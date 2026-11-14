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

const asAdmin = (method, path, body) => ctx.request(method, path, { token: ctx.tokens.admin, body });
const me = async (role) => (await ctx.request('GET', '/auth/me', { token: ctx.tokens[role] })).body.data;

describe('จัดการผู้ใช้', () => {
  let userId;

  test('เฉพาะ admin เท่านั้น', async () => {
    for (const role of ['cashier', 'kitchen']) {
      const res = await ctx.request('GET', '/users', { token: ctx.tokens[role] });
      assert.equal(res.status, 403);
    }
    const res = await asAdmin('GET', '/users');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 3);
    assert.equal(JSON.stringify(res.body.data).includes('password'), false);
  });

  test('รายการตำแหน่ง', async () => {
    const res = await asAdmin('GET', '/users/roles');
    assert.deepEqual(
      res.body.data.map((r) => r.name),
      ['admin', 'cashier', 'kitchen']
    );
  });

  test('ตรวจข้อมูลตอนเพิ่มผู้ใช้', async () => {
    const base = { username: 'somsri', password: 'password123', fullName: 'สมศรี ใจดี', role: 'cashier' };
    const cases = [
      { ...base, username: 'ab' },
      { ...base, username: 'สมศรี' },
      { ...base, username: 'has space' },
      { ...base, password: 'short' },
      { ...base, password: 'ก'.repeat(25) }, // 75 ไบต์
      { ...base, fullName: '' },
      { ...base, role: 'owner' },
    ];
    for (const body of cases) {
      const res = await asAdmin('POST', '/users', body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    const dup = await asAdmin('POST', '/users', { ...base, username: 'CASHIER' });
    assert.equal(dup.status, 409);
  });

  test('เพิ่มผู้ใช้ แล้วล็อกอินได้', async () => {
    const res = await asAdmin('POST', '/users', {
      username: 'SomSri',
      password: 'password123',
      fullName: 'สมศรี ใจดี',
      phone: '0812345678',
      role: 'cashier',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.username, 'somsri'); // เก็บเป็นตัวพิมพ์เล็ก
    assert.equal(res.body.data.isActive, true);
    userId = res.body.data.id;

    const login = await ctx.request('POST', '/auth/login', { body: { username: 'somsri', password: 'password123' } });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.user.role, 'cashier');
  });

  test('เปลี่ยนตำแหน่งมีผลทันทีกับ token เดิม', async () => {
    const login = await ctx.request('POST', '/auth/login', { body: { username: 'somsri', password: 'password123' } });
    const userToken = login.body.data.token;
    assert.equal((await ctx.request('GET', '/pos/catalog', { token: userToken })).status, 200);

    const upd = await asAdmin('PUT', `/users/${userId}`, { fullName: 'สมศรี ใจดี', role: 'kitchen', isActive: true });
    assert.equal(upd.status, 200);
    assert.equal((await ctx.request('GET', '/pos/catalog', { token: userToken })).status, 403);
    assert.equal((await ctx.request('GET', '/orders/kitchen', { token: userToken })).status, 200);
  });

  test('ตั้งรหัสผ่านใหม่ให้ผู้ใช้', async () => {
    const res = await asAdmin('PUT', `/users/${userId}/password`, { password: 'newsecret99' });
    assert.equal(res.status, 200);
    const oldLogin = await ctx.request('POST', '/auth/login', { body: { username: 'somsri', password: 'password123' } });
    assert.equal(oldLogin.status, 401);
    const newLogin = await ctx.request('POST', '/auth/login', { body: { username: 'somsri', password: 'newsecret99' } });
    assert.equal(newLogin.status, 200);
  });

  test('ปิดใช้งาน: token เดิมใช้ไม่ได้ทันที และล็อกอินไม่ได้', async () => {
    const login = await ctx.request('POST', '/auth/login', { body: { username: 'somsri', password: 'newsecret99' } });
    const userToken = login.body.data.token;
    const upd = await asAdmin('PUT', `/users/${userId}`, { fullName: 'สมศรี ใจดี', role: 'kitchen', isActive: false });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.data.isActive, false);
    assert.equal((await ctx.request('GET', '/auth/me', { token: userToken })).status, 401);
    const again = await ctx.request('POST', '/auth/login', { body: { username: 'somsri', password: 'newsecret99' } });
    assert.equal(again.status, 403);
  });

  test('ลบผู้ใช้ที่ไม่มีประวัติ -> ลบจริง', async () => {
    const res = await asAdmin('DELETE', `/users/${userId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.softDeleted, false);
    const list = await asAdmin('GET', '/users');
    assert.ok(!list.body.data.some((u) => u.id === userId));
  });

  test('ลบผู้ใช้ที่มีประวัติออเดอร์ -> soft delete', async () => {
    const created = await asAdmin('POST', '/users', {
      username: 'temp.cashier',
      password: 'password123',
      fullName: 'แคชเชียร์ชั่วคราว',
      role: 'cashier',
    });
    const login = await ctx.request('POST', '/auth/login', { body: { username: 'temp.cashier', password: 'password123' } });
    const order = await ctx.request('POST', '/orders', {
      token: login.body.data.token,
      body: { items: [{ menuId: 1, quantity: 1 }] },
    });
    assert.equal(order.status, 201);

    const res = await asAdmin('DELETE', `/users/${created.body.data.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.softDeleted, true);
    // ประวัติออเดอร์ยังแสดงชื่อแคชเชียร์
    const o = await asAdmin('GET', `/orders/${order.body.data.id}`);
    assert.equal(o.body.data.cashierName, 'แคชเชียร์ชั่วคราว');
  });

  test('ห้ามแก้ตำแหน่ง / ปิดใช้งาน / ลบ / รีเซ็ตรหัส ของตัวเอง', async () => {
    const admin = await me('admin');
    const demote = await asAdmin('PUT', `/users/${admin.id}`, { fullName: admin.fullName, role: 'cashier', isActive: true });
    assert.equal(demote.status, 400);
    const disable = await asAdmin('PUT', `/users/${admin.id}`, { fullName: admin.fullName, role: 'admin', isActive: false });
    assert.equal(disable.status, 400);
    const del = await asAdmin('DELETE', `/users/${admin.id}`);
    assert.equal(del.status, 400);
    const reset = await asAdmin('PUT', `/users/${admin.id}/password`, { password: 'whatever123' });
    assert.equal(reset.status, 400);
    // แก้ชื่อตัวเองได้
    const rename = await asAdmin('PUT', `/users/${admin.id}`, { fullName: 'ผู้ดูแลระบบ (แก้ชื่อ)', role: 'admin', isActive: true });
    assert.equal(rename.status, 200);
  });

  test('admin ลดตำแหน่ง admin คนอื่นได้ (ยังเหลือ admin) และสิทธิ์เปลี่ยนทันที', async () => {
    const second = await asAdmin('POST', '/users', {
      username: 'admin2',
      password: 'password123',
      fullName: 'ผู้ดูแลคนที่ 2',
      role: 'admin',
    });
    assert.equal(second.status, 201);
    const token2 = (await ctx.request('POST', '/auth/login', { body: { username: 'admin2', password: 'password123' } })).body
      .data.token;

    // admin2 ลด admin2 ไม่ได้ (ตัวเอง) แต่ admin ลด admin2 ได้ เพราะยังเหลือ admin
    const demote = await asAdmin('PUT', `/users/${second.body.data.id}`, {
      fullName: 'ผู้ดูแลคนที่ 2',
      role: 'cashier',
      isActive: true,
    });
    assert.equal(demote.status, 200);
    // ตอนนี้ admin2 เป็น cashier -> เข้าจัดการผู้ใช้ไม่ได้
    assert.equal((await ctx.request('GET', '/users', { token: token2 })).status, 403);
  });
});
