const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, findMenu, findOption } = require('./helpers');

/**
 * ตัวเลือกตัดสต็อก: พิเศษ (+% ตามสูตรเมนู) และท็อปปิ้ง (วัตถุดิบเพิ่ม เช่น ไข่ดาว = ไข่ไก่ 1 ฟอง)
 */

let ctx;
let kaprao; // ข้าวกะเพราหมูสับ (หมวดผัดกะเพรา: ขนาด ธรรมดา/พิเศษ + ไข่ดาว/ไข่เจียว/ไข่ข้น)
let special;
let normal;
let friedEgg;
let ings;

before(async () => {
  ctx = await startServer();
  kaprao = await findMenu(ctx, 'ข้าวกะเพราหมูสับ');
  special = await findOption(ctx, kaprao.id, 'size', 'พิเศษ');
  normal = await findOption(ctx, kaprao.id, 'size', 'ธรรมดา');
  friedEgg = await findOption(ctx, kaprao.id, 'topping', 'ไข่ดาว');
  const list = (await ctx.request('GET', '/ingredients', { token: ctx.tokens.admin })).body.data;
  ings = Object.fromEntries(list.map((i) => [i.name, i]));
});
after(async () => {
  await ctx?.close();
});

const round3 = (n) => Math.round(n * 1000) / 1000;
const stockOf = async (id) => (await ctx.request('GET', `/ingredients/${id}`, { token: ctx.tokens.admin })).body.data.quantity;
const getOptRecipe = (id, role = 'admin') => ctx.request('GET', `/menu-options/${id}/recipe`, { token: ctx.tokens[role] });
const setOptRecipe = (id, body, role = 'admin') => ctx.request('PUT', `/menu-options/${id}/recipe`, { token: ctx.tokens[role], body });
const order = (items) => ctx.request('POST', '/orders', { token: ctx.tokens.cashier, body: { items } });

