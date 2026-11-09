const { pool } = require('../config/database');

/**
 * ข้อมูลสำหรับหน้าขาย (POS) ในคำขอเดียว:
 * หมวดหมู่ที่เปิดใช้งาน + เมนู (รวมเมนูที่หมด เพื่อแสดงเป็นปุ่มที่กดไม่ได้) + ตัวเลือกที่ใช้ได้กับแต่ละเมนู
 * ราคาที่ส่งไปใช้แสดงผลเท่านั้น — ตอนสร้างออเดอร์ Backend คำนวณใหม่จาก DB
 */
async function getCatalog() {
  const [categories] = await pool.query(
    'SELECT id, name, sort_order FROM categories WHERE is_active = 1 ORDER BY sort_order, id'
  );
  const [menus] = await pool.query(
    `SELECT m.id, m.category_id, m.name, m.description, m.price, m.image_url, m.status
       FROM menus m JOIN categories c ON c.id = m.category_id
      WHERE m.is_active = 1 AND c.is_active = 1
      ORDER BY c.sort_order, c.id, m.name`
  );
  const [options] = await pool.query(
    `SELECT o.id, o.menu_id, o.category_id, o.option_type, o.name, o.extra_price, o.is_default
       FROM menu_options o
       LEFT JOIN menus m ON m.id = o.menu_id
      WHERE o.is_active = 1 AND (o.menu_id IS NULL OR m.is_active = 1)
      ORDER BY o.option_type, o.sort_order, o.id`
  );

  const toOption = (o) => ({ id: o.id, name: o.name, extraPrice: o.extra_price, isDefault: !!o.is_default });

  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    menus: menus.map((m) => {
      const applicable = options.filter(
        (o) => o.menu_id === m.id || o.category_id === m.category_id || (o.menu_id === null && o.category_id === null)
      );
      return {
        id: m.id,
        categoryId: m.category_id,
        name: m.name,
        description: m.description,
        price: m.price,
        imageUrl: m.image_url,
        status: m.status,
        sizes: applicable.filter((o) => o.option_type === 'size').map(toOption),
        toppings: applicable.filter((o) => o.option_type === 'topping').map(toOption),
      };
    }),
  };
}

module.exports = { getCatalog };
