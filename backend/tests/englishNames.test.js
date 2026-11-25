const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, findMenu, findOption } = require('./helpers');

/** ชื่อภาษาอังกฤษของเมนู/ตัวเลือก (แสดงเมื่อเลือกภาษา EN) + snapshot ในออเดอร์ */

let ctx;
before(async () => {
  ctx = await startServer();
});
after(async () => {
  await ctx?.close();
});

const admin = (method, url, body) => ctx.request(method, url, { token: ctx.tokens.admin, body });

test('ติดตั้งใหม่: เมนูและตัวเลือกตั้งต้นมีชื่ออังกฤษ', async () => {
  const kaprao = await findMenu(ctx, 'ข้าวกะเพราหมูสับ');
  assert.equal(kaprao.nameEn, 'Stir-fried Minced Pork with Holy Basil on Rice');
  const egg = await findOption(ctx, kaprao.id, 'topping', 'ไข่ดาว');
  assert.equal(egg.nameEn, 'Fried Egg');

  const catalog = (await ctx.request('GET', '/pos/catalog', { token: ctx.tokens.cashier })).body.data;
  const m = catalog.menus.find((x) => x.id === kaprao.id);
  assert.equal(m.nameEn, kaprao.nameEn);
  assert.equal(m.sizes.find((s) => s.name === 'พิเศษ').nameEn, 'Large');
  assert.equal(m.toppings.find((s) => s.name === 'ไข่ดาว').nameEn, 'Fried Egg');
});

test('ค้นหาเมนูด้วยชื่ออังกฤษได้', async () => {
  const res = await admin('GET', '/menus?search=Pad%20Thai');
  assert.ok(res.body.data.some((m) => m.name === 'ผัดไทยกุ้งสด'));
});

test('เพิ่ม/แก้เมนูพร้อมชื่ออังกฤษ (ว่าง = null) และตรวจความยาว', async () => {
  const created = await admin('POST', '/menus', { categoryId: 6, name: 'น้ำมะพร้าว', nameEn: '  Coconut Juice ', price: 30 });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.data.nameEn, 'Coconut Juice');

  const cleared = await admin('PUT', `/menus/${created.body.data.id}`, { categoryId: 6, name: 'น้ำมะพร้าว', nameEn: '', price: 30 });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.nameEn, null);

  const long = await admin('PUT', `/menus/${created.body.data.id}`, { categoryId: 6, name: 'น้ำมะพร้าว', nameEn: 'x'.repeat(151), price: 30 });
  assert.equal(long.status, 400);
});

test('เพิ่ม/แก้ตัวเลือกพร้อมชื่ออังกฤษ', async () => {
  const res = await admin('POST', '/menu-options', {
    scope: 'category',
    categoryId: 6,
    optionType: 'topping',
    name: 'เพิ่มน้ำแข็ง',
    nameEn: 'Extra Ice',
    extraPrice: 0,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.nameEn, 'Extra Ice');
  const upd = await admin('PUT', `/menu-options/${res.body.data.id}`, {
    scope: 'category',
    categoryId: 6,
    optionType: 'topping',
    name: 'เพิ่มน้ำแข็ง',
    nameEn: 'More Ice',
    extraPrice: 0,
  });
  assert.equal(upd.body.data.nameEn, 'More Ice');
});

test('ออเดอร์เก็บ snapshot ชื่ออังกฤษ — แก้ชื่อเมนูภายหลังไม่กระทบออเดอร์เดิม', async () => {
  const kaprao = await findMenu(ctx, 'ข้าวกะเพราหมูสับ');
  const egg = await findOption(ctx, kaprao.id, 'topping', 'ไข่ดาว');
  const res = await ctx.request('POST', '/orders', {
    token: ctx.tokens.cashier,
    body: { items: [{ menuId: kaprao.id, optionIds: [egg.id], quantity: 1 }] },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const item = res.body.data.items[0];
  assert.equal(item.menuNameEn, kaprao.nameEn);
  assert.ok(item.options.some((o) => o.nameEn === 'Fried Egg'));
  assert.ok(item.options.some((o) => o.nameEn === 'Regular')); // ขนาดค่าเริ่มต้น

  const full = (await admin('GET', `/menus/${kaprao.id}`)).body.data;
  await admin('PUT', `/menus/${kaprao.id}`, {
    categoryId: full.categoryId,
    name: full.name,
    nameEn: 'Renamed Basil Pork',
    price: full.price,
    status: full.status,
  });
  const again = await admin('GET', `/orders/${res.body.data.id}`);
  assert.equal(again.body.data.items[0].menuNameEn, kaprao.nameEn);
});
