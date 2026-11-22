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

/**
 * Naršyklės api.js pakaitalas (render, reset, remove, getResponse).
 *
 * Be parametrų elgiasi pagal site key (kaip Cloudflare testiniai raktai): 1x… praeina,
 * 2x… klaida. Testai gali priverstinai nustatyti scenarijų:
 *   mode: 'pass'        → callback(token)
 *         'error'       → error-callback
 *         'unsupported' → unsupported-callback
 *         'interactive' → before-interactive-callback, valdiklyje langelis; jį pažymėjus
 *                         after-interactive-callback ir callback(token)
 *   failTimes: N        → pirmi N bandymai baigiasi error-callback, toliau pagal mode
 *   delayMs             → kiek laukti iki rezultato (numatyta 150 ms)
 * Testams: window.__fakeTurnstile.expire() iškviečia expired-callback visiems valdikliams.
 *
 * @param {{ mode?: 'pass' | 'error' | 'unsupported' | 'interactive', failTimes?: number, delayMs?: number }} [options]
 */
export function fakeWidgetScript(options = {}) {
  return `
(() => {
  const OPTIONS = ${JSON.stringify(options)};
  const TOKEN = '${DUMMY_TOKEN}';
  const widgets = new Map();
  let seq = 0;
  let attempts = 0;
  function modeFor(w) {
    if (OPTIONS.mode) return OPTIONS.mode;
    return String(w.options.sitekey).startsWith('2x') ? 'error' : 'pass';
  }
  function pass(w) {
    w.token = TOKEN;
    w.options.callback && w.options.callback(w.token);
  }
  function run(id) {
    const w = widgets.get(id);
    if (!w) return;
    clearTimeout(w.timer);
    w.el && (w.el.innerHTML = '');
    w.timer = setTimeout(() => {
      if (!widgets.has(id)) return;
      attempts += 1;
      const mode = attempts <= (OPTIONS.failTimes || 0) ? 'error' : modeFor(w);
      if (mode === 'error') {
        w.options['error-callback'] && w.options['error-callback']('110100');
      } else if (mode === 'unsupported') {
        w.options['unsupported-callback'] && w.options['unsupported-callback']();
      } else if (mode === 'interactive') {
        w.options['before-interactive-callback'] && w.options['before-interactive-callback']();
        if (!w.el) return;
        w.el.innerHTML =
          '<label class="fake-turnstile-box" style="display:flex;gap:8px;align-items:center;' +
          'padding:14px 16px;border:1px solid #ccc;border-radius:4px;background:#fafafa;' +
          'font:14px sans-serif;color:#333"><input type="checkbox"> Patvirtinkite, kad esate žmogus</label>';
        w.el.querySelector('input').addEventListener('change', () => {
          w.options['after-interactive-callback'] && w.options['after-interactive-callback']();
          setTimeout(() => {
            if (!widgets.has(id)) return;
            w.el.innerHTML = '';
            pass(w);
          }, OPTIONS.delayMs ?? 150);
        });
      } else {
        pass(w);
      }
    }, OPTIONS.delayMs ?? 150);
  }
  window.turnstile = {
    render(container, options) {
      const id = 'fake-' + (++seq);
      const el = typeof container === 'string' ? document.querySelector(container) : container;
      if (el) el.setAttribute('data-fake-turnstile', id);
      widgets.set(id, { options, el, token: null, timer: 0 });
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
  window.__fakeTurnstile = {
    expire() {
      for (const w of widgets.values()) {
        w.token = null;
        w.options['expired-callback'] && w.options['expired-callback']();
      }
    },
  };
})();
`;
}

/** Numatytasis pakaitalas (elgiasi pagal site key). */
export const FAKE_WIDGET_SCRIPT = fakeWidgetScript();

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
