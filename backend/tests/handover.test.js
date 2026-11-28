const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, findMenu } = require('./helpers');

let ctx;
let kaprao;
let order; // 2 × กะเพรา + 1 × กะเพรา = 3 กล่อง

before(async () => {
  ctx = await startServer();
  kaprao = await findMenu(ctx, 'ข้าวกะเพราหมูสับ');
  const res = await ctx.request('POST', '/orders', {
    token: ctx.tokens.cashier,
    body: { items: [{ menuId: kaprao.id, quantity: 2 }, { menuId: kaprao.id, quantity: 1, note: 'ไม่เผ็ด' }] },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  order = res.body.data;
});
after(async () => {
  await ctx?.close();
});

const lookup = (code, role = 'cashier') =>
  ctx.request('GET', `/orders/lookup?code=${encodeURIComponent(code)}`, { token: ctx.tokens[role] });
const setStatus = (status, role = 'cashier') =>
  ctx.request('PATCH', `/orders/${order.id}/status`, { token: ctx.tokens[role], body: { status } });

describe('สแกนบาร์โค้ดสติ๊กเกอร์ (GET /orders/lookup)', () => {
  test('รหัส <เลขออเดอร์>-<กล่อง> คืนออเดอร์ + ลำดับกล่อง + จำนวนกล่อง', async () => {
    const res = await lookup(`${order.orderNo}-2`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.order.id, order.id);
    assert.equal(res.body.data.box, 2);
    assert.equal(res.body.data.boxes, 3);
    assert.equal(res.body.data.order.items.length, 2);
  });

  test('เลขออเดอร์อย่างเดียวก็ค้นได้ (box = null)', async () => {
    const res = await lookup(` ${order.orderNo} `);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.box, null);
  });

  test('รูปแบบผิด / กล่องเกินจำนวน -> 400, ไม่พบ -> 404', async () => {
    assert.equal((await lookup('abc')).status, 400);
    assert.equal((await lookup(`${order.orderNo}-4`)).status, 400);
    assert.equal((await lookup(`${order.orderNo}-0`)).status, 400);
    assert.equal((await lookup('19990101-9999-1')).status, 404);
  });

  test('ครัวใช้หน้าส่งมอบไม่ได้', async () => {
    assert.equal((await lookup(`${order.orderNo}-1`, 'kitchen')).status, 403);
  });
});

describe('ส่งมอบออเดอร์ (status = delivered)', () => {
  test('ยังไม่เสร็จ -> ส่งมอบไม่ได้', async () => {
    assert.equal((await setStatus('delivered')).status, 409);
  });

  test('เสร็จแล้วแต่ยังไม่ชำระ -> ส่งมอบไม่ได้', async () => {
    assert.equal((await setStatus('preparing', 'kitchen')).status, 200);
    assert.equal((await setStatus('completed', 'kitchen')).status, 200);
    const res = await setStatus('delivered');
    assert.equal(res.status, 409);
    assert.match(res.body.message, /ยังไม่ได้ชำระเงิน/);
  });

  test('ครัวส่งมอบไม่ได้', async () => {
    const pay = await ctx.request('POST', `/orders/${order.id}/payment`, {
      token: ctx.tokens.cashier,
      body: { method: 'promptpay' },
    });
    assert.equal(pay.status, 201, JSON.stringify(pay.body));
    assert.equal((await setStatus('delivered', 'kitchen')).status, 403);
  });

  test('แคชเชียร์ส่งมอบได้ บันทึกเวลาและผู้ส่งมอบ', async () => {
    const res = await setStatus('delivered');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, 'delivered');
    assert.ok(res.body.data.deliveredAt);
    assert.ok(res.body.data.deliveredByName);
    assert.equal(res.body.data.completedAt != null, true);
  });

  test('ส่งมอบซ้ำ / ยกเลิกหลังส่งมอบ ไม่ได้', async () => {
    assert.equal((await setStatus('delivered')).status, 409);
    assert.equal((await setStatus('cancelled')).status, 409);
  });

  test('ครัวยังเห็นในรายการเสร็จวันนี้ และกรองสถานะ delivered ได้', async () => {
    const queue = await ctx.request('GET', '/orders/kitchen', { token: ctx.tokens.kitchen });
    assert.ok(queue.body.data.recentCompleted.some((o) => o.id === order.id));
    const list = await ctx.request('GET', '/orders?status=delivered', { token: ctx.tokens.cashier });
    assert.equal(list.status, 200);
    assert.ok(list.body.data.orders.every((o) => o.status === 'delivered'));
    assert.ok(list.body.data.orders.some((o) => o.id === order.id));
  });
});
