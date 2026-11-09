const { pool, withTransaction } = require('../config/database');
const ApiError = require('../utils/ApiError');
const { toSatang, toBaht } = require('../utils/money');

/**
 * ออเดอร์
 * - ราคาทั้งหมดคำนวณที่นี่จากฐานข้อมูล (หน่วยสตางค์) — ไม่รับราคาจาก client
 * - order_items / order_item_options เก็บ snapshot ชื่อและราคา ณ เวลาสั่ง
 */

const STATUS_LABEL = { pending: 'รอทำ', preparing: 'กำลังทำ', completed: 'เสร็จแล้ว', cancelled: 'ยกเลิก' };

/** สถานะที่เปลี่ยนไปได้จากแต่ละสถานะ */
const TRANSITIONS = {
  pending: ['preparing', 'cancelled'],
  preparing: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

/** คอลัมน์เวลาที่บันทึกเมื่อเปลี่ยนเป็นสถานะนั้น (ค่าคงที่ — ไม่ได้มาจาก input) */
const STATUS_TIME_COLUMN = { preparing: 'preparing_at', completed: 'completed_at', cancelled: 'cancelled_at' };

// ---------------------------------------------------------------------
// แปลงข้อมูล
// ---------------------------------------------------------------------

const toOrder = (r) => ({
  id: r.id,
  orderNo: r.order_no,
  orderType: r.order_type,
  tableNo: r.table_no,
  status: r.status,
  paymentStatus: r.payment_status,
  subtotal: r.subtotal,
  discount: r.discount,
  total: r.total,
  note: r.note,
  cashierId: r.cashier_id,
  cashierName: r.cashier_name ?? null,
  itemCount: r.item_count != null ? Number(r.item_count) : undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  preparingAt: r.preparing_at,
  completedAt: r.completed_at,
  cancelledAt: r.cancelled_at,
  paidAt: r.paid_at,
  payment: r.payment_id
    ? {
        id: r.payment_id,
        method: r.payment_method,
        amount: r.payment_amount,
        receivedAmount: r.payment_received,
        changeAmount: r.payment_change,
        referenceNo: r.payment_reference,
        receivedByName: r.payment_received_by ?? null,
        paidAt: r.paid_at,
      }
    : null,
});

const toItem = (r) => ({
  id: r.id,
  menuId: r.menu_id,
  menuName: r.menu_name,
  categoryName: r.category_name,
  unitPrice: r.unit_price,
  optionsPrice: r.options_price,
  quantity: r.quantity,
  lineTotal: r.line_total,
  note: r.note,
  options: [],
});

const ORDER_SELECT = `
  SELECT o.*, u.full_name AS cashier_name,
         (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
         p.id AS payment_id, p.method AS payment_method, p.amount AS payment_amount,
         p.received_amount AS payment_received, p.change_amount AS payment_change,
         p.reference_no AS payment_reference, pu.full_name AS payment_received_by
    FROM orders o
    LEFT JOIN users u ON u.id = o.cashier_id
    LEFT JOIN payments p ON p.order_id = o.id
    LEFT JOIN users pu ON pu.id = p.received_by`;

/** โหลดรายการอาหาร + ตัวเลือก (snapshot) ให้หลายออเดอร์ในคราวเดียว */
async function attachItems(orders, conn = pool) {
  if (!orders.length) return orders;
  const ids = orders.map((o) => o.id);
  const [itemRows] = await conn.query('SELECT * FROM order_items WHERE order_id IN (?) ORDER BY id', [ids]);
  const items = itemRows.map((r) => ({ ...toItem(r), orderId: r.order_id }));

  if (items.length) {
    const [optRows] = await conn.query(
      `SELECT * FROM order_item_options WHERE order_item_id IN (?)
        ORDER BY order_item_id, option_type = 'topping', id`,
      [items.map((i) => i.id)]
    );
    const byItem = new Map(items.map((i) => [i.id, i]));
    for (const o of optRows) {
      byItem.get(o.order_item_id)?.options.push({
        id: o.id,
        menuOptionId: o.menu_option_id,
        optionType: o.option_type,
        name: o.option_name,
        extraPrice: o.extra_price,
      });
    }
  }

  const byOrder = new Map(orders.map((o) => [o.id, { ...o, items: [] }]));
  for (const { orderId, ...item } of items) byOrder.get(orderId)?.items.push(item);
  return orders.map((o) => byOrder.get(o.id));
}

// ---------------------------------------------------------------------
// อ่านข้อมูล
// ---------------------------------------------------------------------

async function getById(id, conn = pool) {
  const [rows] = await conn.query(`${ORDER_SELECT} WHERE o.id = ?`, [id]);
  if (!rows[0]) throw ApiError.notFound('ไม่พบออเดอร์');
  const [order] = await attachItems([toOrder(rows[0])], conn);
  return order;
}

/**
 * รายการออเดอร์ (เรียงใหม่สุดก่อน)
 * filters: statuses[], paymentStatus, date (YYYY-MM-DD ตาม created_at), search (เลขออเดอร์/โต๊ะ), page, pageSize
 */
async function list({ statuses, paymentStatus, date, search, page = 1, pageSize = 20 } = {}) {
  const where = [];
  const params = [];
  if (statuses?.length) {
    where.push('o.status IN (?)');
    params.push(statuses);
  }
  if (paymentStatus) {
    where.push('o.payment_status = ?');
    params.push(paymentStatus);
  }
  if (date) {
    where.push('o.created_at >= ? AND o.created_at < ? + INTERVAL 1 DAY');
    params.push(date, date);
  }
  if (search) {
    const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`;
    where.push('(o.order_no LIKE ? OR o.table_no LIKE ?)');
    params.push(like, like);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM orders o ${whereSql}`, params);
  const [rows] = await pool.query(
    `${ORDER_SELECT} ${whereSql} ORDER BY o.created_at DESC, o.id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );
  const orders = await attachItems(rows.map(toOrder));
  return { orders, pagination: { page, pageSize, total: Number(total), totalPages: Math.ceil(total / pageSize) || 1 } };
}

/**
 * คิวครัว: ออเดอร์ที่ยังไม่เสร็จทั้งหมด (เก่าสุดก่อน) + ที่เสร็จล่าสุดของวันนี้
 */
async function listKitchenQueue({ recentLimit = 12 } = {}) {
  const [active] = await pool.query(
    `${ORDER_SELECT} WHERE o.status IN ('pending', 'preparing') ORDER BY o.created_at, o.id`
  );
  const [done] = await pool.query(
    `${ORDER_SELECT} WHERE o.status = 'completed' AND o.completed_at >= CURDATE()
      ORDER BY o.completed_at DESC, o.id DESC LIMIT ?`,
    [recentLimit]
  );
  const [activeOrders, completedOrders] = await Promise.all([
    attachItems(active.map(toOrder)),
    attachItems(done.map(toOrder)),
  ]);
  return { active: activeOrders, recentCompleted: completedOrders };
}

// ---------------------------------------------------------------------
// สร้างออเดอร์
// ---------------------------------------------------------------------

const optionAppliesTo = (opt, menu) =>
  opt.menu_id === menu.id ||
  opt.category_id === menu.category_id ||
  (opt.menu_id === null && opt.category_id === null);

/**
 * ตรวจสอบและคำนวณราคารายการทั้งหมดจากข้อมูลใน DB
 * - เมนูต้องเปิดใช้งาน พร้อมขาย และหมวดหมู่ต้องเปิดใช้งาน
 * - ตัวเลือกต้องเปิดใช้งานและใช้กับเมนูนั้นได้
 * - ขนาด (size) เลือกได้ 1 อย่าง — ถ้าไม่เลือกจะใช้ค่าเริ่มต้น (is_default)
 */
async function priceItems(conn, items) {
  const menuIds = [...new Set(items.map((i) => i.menuId))];
  const [menuRows] = await conn.query(
    `SELECT m.id, m.name, m.price, m.status, m.is_active, m.category_id,
            c.name AS category_name, c.is_active AS category_active
       FROM menus m JOIN categories c ON c.id = m.category_id
      WHERE m.id IN (?)`,
    [menuIds]
  );
  const menus = new Map(menuRows.map((m) => [m.id, m]));
  const categoryIds = [...new Set(menuRows.map((m) => m.category_id))];

  const [optionRows] = await conn.query(
    `SELECT id, menu_id, category_id, option_type, name, extra_price, is_default
       FROM menu_options
      WHERE is_active = 1
        AND (menu_id IN (?) OR category_id IN (?) OR (menu_id IS NULL AND category_id IS NULL))
      ORDER BY option_type, sort_order, id`,
    [menuIds, categoryIds.length ? categoryIds : [0]]
  );

  return items.map((item, index) => {
    const menu = menus.get(item.menuId);
    const label = `รายการที่ ${index + 1}`;
    if (!menu || !menu.is_active) throw ApiError.badRequest(`${label}: ไม่พบเมนูที่เลือก`);
    if (!menu.category_active) throw ApiError.badRequest(`เมนู "${menu.name}" อยู่ในหมวดหมู่ที่ปิดใช้งาน`);
    if (menu.status !== 'available') throw ApiError.badRequest(`เมนู "${menu.name}" หมดแล้ว`);

    const applicable = optionRows.filter((o) => optionAppliesTo(o, menu));
    const chosen = item.optionIds.map((optId) => {
      const opt = applicable.find((o) => o.id === optId);
      if (!opt) throw ApiError.badRequest(`ตัวเลือกที่เลือกใช้กับเมนู "${menu.name}" ไม่ได้ หรือถูกปิดใช้งานแล้ว`);
      return opt;
    });

    const sizes = applicable.filter((o) => o.option_type === 'size');
    const chosenSizes = chosen.filter((o) => o.option_type === 'size');
    if (chosenSizes.length > 1) throw ApiError.badRequest(`เมนู "${menu.name}" เลือกขนาดได้เพียง 1 อย่าง`);
    if (sizes.length && !chosenSizes.length) {
      const def = sizes.find((o) => o.is_default);
      if (!def) throw ApiError.badRequest(`กรุณาเลือกขนาดของเมนู "${menu.name}"`);
      chosen.unshift(def);
    }

    const unitSatang = toSatang(menu.price);
    const optionsSatang = chosen.reduce((sum, o) => sum + toSatang(o.extra_price), 0);
    const lineSatang = (unitSatang + optionsSatang) * item.quantity;

    return {
      menu,
      options: chosen,
      quantity: item.quantity,
      note: item.note,
      unitSatang,
      optionsSatang,
      lineSatang,
    };
  });
}

/** เลขออเดอร์รายวัน YYYYMMDD-NNNN (ต้องเรียกภายใน transaction — แถวของวันนั้นถูก lock จนกว่าจะ commit) */
async function nextOrderNo(conn) {
  const [[{ today, ymd }]] = await conn.query(
    "SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today, DATE_FORMAT(CURDATE(), '%Y%m%d') AS ymd"
  );
  await conn.query(
    `INSERT INTO order_sequences (seq_date, last_no) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1)`,
    [today]
  );
  const [[{ last_no: no }]] = await conn.query('SELECT last_no FROM order_sequences WHERE seq_date = ?', [today]);
  return `${ymd}-${String(no).padStart(4, '0')}`;
}

/**
 * สร้างออเดอร์ใหม่
 * data: { orderType, tableNo, note, items: [{ menuId, optionIds, quantity, note }] }
 */
async function create(data, cashierId) {
  return withTransaction(async (conn) => {
    const lines = await priceItems(conn, data.items);
    const subtotalSatang = lines.reduce((sum, l) => sum + l.lineSatang, 0);
    const discountSatang = 0; // ส่วนลดใส่ตอนชำระเงิน (payment.service)
    const totalSatang = subtotalSatang - discountSatang;

    const orderNo = await nextOrderNo(conn);
    const [r] = await conn.query(
      `INSERT INTO orders (order_no, order_type, table_no, subtotal, discount, total, note, cashier_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderNo,
        data.orderType,
        data.tableNo,
        toBaht(subtotalSatang),
        toBaht(discountSatang),
        toBaht(totalSatang),
        data.note,
        cashierId,
      ]
    );
    const orderId = r.insertId;

    for (const l of lines) {
      const [ir] = await conn.query(
        `INSERT INTO order_items
           (order_id, menu_id, menu_name, category_name, unit_price, options_price, quantity, line_total, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          l.menu.id,
          l.menu.name,
          l.menu.category_name,
          toBaht(l.unitSatang),
          toBaht(l.optionsSatang),
          l.quantity,
          toBaht(l.lineSatang),
          l.note,
        ]
      );
      if (l.options.length) {
        await conn.query(
          'INSERT INTO order_item_options (order_item_id, menu_option_id, option_type, option_name, extra_price) VALUES ?',
          [l.options.map((o) => [ir.insertId, o.id, o.option_type, o.name, o.extra_price])]
        );
      }
    }

    return getById(orderId, conn);
  });
}

// ---------------------------------------------------------------------
// เปลี่ยนสถานะ
// ---------------------------------------------------------------------

/**
 * เปลี่ยนสถานะออเดอร์: pending -> preparing -> completed, ยกเลิกได้ก่อนเสร็จ
 * - ครัวยกเลิกออเดอร์ไม่ได้ (ให้แคชเชียร์/ผู้ดูแลเป็นคนยกเลิก)
 * - ออเดอร์ที่ชำระเงินแล้วยกเลิกไม่ได้
 * ใช้ SELECT ... FOR UPDATE กันการกดพร้อมกันจากหลายเครื่อง
 */
async function updateStatus(id, nextStatus, user) {
  return withTransaction(async (conn) => {
    const [[row]] = await conn.query('SELECT id, status, payment_status FROM orders WHERE id = ? FOR UPDATE', [id]);
    if (!row) throw ApiError.notFound('ไม่พบออเดอร์');

    if (row.status === nextStatus) {
      throw ApiError.conflict(`ออเดอร์นี้อยู่ในสถานะ "${STATUS_LABEL[nextStatus]}" แล้ว`);
    }
    if (!TRANSITIONS[row.status].includes(nextStatus)) {
      throw ApiError.conflict(
        `ไม่สามารถเปลี่ยนสถานะจาก "${STATUS_LABEL[row.status]}" เป็น "${STATUS_LABEL[nextStatus]}" ได้`
      );
    }
    if (nextStatus === 'cancelled') {
      if (user.role === 'kitchen') throw ApiError.forbidden('พนักงานครัวไม่มีสิทธิ์ยกเลิกออเดอร์');
      if (row.payment_status === 'paid') throw ApiError.conflict('ออเดอร์ที่ชำระเงินแล้วไม่สามารถยกเลิกได้');
    }

    const timeColumn = STATUS_TIME_COLUMN[nextStatus];
    await conn.query(`UPDATE orders SET status = ?, ${timeColumn} = NOW() WHERE id = ?`, [nextStatus, id]);
    return getById(id, conn);
  });
}

module.exports = { list, listKitchenQueue, getById, create, updateStatus, STATUS_LABEL };
