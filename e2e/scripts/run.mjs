#!/usr/bin/env node
/**
 * pnpm e2e: paleidžia visą sistemą produkcijos režimu ir Playwright testus.
 *
 * 1. Sukompiliuoja api, web ir admin (turbo; web su Turnstile testiniu site key).
 * 2. Paleidžia laikiną MongoDB replica set (mongodb-memory-server, kaip API Jest testai).
 * 3. Sukuria indeksus (db:indexes) ir adminą (admin:create).
 * 4. Paleidžia API, web ir admin (NODE_ENV=production) laisvuose portuose.
 * 5. Playwright: projektas „main“, tada API perleidžiamas su Turnstile „visada atmeta“
 *    secret ir paleidžiamas projektas „turnstile-fail“.
 * 6. Viską sustabdo (ir po klaidos ar Ctrl+C).
 *
 * Tik Node (be bash), todėl veikia ir Windows. Papildomi argumentai perduodami Playwright,
 * pvz.: pnpm e2e -- --grep checkout
 *
 * Aplinka:
 *   E2E_SKIP_BUILD=1        nekompiliuoti (naudoti esamus dist/ ir .next/)
 *   E2E_TURNSTILE=real|fake tikras Cloudflare su testiniais raktais arba vietinis pakaitalas
 *                           (numatyta: real, jei challenges.cloudflare.com pasiekiamas)
 *   E2E_HEADED=1            matoma naršyklė
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { startFakeSiteverify } from '../support/fake-turnstile.mjs';

const E2E_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(E2E_DIR, '..');
const LOG_DIR = join(E2E_DIR, '.logs');
const require = createRequire(join(E2E_DIR, 'package.json'));

/** Cloudflare testiniai raktai: https://developers.cloudflare.com/turnstile/troubleshooting/testing/ */
const TURNSTILE = {
  siteKeyPass: '1x00000000000000000000AA',
  secretPass: '1x0000000000000000000000000000000AA',
  secretFail: '2x0000000000000000000000000000000AA',
};
/** Ta pati versija kaip API testuose (apps/api/test/global-setup.ts). */
const MONGOD_VERSION = process.env.MONGOMS_VERSION ?? '8.2.6';
const ADMIN = { email: 'admin@e2e.test', password: 'e2e-admino-slaptazodis-123' };
const CLOUDINARY = {
  cloudName: 'desert-e2e',
  apiKey: '111122223333444',
  apiSecret: 'e2e-cloudinary-paslaptis-ne-tikra',
  folder: 'desert-web/e2e/products',
};

const children = new Set();
const cleanups = [];
let cleaningUp = false;

function log(message) {
  console.log(`[e2e] ${message}`);
}

/** pnpm kvietimas visose OS: per npm_execpath (kai paleista per pnpm) arba per shell Windows. */
function pnpmCommand(args) {
  const execPath = process.env.npm_execpath;
  if (execPath && /\.(c?js|mjs)$/.test(execPath) && execPath.includes('pnpm')) {
    return { command: process.execPath, args: [execPath, ...args], shell: false };
  }
  return { command: 'pnpm', args, shell: process.platform === 'win32' };
}

/** Paleidžia procesą ir laukia pabaigos (išvestis į konsolę). */
function runToEnd(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    children.add(child);
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      children.delete(child);
      resolvePromise(code ?? (signal ? 1 : 0));
    });
  });
}

/** Paleidžia ilgai veikiantį procesą, išvestį rašo į .logs/<name>.log. */
function startService(name, args, { cwd, env }) {
  const logPath = join(LOG_DIR, `${name}.log`);
  const out = createWriteStream(logPath, { flags: 'a' });
  const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  children.add(child);
  const service = { name, child, logPath, exited: false, exitCode: null };
  child.on('exit', (code) => {
    service.exited = true;
    service.exitCode = code;
    children.delete(child);
  });
  return service;
}

async function stopService(service) {
  if (!service || service.exited) return;
  const done = new Promise((r) => service.child.once('exit', r));
  service.child.kill('SIGTERM');
  const timedOut = await Promise.race([done.then(() => false), sleep(10_000).then(() => true)]);
  if (timedOut) {
    service.child.kill('SIGKILL');
    await done;
  }
}

function tail(path, lines = 40) {
  try {
    return readFileSync(path, 'utf8').split(/\r?\n/).slice(-lines).join('\n');
  } catch {
    return '';
  }
}

async function freePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolvePromise(port));
    });
  });
}

