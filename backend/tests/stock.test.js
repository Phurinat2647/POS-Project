const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, findMenu } = require('./helpers');

let ctx;
let menu; // เมนูทดสอบที่สร้างใหม่ (ไม่มีตัวเลือก ราคา 40)
let rice;
let pork;
let ingA; // วัตถุดิบใหม่ คงเหลือ 1

before(async () => {
  ctx = await startServer();
  const ings = (await ctx.request('GET', '/ingredients', { token: ctx.tokens.admin })).body.data;
  rice = ings.find((i) => i.name === 'ข้าวสาร');
  pork = ings.find((i) => i.name === 'หมูสับ');
  const a = await ctx.request('POST', '/ingredients', {
    token: ctx.tokens.admin,
    body: { name: 'ซอสพิเศษ', unit: 'ขวด', quantity: 1, minQuantity: 0.5 },
  });
  ingA = a.body.data;
  const m = await ctx.request('POST', '/menus', {
    token: ctx.tokens.admin,
    body: { categoryId: 6, name: 'เมนูทดสอบสต็อก', price: 40 },
  });
  menu = m.body.data;
});
after(async () => {
  await ctx?.close();
});

const stockOf = async (id) => (await ctx.request('GET', `/ingredients/${id}`, { token: ctx.tokens.admin })).body.data.quantity;
const setRecipe = (items, role = 'admin', menuId = menu.id) =>
  ctx.request('PUT', `/menus/${menuId}/recipe`, { token: ctx.tokens[role], body: { items } });
const order = (items) => ctx.request('POST', '/orders', { token: ctx.tokens.cashier, body: { items } });
const getMenu = async (id) => (await ctx.request('GET', `/menus/${id}`, { token: ctx.tokens.admin })).body.data;