describe('สูตรของตัวเลือก', () => {
  test('ติดตั้งใหม่: ตัวเลือกมาตรฐานมีสูตรจาก recipes.js', async () => {
    const egg = (await getOptRecipe(friedEgg.id)).body.data;
    assert.equal(egg.extraPercent, 0);
    assert.equal(egg.items.find((i) => i.name === 'ไข่ไก่').quantity, 1);
    const sp = (await getOptRecipe(special.id)).body.data;
    assert.equal(sp.extraPercent, 50);
    assert.equal(sp.items.length, 0);
    const n = (await getOptRecipe(normal.id)).body.data;
    assert.equal(n.extraPercent, 0);
    assert.equal(n.items.length, 0);

    const list = (await ctx.request('GET', '/menu-options', { token: ctx.tokens.admin })).body.data;
    const row = list.find((o) => o.id === friedEgg.id);
    assert.equal(row.recipeItemCount, egg.items.length);
    assert.equal(list.find((o) => o.id === special.id).recipeExtraPercent, 50);
  });

  test('สิทธิ์: เฉพาะ admin', async () => {
    assert.equal((await getOptRecipe(friedEgg.id, 'cashier')).status, 403);
    assert.equal((await getOptRecipe(friedEgg.id, 'kitchen')).status, 403);
    assert.equal((await setOptRecipe(friedEgg.id, { extraPercent: 0, items: [] }, 'cashier')).status, 403);
  });

  test('ตรวจข้อมูล', async () => {
    const bad = [
      { extraPercent: 501, items: [] },
      { extraPercent: -1, items: [] },
      { extraPercent: 1.234, items: [] },
      { extraPercent: 0 },
      { extraPercent: 0, items: [{ ingredientId: ings['ไข่ไก่'].id, quantity: 0 }] },
      {
        extraPercent: 0,
        items: [
          { ingredientId: ings['ไข่ไก่'].id, quantity: 1 },
          { ingredientId: ings['ไข่ไก่'].id, quantity: 2 },
        ],
      },
    ];
    for (const body of bad) assert.equal((await setOptRecipe(friedEgg.id, body)).status, 400, JSON.stringify(body));
    assert.equal((await setOptRecipe(999999, { extraPercent: 0, items: [] })).status, 404);
    assert.equal((await getOptRecipe(999999)).status, 404);
  });

  test('บันทึก + พิมพ์ชื่อวัตถุดิบใหม่ได้ แล้วตั้งกลับ', async () => {
    const res = await setOptRecipe(friedEgg.id, {
      extraPercent: 10,
      items: [
        { ingredientId: ings['ไข่ไก่'].id, quantity: 1 },
        { name: 'ซอสพริกทดสอบ', unit: 'ขวด', quantity: 0.01 },
      ],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.extraPercent, 10);
    assert.equal(res.body.data.items.length, 2);
    const back = await setOptRecipe(friedEgg.id, {
      extraPercent: 0,
      items: [
        { ingredientId: ings['ไข่ไก่'].id, quantity: 1 },
        { ingredientId: ings['น้ำมันพืช'].id, quantity: 0.03 },
      ],
    });
    assert.equal(back.status, 200);
  });
});

describe('ตัดสต็อกตามตัวเลือก', () => {
  let orderId;

  test('พิเศษ + ไข่ดาว x2 -> หมูสับ x1.5 และไข่ไก่ 1 ฟอง/จาน พร้อมหมายเหตุออเดอร์', async () => {
    const porkBefore = await stockOf(ings['หมูสับ'].id);
    const eggBefore = await stockOf(ings['ไข่ไก่'].id);
    const res = await order([{ menuId: kaprao.id, optionIds: [special.id, friedEgg.id], quantity: 2 }]);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    orderId = res.body.data.id;
    assert.equal(await stockOf(ings['หมูสับ'].id), round3(porkBefore - 0.1 * 1.5 * 2));
    assert.equal(await stockOf(ings['ไข่ไก่'].id), eggBefore - 2);

    const tx = await ctx.request('GET', `/ingredients/transactions?ingredientId=${ings['ไข่ไก่'].id}`, { token: ctx.tokens.admin });
    const last = tx.body.data.transactions[0];
    assert.equal(last.orderId, orderId);
    assert.equal(last.quantity, 2);
  });

  test('ขนาดค่าเริ่มต้น (ไม่ส่ง optionIds) -> ตัดตามสูตรปกติ', async () => {
    const porkBefore = await stockOf(ings['หมูสับ'].id);
    const eggBefore = await stockOf(ings['ไข่ไก่'].id);
    const res = await order([{ menuId: kaprao.id, quantity: 1 }]);
    assert.equal(res.status, 201);
    assert.equal(await stockOf(ings['หมูสับ'].id), round3(porkBefore - 0.1));
    assert.equal(await stockOf(ings['ไข่ไก่'].id), eggBefore);
  });

  test('ยกเลิก -> คืนสต็อกส่วนของตัวเลือกด้วย', async () => {
    const porkBefore = await stockOf(ings['หมูสับ'].id);
    const eggBefore = await stockOf(ings['ไข่ไก่'].id);
    const res = await ctx.request('PATCH', `/orders/${orderId}/status`, { token: ctx.tokens.cashier, body: { status: 'cancelled' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(await stockOf(ings['หมูสับ'].id), round3(porkBefore + 0.3));
    assert.equal(await stockOf(ings['ไข่ไก่'].id), eggBefore + 2);
  });

  test('วัตถุดิบของตัวเลือกไม่พอ -> 409 ทั้งใบ บอกชื่อตัวเลือก และไม่ตัดอะไร', async () => {
    const eggId = ings['ไข่ไก่'].id;
    const original = await stockOf(eggId);
    const adjust = (newBalance) =>
      ctx.request('POST', `/ingredients/${eggId}/transactions`, { token: ctx.tokens.admin, body: { type: 'adjust', newBalance } });
    assert.equal((await adjust(1)).status, 201);
    const porkBefore = await stockOf(ings['หมูสับ'].id);
    const res = await order([{ menuId: kaprao.id, optionIds: [friedEgg.id], quantity: 2 }]);
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.match(res.body.message, /ไข่ไก่/);
    assert.match(res.body.message, /ไข่ดาว/);
    assert.equal(await stockOf(eggId), 1);
    assert.equal(await stockOf(ings['หมูสับ'].id), porkBefore);
    assert.equal((await adjust(original)).status, 201);
  });

  test('วัตถุดิบของตัวเลือกที่ปิดใช้งาน -> ไม่ถูกตัด', async () => {
    const ing = (
      await ctx.request('POST', '/ingredients', { token: ctx.tokens.admin, body: { name: 'ผักโรยทดสอบ', unit: 'กิโลกรัม', quantity: 1, minQuantity: 0 } })
    ).body.data;
    const save = await setOptRecipe(friedEgg.id, {
      extraPercent: 0,
      items: [
        { ingredientId: ings['ไข่ไก่'].id, quantity: 1 },
        { ingredientId: ing.id, quantity: 0.1 },
      ],
    });
    assert.equal(save.status, 200);
    const off = await ctx.request('PUT', `/ingredients/${ing.id}`, {
      token: ctx.tokens.admin,
      body: { name: ing.name, unit: ing.unit, minQuantity: 0, costPerUnit: 0, isActive: false },
    });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    const res = await order([{ menuId: kaprao.id, optionIds: [friedEgg.id], quantity: 1 }]);
    assert.equal(res.status, 201);
    assert.equal(await stockOf(ing.id), 1);
  });

  test('ไม่มีวัตถุดิบติดลบ', async () => {
    const [[{ n }]] = await ctx.pool.query('SELECT COUNT(*) AS n FROM ingredients WHERE quantity < 0');
    assert.equal(Number(n), 0);
  });
});
