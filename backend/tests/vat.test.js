const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const { startServer, findMenu, findOption } = require('./helpers');

let ctx;
let kaprao; // ข้าวกะเพราหมูสับ 50 บาท
let special; // พิเศษ +10

before(async () => {
  ctx = await startServer();
  kaprao = await findMenu(ctx, 'ข้าวกะเพราหมูสับ');
  special = await findOption(ctx, kaprao.id, 'size', 'พิเศษ');
});
after(async () => {
  await ctx?.close();
});

const getSettings = () => ctx.request('GET', '/settings', { token: ctx.tokens.admin });
const putSettings = async (patch) => {
  const current = (await getSettings()).body.data;
  return ctx.request('PUT', '/settings', { token: ctx.tokens.admin, body: { ...current, ...patch } });
};
const createOrder = (items) => ctx.request('POST', '/orders', { token: ctx.tokens.cashier, body: { items } });
const pay = (id, body) => ctx.request('POST', `/orders/${id}/payment`, { token: ctx.tokens.cashier, body });

describe('ตั้งค่า VAT', () => {
  test('ค่าตั้งต้น: ปิด VAT อัตรา 7%', async () => {
    const res = await getSettings();
    assert.equal(res.status, 200);
    assert.equal(res.body.data.vatEnabled, false);
    assert.equal(res.body.data.vatRate, 7);
  });

  test('อัตรา VAT ต้องมากกว่า 0 และไม่เกิน 30', async () => {
    assert.equal((await putSettings({ vatRate: 0 })).status, 400);
    assert.equal((await putSettings({ vatRate: 31 })).status, 400);
    assert.equal((await putSettings({ vatRate: 'abc' })).status, 400);
  });

  test('ไม่ส่งค่า VAT มา = คงค่าเดิม', async () => {
    const res = await ctx.request('PUT', '/settings', { token: ctx.tokens.admin, body: { shopName: 'ร้านทดสอบ' } });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.vatEnabled, false);
    assert.equal(res.body.data.vatRate, 7);
  });

  test('cashier แก้การตั้งค่าไม่ได้', async () => {
    const res = await ctx.request('PUT', '/settings', { token: ctx.tokens.cashier, body: { shopName: 'x', vatEnabled: true } });
    assert.equal(res.status, 403);
  });
});

describe('ชำระเงินพร้อม VAT', () => {
  test('ปิด VAT: ยอดสุทธิไม่บวก VAT', async () => {
    await putSettings({ vatEnabled: false });
    const order = (await createOrder([{ menuId: kaprao.id, quantity: 2 }])).body.data; // 100
    const res = await pay(order.id, { method: 'cash', receivedAmount: 100 });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.vatRate, 0);
    assert.equal(res.body.data.vatAmount, 0);
    assert.equal(res.body.data.total, 100);
  });

  test('เปิด VAT 7%: บวกเพิ่มจากยอดหลังส่วนลด และเงินสดต้องพอยอดรวม VAT', async () => {
    assert.equal((await putSettings({ vatEnabled: true, vatRate: 7 })).status, 200);
    const order = (await createOrder([{ menuId: kaprao.id, optionIds: [special.id], quantity: 3 }])).body.data; // 180
    const discount = { type: 'amount', value: 20 }; // 160 -> VAT 11.20 -> 171.20

    const short = await pay(order.id, { method: 'cash', receivedAmount: 160, discount });
    assert.equal(short.status, 400);

    const res = await pay(order.id, { method: 'cash', receivedAmount: 200, discount });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const paid = res.body.data;
    assert.equal(paid.subtotal, 180);
    assert.equal(paid.discount, 20);
    assert.equal(paid.vatRate, 7);
    assert.equal(paid.vatAmount, 11.2);
    assert.equal(paid.total, 171.2);
    assert.equal(paid.payment.amount, 171.2);
    assert.equal(paid.payment.changeAmount, 28.8);
  });

  test('VAT ปัดเศษเป็นสตางค์', async () => {
    await putSettings({ vatEnabled: true, vatRate: 7 });
    const order = (await createOrder([{ menuId: kaprao.id, quantity: 1 }])).body.data; // 50
    const res = await pay(order.id, { method: 'promptpay', discount: { type: 'amount', value: 0.07 } }); // 49.93 * 7% = 3.4951
    assert.equal(res.status, 201);
    assert.equal(res.body.data.vatAmount, 3.5);
    assert.equal(res.body.data.total, 53.43);
  });

  test('ใบเสร็จเก่าคงค่า VAT ตอนชำระ แม้ปิด VAT ภายหลัง', async () => {
    await putSettings({ vatEnabled: true, vatRate: 7 });
    const order = (await createOrder([{ menuId: kaprao.id, quantity: 1 }])).body.data;
    assert.equal((await pay(order.id, { method: 'promptpay' })).status, 201);
    await putSettings({ vatEnabled: false });

    const receipt = await ctx.request('GET', `/orders/${order.id}/receipt`, { token: ctx.tokens.cashier });
    assert.equal(receipt.status, 200, JSON.stringify(receipt.body));
    assert.equal(receipt.body.data.order.vatAmount, 3.5);
    assert.equal(receipt.body.data.order.total, 53.5);
  });

  test('รายงานแสดง VAT รวม และยอดสุทธิรวม VAT', async () => {
    const [[expected]] = await ctx.pool.query(
      `SELECT COALESCE(SUM(vat_amount), 0) AS vat, COALESCE(SUM(total), 0) AS net
         FROM orders WHERE payment_status = 'paid' AND paid_at >= CURDATE()`
    );
    const [[{ today }]] = await ctx.pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");
    const res = await ctx.request('GET', `/reports/sales?from=${today}&to=${today}`, { token: ctx.tokens.admin });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.summary.vat, expected.vat);
    assert.equal(res.body.data.summary.netSales, expected.net);
    assert.ok(res.body.data.summary.vat > 0);
    assert.ok(res.body.data.orders.some((o) => o.vatAmount > 0));
  });
});
