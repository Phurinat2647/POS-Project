const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { io: ioClient } = require('socket.io-client');
const { startServer, findMenu, findOption } = require('./helpers');

let ctx;
let kaprao; // ข้าวกะเพราหมูสับ 50 บาท (หมวด 3: ขนาด ธรรมดา/พิเศษ+10, ท็อปปิ้ง ไข่ดาว+10 ฯลฯ)
let special;
let friedEgg;
let normal;
let drink; // เมนูหมวดเครื่องดื่ม (ไม่มีตัวเลือก)

before(async () => {
  ctx = await startServer();
  kaprao = await findMenu(ctx, 'ข้าวกะเพราหมูสับ');
  special = await findOption(ctx, kaprao.id, 'size', 'พิเศษ');
  normal = await findOption(ctx, kaprao.id, 'size', 'ธรรมดา');
  friedEgg = await findOption(ctx, kaprao.id, 'topping', 'ไข่ดาว');
  const menus = await ctx.request('GET', '/menus?categoryId=6', { token: ctx.tokens.admin });
  drink = menus.body.data[0];
});
after(async () => {
  await ctx?.close();
});

const createOrder = (body, token = ctx.tokens.cashier) => ctx.request('POST', '/orders', { token, body });
const setStatus = (id, status, role = 'cashier') =>
  ctx.request('PATCH', `/orders/${id}/status`, { token: ctx.tokens[role], body: { status } });
const pay = (id, body, role = 'cashier') => ctx.request('POST', `/orders/${id}/payment`, { token: ctx.tokens[role], body });

