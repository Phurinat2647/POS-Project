const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, findMenu, findOption } = require('./helpers');

/** น้ำอัดลม: ต้องเลือกรส (กลุ่มเลือก 1 อย่างไม่มีค่าเริ่มต้น) และตัดสต็อกกระป๋องของรสนั้น */

let ctx;
let soda;
let ings;
before(async () => {
  ctx = await startServer();
  soda = await findMenu(ctx, 'น้ำอัดลม');
  const list = (await ctx.request('GET', '/ingredients', { token: ctx.tokens.admin })).body.data;
  ings = Object.fromEntries(list.map((i) => [i.name, i]));
});
after(async () => {
  await ctx?.close();
});

const FLAVORS = ['โค้ก', 'น้ำแดง', 'น้ำเขียว', 'น้ำส้ม'];
// วัตถุดิบของแต่ละรส (โค้กตัด "น้ำอัดลม โคล่า")
const CAN = { โค้ก: 'น้ำอัดลม โคล่า', น้ำแดง: 'น้ำอัดลม น้ำแดง', น้ำเขียว: 'น้ำอัดลม น้ำเขียว', น้ำส้ม: 'น้ำอัดลม น้ำส้ม' };
const stockOf = async (name) => (await ctx.request('GET', `/ingredients/${ings[name].id}`, { token: ctx.tokens.admin })).body.data.quantity;
const order = (items) => ctx.request('POST', '/orders', { token: ctx.tokens.cashier, body: { items } });

test('ติดตั้งใหม่: น้ำอัดลมมี 4 รส ไม่มีค่าเริ่มต้น พร้อมวัตถุดิบในคลัง', async () => {
  const catalog = (await ctx.request('GET', '/pos/catalog', { token: ctx.tokens.cashier })).body.data;
  const m = catalog.menus.find((x) => x.id === soda.id);
  assert.deepEqual(m.sizes.map((s) => s.name), FLAVORS);
  assert.ok(m.sizes.every((s) => !s.isDefault && s.extraPrice === 0));
  assert.equal(m.sizes.find((s) => s.name === 'น้ำแดง').nameEn, 'Red Soda');
  for (const f of FLAVORS) assert.equal(ings[CAN[f]].quantity, 24, f);
  assert.equal(ings['น้ำอัดลมกระป๋อง'], undefined);
  assert.equal(ings['น้ำอัดลม น้ำใส'], undefined);
});

test('ไม่เลือกรส -> 400', async () => {
  const res = await order([{ menuId: soda.id, quantity: 1 }]);
  assert.equal(res.status, 400);
});

test('เลือกน้ำแดง 2 กระป๋อง -> ตัดเฉพาะน้ำแดง 2, ราคา 40, ยกเลิกแล้วคืน', async () => {
  const red = await findOption(ctx, soda.id, 'size', 'น้ำแดง');
  const before = Object.fromEntries(await Promise.all(FLAVORS.map(async (f) => [f, await stockOf(CAN[f])])));
  const res = await order([{ menuId: soda.id, optionIds: [red.id], quantity: 2 }]);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.total, 40);
  for (const f of FLAVORS) {
    assert.equal(await stockOf(CAN[f]), before[f] - (f === 'น้ำแดง' ? 2 : 0), f);
  }
  const cancel = await ctx.request('PATCH', `/orders/${res.body.data.id}/status`, {
    token: ctx.tokens.cashier,
    body: { status: 'cancelled' },
  });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  assert.equal(await stockOf('น้ำอัดลม น้ำแดง'), before['น้ำแดง']);
});
