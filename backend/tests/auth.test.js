const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

let ctx;
before(async () => {
  ctx = await startServer();
});
after(async () => {
  await ctx?.close();
});

describe('Health', () => {
  test('GET /health ตอบสถานะฐานข้อมูลและตารางครบ', async () => {
    const res = await ctx.request('GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.database.connected, true);
    assert.equal(res.body.database.schemaReady, true);
    assert.deepEqual(res.body.database.missingTables, []);
  });

  test('path ที่ไม่มีอยู่ตอบ 404 รูปแบบมาตรฐาน', async () => {
    const res = await ctx.request('GET', '/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(typeof res.body.message, 'string');
  });
});

describe('Login', () => {
  test('เข้าสู่ระบบสำเร็จ คืน token + ข้อมูลผู้ใช้ ไม่มีรหัสผ่าน', async () => {
    const res = await ctx.request('POST', '/auth/login', { body: { username: 'admin', password: 'admin1234' } });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.role, 'admin');
    assert.equal(JSON.stringify(res.body.data.user).includes('password'), false);
  });

  test('รหัสผ่านผิด -> 401', async () => {
    const res = await ctx.request('POST', '/auth/login', { body: { username: 'cashier', password: 'wrong-pass' } });
    assert.equal(res.status, 401);
    assert.equal(res.body.success, false);
  });

  test('ไม่กรอกข้อมูล -> 400', async () => {
    const res = await ctx.request('POST', '/auth/login', { body: {} });
    assert.equal(res.status, 400);
  });

  test('ชนิดข้อมูลผิด (object แทน string) -> 400 ไม่ใช่ 500', async () => {
    const res = await ctx.request('POST', '/auth/login', { body: { username: { $ne: '' }, password: ['x'] } });
    assert.equal(res.status, 400);
  });

  test('ผิดครบ 5 ครั้ง -> ถูกล็อก 429 (แม้รหัสถูก)', async () => {
    const body = { username: 'locktest-user', password: 'nope' };
    for (let i = 0; i < 5; i++) {
      const r = await ctx.request('POST', '/auth/login', { body });
      assert.equal(r.status, 401);
    }
    const locked = await ctx.request('POST', '/auth/login', { body });
    assert.equal(locked.status, 429);
    // ผู้ใช้อื่นยังเข้าได้ (ล็อกแยกตาม username)
    const other = await ctx.request('POST', '/auth/login', { body: { username: 'kitchen', password: 'kitchen1234' } });
    assert.equal(other.status, 200);
  });
});

describe('Token', () => {
  test('ไม่มี token -> 401', async () => {
    const res = await ctx.request('GET', '/auth/me');
    assert.equal(res.status, 401);
  });

  test('token ปลอม -> 401', async () => {
    const res = await ctx.request('GET', '/auth/me', { token: 'abc.def.ghi' });
    assert.equal(res.status, 401);
  });

  test('GET /auth/me คืนข้อมูลผู้ใช้ตาม token', async () => {
    const res = await ctx.request('GET', '/auth/me', { token: ctx.tokens.kitchen });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.role, 'kitchen');
  });
});

describe('เปลี่ยนรหัสผ่าน', () => {
  test('ตรวจสอบเงื่อนไขและเปลี่ยนได้จริง', async () => {
    const token = await ctx.login('cashier');
    const short = await ctx.request('PUT', '/auth/change-password', {
      token,
      body: { currentPassword: 'cashier1234', newPassword: 'short' },
    });
    assert.equal(short.status, 400);

    const wrong = await ctx.request('PUT', '/auth/change-password', {
      token,
      body: { currentPassword: 'not-current', newPassword: 'newpass1234' },
    });
    assert.equal(wrong.status, 400);

    const ok = await ctx.request('PUT', '/auth/change-password', {
      token,
      body: { currentPassword: 'cashier1234', newPassword: 'newpass1234' },
    });
    assert.equal(ok.status, 200);

    const oldLogin = await ctx.request('POST', '/auth/login', { body: { username: 'cashier', password: 'cashier1234' } });
    assert.equal(oldLogin.status, 401);
    const newLogin = await ctx.request('POST', '/auth/login', { body: { username: 'cashier', password: 'newpass1234' } });
    assert.equal(newLogin.status, 200);

    // คืนค่าเดิมเพื่อไม่ให้กระทบเทสต์อื่น
    const back = await ctx.request('PUT', '/auth/change-password', {
      token,
      body: { currentPassword: 'newpass1234', newPassword: 'cashier1234' },
    });
    assert.equal(back.status, 200);
  });
});

describe('สิทธิ์การเข้าถึง (Role)', () => {
  // [method, path, body, { admin, cashier, kitchen } -> อนุญาตหรือไม่]
  const MATRIX = [
    ['GET', '/dashboard/summary', undefined, { admin: true, cashier: true, kitchen: false }],
    ['GET', '/pos/catalog', undefined, { admin: true, cashier: true, kitchen: false }],
    ['GET', '/orders', undefined, { admin: true, cashier: true, kitchen: false }],
    ['GET', '/orders/kitchen', undefined, { admin: true, cashier: true, kitchen: true }],
    ['GET', '/ingredients', undefined, { admin: true, cashier: false, kitchen: true }],
    ['GET', '/reports/sales', undefined, { admin: true, cashier: false, kitchen: false }],
    ['GET', '/settings', undefined, { admin: true, cashier: true, kitchen: false }],
    ['GET', '/menu-options', undefined, { admin: true, cashier: false, kitchen: false }],
    ['GET', '/menus', undefined, { admin: true, cashier: true, kitchen: true }],
    ['GET', '/categories', undefined, { admin: true, cashier: true, kitchen: true }],
    ['POST', '/categories', { name: '' }, { admin: true, cashier: false, kitchen: false }],
    ['POST', '/menus', {}, { admin: true, cashier: false, kitchen: false }],
    ['PUT', '/settings', {}, { admin: true, cashier: false, kitchen: false }],
    ['POST', '/ingredients', {}, { admin: true, cashier: false, kitchen: false }],
    ['POST', '/orders', {}, { admin: true, cashier: true, kitchen: false }],
    ['POST', '/orders/1/payment', {}, { admin: true, cashier: true, kitchen: false }],
  ];

  for (const [method, path, body, allowed] of MATRIX) {
    for (const role of ['admin', 'cashier', 'kitchen']) {
      test(`${role} ${method} ${path} -> ${allowed[role] ? 'อนุญาต' : '403'}`, async () => {
        const res = await ctx.request(method, path, { token: ctx.tokens[role], body });
        if (allowed[role]) {
          // อนุญาตแล้วอาจได้ 200/201 หรือ 400/404 จากการตรวจข้อมูล แต่ต้องไม่ใช่ 401/403
          assert.ok(![401, 403].includes(res.status), `ได้ ${res.status}: ${JSON.stringify(res.body)}`);
        } else {
          assert.equal(res.status, 403);
        }
      });
    }
  }

  test('ทุก endpoint ที่ต้องล็อกอิน ตอบ 401 เมื่อไม่มี token', async () => {
    for (const [method, path, body] of MATRIX) {
      const res = await ctx.request(method, path, { body });
      assert.equal(res.status, 401, `${method} ${path}`);
    }
  });
});