describe('สร้างออเดอร์ — ราคาคำนวณที่ Backend', () => {
  test('คำนวณราคา + ตัวเลือก + จำนวน และไม่สนราคาที่ client ส่งมา', async () => {
    const res = await createOrder({
      orderType: 'dine_in',
      tableNo: 'A1',
      subtotal: 1, // ต้องถูกเพิกเฉย
      total: 1,
      items: [
        { menuId: kaprao.id, optionIds: [special.id, friedEgg.id], quantity: 2, price: 1, note: 'ไม่เผ็ด' },
        { menuId: drink.id, quantity: 1 },
      ],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const order = res.body.data;
    assert.match(order.orderNo, /^\d{8}-\d{4}$/);
    assert.equal(order.status, 'pending');
    assert.equal(order.paymentStatus, 'unpaid');

    const [line1, line2] = order.items;
    assert.equal(line1.unitPrice, 50);
    assert.equal(line1.optionsPrice, 20);
    assert.equal(line1.lineTotal, 140); // (50 + 10 + 10) * 2
    assert.equal(line1.note, 'ไม่เผ็ด');
    assert.equal(line1.menuName, 'ข้าวกะเพราหมูสับ'); // snapshot
    assert.equal(line1.options.length, 2);
    assert.equal(line2.lineTotal, drink.price);
    assert.equal(order.subtotal, 140 + drink.price);
    assert.equal(order.total, order.subtotal);
  });

  test('ไม่เลือกขนาด -> ใช้ขนาดเริ่มต้นอัตโนมัติ', async () => {
    const res = await createOrder({ orderType: 'takeaway', items: [{ menuId: kaprao.id, quantity: 1 }] });
    assert.equal(res.status, 201);
    const item = res.body.data.items[0];
    assert.deepEqual(
      item.options.map((o) => o.name),
      ['ธรรมดา']
    );
    assert.equal(item.lineTotal, 50);
    assert.equal(res.body.data.tableNo, null); // takeaway ไม่มีโต๊ะ
  });

  test('เลขออเดอร์เรียงต่อกันในวันเดียวกัน', async () => {
    const a = await createOrder({ items: [{ menuId: drink.id, quantity: 1 }] });
    const b = await createOrder({ items: [{ menuId: drink.id, quantity: 1 }] });
    const n = (o) => Number(o.body.data.orderNo.split('-')[1]);
    assert.equal(n(b), n(a) + 1);
  });

  test('สร้างพร้อมกัน 10 ออเดอร์ เลขไม่ซ้ำ', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => createOrder({ items: [{ menuId: drink.id, quantity: 1 }] }))
    );
    results.forEach((r) => assert.equal(r.status, 201, JSON.stringify(r.body)));
    const numbers = results.map((r) => r.body.data.orderNo);
    assert.equal(new Set(numbers).size, 10);
  });

  const INVALID = [
    ['ไม่มีรายการ', { items: [] }],
    ['จำนวน 0', { items: [{ menuId: 1, quantity: 0 }] }],
    ['จำนวนเกิน 99', { items: [{ menuId: 1, quantity: 100 }] }],
    ['จำนวนทศนิยม', { items: [{ menuId: 1, quantity: 1.5 }] }],
    ['menuId ไม่ถูกต้อง', { items: [{ menuId: 'abc', quantity: 1 }] }],
    ['ไม่พบเมนู', { items: [{ menuId: 999999, quantity: 1 }] }],
    ['ประเภทออเดอร์ผิด', { orderType: 'delivery', items: [{ menuId: 1, quantity: 1 }] }],
  ];
  for (const [label, body] of INVALID) {
    test(`ข้อมูลไม่ถูกต้อง: ${label} -> 400`, async () => {
      const res = await createOrder(body);
      assert.equal(res.status, 400, JSON.stringify(res.body));
      assert.equal(res.body.success, false);
    });
  }

  test('เลือกขนาด 2 อย่าง -> 400', async () => {
    const res = await createOrder({ items: [{ menuId: kaprao.id, optionIds: [special.id, normal.id], quantity: 1 }] });
    assert.equal(res.status, 400);
  });

  test('ตัวเลือกที่ไม่ใช่ของเมนูนั้น -> 400', async () => {
    const res = await createOrder({ items: [{ menuId: drink.id, optionIds: [friedEgg.id], quantity: 1 }] });
    assert.equal(res.status, 400);
  });

  test('เมนูหมด -> สั่งไม่ได้ และกลับมาสั่งได้เมื่อเปิดขาย', async () => {
    const off = await ctx.request('PATCH', `/menus/${drink.id}/status`, {
      token: ctx.tokens.kitchen,
      body: { status: 'sold_out' },
    });
    assert.equal(off.status, 200);
    const fail = await createOrder({ items: [{ menuId: drink.id, quantity: 1 }] });
    assert.equal(fail.status, 400);
    assert.match(fail.body.message, /หมด/);

    await ctx.request('PATCH', `/menus/${drink.id}/status`, { token: ctx.tokens.kitchen, body: { status: 'available' } });
    const ok = await createOrder({ items: [{ menuId: drink.id, quantity: 1 }] });
    assert.equal(ok.status, 201);
  });

  test('Snapshot: แก้ราคาเมนูภายหลัง ออเดอร์เดิมไม่เปลี่ยน', async () => {
    const menu = await findMenu(ctx, 'ข้าวผัดปู');
    const created = await createOrder({ items: [{ menuId: menu.id, quantity: 1 }] });
    const before = created.body.data.subtotal;

    const upd = await ctx.request('PUT', `/menus/${menu.id}`, {
      token: ctx.tokens.admin,
      body: { categoryId: menu.categoryId, name: 'ข้าวผัดปู (ใหม่)', price: 999, status: 'available' },
    });
    assert.equal(upd.status, 200, JSON.stringify(upd.body));

    const again = await ctx.request('GET', `/orders/${created.body.data.id}`, { token: ctx.tokens.cashier });
    assert.equal(again.body.data.subtotal, before);
    assert.equal(again.body.data.items[0].menuName, 'ข้าวผัดปู');
    assert.equal(again.body.data.items[0].unitPrice, menu.price);
  });

  test('ลบเมนูที่เคยถูกสั่ง -> soft delete', async () => {
    const menu = await findMenu(ctx, 'ข้าวผัดปู (ใหม่)');
    const res = await ctx.request('DELETE', `/menus/${menu.id}`, { token: ctx.tokens.admin });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.softDeleted, true);
    const order = await createOrder({ items: [{ menuId: menu.id, quantity: 1 }] });
    assert.equal(order.status, 400);
  });
});

