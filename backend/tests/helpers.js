/**
 * ตัวช่วยสำหรับชุดทดสอบ API (node:test)
 *
 * - ใช้ฐานข้อมูลแยก (ค่าเริ่มต้น `food_pos_test`) — ไม่แตะฐานข้อมูลหลัก `food_pos`
 * - resetDatabase() รัน schema.sql + seed.sql ใหม่ผ่าน scripts/db-setup.js
 * - startServer() เปิด Express + Socket.IO ในโปรเซสเดียวกันบนพอร์ตสุ่ม
 */
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const TEST_DB = process.env.TEST_DB_NAME || 'food_pos_test';
if (!/_test$/.test(TEST_DB)) {
  throw new Error(`[tests] ชื่อฐานข้อมูลทดสอบต้องลงท้ายด้วย _test (ได้ "${TEST_DB}") เพื่อป้องกันการลบข้อมูลจริง`);
}

// ต้องตั้งค่าก่อน require โมดูลใน src (env.js อ่านค่าตอนโหลด; dotenv ไม่ทับค่าที่ตั้งไว้แล้ว)
process.env.DB_NAME = TEST_DB;
process.env.NODE_ENV = 'test';

function resetDatabase() {
  execFileSync(process.execPath, [path.resolve(__dirname, '../scripts/db-setup.js')], {
    env: { ...process.env, DB_NAME: TEST_DB },
    stdio: 'pipe',
  });
}

const ACCOUNTS = {
  admin: { username: 'admin', password: 'admin1234' },
  cashier: { username: 'cashier', password: 'cashier1234' },
  kitchen: { username: 'kitchen', password: 'kitchen1234' },
};

/**
 * เริ่มเซิร์ฟเวอร์ทดสอบ คืนค่า { baseUrl, request, login, tokens, pool, close }
 * request(method, path, { token, body }) -> { status, body }
 */
async function startServer() {
  resetDatabase();

  const app = require('../src/app');
  const { initSocket } = require('../src/config/socket');
  const { pool } = require('../src/config/database');

  const server = http.createServer(app);
  const io = initSocket(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(method, urlPath, { token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${baseUrl}/api${urlPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: res.status, body: json };
  }

  async function login(role) {
    const res = await request('POST', '/auth/login', { body: ACCOUNTS[role] });
    if (res.status !== 200) throw new Error(`login ${role} failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.data.token;
  }

  const tokens = {
    admin: await login('admin'),
    cashier: await login('cashier'),
    kitchen: await login('kitchen'),
  };

  async function close() {
    io.close();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }

  return { baseUrl, request, login, tokens, pool, close };
}

/** หาเมนูจากชื่อใน catalog ของ POS */
async function findMenu(ctx, name) {
  const res = await ctx.request('GET', `/menus?search=${encodeURIComponent(name)}`, { token: ctx.tokens.admin });
  const menu = res.body.data.find((m) => m.name === name);
  if (!menu) throw new Error(`ไม่พบเมนู ${name}`);
  return menu;
}

/** หา option ของเมนู (จาก GET /menus/:id) ตามประเภทและชื่อ */
async function findOption(ctx, menuId, type, name) {
  const res = await ctx.request('GET', `/menus/${menuId}`, { token: ctx.tokens.admin });
  const opt = res.body.data.options.find((o) => o.optionType === type && o.name === name);
  if (!opt) throw new Error(`ไม่พบตัวเลือก ${type}/${name} ของเมนู ${menuId}`);
  return opt;
}

module.exports = { startServer, resetDatabase, findMenu, findOption, ACCOUNTS, TEST_DB };