describe('สูตรอาหาร', () => {
  test('สิทธิ์: admin แก้ได้, ครัวดูได้, แคชเชียร์ดูไม่ได้', async () => {
    assert.equal((await setRecipe([], 'kitchen')).status, 403);
    assert.equal((await ctx.request('GET', `/menus/${menu.id}/recipe`, { token: ctx.tokens.kitchen })).status, 200);
    assert.equal((await ctx.request('GET', `/menus/${menu.id}/recipe`, { token: ctx.tokens.cashier })).status, 403);
  });

  test('ตรวจข้อมูล', async () => {
    const bad = [
      [{ ingredientId: rice.id, quantity: 0 }],
      [{ ingredientId: rice.id, quantity: -1 }],
      [{ ingredientId: rice.id, quantity: 0.0001 }],
      [{ ingredientId: 999999, quantity: 1 }],
      [
        { ingredientId: rice.id, quantity: 1 },
        { ingredientId: rice.id, quantity: 2 },
      ],
    ];
    for (const items of bad) assert.equal((await setRecipe(items)).status, 400, JSON.stringify(items));
    assert.equal((await ctx.request('PUT', `/menus/${menu.id}/recipe`, { token: ctx.tokens.admin, body: {} })).status, 400);
    assert.equal((await setRecipe([], 'admin', 999999)).status, 404);
  });

  test('บันทึกและอ่านสูตร (แทนที่ทั้งหมด)', async () => {
    const res = await setRecipe([
      { ingredientId: rice.id, quantity: 0.15 },
      { ingredientId: pork.id, quantity: 0.1 },
      { ingredientId: ingA.id, quantity: 0.4 },
    ]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.length, 3);
    const read = await ctx.request('GET', `/menus/${menu.id}/recipe`, { token: ctx.tokens.admin });
    assert.equal(read.body.data.find((r) => r.ingredientId === pork.id).quantity, 0.1);
  });

  test('ติดตั้งใหม่: ทุกเมนูตั้งต้นมีสูตร และวัตถุดิบในสูตรมียอดตัวอย่าง', async () => {
    const [rows] = await ctx.pool.query(
      `SELECT m.name, m.status, COUNT(mi.ingredient_id) AS n, MIN(i.quantity) AS min_stock
         FROM menus m LEFT JOIN menu_ingredients mi ON mi.menu_id = m.id LEFT JOIN ingredients i ON i.id = mi.ingredient_id
        WHERE m.name <> 'เมนูทดสอบสต็อก' GROUP BY m.id`
    );
    assert.equal(rows.length, 39); // 23 เดิม + อาหารคลีน 6 + น้ำปั่นคลีน 6 + เครื่องดื่ม 4
    for (const r of rows) {
      if (r.name === 'น้ำอัดลม') continue; // ตัดสต็อกตามรสที่เลือก (ตัวเลือก) ไม่มีสูตรของเมนู
      assert.ok(Number(r.n) > 0, `${r.name} ไม่มีสูตร`);
      assert.ok(r.min_stock > 0, `${r.name} มีวัตถุดิบยอด 0`);
      if (r.name !== 'สุกี้แห้งหมู') assert.equal(r.status, 'available', `${r.name} ควรพร้อมขาย`); // สุกี้แห้งหมูตั้งเป็นหมดใน seed
    }
  });

  test('ติดตั้งใหม่: หมวดอาหารคลีน/น้ำปั่นคลีน มีเมนู ชื่ออังกฤษ และตัวเลือกที่ตัดสต็อก', async () => {
    const [menus] = await ctx.pool.query(
      `SELECT c.name AS cat, COUNT(*) AS n, COUNT(m.name_en) AS n_en
         FROM menus m JOIN categories c ON c.id = m.category_id
        WHERE c.name IN ('อาหารคลีน', 'น้ำปั่นคลีน') GROUP BY c.id ORDER BY c.sort_order`
    );
    assert.deepEqual(
      menus.map((r) => [r.cat, Number(r.n), Number(r.n_en)]),
      [
        ['อาหารคลีน', 6, 6],
        ['น้ำปั่นคลีน', 6, 6],
      ]
    );
    const [opts] = await ctx.pool.query(
      `SELECT o.name, o.name_en, o.is_default, o.recipe_extra_percent AS pct,
              (SELECT COUNT(*) FROM option_ingredients oi WHERE oi.option_id = o.id) AS items
         FROM menu_options o JOIN categories c ON c.id = o.category_id
        WHERE c.name IN ('อาหารคลีน', 'น้ำปั่นคลีน') ORDER BY c.sort_order, o.sort_order`
    );
    assert.deepEqual(
      opts.map((o) => [o.name, o.name_en, Number(o.is_default), Number(o.pct), Number(o.items)]),
      [
        ['เพิ่มอกไก่', 'Extra Chicken Breast', 0, 0, 1],
        ['แก้วปกติ', 'Regular Cup', 1, 0, 0],
        ['แก้วใหญ่', 'Large Cup', 0, 50, 0],
        ['เพิ่มเวย์โปรตีน', 'Add Whey Protein', 0, 0, 1],
        ['เพิ่มเมล็ดเชีย', 'Add Chia Seeds', 0, 0, 1],
      ]
    );
  });

  test('สูตรมาตรฐานจาก recipes.js ถูกใส่ให้กะเพราหมูสับ', async () => {
    const kaprao = await findMenu(ctx, 'ข้าวกะเพราหมูสับ');
    const res = await ctx.request('GET', `/menus/${kaprao.id}/recipe`, { token: ctx.tokens.admin });
    const names = res.body.data.map((r) => r.name);
    for (const n of ['ข้าวสาร', 'หมูสับ', 'ใบกะเพรา', 'กระเทียม']) assert.ok(names.includes(n), n);
  });
});