describe('สถานะออเดอร์', () => {
  let orderId;
  before(async () => {
    const r = await createOrder({ items: [{ menuId: kaprao.id, quantity: 1 }] });
    orderId = r.body.data.id;
  });

  test('ข้ามขั้น pending -> completed ไม่ได้ (409)', async () => {
    const res = await setStatus(orderId, 'completed', 'kitchen');
    assert.equal(res.status, 409);
  });

  test('ครัวยกเลิกออเดอร์ไม่ได้ (403)', async () => {
    const res = await setStatus(orderId, 'cancelled', 'kitchen');
    assert.equal(res.status, 403);
  });

  test('สถานะที่ไม่รู้จัก -> 400', async () => {
    const res = await setStatus(orderId, 'pending', 'kitchen');
    assert.equal(res.status, 400);
  });

  test('pending -> preparing -> completed และบันทึกเวลา', async () => {
    const p = await setStatus(orderId, 'preparing', 'kitchen');
    assert.equal(p.status, 200);
    assert.ok(p.body.data.preparingAt);
    const again = await setStatus(orderId, 'preparing', 'kitchen');
    assert.equal(again.status, 409);
    const c = await setStatus(orderId, 'completed', 'kitchen');
    assert.equal(c.status, 200);
    assert.ok(c.body.data.completedAt);
  });

  test('ออเดอร์เสร็จแล้วยกเลิกไม่ได้', async () => {
    const res = await setStatus(orderId, 'cancelled');
    assert.equal(res.status, 409);
  });

  test('คิวครัวแสดงออเดอร์ค้าง และที่เสร็จวันนี้', async () => {
    const res = await ctx.request('GET', '/orders/kitchen', { token: ctx.tokens.kitchen });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.active.every((o) => ['pending', 'preparing'].includes(o.status)));
    assert.ok(res.body.data.recentCompleted.some((o) => o.id === orderId));
  });

  test('กดเปลี่ยนสถานะพร้อมกัน สำเร็จได้ครั้งเดียว', async () => {
    const r = await createOrder({ items: [{ menuId: drink.id, quantity: 1 }] });
    const results = await Promise.all(Array.from({ length: 5 }, () => setStatus(r.body.data.id, 'preparing', 'kitchen')));
    assert.equal(results.filter((x) => x.status === 200).length, 1);
    assert.equal(results.filter((x) => x.status === 409).length, 4);
  });

  test('ค้นหา/กรองรายการออเดอร์ + แบ่งหน้า', async () => {
    const res = await ctx.request('GET', '/orders?status=completed&pageSize=5', { token: ctx.tokens.cashier });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.orders.every((o) => o.status === 'completed'));
    assert.equal(res.body.data.pagination.pageSize, 5);

    const bad = await ctx.request('GET', '/orders?status=unknown', { token: ctx.tokens.cashier });
    assert.equal(bad.status, 400);

    const search = await ctx.request('GET', `/orders?search=${encodeURIComponent('%_')}`, { token: ctx.tokens.cashier });
    assert.equal(search.status, 200);
    assert.equal(search.body.data.orders.length, 0); // wildcard ถูก escape
  });
});

