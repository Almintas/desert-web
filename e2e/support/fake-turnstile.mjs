/**
 * Vietinis Cloudflare Turnstile pakaitalas, kai challenges.cloudflare.com nepasiekiamas
 * (pvz., uždaroje CI aplinkoje). Elgiasi kaip Cloudflare testiniai raktai
 * (https://developers.cloudflare.com/turnstile/troubleshooting/testing/):
 *   site key 1x…  → valdiklis iškart duoda tokeną XXXX.DUMMY.TOKEN.XXXX
 *   site key 2x…  → valdiklis praneša klaidą (error-callback)
 *   secret 1x…    → siteverify priima tik XXXX.DUMMY.TOKEN.XXXX
 *   secret 2x…    → siteverify visada atmeta (invalid-input-response)
 *   secret 3x…    → siteverify grąžina timeout-or-duplicate
 * Kai Cloudflare pasiekiamas, run.mjs naudoja tikrą Cloudflare su tais pačiais testiniais raktais.
 */
import { createServer } from 'node:http';

export const DUMMY_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

/** Naršyklės api.js pakaitalas (tik metodai, kuriuos naudoja web: render, reset, remove). */
export const FAKE_WIDGET_SCRIPT = `
(() => {
  const widgets = new Map();
  let seq = 0;
  function run(id) {
    const w = widgets.get(id);
    if (!w) return;
    clearTimeout(w.timer);
    w.timer = setTimeout(() => {
      if (!widgets.has(id)) return;
      if (String(w.options.sitekey).startsWith('2x')) {
        w.options['error-callback'] && w.options['error-callback']('110100');
      } else {
        w.token = '${DUMMY_TOKEN}';
        w.options.callback && w.options.callback(w.token);
      }
    }, 150);
  }
  window.turnstile = {
    render(container, options) {
      const id = 'fake-' + (++seq);
      const el = typeof container === 'string' ? document.querySelector(container) : container;
      if (el) el.setAttribute('data-fake-turnstile', id);
      widgets.set(id, { options, token: null, timer: 0 });
      run(id);
      return id;
    },
    reset(id) {
      const w = widgets.get(id);
      if (!w) return;
      w.token = null;
      run(id);
    },
    remove(id) {
      const w = widgets.get(id);
      if (w) clearTimeout(w.timer);
      widgets.delete(id);
    },
    getResponse(id) {
      return widgets.get(id)?.token ?? undefined;
    },
  };
})();
`;

function siteverifyResult(secret, response) {
  if (secret.startsWith('1x') && response === DUMMY_TOKEN) {
    return {
      success: true,
      challenge_ts: new Date().toISOString(),
      hostname: 'example.com',
      'error-codes': [],
    };
  }
  if (secret.startsWith('3x')) return { success: false, 'error-codes': ['timeout-or-duplicate'] };
  if (!response) return { success: false, 'error-codes': ['missing-input-response'] };
  return { success: false, 'error-codes': ['invalid-input-response'] };
}

/** Paleidžia siteverify pakaitalą. Grąžina { url, close }. */
export async function startFakeSiteverify() {
  const server = createServer((req, res) => {
    if (req.method !== 'POST' || !req.url?.startsWith('/turnstile/v0/siteverify')) {
      res.writeHead(404).end();
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const params = new URLSearchParams(body);
      const result = siteverifyResult(params.get('secret') ?? '', params.get('response') ?? '');
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/turnstile/v0/siteverify`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
