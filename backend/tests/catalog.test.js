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

describe('หมวดหมู่', () => {
  let catId;

  test('เพิ่ม / ชื่อซ้ำ / แก้ไข', async () => {
    const res = await asAdmin('POST', '/categories', { name: 'ของหวาน', sortOrder: 7 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    catId = res.body.data.id;

    const dup = await asAdmin('POST', '/categories', { name: 'ของหวาน' });
    assert.equal(dup.status, 409);

    const empty = await asAdmin('POST', '/categories', { name: '   ' });
    assert.equal(empty.status, 400);

    const upd = await asAdmin('PUT', `/categories/${catId}`, { name: 'ขนมหวาน', sortOrder: 8 });
    assert.equal(upd.status, 200);
    assert.equal(upd.body.data.name, 'ขนมหวาน');
  });

  test('หมวดที่ปิดใช้งาน: ซ่อนจากพนักงาน และเพิ่มเมนูไม่ได้', async () => {
    await asAdmin('PUT', `/categories/${catId}`, { name: 'ขนมหวาน', isActive: false });
    const cashierList = await ctx.request('GET', '/categories', { token: ctx.tokens.cashier });
    assert.ok(!cashierList.body.data.some((c) => c.id === catId));
    const adminList = await asAdmin('GET', '/categories?includeInactive=1');
    assert.ok(adminList.body.data.some((c) => c.id === catId));

    const menu = await asAdmin('POST', '/menus', { categoryId: catId, name: 'บัวลอย', price: 30 });
    assert.equal(menu.status, 400);
  });

  test('ลบหมวดหมู่ที่ยังมีเมนู -> 409', async () => {
    const res = await asAdmin('DELETE', '/categories/1');
    assert.equal(res.status, 409);
  });

  test('ลบหมวดหมู่ว่าง', async () => {
    const res = await asAdmin('DELETE', `/categories/${catId}`);
    assert.equal(res.status, 200);
  });
});

describe('เมนู', () => {
  let menuId;

  test('เพิ่มเมนู (JSON) + ตรวจราคา', async () => {
    for (const price of [-1, 'abc', 10.555, '']) {
      const bad = await asAdmin('POST', '/menus', { categoryId: 1, name: 'ทดสอบราคา', price });
      assert.equal(bad.status, 400, `price=${price}`);
    }
    const res = await asAdmin('POST', '/menus', { categoryId: 1, name: 'ข้าวหมูทอดกระเทียม', price: '55.50' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.price, 55.5);
    menuId = res.body.data.id;

    const dup = await asAdmin('POST', '/menus', { categoryId: 1, name: 'ข้าวหมูทอดกระเทียม', price: 50 });
    assert.equal(dup.status, 409);
  });

  test('เพิ่มเมนูแบบ multipart/form-data', async () => {
    const form = new FormData();
    form.append('categoryId', '6');
    form.append('name', 'ชาไทยเย็น');
    form.append('price', '35');
    const res = await fetch(`${ctx.baseUrl}/api/menus`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.tokens.admin}` },
      body: form,
    });
    assert.equal(res.status, 201);
  });

  test('อัปโหลดไฟล์ที่ไม่ใช่รูป -> 400', async () => {
    const form = new FormData();
    form.append('categoryId', '6');
    form.append('name', 'ไฟล์ผิดประเภท');
    form.append('price', '10');
    form.append('image', new Blob(['hello'], { type: 'text/plain' }), 'x.txt');
    const res = await fetch(`${ctx.baseUrl}/api/menus`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.tokens.admin}` },
      body: form,
    });
    assert.equal(res.status, 400);
  });

  test('POS catalog แสดงเมนูใหม่พร้อมตัวเลือกของหมวด', async () => {
    const res = await ctx.request('GET', '/pos/catalog', { token: ctx.tokens.cashier });
    assert.equal(res.status, 200);
    const text = JSON.stringify(res.body.data);
    assert.ok(text.includes('ข้าวหมูทอดกระเทียม'));
  });

  test('ลบเมนูที่ไม่เคยขาย -> ลบจริง', async () => {
    const res = await asAdmin('DELETE', `/menus/${menuId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.softDeleted, false);
    const again = await asAdmin('GET', `/menus/${menuId}`);
    assert.equal(again.status, 404);
  });
});

describe('ตัวเลือกเมนู', () => {
  test('กำหนดขอบเขต menu/category/all ได้ และตรวจข้อมูล', async () => {
    const forMenu = await asAdmin('POST', '/menu-options', {
      scope: 'menu',
      menuId: 1,
      optionType: 'topping',
      name: 'เพิ่มหมูสับ',
      extraPrice: 15,
    });
    assert.equal(forMenu.status, 201, JSON.stringify(forMenu.body));
    assert.equal(forMenu.body.data.menuId, 1);
    assert.equal(forMenu.body.data.categoryId, null);

    const all = await asAdmin('POST', '/menu-options', { scope: 'all', optionType: 'topping', name: 'ใส่กล่อง', extraPrice: 5 });
    assert.equal(all.status, 201);
    assert.equal(all.body.data.menuId, null);
    assert.equal(all.body.data.categoryId, null);

    const badDefault = await asAdmin('POST', '/menu-options', {
      scope: 'all',
      optionType: 'topping',
      name: 'x',
      isDefault: true,
    });
    assert.equal(badDefault.status, 400);

    const noMenu = await asAdmin('POST', '/menu-options', { scope: 'menu', optionType: 'topping', name: 'x' });
    assert.equal(noMenu.status, 400);

    const del = await asAdmin('DELETE', `/menu-options/${all.body.data.id}`);
    assert.equal(del.status, 200);
  });
});

describe('ตั้งค่าร้าน', () => {
  const base = { shopName: 'ร้านทดสอบ', shopAddress: '', shopPhone: '', taxId: '', receiptFooter: 'ขอบคุณ' };

  test('PromptPay / เลขผู้เสียภาษี ตรวจรูปแบบ', async () => {
    for (const promptpayId of ['12345', '1234567890', 'abc0812345678']) {
      const res = await asAdmin('PUT', '/settings', { ...base, promptpayId });
      assert.equal(res.status, 400, promptpayId);
    }
    const badTax = await asAdmin('PUT', '/settings', { ...base, taxId: '123' });
    assert.equal(badTax.status, 400);
    const noName = await asAdmin('PUT', '/settings', { ...base, shopName: '' });
    assert.equal(noName.status, 400);
  });

  test('บันทึกได้ และแคชเชียร์อ่านได้', async () => {
    const res = await asAdmin('PUT', '/settings', { ...base, promptpayId: '081-234-5678', taxId: '0105555555555' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.promptpayId, '0812345678');
    const read = await ctx.request('GET', '/settings', { token: ctx.tokens.cashier });
    assert.equal(read.body.data.shopName, 'ร้านทดสอบ');
  });
});

describe('คลังวัตถุดิบ', () => {
  let ing;

  test('เพิ่มวัตถุดิบ + ยอดเริ่มต้นบันทึกเป็นรายการ', async () => {
    const res = await asAdmin('POST', '/ingredients', { name: 'น้ำปลา', unit: 'ขวด', quantity: 10, minQuantity: 3, costPerUnit: 25 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    ing = res.body.data;
    assert.equal(ing.quantity, 10);

    const dup = await asAdmin('POST', '/ingredients', { name: 'น้ำปลา', unit: 'ขวด' });
    assert.equal(dup.status, 409);
  });

  const tx = (role, body) => ctx.request('POST', `/ingredients/${ing.id}/transactions`, { token: ctx.tokens[role], body });

  test('รับเข้า / เบิกออก ทศนิยม 3 ตำแหน่งไม่คลาดเคลื่อน', async () => {
    const a = await tx('kitchen', { type: 'in', quantity: 0.1 });
    assert.equal(a.status, 201, JSON.stringify(a.body));
    const b = await tx('kitchen', { type: 'in', quantity: 0.2 });
    assert.equal(b.body.data.ingredient.quantity, 10.3); // ไม่ใช่ 10.299999...
    const c = await tx('kitchen', { type: 'out', quantity: 0.3, note: 'ใช้ทำอาหาร' });
    assert.equal(c.body.data.ingredient.quantity, 10);
    assert.equal(c.body.data.transaction.balanceAfter, 10);
    assert.equal(c.body.data.transaction.quantity, 0.3);
  });

  test('เบิกเกินคงเหลือ -> 400 และยอดไม่เปลี่ยน', async () => {
    const res = await tx('kitchen', { type: 'out', quantity: 10.001 });
    assert.equal(res.status, 400);
    const cur = await ctx.request('GET', `/ingredients/${ing.id}`, { token: ctx.tokens.kitchen });
    assert.equal(cur.body.data.quantity, 10);
  });

  test('ตรวจข้อมูล: จำนวน 0 / ติดลบ / ทศนิยม 4 ตำแหน่ง / ประเภทผิด', async () => {
    for (const body of [
      { type: 'in', quantity: 0 },
      { type: 'in', quantity: -1 },
      { type: 'in', quantity: 1.0001 },
      { type: 'transfer', quantity: 1 },
    ]) {
      const res = await tx('kitchen', body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });

  test('ปรับยอด: เก็บ quantity เป็นค่าบวก และ balance_after ตรงยอดที่นับ', async () => {
    const same = await tx('admin', { type: 'adjust', newBalance: 10 });
    assert.equal(same.status, 400);
    const down = await tx('admin', { type: 'adjust', newBalance: 2.5 });
    assert.equal(down.status, 201);
    assert.equal(down.body.data.transaction.quantity, 7.5);
    assert.equal(down.body.data.transaction.balanceAfter, 2.5);
    assert.equal(down.body.data.ingredient.isLow, true); // 2.5 <= 3
  });

  test('เบิกพร้อมกันเกินยอด: สำเร็จเท่าที่มีของ ยอดไม่ติดลบ', async () => {
    // คงเหลือ 2.5 -> เบิก 1 พร้อมกัน 5 ครั้ง ควรสำเร็จ 2 ครั้ง
    const results = await Promise.all(Array.from({ length: 5 }, () => tx('kitchen', { type: 'out', quantity: 1 })));
    assert.equal(results.filter((r) => r.status === 201).length, 2);
    const cur = await ctx.request('GET', `/ingredients/${ing.id}`, { token: ctx.tokens.kitchen });
    assert.equal(cur.body.data.quantity, 0.5);
  });

  test('ยอดคงเหลือ = ผลรวมรายการเคลื่อนไหว (balance_after ล่าสุด)', async () => {
    const res = await ctx.request('GET', `/ingredients/transactions?ingredientId=${ing.id}&pageSize=100`, {
      token: ctx.tokens.kitchen,
    });
    assert.equal(res.status, 200);
    const list = res.body.data.transactions;
    assert.equal(list[0].balanceAfter, 0.5); // ใหม่สุดก่อน
    assert.ok(list.every((t) => t.quantity > 0));
  });

  test('กรองเฉพาะของใกล้หมด', async () => {
    const res = await ctx.request('GET', '/ingredients?lowOnly=1', { token: ctx.tokens.kitchen });
    assert.ok(res.body.data.every((i) => i.isLow));
    assert.ok(res.body.data.some((i) => i.id === ing.id));
  });

  test('ลบวัตถุดิบที่มีประวัติ -> ปิดใช้งาน และบันทึกรายการไม่ได้', async () => {
    const del = await asAdmin('DELETE', `/ingredients/${ing.id}`);
    assert.equal(del.status, 200);
    assert.equal(del.body.data.softDeleted, true);
    const res = await tx('admin', { type: 'in', quantity: 1 });
    assert.equal(res.status, 400);
  });

  test('แคชเชียร์เข้าคลังไม่ได้', async () => {
    const res = await ctx.request('POST', '/ingredients/1/transactions', {
      token: ctx.tokens.cashier,
      body: { type: 'in', quantity: 1 },
    });
    assert.equal(res.status, 403);
  });
});