describe('ชำระเงิน', () => {
  let order; // ยอด 100 บาท (กะเพราพิเศษ 60 + ไข่ดาว 10 = 70? -> ใช้ 2 x 50)
  before(async () => {
    const r = await createOrder({ items: [{ menuId: kaprao.id, quantity: 2 }] });
    order = r.body.data;
    assert.equal(order.subtotal, 100);
  });

  test('ไม่ระบุวิธีชำระ -> 400', async () => {
    const res = await pay(order.id, {});
    assert.equal(res.status, 400);
  });

  test('เงินสดไม่พอ -> 400', async () => {
    const res = await pay(order.id, { method: 'cash', receivedAmount: 99.99 });
    assert.equal(res.status, 400);
  });

  test('ส่วนลดเกินยอด -> 400', async () => {
    const res = await pay(order.id, { method: 'cash', receivedAmount: 100, discount: { type: 'amount', value: 100.01 } });
    assert.equal(res.status, 400);
  });

  test('ส่วนลดเปอร์เซ็นต์เกิน 100 -> 400', async () => {
    const res = await pay(order.id, { method: 'cash', receivedAmount: 100, discount: { type: 'percent', value: 101 } });
    assert.equal(res.status, 400);
  });

  test('เงินสด + ส่วนลด 15% คำนวณยอดและเงินทอนถูกต้อง', async () => {
    const res = await pay(order.id, {
      method: 'cash',
      receivedAmount: 100,
      discount: { type: 'percent', value: 15 },
      total: 1, // ต้องถูกเพิกเฉย
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const o = res.body.data;
    assert.equal(o.paymentStatus, 'paid');
    assert.equal(o.discount, 15);
    assert.equal(o.total, 85);
    assert.equal(o.payment.amount, 85);
    assert.equal(o.payment.receivedAmount, 100);
    assert.equal(o.payment.changeAmount, 15);
    assert.ok(o.paidAt);
  });

  test('ชำระซ้ำ -> 409', async () => {
    const res = await pay(order.id, { method: 'promptpay' });
    assert.equal(res.status, 409);
  });

  test('ชำระแล้วยกเลิกไม่ได้ แต่ยังเปลี่ยนสถานะครัวได้', async () => {
    const cancel = await setStatus(order.id, 'cancelled');
    assert.equal(cancel.status, 409);
    const prep = await setStatus(order.id, 'preparing', 'kitchen');
    assert.equal(prep.status, 200);
  });

  test('ใบเสร็จ: มีข้อมูลร้าน + ยอดจาก snapshot', async () => {
    const res = await ctx.request('GET', `/orders/${order.id}/receipt`, { token: ctx.tokens.cashier });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.shop.shopName);
    assert.equal(res.body.data.order.total, 85);
  });

  test('ใบเสร็จของออเดอร์ที่ยังไม่ชำระ -> 400', async () => {
    const r = await createOrder({ items: [{ menuId: drink.id, quantity: 1 }] });
    const res = await ctx.request('GET', `/orders/${r.body.data.id}/receipt`, { token: ctx.tokens.cashier });
    assert.equal(res.status, 400);
  });

  test('ชำระพร้อมกัน 5 ครั้ง สำเร็จได้ครั้งเดียว', async () => {
    const r = await createOrder({ items: [{ menuId: drink.id, quantity: 1 }] });
    const results = await Promise.all(Array.from({ length: 5 }, () => pay(r.body.data.id, { method: 'promptpay' })));
    assert.equal(results.filter((x) => x.status === 201).length, 1);
    assert.equal(results.filter((x) => x.status === 409).length, 4);
    const [[{ n }]] = await ctx.pool.query('SELECT COUNT(*) AS n FROM payments WHERE order_id = ?', [r.body.data.id]);
    assert.equal(n, 1);
  });

  test('ออเดอร์ที่ยกเลิกแล้วชำระไม่ได้', async () => {
    const r = await createOrder({ items: [{ menuId: drink.id, quantity: 1 }] });
    assert.equal((await setStatus(r.body.data.id, 'cancelled')).status, 200);
    const res = await pay(r.body.data.id, { method: 'cash', receivedAmount: 1000 });
    assert.equal(res.status, 409);
  });

  test('ส่วนลดเป็นจำนวนเงิน + PromptPay', async () => {
    const r = await createOrder({ items: [{ menuId: kaprao.id, optionIds: [special.id], quantity: 1 }] }); // 60
    const res = await pay(r.body.data.id, { method: 'promptpay', referenceNo: 'REF-1', discount: { type: 'amount', value: 10.5 } });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.total, 49.5);
    assert.equal(res.body.data.payment.method, 'promptpay');
    assert.equal(res.body.data.payment.changeAmount, 0);
  });
});

