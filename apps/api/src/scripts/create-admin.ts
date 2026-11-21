/**
 * Sukuria adminą (viešos registracijos nėra) arba pakeičia jo slaptažodį.
 *
 *   pnpm --filter @desert-web/api admin:create --email ona@example.com --role owner
 *   pnpm --filter @desert-web/api admin:create --email ona@example.com --reset-password
 *
 * Slaptažodis įvedamas interaktyviai (nerodomas) arba per ADMIN_PASSWORD (neinteraktyviai).
 * Prieš tai: pnpm turbo run build --filter=@desert-web/api
 *
 * Railway Pre-deploy Command vykdomas be shell, todėl kelias komandas reikia apgaubti:
 *   sh -c 'pnpm --filter @desert-web/api db:indexes && pnpm --filter @desert-web/api admin:create ...'
 */
import 'reflect-metadata';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { adminEmailSchema, adminPasswordSchema, adminRoleSchema } from '@desert-web/shared';
import { NestFactory } from '@nestjs/core';
import {
  AdminAccountsService,
  AdminExistsError,
  AdminNotFoundError,
} from '../admin-auth/admin-accounts.service';
import { AppModule } from '../app.module';

class UsageError extends Error {}

/** Klausia slaptažodžio nerodant įvedamų simbolių (jei terminalas leidžia). */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new UsageError('No terminal to enter the password. Set ADMIN_PASSWORD.'));
      return;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    const output = rl as unknown as {
      _writeToOutput: (s: string) => void;
      output: NodeJS.WriteStream;
    };
    output._writeToOutput = (s: string) => {
      if (!muted || s.includes('\n') || s.includes('\r')) output.output.write(muted ? '\n' : s);
    };
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
    muted = true;
  });
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  const password = fromEnv ?? (await promptHidden('Slaptažodis: '));
  const parsed = adminPasswordSchema.safeParse(password);
  if (!parsed.success) throw new UsageError(parsed.error.issues[0]!.message);
  if (fromEnv === undefined) {
    const repeat = await promptHidden('Pakartok slaptažodį: ');
    if (repeat !== password) throw new UsageError('Passwords do not match');
  }
  return parsed.data;
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      role: { type: 'string' },
      'reset-password': { type: 'boolean', default: false },
    },
  });

  const email = adminEmailSchema.safeParse(values.email ?? '');
  if (!email.success) throw new UsageError('Provide --email <email>');
  const role = values.role === undefined ? undefined : adminRoleSchema.safeParse(values.role);
  if (role && !role.success) throw new UsageError('--role must be owner or staff');
  const reset = values['reset-password'];
  if (!reset && !role) throw new UsageError('Provide --role owner|staff for a new admin');

  const password = await readPassword();

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const accounts = app.get(AdminAccountsService);
    if (reset) {
      const { admin, deletedSessions } = await accounts.resetPassword(
        email.data,
        password,
        role?.data,
      );
      console.log(
        `Password changed: ${admin.email} (${admin.role}). Sessions deleted: ${deletedSessions}.`,
      );
    } else {
      const admin = await accounts.create(email.data, role!.data!, password);
      console.log(`Admin created: ${admin.email} (${admin.role}).`);
    }
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  // Laukiamos klaidos (blogi argumentai, adminas jau yra) be stack trace.
  const expected =
    error instanceof UsageError ||
    error instanceof AdminExistsError ||
    error instanceof AdminNotFoundError;
  console.error(expected ? `Error: ${(error as Error).message}` : error);
  process.exit(1);
});
