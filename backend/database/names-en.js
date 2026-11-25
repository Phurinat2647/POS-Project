/**
 * ชื่อภาษาอังกฤษของเมนูและตัวเลือกตั้งต้น (แสดงเมื่อผู้ใช้เลือกภาษา EN)
 * จับคู่ด้วยชื่อภาษาไทย — ใส่ให้เฉพาะแถวที่ยังไม่มีชื่ออังกฤษ (ไม่ทับที่ผู้ใช้แก้เอง)
 * ใช้โดย scripts/db-setup.js (หลัง seed.sql) และ scripts/db-migrate.js
 * เมนู/ตัวเลือกที่เพิ่มเองตั้งชื่ออังกฤษได้ที่หน้า "เมนูอาหาร" / "ตัวเลือกเมนู"
 */

const MENU_NAMES_EN = {
  ข้าวไข่เจียวหมูสับ: 'Minced Pork Omelette on Rice',
  ข้าวหมูกระเทียม: 'Garlic Pork on Rice',
  ข้าวผัดพริกแกงหมู: 'Stir-fried Pork with Red Curry Paste on Rice',
  ข้าวคะน้าหมูกรอบ: 'Crispy Pork with Chinese Kale on Rice',
  ข้าวผัดหมู: 'Pork Fried Rice',
  ข้าวผัดกุ้ง: 'Shrimp Fried Rice',
  ข้าวผัดปู: 'Crab Fried Rice',
  ข้าวผัดต้มยำ: 'Tom Yum Fried Rice',
  ข้าวกะเพราหมูสับ: 'Stir-fried Minced Pork with Holy Basil on Rice',
  ข้าวกะเพราไก่: 'Stir-fried Chicken with Holy Basil on Rice',
  ข้าวกะเพราหมูกรอบ: 'Stir-fried Crispy Pork with Holy Basil on Rice',
  ข้าวกะเพราทะเล: 'Stir-fried Seafood with Holy Basil on Rice',
  ผัดซีอิ๊วหมู: 'Pad See Ew with Pork',
  ราดหน้าหมู: 'Rad Na with Pork (Noodles in Gravy)',
  ผัดไทยกุ้งสด: 'Pad Thai with Fresh Shrimp',
  สุกี้แห้งหมู: 'Dry Suki with Pork',
  ต้มยำกุ้งน้ำข้น: 'Creamy Tom Yum Goong',
  แกงจืดเต้าหู้หมูสับ: 'Clear Soup with Egg Tofu and Minced Pork',
  ต้มแซ่บกระดูกอ่อน: 'Spicy Pork Cartilage Soup (Tom Saep)',
  น้ำเปล่า: 'Drinking Water',
  น้ำอัดลม: 'Soft Drink',
  ชาเย็น: 'Thai Iced Tea',
  กาแฟเย็น: 'Thai Iced Coffee',
  นมสด: 'Iced Fresh Milk',
  ชาเขียว: 'Iced Green Tea Latte',
  นมชมพู: 'Iced Pink Milk',
  ชามะนาว: 'Iced Lemon Tea',
  // อาหารคลีน
  ข้าวกล้องอกไก่ย่างสมุนไพร: 'Grilled Herb Chicken Breast with Brown Rice',
  สลัดอกไก่น้ำสลัดงา: 'Chicken Breast Salad with Sesame Dressing',
  'ข้าวกล้องกะเพราอกไก่ (สูตรคลีน)': 'Clean Holy Basil Chicken with Brown Rice',
  'ปลากะพงนึ่งมะนาว ข้าวกล้อง': 'Steamed Sea Bass with Lime & Brown Rice',
  'ผัดผักรวม ข้าวไรซ์เบอร์รี่': 'Mixed Vegetable Stir-fry with Riceberry',
  ต้มจืดเต้าหู้อกไก่สับ: 'Clear Soup with Tofu & Minced Chicken (No MSG)',
  // น้ำปั่นคลีน
  กรีนสมูทตี้ผักโขมกล้วย: 'Green Smoothie (Spinach & Banana)',
  สมูทตี้เบอร์รี่โยเกิร์ต: 'Mixed Berry Yogurt Smoothie',
  กล้วยโอ๊ตนมอัลมอนด์ปั่น: 'Banana Oat Almond Milk Smoothie',
  มะม่วงเสาวรสปั่น: 'Mango Passion Fruit Smoothie',
  แตงโมมะนาวปั่น: 'Watermelon Lime Slush',
  อะโวคาโดนมอัลมอนด์ปั่น: 'Avocado Almond Milk Smoothie',
};

const OPTION_NAMES_EN = {
  ธรรมดา: 'Regular',
  พิเศษ: 'Large',
  ไข่ดาว: 'Fried Egg',
  ไข่เจียว: 'Omelette',
  ไข่ข้น: 'Creamy Scrambled Egg',
  เพิ่มกุ้ง: 'Extra Shrimp',
  เพิ่มอกไก่: 'Extra Chicken Breast',
  แก้วปกติ: 'Regular Cup',
  แก้วใหญ่: 'Large Cup',
  เพิ่มเวย์โปรตีน: 'Add Whey Protein',
  เพิ่มเมล็ดเชีย: 'Add Chia Seeds',
  ปั่น: 'Blended',
  โค้ก: 'Cola',
  น้ำแดง: 'Red Soda',
  น้ำเขียว: 'Green Soda',
  น้ำส้ม: 'Orange Soda',
};

/** ใส่ชื่ออังกฤษให้แถวที่ยังว่าง — conn: connection/pool ที่เลือกฐานข้อมูลแล้ว คืนจำนวนแถวที่อัปเดต */
async function applyEnglishNames(conn) {
  let menus = 0;
  let options = 0;
  for (const [th, en] of Object.entries(MENU_NAMES_EN)) {
    const [r] = await conn.query("UPDATE menus SET name_en = ? WHERE name = ? AND (name_en IS NULL OR name_en = '')", [en, th]);
    menus += r.affectedRows;
  }
  for (const [th, en] of Object.entries(OPTION_NAMES_EN)) {
    const [r] = await conn.query("UPDATE menu_options SET name_en = ? WHERE name = ? AND (name_en IS NULL OR name_en = '')", [en, th]);
    options += r.affectedRows;
  }
  return { menus, options };
}

module.exports = { MENU_NAMES_EN, OPTION_NAMES_EN, applyEnglishNames };