/** Laukia, kol URL atsakys 2xx/3xx (arba procesas nukris). */
async function waitForHttp(service, url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (service.exited) {
      throw new Error(
        `${service.name} nukrito (kodas ${service.exitCode}). Logas ${service.logPath}:\n${tail(service.logPath)}`,
      );
    }
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5_000) });
      if (res.status < 400) return;
    } catch {
      // dar nepasileido
    }
    await sleep(300);
  }
  throw new Error(
    `${service.name} neatsakė per ${timeoutMs / 1000} s (${url}). Logas:\n${tail(service.logPath)}`,
  );
}

async function cloudflareReachable() {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/api.js', {
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function cleanup() {
  if (cleaningUp) return;
  cleaningUp = true;
  for (const child of children) {
    try {
      child.kill('SIGTERM');
    } catch {
      // jau baigėsi
    }
  }
  for (const fn of cleanups.reverse()) {
    try {
      await fn();
    } catch (error) {
      console.error('[e2e] valymo klaida', error);
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log(`gautas ${signal}, stabdoma…`);
    void cleanup().finally(() => process.exit(130));
  });
}

async function main() {
  const playwrightArgs = process.argv.slice(2).filter((a) => a !== '--');
  const started = Date.now();
  rmSync(LOG_DIR, { recursive: true, force: true });
  mkdirSync(LOG_DIR, { recursive: true });

  // 1. Build (web gauna testinį site key: NEXT_PUBLIC_ reikšmės įrašomos builde).
  if (process.env.E2E_SKIP_BUILD === '1') {
    log('E2E_SKIP_BUILD=1: naudojami esami buildai');
  } else {
    log('kompiliuojama: api, web, admin…');
    const { command, args, shell } = pnpmCommand([
      'turbo',
      'run',
      'build',
      '--filter=@desert-web/api',
      '--filter=@desert-web/web',
      '--filter=@desert-web/admin',
    ]);
    const code = await runToEnd(command, args, {
      cwd: ROOT,
      shell,
      env: { ...process.env, NEXT_PUBLIC_TURNSTILE_SITE_KEY: TURNSTILE.siteKeyPass },
    });
    if (code !== 0) throw new Error(`build nepavyko (kodas ${code})`);
  }

  // 2. Turnstile: tikras Cloudflare su testiniais raktais arba vietinis pakaitalas.
  const mode =
    process.env.E2E_TURNSTILE === 'real' || process.env.E2E_TURNSTILE === 'fake'
      ? process.env.E2E_TURNSTILE
      : (await cloudflareReachable())
        ? 'real'
        : 'fake';
  let verifyUrl;
  if (mode === 'fake') {
    const fake = await startFakeSiteverify();
    cleanups.push(fake.close);
    verifyUrl = fake.url;
    log('Turnstile: challenges.cloudflare.com nepasiekiamas, naudojamas vietinis pakaitalas');
  } else {
    log('Turnstile: tikras Cloudflare su testiniais raktais');
  }

  // 3. MongoDB replica set (transakcijoms).
  log(`paleidžiama MongoDB ${MONGOD_VERSION}…`);
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const replSet = await MongoMemoryReplSet.create({
    binary: { version: MONGOD_VERSION },
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  cleanups.push(() => replSet.stop());
  const mongoUri = replSet.getUri('desert-web-e2e');

  const [apiPort, webPort, adminPort] = [await freePort(), await freePort(), await freePort()];
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://localhost:${webPort}`;
  const adminUrl = `http://localhost:${adminPort}`;
  const internalSecret = `e2e-${randomBytes(24).toString('hex')}`;

  const baseEnv = { ...process.env };
  delete baseEnv.NODE_OPTIONS;
  const apiEnv = (turnstileSecret) => ({
    ...baseEnv,
    NODE_ENV: 'production',
    PORT: String(apiPort),
    MONGODB_URI: mongoUri,
    CORS_ORIGIN: `${webUrl},${adminUrl}`,
    INTERNAL_API_SECRET: internalSecret,
    CLOUDINARY_CLOUD_NAME: CLOUDINARY.cloudName,
    CLOUDINARY_API_KEY: CLOUDINARY.apiKey,
    CLOUDINARY_API_SECRET: CLOUDINARY.apiSecret,
    CLOUDINARY_FOLDER: CLOUDINARY.folder,
    TURNSTILE_SECRET_KEY: turnstileSecret,
    ...(verifyUrl ? { TURNSTILE_VERIFY_URL: verifyUrl } : {}),
    // Testai daug kartų jungiasi ir užsako iš vieno IP; ribojimus tikrina Jest testai.
    ADMIN_LOGIN_RATE_LIMIT: '1000',
    ORDER_RATE_LIMIT_SHORT: '1000',
    ORDER_RATE_LIMIT_DAILY: '1000',
    ORDER_ACCESS_RATE_LIMIT: '1000',
    // Lokaliai nėra Railway edge, kuris nustatytų X-Real-IP.
    TRUST_X_REAL_IP: 'false',
  });
  const apiDir = join(ROOT, 'apps/api');

  // 4. Indeksai ir adminas (kaip Railway Pre-deploy ir admin:create).
  log('kuriami indeksai ir adminas…');
  if (
    (await runToEnd(process.execPath, [join(apiDir, 'dist/scripts/sync-indexes.js')], {
      cwd: E2E_DIR,
      env: apiEnv(TURNSTILE.secretPass),
    })) !== 0
  ) {
    throw new Error('db:indexes nepavyko');
  }
  if (
    (await runToEnd(
      process.execPath,
      [join(apiDir, 'dist/scripts/create-admin.js'), '--email', ADMIN.email, '--role', 'owner'],
      { cwd: E2E_DIR, env: { ...apiEnv(TURNSTILE.secretPass), ADMIN_PASSWORD: ADMIN.password } },
    )) !== 0
  ) {
    throw new Error('admin:create nepavyko');
  }

  // 5. Serveriai.
  const nextBin = (app) =>
    createRequire(join(ROOT, 'apps', app, 'package.json')).resolve('next/dist/bin/next');
  const startApi = async (turnstileSecret) => {
    const api = startService('api', [join(apiDir, 'dist/main.js')], {
      cwd: E2E_DIR,
      env: apiEnv(turnstileSecret),
    });
    await waitForHttp(api, `${apiUrl}/health`);
    return api;
  };
  log('paleidžiami API, web ir admin…');
  let api = await startApi(TURNSTILE.secretPass);
  const appEnv = (port) => ({
    ...baseEnv,
    NODE_ENV: 'production',
    PORT: String(port),
    API_URL: apiUrl,
    INTERNAL_API_SECRET: internalSecret,
  });
  const web = startService('web', [nextBin('web'), 'start', '-p', String(webPort)], {
    cwd: join(ROOT, 'apps/web'),
    env: appEnv(webPort),
  });
  const admin = startService('admin', [nextBin('admin'), 'start', '-p', String(adminPort)], {
    cwd: join(ROOT, 'apps/admin'),
    env: appEnv(adminPort),
  });
  await Promise.all([
    waitForHttp(web, `${webUrl}/privatumas`),
    waitForHttp(admin, `${adminUrl}/login`),
  ]);

  // 6. Testai.
  const testEnv = {
    ...baseEnv,
    E2E_API_URL: apiUrl,
    E2E_WEB_URL: webUrl,
    E2E_ADMIN_URL: adminUrl,
    E2E_ADMIN_EMAIL: ADMIN.email,
    E2E_ADMIN_PASSWORD: ADMIN.password,
    E2E_INTERNAL_SECRET: internalSecret,
    E2E_CLOUDINARY_CLOUD_NAME: CLOUDINARY.cloudName,
    E2E_CLOUDINARY_API_SECRET: CLOUDINARY.apiSecret,
    E2E_CLOUDINARY_FOLDER: CLOUDINARY.folder,
    E2E_TURNSTILE_MODE: mode,
  };
  const cli = require.resolve('@playwright/test/cli');
  const playwright = (project) =>
    runToEnd(
      process.execPath,
      [cli, 'test', `--project=${project}`, '--pass-with-no-tests', ...playwrightArgs],
      { cwd: E2E_DIR, env: testEnv },
    );

  log('Playwright: main');
  const mainCode = await playwright('main');

  log('API perleidžiamas su Turnstile „visada atmeta“ secret…');
  await stopService(api);
  api = await startApi(TURNSTILE.secretFail);
  log('Playwright: turnstile-fail');
  const failCode = await playwright('turnstile-fail');

  const seconds = Math.round((Date.now() - started) / 1000);
  if (mainCode !== 0 || failCode !== 0) {
    for (const s of [api, web, admin]) {
      console.error(`\n[e2e] --- ${s.name} logo pabaiga (${s.logPath}) ---\n${tail(s.logPath)}`);
    }
    throw new Error(
      `testai nepavyko (main: ${mainCode}, turnstile-fail: ${failCode}), ${seconds} s`,
    );
  }
  log(`viskas praėjo per ${seconds} s`);
}

let exitCode = 0;
try {
  await main();
} catch (error) {
  console.error(`[e2e] ${error instanceof Error ? error.message : String(error)}`);
  exitCode = 1;
} finally {
  await cleanup();
}
process.exit(exitCode);