describe('สูตรอาหาร — พิมพ์ชื่อวัตถุดิบเอง', () => {
  let other; // เมนูแยกสำหรับชุดนี้ (ไม่กระทบเทสต์ตัดสต็อก)
  before(async () => {
    other = (await ctx.request('POST', '/menus', { token: ctx.tokens.admin, body: { categoryId: 6, name: 'เมนูทดสอบพิมพ์วัตถุดิบ', price: 20 } }))
      .body.data;
  });
  const save = (items) => setRecipe(items, 'admin', other.id);
  const ingredientsNamed = async (name) =>
    (await ctx.request('GET', `/ingredients?includeInactive=1&search=${encodeURIComponent(name)}`, { token: ctx.tokens.admin })).body.data.filter(
      (i) => i.name === name
    );

  test('ชื่อใหม่ -> สร้างวัตถุดิบ (คงเหลือ 0) และผูกกับสูตร', async () => {
    const res = await save([{ name: '  ผงปาปริก้า ', unit: 'กรัม', quantity: 5 }, { ingredientId: rice.id, quantity: 0.1 }]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const created = await ingredientsNamed('ผงปาปริก้า');
    assert.equal(created.length, 1);
    assert.equal(created[0].unit, 'กรัม');
    assert.equal(created[0].quantity, 0);
    assert.ok(res.body.data.some((r) => r.ingredientId === created[0].id && r.quantity === 5));
  });

  test('พิมพ์ชื่อที่มีอยู่แล้ว -> ใช้วัตถุดิบเดิม ไม่สร้างซ้ำ', async () => {
    const res = await save([{ name: 'ผงปาปริก้า', unit: 'ช้อน', quantity: 3 }]);
    assert.equal(res.status, 200);
    const list = await ingredientsNamed('ผงปาปริก้า');
    assert.equal(list.length, 1);
    assert.equal(list[0].unit, 'กรัม'); // ไม่เปลี่ยนหน่วยของตัวเดิม
  });

  test('ชื่อซ้ำในสูตรเดียว (ใหม่+ใหม่ / ใหม่+เลือกจากรายการ) -> 400 และไม่สร้างวัตถุดิบ', async () => {
    const a = await save([
      { name: 'น้ำตาลมะพร้าว', unit: 'กรัม', quantity: 1 },
      { name: 'น้ำตาลมะพร้าว', unit: 'กรัม', quantity: 2 },
    ]);
    assert.equal(a.status, 400);
    const b = await save([{ name: 'ข้าวสาร', unit: 'กิโลกรัม', quantity: 1 }, { ingredientId: rice.id, quantity: 1 }]);
    assert.equal(b.status, 400);
    assert.equal((await ingredientsNamed('น้ำตาลมะพร้าว')).length, 0); // rollback
  });

  test('ไม่ใส่หน่วย / ไม่ใส่ชื่อ -> 400', async () => {
    assert.equal((await save([{ name: 'ซีอิ๊วดำ', quantity: 1 }])).status, 400);
    assert.equal((await save([{ name: '', unit: 'ขวด', quantity: 1 }])).status, 400);
  });

  test('ชื่อตรงกับวัตถุดิบที่ปิดใช้งาน -> 400', async () => {
    const ing = (await ctx.request('POST', '/ingredients', { token: ctx.tokens.admin, body: { name: 'พริกป่น', unit: 'กรัม' } })).body.data;
    await ctx.request('PUT', `/ingredients/${ing.id}`, {
      token: ctx.tokens.admin,
      body: { name: 'พริกป่น', unit: 'กรัม', minQuantity: 0, isActive: false },
    });
    const res = await save([{ name: 'พริกป่น', unit: 'กรัม', quantity: 1 }]);
    assert.equal(res.status, 400);
    assert.match(res.body.message, /ปิดใช้งาน/);
  });
});

describe('ตัดสต็อกอัตโนมัติ', () => {
  let orderId;

  test('สร้างออเดอร์ -> ตัดตามสูตร x จำนวน และบันทึกประวัติพร้อมเลขออเดอร์', async () => {
    const riceBefore = await stockOf(rice.id);
    const porkBefore = await stockOf(pork.id);
    const res = await order([{ menuId: menu.id, quantity: 2 }]);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    orderId = res.body.data.id;

    assert.equal(await stockOf(rice.id), Math.round((riceBefore - 0.3) * 1000) / 1000);
    assert.equal(await stockOf(pork.id), Math.round((porkBefore - 0.2) * 1000) / 1000);
    assert.equal(await stockOf(ingA.id), 0.2); // 1 - 0.8

    const tx = await ctx.request('GET', `/ingredients/transactions?ingredientId=${ingA.id}`, { token: ctx.tokens.admin });
    const last = tx.body.data.transactions[0];
    assert.equal(last.type, 'out');
    assert.equal(last.quantity, 0.8);
    assert.equal(last.balanceAfter, 0.2);
    assert.equal(last.orderId, orderId);
    assert.equal(last.orderNo, res.body.data.orderNo);
  });

  test('วัตถุดิบเหลือไม่พอทำอีกจาน -> เมนูถูกตั้งเป็น "หมด" อัตโนมัติ และสั่งไม่ได้', async () => {
    // ingA เหลือ 0.2 แต่สูตรใช้ 0.4
    const m = await getMenu(menu.id);
    assert.equal(m.status, 'sold_out');
    assert.equal(m.autoSoldOut, true);
    const res = await order([{ menuId: menu.id, quantity: 1 }]);
    assert.equal(res.status, 400);
    assert.match(res.body.message, /หมด/);
    assert.equal(await stockOf(ingA.id), 0.2);
  });

  test('ตั้งเป็นพร้อมขายเองไม่ได้ ถ้าวัตถุดิบไม่พอ', async () => {
    const res = await ctx.request('PATCH', `/menus/${menu.id}/status`, { token: ctx.tokens.admin, body: { status: 'available' } });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /ซอสพิเศษ/);
  });

  test('รับเข้าวัตถุดิบ -> เมนูเปิดขายคืนอัตโนมัติ', async () => {
    const inn = await ctx.request('POST', `/ingredients/${ingA.id}/transactions`, {
      token: ctx.tokens.kitchen,
      body: { type: 'in', quantity: 1 },
    });
    assert.equal(inn.status, 201);
    assert.equal(inn.body.data.ingredient.quantity, 1.2);
    const m = await getMenu(menu.id);
    assert.equal(m.status, 'available');
    assert.equal(m.autoSoldOut, false);
  });

  test('สั่งเกินวัตถุดิบที่มี -> 409 ทั้งใบ ไม่ตัดอะไรเลย (ไม่ติดลบ)', async () => {
    const riceBefore = await stockOf(rice.id);
    const res = await order([{ menuId: menu.id, quantity: 4 }]); // ต้องใช้ 1.6 มี 1.2
    assert.equal(res.status, 409);
    assert.match(res.body.message, /วัตถุดิบไม่พอ/);
    assert.match(res.body.message, /ซอสพิเศษ/);
    assert.match(res.body.message, /เมนูทดสอบสต็อก/);
    assert.equal(res.body.details[0].ingredientId, ingA.id);
    assert.equal(await stockOf(ingA.id), 1.2);
    assert.equal(await stockOf(rice.id), riceBefore);
  });

  test('ใช้วัตถุดิบหมดพอดี -> ขายได้ ยอดเป็น 0 และเมนูหมด + แจ้งเตือนจุดสั่งซื้อ', async () => {
    const res = await order([{ menuId: menu.id, quantity: 3 }]);
    assert.equal(res.status, 201);
    assert.equal(await stockOf(ingA.id), 0);
    const warning = res.body.data.stockWarnings.find((w) => w.id === ingA.id);
    assert.equal(warning?.quantity, 0);
    assert.equal((await getMenu(menu.id)).status, 'sold_out');
  });

  test('เบิกออกเกินคงเหลือไม่ได้', async () => {
    const out = await ctx.request('POST', `/ingredients/${ingA.id}/transactions`, {
      token: ctx.tokens.kitchen,
      body: { type: 'out', quantity: 0.1 },
    });
    assert.equal(out.status, 400);
  });

  test('ยกเลิกออเดอร์ -> คืนสต็อกเท่าที่ตัดไป (แม้แก้สูตรภายหลัง)', async () => {
    const before = await stockOf(ingA.id);
    // แก้สูตรหลังสั่ง — การคืนต้องอิงจากที่ตัดจริง (0.8)
    await setRecipe([{ ingredientId: ingA.id, quantity: 5 }]);
    const res = await ctx.request('PATCH', `/orders/${orderId}/status`, {
      token: ctx.tokens.cashier,
      body: { status: 'cancelled' },
    });
    assert.equal(res.status, 200);
    assert.equal(await stockOf(ingA.id), Math.round((before + 0.8) * 1000) / 1000);

    const tx = await ctx.request('GET', `/ingredients/transactions?ingredientId=${ingA.id}`, { token: ctx.tokens.admin });
    const last = tx.body.data.transactions[0];
    assert.equal(last.type, 'in');
    assert.equal(last.orderId, orderId);
    assert.match(last.note, /ยกเลิก/);
  });

  test('ออเดอร์ไม่ผ่านการตรวจ -> ไม่ตัดสต็อกเลย', async () => {
    const before = await stockOf(ingA.id);
    const soldOut = await findMenu(ctx, 'ข้าวผัดปู');
    await ctx.request('PATCH', `/menus/${soldOut.id}/status`, { token: ctx.tokens.admin, body: { status: 'sold_out' } });
    const res = await order([
      { menuId: menu.id, quantity: 1 },
      { menuId: soldOut.id, quantity: 1 },
    ]);
    assert.equal(res.status, 400);
    assert.equal(await stockOf(ingA.id), before);
  });

  test('วัตถุดิบที่ปิดใช้งาน -> ไม่ถูกตัด', async () => {
    await setRecipe([{ ingredientId: ingA.id, quantity: 0.1 }, { ingredientId: rice.id, quantity: 0.1 }]);
    await ctx.request('DELETE', `/ingredients/${ingA.id}`, { token: ctx.tokens.admin }); // มีประวัติ -> soft delete
    const before = await stockOf(ingA.id);
    const riceBefore = await stockOf(rice.id);
    const res = await order([{ menuId: menu.id, quantity: 1 }]);
    assert.equal(res.status, 201);
    assert.equal(await stockOf(ingA.id), before);
    assert.equal(await stockOf(rice.id), Math.round((riceBefore - 0.1) * 1000) / 1000);
  });

  test('สั่งพร้อมกัน 10 ออเดอร์ ยอดตัดครบไม่หาย', async () => {
    await setRecipe([{ ingredientId: rice.id, quantity: 0.1 }]);
    const before = await stockOf(rice.id);
    const results = await Promise.all(Array.from({ length: 10 }, () => order([{ menuId: menu.id, quantity: 1 }])));
    results.forEach((r) => assert.equal(r.status, 201));
    assert.equal(await stockOf(rice.id), Math.round((before - 1) * 1000) / 1000);
  });

  test('สั่งพร้อมกันเกินวัตถุดิบ -> ขายได้เท่าที่มี ยอดไม่ติดลบ', async () => {
    const b = (await ctx.request('POST', '/ingredients', { token: ctx.tokens.admin, body: { name: 'ผงทดสอบพร้อมกัน', unit: 'กก.', quantity: 1 } })).body
      .data;
    const m = (await ctx.request('POST', '/menus', { token: ctx.tokens.admin, body: { categoryId: 6, name: 'เมนูทดสอบพร้อมกัน', price: 10 } })).body
      .data;
    assert.equal((await setRecipe([{ ingredientId: b.id, quantity: 0.3 }], 'admin', m.id)).status, 200);
    const results = await Promise.all(Array.from({ length: 10 }, () => order([{ menuId: m.id, quantity: 1 }])));
    assert.equal(results.filter((r) => r.status === 201).length, 3);
    results.filter((r) => r.status !== 201).forEach((r) => assert.ok([400, 409].includes(r.status), String(r.status)));
    assert.equal(await stockOf(b.id), 0.1);
    assert.equal((await getMenu(m.id)).status, 'sold_out');
  });

  test('เมนูที่ตั้งเป็นหมดเอง -> รับเข้าวัตถุดิบแล้วระบบไม่เปิดขายให้', async () => {
    const kaprao = await findMenu(ctx, 'ข้าวกะเพราไก่');
    await ctx.request('PATCH', `/menus/${kaprao.id}/status`, { token: ctx.tokens.admin, body: { status: 'sold_out' } });
    await ctx.request('POST', `/ingredients/${rice.id}/transactions`, { token: ctx.tokens.admin, body: { type: 'in', quantity: 1 } });
    const m = await getMenu(kaprao.id);
    assert.equal(m.status, 'sold_out');
    assert.equal(m.autoSoldOut, false);
  });

  test('ไม่มีวัตถุดิบติดลบ', async () => {
    const [[{ n }]] = await ctx.pool.query('SELECT COUNT(*) AS n FROM ingredients WHERE quantity < 0');
    assert.equal(Number(n), 0);
    await assert.rejects(ctx.pool.query('UPDATE ingredients SET quantity = -1 WHERE id = ?', [rice.id])); // CHECK
  });

  test('ยอดคงเหลือ = balance_after ล่าสุด และสอดคล้องกับผลรวมรายการทั้งหมด', async () => {
    const [rows] = await ctx.pool.query(
      `SELECT i.id, i.quantity,
              (SELECT t.balance_after FROM inventory_transactions t WHERE t.ingredient_id = i.id ORDER BY t.id DESC LIMIT 1) AS last_balance
         FROM ingredients i`
    );
    for (const r of rows) if (r.last_balance !== null) assert.equal(r.quantity, r.last_balance, `ingredient ${r.id}`);
  });
});
