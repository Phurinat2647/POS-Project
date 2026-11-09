const { pool } = require('../config/database');
const { toSatang, toBaht } = require('../utils/money');

/**
 * รายงานยอดขาย — นับเฉพาะออเดอร์ที่ชำระแล้ว ตามวันที่ชำระ (paid_at)
 * ช่วงวันที่ from..to (YYYY-MM-DD) รวมทั้งสองวัน
 * ข้อมูลเมนู/หมวดหมู่อ่านจาก snapshot ใน order_items (ไม่ join ไปที่ menus)
 * หมายเหตุ: ยอดรายเมนู/หมวด = line_total (ก่อนหักส่วนลดท้ายบิล)
 */

const baht = (v) => toBaht(toSatang(v || 0));

/** รายการวันที่ตั้งแต่ from ถึง to (คำนวณบน UTC ไม่ขึ้นกับ timezone ของเครื่อง) */
function eachDay(from, to) {
  const toUtc = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const days = [];
  for (let t = toUtc(from); t <= toUtc(to); t += 86400000) days.push(new Date(t).toISOString().slice(0, 10));
  return days;
}

const PAID_IN_RANGE = `o.payment_status = 'paid' AND o.status <> 'cancelled'
  AND o.paid_at >= ? AND o.paid_at < DATE_ADD(?, INTERVAL 1 DAY)`;

async function getSalesReport({ from, to }) {
  const range = [from, to];

  const [[summary]] = await pool.query(
    `SELECT COUNT(*) AS bills, COALESCE(SUM(o.subtotal), 0) AS gross, COALESCE(SUM(o.discount), 0) AS discount,
            COALESCE(SUM(o.total), 0) AS net
       FROM orders o WHERE ${PAID_IN_RANGE}`,
    range
  );
  const [[items]] = await pool.query(
    `SELECT COALESCE(SUM(oi.quantity), 0) AS qty
       FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${PAID_IN_RANGE}`,
    range
  );
  const [[cancelled]] = await pool.query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(subtotal), 0) AS amount
       FROM orders WHERE status = 'cancelled' AND cancelled_at >= ? AND cancelled_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    range
  );
  const [[unpaid]] = await pool.query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(total), 0) AS amount
       FROM orders WHERE status <> 'cancelled' AND payment_status = 'unpaid'
        AND created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
    range
  );

  const [dailyRows] = await pool.query(
    `SELECT DATE_FORMAT(o.paid_at, '%Y-%m-%d') AS day, COUNT(*) AS bills, SUM(o.total) AS sales
       FROM orders o WHERE ${PAID_IN_RANGE} GROUP BY day`,
    range
  );
  const byDay = new Map(dailyRows.map((r) => [r.day, r]));
  const daily = eachDay(from, to).map((day) => ({
    date: day,
    sales: baht(byDay.get(day)?.sales),
    bills: Number(byDay.get(day)?.bills || 0),
  }));

  const [hourRows] = await pool.query(
    `SELECT HOUR(o.paid_at) AS h, COUNT(*) AS bills, SUM(o.total) AS sales
       FROM orders o WHERE ${PAID_IN_RANGE} GROUP BY h`,
    range
  );
  const byHourMap = new Map(hourRows.map((r) => [Number(r.h), r]));
  const byHour = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    sales: baht(byHourMap.get(h)?.sales),
    bills: Number(byHourMap.get(h)?.bills || 0),
  }));

  const [methodRows] = await pool.query(
    `SELECT p.method, COUNT(*) AS bills, SUM(p.amount) AS sales
       FROM payments p JOIN orders o ON o.id = p.order_id WHERE ${PAID_IN_RANGE}
      GROUP BY p.method`,
    range
  );
  const byMethod = ['cash', 'promptpay'].map((method) => {
    const r = methodRows.find((x) => x.method === method);
    return { method, bills: Number(r?.bills || 0), sales: baht(r?.sales) };
  });

  const [menuRows] = await pool.query(
    `SELECT oi.menu_name AS name, oi.category_name AS category, SUM(oi.quantity) AS quantity, SUM(oi.line_total) AS sales
       FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${PAID_IN_RANGE}
      GROUP BY oi.menu_name, oi.category_name
      ORDER BY quantity DESC, sales DESC`,
    range
  );
  const [categoryRows] = await pool.query(
    `SELECT COALESCE(oi.category_name, 'ไม่ระบุ') AS name, SUM(oi.quantity) AS quantity, SUM(oi.line_total) AS sales
       FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${PAID_IN_RANGE}
      GROUP BY name ORDER BY sales DESC`,
    range
  );

  const [orderRows] = await pool.query(
    `SELECT o.order_no, o.order_type, o.table_no, o.subtotal, o.discount, o.total, o.paid_at, p.method,
            (SELECT SUM(oi.quantity) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM orders o JOIN payments p ON p.order_id = o.id
      WHERE ${PAID_IN_RANGE}
      ORDER BY o.paid_at, o.id
      LIMIT 5000`,
    range
  );

  const bills = Number(summary.bills);
  const net = baht(summary.net);
  return {
    range: { from, to },
    summary: {
      bills,
      itemsSold: Number(items.qty),
      grossSales: baht(summary.gross),
      discount: baht(summary.discount),
      netSales: net,
      averagePerBill: bills ? toBaht(Math.round(toSatang(net) / bills)) : 0,
      cancelledOrders: Number(cancelled.n),
      cancelledAmount: baht(cancelled.amount),
      unpaidOrders: Number(unpaid.n),
      unpaidAmount: baht(unpaid.amount),
    },
    daily,
    byHour,
    byMethod,
    topMenus: menuRows.map((r) => ({ name: r.name, category: r.category, quantity: Number(r.quantity), sales: baht(r.sales) })),
    byCategory: categoryRows.map((r) => ({ name: r.name, quantity: Number(r.quantity), sales: baht(r.sales) })),
    orders: orderRows.map((r) => ({
      orderNo: r.order_no,
      orderType: r.order_type,
      tableNo: r.table_no,
      itemCount: Number(r.item_count || 0),
      subtotal: r.subtotal,
      discount: r.discount,
      total: r.total,
      method: r.method,
      paidAt: r.paid_at,
    })),
  };
}

module.exports = { getSalesReport, eachDay };