describe('รายงานและ Dashboard นับเฉพาะที่ชำระแล้ว', () => {
  test('ยอดขายสุทธิ = ผลรวม orders.total ที่ชำระแล้ว', async () => {
    const [[expected]] = await ctx.pool.query(
      `SELECT COALESCE(SUM(total), 0) AS net, COUNT(*) AS bills, COALESCE(SUM(discount), 0) AS discount
         FROM orders WHERE payment_status = 'paid' AND paid_at >= CURDATE()`
    );
    const [[{ today }]] = await ctx.pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");

    const report = await ctx.request('GET', `/reports/sales?from=${today}&to=${today}`, { token: ctx.tokens.admin });
    assert.equal(report.status, 200);
    const s = report.body.data.summary;
    assert.equal(s.netSales, expected.net);
    assert.equal(s.discount, expected.discount);
    assert.equal(s.grossSales - s.discount, s.netSales);
    assert.ok(s.cancelledOrders >= 1);
    assert.ok(s.unpaidOrders >= 1);
    const methodSum = report.body.data.byMethod.reduce((sum, m) => sum + m.sales, 0);
    assert.equal(Math.round(methodSum * 100), Math.round(expected.net * 100));

    const dash = await ctx.request('GET', '/dashboard/summary', { token: ctx.tokens.cashier });
    assert.equal(dash.status, 200);
    assert.equal(dash.body.data.today.sales, expected.net);
    assert.equal(dash.body.data.today.paidOrders, Number(expected.bills));
  });

  test('ช่วงวันที่ไม่ถูกต้อง -> 400', async () => {
    for (const q of ['from=2026-02-30', 'from=2026-05-02&to=2026-05-01', 'from=2024-01-01&to=2026-01-01', 'from=abc']) {
      const res = await ctx.request('GET', `/reports/sales?${q}`, { token: ctx.tokens.admin });
      assert.equal(res.status, 400, q);
    }
  });
});

describe('Socket.IO real-time', () => {
  const connect = (token) =>
    new Promise((resolve, reject) => {
      const s = ioClient(ctx.baseUrl, { auth: { token }, transports: ['websocket'], reconnection: false });
      s.on('connect', () => resolve(s));
      s.on('connect_error', (err) => {
        s.close();
        reject(err);
      });
    });

  test('ไม่มี token เชื่อมต่อไม่ได้', async () => {
    await assert.rejects(connect(undefined));
    await assert.rejects(connect('bad-token'));
  });

  test('ครัวได้รับ order:created และ order:updated', async () => {
    const socket = await connect(ctx.tokens.kitchen);
    try {
      const created = new Promise((resolve) => socket.once('order:created', resolve));
      const r = await createOrder({ items: [{ menuId: drink.id, quantity: 1 }] });
      const evt = await created;
      assert.equal(evt.order.id, r.body.data.id);

      const updated = new Promise((resolve) => socket.once('order:updated', resolve));
      await setStatus(r.body.data.id, 'preparing', 'kitchen');
      const upd = await updated;
      assert.equal(upd.order.status, 'preparing');

      const menuEvt = new Promise((resolve) => socket.once('menu:updated', resolve));
      await ctx.request('PATCH', `/menus/${drink.id}/status`, { token: ctx.tokens.cashier, body: { status: 'available' } });
      assert.equal((await menuEvt).menu.id, drink.id);
    } finally {
      socket.close();
    }
  });
});
