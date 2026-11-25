const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers');

/** ต้นทุน/กำไรต่อจานในรายการเมนู (GET /menus) — คำนวณจากสูตร × ต้นทุนต่อหน่วย, แสดงเฉพาะ admin */

let ctx;
before(async () => {
  ctx = await startServer();
});
after(async () => {
  await ctx?.close();
});

const listAs = async (role) => {
  const res = await ctx.request('GET', '/menus', { token: ctx.tokens[role] });
  assert.equal(res.status, 200);
  return res.body.data;
};

test('admin เห็นต้นทุน/กำไรที่ตรงกับสูตร × ต้นทุนวัตถุดิบ', async () => {
  const menus = await listAs('admin');
  const [rows] = await ctx.pool.query(
    `SELECT mi.menu_id, ROUND(SUM(mi.quantity * COALESCE(i.cost_per_unit, 0)), 2) AS cost
       FROM menu_ingredients mi JOIN ingredients i ON i.id = mi.ingredient_id GROUP BY mi.menu_id`
  );
  const expected = new Map(rows.map((r) => [r.menu_id, Number(r.cost)]));
  for (const m of menus) {
    assert.ok(m.costing, `${m.name} ไม่มี costing`);
    if (!expected.has(m.id)) {
      assert.equal(m.costing.cost, null);
      continue;
    }
    assert.equal(m.costing.cost, expected.get(m.id), m.name);
    assert.equal(m.costing.profit, Math.round((m.price - m.costing.cost) * 100) / 100, m.name);
  }

  // ตัวอย่างคำนวณมือ: แตงโมมะนาวปั่น = แตงโม 0.25×20 + มะนาว 0.5×3 + น้ำแข็ง 0.1×5 = 7.00 -> กำไร 49 - 7 = 42 (85.7%)
  const melon = menus.find((m) => m.name === 'แตงโมมะนาวปั่น');
  assert.deepEqual(melon.costing, {
    ingredientCost: 7,
    extraCost: 0,
    cost: 7,
    profit: 42,
    marginPercent: 85.7,
    recipeItems: 3,
    missingCostItems: 0,
  });
});

test('วัตถุดิบที่ไม่ได้ใส่ต้นทุน -> นับเป็น 0 และแจ้ง missingCostItems', async () => {
  await ctx.pool.query("UPDATE ingredients SET cost_per_unit = NULL WHERE name = 'น้ำแข็ง'");
  try {
    const melon = (await listAs('admin')).find((m) => m.name === 'แตงโมมะนาวปั่น');
    assert.equal(melon.costing.cost, 6.5);
    assert.equal(melon.costing.missingCostItems, 1);
  } finally {
    await ctx.pool.query("UPDATE ingredients SET cost_per_unit = 5 WHERE name = 'น้ำแข็ง'");
  }
});

test('cashier / kitchen ไม่เห็นต้นทุน', async () => {
  for (const role of ['cashier', 'kitchen']) {
    const menus = await listAs(role);
    assert.ok(menus.length > 0);
    assert.ok(menus.every((m) => m.costing === undefined), role);
  }
});

test('ต้นทุนอื่นต่อจาน: admin ตั้งได้ บวกเข้าต้นทุนรวม และตรวจข้อมูล', async () => {
  const melon = (await listAs('admin')).find((m) => m.name === 'แตงโมมะนาวปั่น');
  const set = (body, role = 'admin', id = melon.id) => ctx.request('PATCH', `/menus/${id}/extra-cost`, { token: ctx.tokens[role], body });

  const res = await set({ extraCost: 3.5 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(
    { i: res.body.data.ingredientCost, e: res.body.data.extraCost, c: res.body.data.cost, p: res.body.data.profit },
    { i: 7, e: 3.5, c: 10.5, p: 38.5 }
  );
  const again = (await listAs('admin')).find((m) => m.id === melon.id);
  assert.equal(again.costing.cost, 10.5);

  for (const bad of [-1, 'abc', 100000]) assert.equal((await set({ extraCost: bad })).status, 400, String(bad));
  assert.equal((await set({ extraCost: 1 }, 'cashier')).status, 403);
  assert.equal((await set({ extraCost: 1 }, 'kitchen')).status, 403);
  assert.equal((await set({ extraCost: 1 }, 'admin', 999999)).status, 404);

  assert.equal((await set({ extraCost: 0 })).status, 200);
});

test('เมนูไม่มีสูตร + ต้นทุนอื่น -> ต้นทุนรวม = ต้นทุนอื่น', async () => {
  const soda = (await listAs('admin')).find((m) => m.name === 'น้ำอัดลม');
  assert.equal(soda.costing.cost, null);
  const res = await ctx.request('PATCH', `/menus/${soda.id}/extra-cost`, { token: ctx.tokens.admin, body: { extraCost: 12 } });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.ingredientCost, null);
  assert.equal(res.body.data.cost, 12);
  assert.equal(res.body.data.profit, 8);
});
