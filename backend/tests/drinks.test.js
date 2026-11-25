const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, findMenu, findOption } = require('./helpers');

/** เครื่องดื่มเพิ่ม (นมสด ชาเขียว นมชมพู ชามะนาว) + ตัวเลือก "ปั่น" (+10 บาท, ตัดน้ำแข็งเพิ่ม) */

let ctx;
let ings;
before(async () => {
  ctx = await startServer();
  const list = (await ctx.request('GET', '/ingredients', { token: ctx.tokens.admin })).body.data;
  ings = Object.fromEntries(list.map((i) => [i.name, i]));
});
after(async () => {
  await ctx?.close();
});

const BLENDABLE = ['ชาเย็น', 'กาแฟเย็น', 'นมสด', 'ชาเขียว', 'นมชมพู', 'ชามะนาว'];
const stockOf = async (name) => (await ctx.request('GET', `/ingredients/${ings[name].id}`, { token: ctx.tokens.admin })).body.data.quantity;

test('ติดตั้งใหม่: "ปั่น" มีเฉพาะเครื่องดื่มที่ปั่นได้', async () => {
  const catalog = (await ctx.request('GET', '/pos/catalog', { token: ctx.tokens.cashier })).body.data;
  for (const m of catalog.menus) {
    const blend = m.toppings.find((o) => o.name === 'ปั่น');
    if (BLENDABLE.includes(m.name)) {
      assert.ok(blend, `${m.name} ควรมีปั่น`);
      assert.equal(blend.extraPrice, 10);
      assert.equal(blend.nameEn, 'Blended');
    } else {
      assert.equal(blend, undefined, `${m.name} ไม่ควรมีปั่น`);
    }
  }
  const pink = catalog.menus.find((m) => m.name === 'นมชมพู');
  assert.equal(pink.nameEn, 'Iced Pink Milk');
  assert.equal(pink.status, 'available');
});

test('นมชมพูปั่น 1 แก้ว: ราคา 45 และตัดนมสด + น้ำแข็ง (สูตร 0.15 + ปั่น 0.15)', async () => {
  const pink = await findMenu(ctx, 'นมชมพู');
  const blend = await findOption(ctx, pink.id, 'topping', 'ปั่น');
  const milk = await stockOf('นมสด');
  const ice = await stockOf('น้ำแข็ง');
  const res = await ctx.request('POST', '/orders', {
    token: ctx.tokens.cashier,
    body: { items: [{ menuId: pink.id, optionIds: [blend.id], quantity: 1 }] },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.total, 45);
  assert.equal(await stockOf('นมสด'), Math.round((milk - 0.2) * 1000) / 1000);
  assert.equal(await stockOf('น้ำแข็ง'), Math.round((ice - 0.3) * 1000) / 1000);
});
