/**
 * ตรวจ Responsive อัตโนมัติด้วย Chrome/Edge แบบ headless (Chrome DevTools Protocol — ไม่ต้องติดตั้ง package เพิ่ม)
 *
 *   node scripts/responsive-check.mjs [--shots <โฟลเดอร์>]
 *
 * ต้องรัน backend (:5000) และ frontend dev server (:5173) ก่อน
 * แนะนำให้รัน backend กับฐานข้อมูลทดสอบ: DB_NAME=food_pos_test (สร้างโดย `npm test` ใน backend)
 *
 * ตรวจแต่ละหน้า x แต่ละขนาดจอ:
 *   - หน้าโหลดสำเร็จ (ไม่ค้างที่ loading / ไม่มีข้อความ error)
 *   - ไม่มี horizontal scroll ทั้งหน้า (scrollWidth > innerWidth)
 *   - ไม่มี console error / exception
 * ตัวแปร: APP_URL (ค่าเริ่มต้น http://localhost:5173), BROWSER (path ของ chrome/msedge)
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const APP_URL = process.env.APP_URL || 'http://localhost:5173';
const PORT = 9333;
const shotsIdx = process.argv.indexOf('--shots');
const SHOTS_DIR = shotsIdx > 0 ? path.resolve(process.argv[shotsIdx + 1]) : null;

const BROWSERS = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812, mobile: true },
  { name: 'tablet', width: 768, height: 1024, mobile: true },
  { name: 'desktop', width: 1366, height: 768, mobile: false },
];

const PAGES = {
  admin: ['/', '/pos', '/orders', '/kitchen', '/menus', '/categories', '/menu-options', '/inventory', '/reports', '/settings', '/system-status', '/change-password'],
  cashier: ['/', '/pos', '/orders'],
  kitchen: ['/kitchen', '/inventory', '/menus'],
};
const PASSWORDS = { admin: 'admin1234', cashier: 'cashier1234', kitchen: 'kitchen1234' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browserPath = BROWSERS.find((p) => existsSync(p));
  if (!browserPath) throw new Error('ไม่พบ Chrome/Edge — กำหนด BROWSER=<path>');
  if (SHOTS_DIR) mkdirSync(SHOTS_DIR, { recursive: true });

  const profile = path.join(tmpdir(), `food-pos-responsive-${process.pid}`);
  const browser = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--disable-gpu',
    'about:blank',
  ]);

  try {
    let targets;
    for (let i = 0; i < 50 && !targets; i++) {
      try {
        targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      } catch {
        await sleep(200);
      }
    }
    const page = targets.find((t) => t.type === 'page');
    const cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) => errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text));
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') errors.push(p.args.map((a) => a.value ?? a.description).join(' '));
    });

    const evaluate = async (expression) =>
      (await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

    const navigate = async (url) => {
      const loaded = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', { url });
      await loaded;
    };

    const results = [];
    for (const [role, pages] of Object.entries(PAGES)) {
      const login = await fetch(`${APP_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: role, password: PASSWORDS[role] }),
      }).then((r) => r.json());
      if (!login.success) throw new Error(`login ${role} ไม่สำเร็จ: ${login.message}`);

      await navigate(`${APP_URL}/login`);
      await evaluate(`localStorage.setItem('food_pos_token', ${JSON.stringify(login.data.token)})`);

      for (const vp of VIEWPORTS) {
        await cdp.send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: 1,
          mobile: vp.mobile,
        });
        for (const route of pages) {
          errors.length = 0;
          await navigate(`${APP_URL}${route}`);
          // รอให้ข้อมูลโหลดเสร็จ (ไม่มี spinner animate-spin เหลืออยู่)
          let settled = false;
          for (let i = 0; i < 40 && !settled; i++) {
            await sleep(150);
            settled = await evaluate(`!document.querySelector('.animate-spin') && document.body.innerText.trim().length > 0`);
          }
          await sleep(300); // ให้ chart/animation วาดเสร็จ
          const info = await evaluate(`(() => {
            const de = document.documentElement;
            const wide = [...document.querySelectorAll('body *')]
              .filter((el) => {
                const r = el.getBoundingClientRect();
                if (r.width === 0 || r.right <= innerWidth + 1) return false;
                // ข้ามองค์ประกอบที่อยู่ในกล่องเลื่อนแนวนอน (ตั้งใจให้เลื่อนได้)
                for (let p = el.parentElement; p; p = p.parentElement) {
                  const s = getComputedStyle(p);
                  if (['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowX)) return false;
                }
                return true;
              })
              .slice(0, 3)
              .map((el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') + ' right=' + Math.round(el.getBoundingClientRect().right));
            return {
              path: location.pathname,
              overflowX: de.scrollWidth > innerWidth + 1,
              scrollWidth: de.scrollWidth,
              wide,
              errorText: /เกิดข้อผิดพลาด|ไม่สามารถ|โหลดข้อมูลไม่สำเร็จ/.test(document.querySelector('main')?.innerText || ''),
            };
          })()`);

          const problems = [];
          if (!settled) problems.push('ยังโหลดไม่เสร็จ');
          if (info.path !== route) problems.push(`redirect -> ${info.path}`);
          if (info.overflowX) problems.push(`เลื่อนแนวนอน (scrollWidth ${info.scrollWidth}px) ${info.wide.join(', ')}`);
          if (info.errorText) problems.push('แสดงข้อความ error');
          if (errors.length) problems.push(`console: ${errors.slice(0, 2).join(' | ').slice(0, 200)}`);
          results.push({ role, viewport: vp.name, route, problems });

          if (SHOTS_DIR) {
            const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            const file = `${role}_${vp.name}_${route.replace(/\//g, '_') || '_'}.png`.replace(/__+/g, '_');
            writeFileSync(path.join(SHOTS_DIR, file), Buffer.from(data, 'base64'));
          }
        }
      }
    }

    let failed = 0;
    for (const r of results) {
      const ok = r.problems.length === 0;
      if (!ok) failed++;
      console.log(`${ok ? '✔' : '✖'} [${r.role}] ${r.viewport.padEnd(7)} ${r.route}${ok ? '' : '  — ' + r.problems.join('; ')}`);
    }
    console.log(`\n${results.length - failed}/${results.length} ผ่าน`);
    process.exitCode = failed ? 1 : 0;
    cdp.close();
  } finally {
    browser.kill();
    await sleep(500);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* โปรไฟล์อาจยังถูกล็อกอยู่ชั่วครู่ */
    }
  }
}

/** CDP client ขนาดเล็ก (ใช้ WebSocket ที่มีใน Node 22+) */
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const listeners = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      } else if (msg.method) {
        (listeners.get(msg.method) || []).slice().forEach((fn) => fn(msg.params));
      }
    };
    ws.onerror = reject;
    ws.onopen = () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const msgId = ++id;
            pending.set(msgId, { res, rej });
            ws.send(JSON.stringify({ id: msgId, method, params }));
          }),
        on: (method, fn) => listeners.set(method, [...(listeners.get(method) || []), fn]),
        once(method) {
          return new Promise((res) => {
            const fn = (p) => {
              listeners.set(method, listeners.get(method).filter((f) => f !== fn));
              res(p);
            };
            this.on(method, fn);
          });
        },
        close: () => ws.close(),
      });
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
