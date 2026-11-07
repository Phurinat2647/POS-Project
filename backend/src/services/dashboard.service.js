const { pool } = require('../config/database');
const { toSatang, toBaht } = require('../utils/money');

const TREND_DAYS = 7;

/** ปัดยอดเงินจาก SUM() ผ่านหน่วยสตางค์ */
const baht = (v) => toBaht(toSatang(v || 0));

/** วันที่ YYYY-MM-DD ย้อนหลัง n วันจาก today (คำนวณบน UTC เพื่อไม่ให้ timezone ของเครื่องมีผล) */
function lastDays(today, n) {
  const [y, m, d] = today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(Date.UTC(y, m - 1, d - (n - 1 - i)));
    return dt.toISOString().slice(0, 10);
  });
}

/**
 * สรุปข้อมูลหน้า Dashboard — ยอดขายนับจากออเดอร์ที่ชำระแล้ว (payment_status = 'paid') ตาม paid_at
 * ข้อมูลเมนูขายดีอ่านจาก snapshot ใน order_items (ไม่ join ไปที่ menus)
 */
async function getSummary() {
  const [[{ today }]] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today");

  const [[sales]] = await pool.query(
    `SELECT
        COALESCE(SUM(CASE WHEN paid_at >= CURDATE() THEN total END), 0) AS today_sales,
        COUNT(CASE WHEN paid_at >= CURDATE() THEN 1 END) AS today_paid_orders,
        COALESCE(SUM(CASE WHEN paid_at >= CURDATE() - INTERVAL 1 DAY AND paid_at < CURDATE() THEN total END), 0) AS yesterday_sales
       FROM orders
      WHERE payment_status = 'paid' AND status <> 'cancelled'
        AND paid_at >= CURDATE() - INTERVAL 1 DAY`
  );

  const [[orders]] = await pool.query(
    `SELECT
        COUNT(CASE WHEN status <> 'cancelled' THEN 1 END) AS today_orders,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending,
        COUNT(CASE WHEN status = 'preparing' THEN 1 END) AS preparing,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled,
        COUNT(CASE WHEN payment_status = 'unpaid' AND status <> 'cancelled' THEN 1 END) AS unpaid
       FROM orders
      WHERE created_at >= CURDATE()`
  );

  const [trendRows] = await pool.query(
    `SELECT DATE_FORMAT(paid_at, '%Y-%m-%d') AS day, SUM(total) AS sales, COUNT(*) AS orders
       FROM orders
      WHERE payment_status = 'paid' AND status <> 'cancelled'
        AND paid_at >= CURDATE() - INTERVAL ? DAY
      GROUP BY day`,
    [TREND_DAYS - 1]
  );
  const byDay = new Map(trendRows.map((r) => [r.day, r]));
  const salesTrend = lastDays(today, TREND_DAYS).map((day) => ({
    date: day,
    sales: baht(byDay.get(day)?.sales),
    orders: Number(byDay.get(day)?.orders || 0),
  }));

  const [topMenus] = await pool.query(
    `SELECT oi.menu_name AS name, SUM(oi.quantity) AS quantity, SUM(oi.line_total) AS sales
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.payment_status = 'paid' AND o.status <> 'cancelled'
        AND o.paid_at >= CURDATE() - INTERVAL ? DAY
      GROUP BY oi.menu_name
      ORDER BY quantity DESC, sales DESC
      LIMIT 5`,
    [TREND_DAYS - 1]
  );

  const [[menuStats]] = await pool.query(
    `SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN m.status = 'available' THEN 1 END) AS available,
        COUNT(CASE WHEN m.status = 'sold_out' THEN 1 END) AS sold_out,
        (SELECT COUNT(*) FROM categories WHERE is_active = 1) AS categories
       FROM menus m JOIN categories c ON c.id = m.category_id
      WHERE m.is_active = 1 AND c.is_active = 1`
  );

  const [lowStock] = await pool.query(
    `SELECT id, name, unit, quantity, min_quantity
       FROM ingredients
      WHERE is_active = 1 AND quantity <= min_quantity
      ORDER BY (quantity / NULLIF(min_quantity, 0)), name
      LIMIT 10`
  );

  const [recentOrders] = await pool.query(
    `SELECT id, order_no, order_type, table_no, status, payment_status, total, created_at
       FROM orders ORDER BY created_at DESC, id DESC LIMIT 5`
  );

  const todaySales = baht(sales.today_sales);
  const todayPaid = Number(sales.today_paid_orders);

  return {
    date: today,
    today: {
      sales: todaySales,
      paidOrders: todayPaid,
      averagePerBill: todayPaid ? toBaht(Math.round(toSatang(todaySales) / todayPaid)) : 0,
      yesterdaySales: baht(sales.yesterday_sales),
      orders: Number(orders.today_orders),
      pending: Number(orders.pending),
      preparing: Number(orders.preparing),
      cancelled: Number(orders.cancelled),
      unpaid: Number(orders.unpaid),
    },
    salesTrend,
    topMenus: topMenus.map((r) => ({ name: r.name, quantity: Number(r.quantity), sales: baht(r.sales) })),
    menus: {
      total: Number(menuStats.total),
      available: Number(menuStats.available),
      soldOut: Number(menuStats.sold_out),
      categories: Number(menuStats.categories),
    },
    lowStock: lowStock.map((r) => ({
      id: r.id,
      name: r.name,
      unit: r.unit,
      quantity: r.quantity,
      minQuantity: r.min_quantity,
    })),
    recentOrders: recentOrders.map((r) => ({
      id: r.id,
      orderNo: r.order_no,
      orderType: r.order_type,
      tableNo: r.table_no,
      status: r.status,
      paymentStatus: r.payment_status,
      total: r.total,
      createdAt: r.created_at,
    })),
  };
}

module.exports = { getSummary };
