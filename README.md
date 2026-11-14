# Food POS Management System

ระบบบริหารจัดการร้านอาหารตามสั่ง (POS) — React + Vite + Tailwind CSS / Node.js + Express / MySQL

> **สถานะปัจจุบัน: Phase 1–6 เสร็จ** (โครงสร้าง + ฐานข้อมูล, Authentication, Dashboard, จัดการเมนู/หมวดหมู่/ตัวเลือก, POS, ออเดอร์, หน้าจอครัว Real-time, ชำระเงิน + ใบเสร็จ, คลังวัตถุดิบ, รายงานยอดขาย, ทดสอบระบบ, จัดการผู้ใช้, สูตรอาหาร + ตัดสต็อกอัตโนมัติ, รายงาน PDF)
> ทดสอบแล้ว: API อัตโนมัติ 146 เคส + Responsive 57 หน้าจอ ดูหัวข้อ [การทดสอบ](#การทดสอบ) — Phase 7–8 ยังไม่ได้ทำ

---

## ความต้องการของระบบ

| เครื่องมือ | เวอร์ชัน |
|---|---|
| Node.js | 18 ขึ้นไป (ทดสอบกับ v24) |
| MySQL / MariaDB | MySQL 8.0+ หรือ MariaDB 10.4+ (ทดสอบกับ MariaDB 10.4.32 ของ XAMPP) |

## โครงสร้างโปรเจกต์

```
Project/
├── backend/
│   ├── database/
│   │   ├── schema.sql          # สร้างฐานข้อมูลและตารางทั้งหมด
│   │   └── seed.sql            # ข้อมูลเริ่มต้น (บัญชีผู้ใช้ หมวดหมู่ เมนู วัตถุดิบ ตั้งค่าร้าน)
│   ├── scripts/
│   │   ├── db-setup.js         # npm run db:setup
│   │   ├── db-check.js         # npm run db:check
│   │   └── hash-password.js    # npm run hash -- <password>
│   ├── src/
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── config/             # env, database, socket.io, upload (multer รูปเมนู)
│   │   ├── routes/             # health, auth, dashboard, categories, menus, menu-options, pos, orders, settings, ingredients, reports
│   │   ├── middlewares/        # error handler, 404, auth (authenticate/authorize), loginLimiter
│   │   ├── services/
│   │   ├── utils/              # ApiError, asyncHandler, money (สตางค์), jwt, validate
│   │   ├── app.js
│   │   └── server.js
│   ├── uploads/menus/          # รูปภาพเมนูที่อัปโหลด
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── components/  pages/  layouts/  services/
    │   ├── hooks/  contexts/  utils/  assets/
    │   ├── App.jsx  main.jsx  index.css (ธีม Tailwind)
    ├── vite.config.js          # proxy /api, /uploads, /socket.io -> backend
    └── .env.example
```

## การติดตั้ง

### 1) เปิด MySQL
- XAMPP: เปิด XAMPP Control Panel แล้วกด **Start** ที่ MySQL
- หรือใช้ MySQL Server ที่ติดตั้งไว้

### 2) Backend

```bash
cd backend
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

แก้ไข `.env` ให้ตรงกับเครื่อง (`DB_USER`, `DB_PASSWORD`) และ **เปลี่ยน `JWT_SECRET`** เป็นค่าสุ่ม:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

สร้างฐานข้อมูล + ข้อมูลเริ่มต้น:

```bash
npm run db:setup     # ⚠️ DROP ตารางเดิมทั้งหมดแล้วสร้างใหม่
npm run db:check     # ตรวจสอบจำนวนข้อมูลและ Foreign Keys
```

**อัปเดตจากเวอร์ชันก่อน (มีข้อมูลอยู่แล้ว)** — ไม่ต้อง `db:setup` ใหม่ ให้ backup แล้วรัน migration (ไม่ลบข้อมูล, รันซ้ำได้):

```bash
mysqldump -u root --databases food_pos > backups/food_pos_backup.sql
npm run db:migrate
```

**สูตรอาหารมาตรฐาน** (`database/recipes.js` — ปริมาณต่อจานอิงร้านอาหารตามสั่งทั่วไป ครบ 23 เมนูตั้งต้น):
`db:setup` ใส่ให้อัตโนมัติ (พร้อมยอดวัตถุดิบตัวอย่าง) — สำหรับฐานข้อมูลที่มีอยู่แล้ว:

```bash
npm run db:recipes               # เพิ่มวัตถุดิบที่ขาด (คงเหลือ 0) + ใส่สูตรเฉพาะเมนูที่ยังไม่มีสูตร
npm run db:recipes -- --replace  # แทนที่สูตรของทุกเมนูที่ชื่อตรง (สูตรที่แก้เองจะหาย — backup ก่อน)
```

> ทางเลือก: import `database/schema.sql` แล้วตามด้วย `database/seed.sql` ผ่าน phpMyAdmin หรือ
> `mysql -u root -p < database/schema.sql && mysql -u root -p < database/seed.sql` (วิธีนี้จะยังไม่มีสูตรอาหาร — รัน `npm run db:recipes` ต่อ)

รันเซิร์ฟเวอร์:

```bash
npm run dev          # โหมดพัฒนา (nodemon) - http://localhost:5000/api
npm start            # โหมดปกติ
```

### 3) Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev          # http://localhost:5173
npm run build        # build สำหรับ production -> dist/
npm run preview      # ทดลองเปิดไฟล์ที่ build แล้ว
```

เปิด http://localhost:5173 → หน้า **เข้าสู่ระบบ** (ใช้บัญชีทดสอบด้านล่าง)

| หน้า | admin | cashier | kitchen |
|---|---|---|---|
| Dashboard (`/`) | ✅ | ✅ | — (เข้าหน้าครัวแทน) |
| ขายหน้าร้าน POS (`/pos`) | ✅ | ✅ | — |
| ออเดอร์ (`/orders`) | ดู/เปลี่ยนสถานะ/ยกเลิก/ชำระเงิน/พิมพ์ใบเสร็จ | ดู/เปลี่ยนสถานะ/ยกเลิก/ชำระเงิน/พิมพ์ใบเสร็จ | — |
| ครัว (`/kitchen`) | ✅ | ✅ | เริ่มทำ/เสร็จแล้ว (ยกเลิกไม่ได้) |
| คลังวัตถุดิบ (`/inventory`) | เพิ่ม/แก้ไข/ลบ + รับเข้า/เบิก/ปรับยอด | — | รับเข้า/เบิก/ปรับยอด |
| รายงานยอดขาย (`/reports`), ตั้งค่าร้าน (`/settings`) | ✅ | — | — |
| เมนูอาหาร (`/menus`) | เพิ่ม/แก้ไข/ลบ/อัปโหลดรูป | ตั้งพร้อมขาย/หมด | ตั้งพร้อมขาย/หมด |
| หมวดหมู่ (`/categories`), ตัวเลือกเมนู (`/menu-options`), สถานะระบบ (`/system-status`) | ✅ | — | — |

> ยอดขาย (Dashboard / รายงาน) นับเฉพาะออเดอร์ที่ **ชำระเงินแล้ว** ตามวันที่ชำระ

### การทำงานของ POS → ครัว
1. แคชเชียร์เลือกเมนูที่หน้า `/pos` (เลือกขนาด/ท็อปปิ้ง/หมายเหตุ/จำนวน) → กด **ส่งออเดอร์เข้าครัว**
2. Backend ดึงราคาจาก DB ใหม่ คำนวณเป็นสตางค์ สร้างเลขออเดอร์ `YYYYMMDD-NNNN` และบันทึก snapshot ใน transaction เดียว
3. Socket.IO ส่ง `order:created` → หน้าครัวแสดงการ์ดใหม่ทันที (มีเสียงแจ้งเตือน เปิด/ปิดได้)
4. ครัวกด **เริ่มทำ** → **เสร็จแล้ว** (`order:updated`) → หน้าออเดอร์ / Dashboard ของทุกเครื่องอัปเดตเอง
5. เมนูที่ถูกตั้งเป็น "หมด" (`menu:updated`) จะกดไม่ได้ในหน้า POS ทันที

### การชำระเงิน
- ชำระได้ทันทีหลังส่งออเดอร์ (ปุ่ม **ชำระเงินเลย**) หรือภายหลังจากหน้า **ออเดอร์**
- ใส่ส่วนลดเป็นบาทหรือ % ได้ (admin และ cashier) — Backend คำนวณยอดใหม่จาก `subtotal` ใน DB
- **เงินสด**: กรอก/กดปุ่มลัดจำนวนเงิน ระบบแสดงเงินทอน, **PromptPay**: แสดง QR ตามยอด (จากเลข PromptPay ใน "ตั้งค่าร้าน") — ระบบไม่ได้ตรวจยอดโอนอัตโนมัติ ผู้รับเงินต้องตรวจก่อนกดยืนยัน
- ใบเสร็จขนาด 80mm เปิดในแท็บใหม่ (`/orders/:id/receipt`) แล้วสั่งพิมพ์จากเบราว์เซอร์
- ไม่คิด VAT, 1 ออเดอร์ชำระได้ครั้งเดียว, ออเดอร์ที่ชำระแล้วยกเลิกไม่ได้

### คลังวัตถุดิบ
- **รับเข้า** (บันทึกต้นทุนล่าสุดได้), **เบิกออก** (ห้ามเกินคงเหลือ), **ปรับยอด** (กรอกยอดที่นับได้จริง)
- ทุกการเปลี่ยนยอดบันทึกใน `inventory_transactions` พร้อม `balance_after` และผู้ทำรายการ

### สูตรอาหาร + ตัดสต็อกอัตโนมัติ
- admin กำหนด **สูตรวัตถุดิบต่อ 1 จาน** ที่หน้าเมนูอาหาร → ปุ่ม "สูตรวัตถุดิบ" (ครัวเปิดดูได้อย่างเดียว)
  พิมพ์ชื่อวัตถุดิบเองได้ (มีรายชื่อแนะนำ) — ถ้าเป็นชื่อใหม่ให้ใส่หน่วยนับ ระบบจะเพิ่มวัตถุดิบนั้นในคลัง (คงเหลือ 0) ตอนบันทึกสูตร
- **ส่งออเดอร์เข้าครัว** → ตัดวัตถุดิบตามสูตร × จำนวน ใน transaction เดียวกับการสร้างออเดอร์ (ประวัติแสดงป้าย "อัตโนมัติ" + เลขออเดอร์)
- ยอดวัตถุดิบ **ไม่ติดลบ** — สั่งเกินวัตถุดิบที่มี ออเดอร์ถูกปฏิเสธทั้งใบพร้อมบอกว่าวัตถุดิบไหนขาด
- เมนูที่วัตถุดิบเหลือไม่พอทำอีก 1 จาน ถูกตั้งเป็น **"หมด · วัตถุดิบไม่พอ"** อัตโนมัติ และ **เปิดขายคืนเอง** เมื่อรับเข้า/ปรับยอดจนพอ (เมนูที่ตั้งหมดเองต้องเปิดขายเอง)
- หน้า POS แจ้งเตือนวัตถุดิบที่ถึงจุดสั่งซื้อหลังส่งออเดอร์
- **ยกเลิกออเดอร์** → คืนวัตถุดิบเท่าที่ตัดไปจริง (แม้จะแก้สูตรภายหลัง)
- วัตถุดิบที่ปิดใช้งานจะไม่ถูกตัด, ยังไม่ผูกสูตรกับตัวเลือก (ไข่ดาว/พิเศษ)

### จัดการผู้ใช้ (admin)
- เพิ่ม/แก้ไขพนักงาน, เปลี่ยนตำแหน่ง, ตั้งรหัสผ่านใหม่, ปิดใช้งาน (มีผลทันที — token เดิมใช้ไม่ได้)
- ลบผู้ใช้ที่เคยทำรายการ → ปิดใช้งานแทน (เก็บชื่อในประวัติ), แก้/ลบบัญชีตัวเองไม่ได้ และต้องเหลือผู้ดูแลระบบอย่างน้อย 1 คน

### รายงาน PDF
- หน้ารายงานยอดขาย → ปุ่ม "รายงาน PDF" เปิดรายงาน A4 ในแท็บใหม่ แล้วเลือกเครื่องพิมพ์เป็น "บันทึกเป็น PDF" (ภาษาไทยแสดงถูกต้องเพราะใช้ฟอนต์ของ browser)
- มีสรุปยอด, แยกวิธีชำระ/หมวดหมู่, รายวัน (ถ้าเลือกหลายวัน), รายเมนู และรายการบิลทั้งหมด

## การทดสอบ

### API (backend) — `npm test`

```bash
cd backend
npm test
```

- ใช้ `node:test` ที่มากับ Node (ไม่ต้องติดตั้ง test framework) + `socket.io-client` สำหรับทดสอบ Real-time
- รันบน **ฐานข้อมูลแยก `food_pos_test`** ซึ่งถูกสร้างใหม่ (schema + seed) ทุกไฟล์ทดสอบ — ข้อมูลใน `food_pos` ไม่ถูกแตะ
  (เปลี่ยนชื่อได้ด้วย `TEST_DB_NAME` แต่ต้องลงท้ายด้วย `_test` ไม่เช่นนั้นจะไม่ยอมรัน)
- ต้องเปิด MySQL ก่อน แต่ไม่ต้องรันเซิร์ฟเวอร์ (เทสต์เปิด Express + Socket.IO บนพอร์ตสุ่มเอง)

| ไฟล์ | ครอบคลุม |
|---|---|
| `tests/auth.test.js` | health, login / ล็อกหลังผิด 5 ครั้ง, token, เปลี่ยนรหัสผ่าน, ตารางสิทธิ์ 3 role × 16 endpoint |
| `tests/orders.test.js` | ราคาคำนวณที่ backend (ไม่เชื่อราคาจาก client), ขนาดเริ่มต้น, ตัวเลือกผิดเมนู, เมนูหมด, snapshot, soft delete, เลขออเดอร์ไม่ซ้ำเมื่อสร้างพร้อมกัน, สถานะ + สิทธิ์ครัว, ชำระเงิน / ส่วนลด / เงินทอน, ชำระพร้อมกันสำเร็จครั้งเดียว, ใบเสร็จ, รายงาน / Dashboard ตรงกับ DB, Socket events |
| `tests/catalog.test.js` | หมวดหมู่, เมนู (JSON + multipart, ไฟล์ผิดประเภท), ตัวเลือกเมนู 3 ขอบเขต, ตั้งค่าร้าน (PromptPay / เลขภาษี), คลังวัตถุดิบ (ทศนิยม 3 ตำแหน่ง, เบิกเกิน, ปรับยอด, เบิกพร้อมกันไม่ติดลบ, soft delete) |
| `tests/stock.test.js` | สูตรอาหาร (สิทธิ์, ตรวจข้อมูล), ตัดสต็อกตามสูตร × จำนวน, แจ้งเตือน, วัตถุดิบไม่พอ → 409/เมนูหมดอัตโนมัติ/รับเข้าแล้วเปิดขายคืน, สั่งพร้อมกันเกินวัตถุดิบไม่ติดลบ, คืนสต็อกเมื่อยกเลิก, ไม่ตัดเมื่อออเดอร์ไม่ผ่าน, ข้ามวัตถุดิบที่ปิด, สั่งพร้อมกันยอดไม่หาย, ยอดตรงกับประวัติ |
| `tests/users.test.js` | จัดการผู้ใช้: สิทธิ์ admin, ตรวจข้อมูล, เปลี่ยนตำแหน่ง/ปิดใช้งานมีผลทันที, รีเซ็ตรหัส, ลบจริง/soft delete, ห้ามแก้บัญชีตัวเอง |

### Responsive (frontend) — `scripts/responsive-check.mjs`

เปิด Chrome/Edge แบบ headless ผ่าน DevTools Protocol (ไม่ต้องติดตั้ง package เพิ่ม) ล็อกอินทั้ง 3 role แล้วเปิดทุกหน้าที่ role นั้นเข้าได้ที่ความกว้าง 375 / 768 / 1366px
ตรวจว่าโหลดข้อมูลเสร็จ, ไม่มีการเลื่อนแนวนอนทั้งหน้า, ไม่มีข้อความ error และไม่มี console error

```bash
# 1) backend กับฐานข้อมูลทดสอบ (หลังรัน npm test แล้ว)
cd backend && DB_NAME=food_pos_test npm start     # PowerShell: $env:DB_NAME='food_pos_test'; npm start
# 2) frontend
cd frontend && npm run dev
# 3) ตรวจ (เพิ่ม --shots <โฟลเดอร์> เพื่อบันทึกภาพหน้าจอ)
cd frontend && node scripts/responsive-check.mjs
```

## บัญชีทดสอบเริ่มต้น

รหัสผ่านถูกเก็บเป็น **bcrypt hash** ในฐานข้อมูล (ไม่มีรหัสผ่านจริงในตาราง)

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin1234` |
| Cashier | `cashier` | `cashier1234` |
| Kitchen | `kitchen` | `kitchen1234` |

> ⚠️ เปลี่ยนรหัสผ่านทั้งหมดก่อนใช้งานจริง (สร้าง hash ใหม่ได้ด้วย `npm run hash -- <รหัสผ่านใหม่>`)

## การออกแบบฐานข้อมูล

| ตาราง | หน้าที่ |
|---|---|
| `roles` | ประเภทผู้ใช้ (admin / cashier / kitchen) |
| `users` | พนักงาน, `password_hash` (bcrypt), `is_active` |
| `categories` | หมวดหมู่อาหาร |
| `menus` | เมนูอาหาร, ราคา `DECIMAL(10,2)`, สถานะ `available` / `sold_out`, `is_active` (soft delete) |
| `menu_options` | ตัวเลือก `size` (ธรรมดา/พิเศษ) และ `topping` (ไข่ดาว ไข่เจียว ฯลฯ) พร้อมราคาเพิ่ม — ผูกกับเมนูเดียว, ทั้งหมวด หรือทุกเมนู |
| `orders` | ออเดอร์, `order_no` ไม่ซ้ำ, ประเภท dine_in / takeaway, สถานะครัว pending / preparing / completed / cancelled, สถานะชำระ unpaid / paid |
| `order_sequences` | ตัวนับเลขออเดอร์รายวันสำหรับสร้างเลขแบบไม่ซ้ำภายใต้ transaction |
| `order_items` | **Snapshot** ชื่อเมนู หมวด ราคา ราคาตัวเลือก ณ เวลาสั่ง + หมายเหตุ |
| `order_item_options` | **Snapshot** ตัวเลือกที่ลูกค้าเลือก (ชื่อ + ราคา) |
| `payments` | การชำระเงิน cash / promptpay, ยอดรับ, เงินทอน (`UNIQUE(order_id)` ป้องกันชำระซ้ำ) |
| `ingredients` | วัตถุดิบ หน่วยนับ คงเหลือ ขั้นต่ำ |
| `inventory_transactions` | ประวัติรับเข้า / เบิกออก / ปรับยอด พร้อม `balance_after` |
| `menu_ingredients` | สูตรอาหาร (วัตถุดิบต่อ 1 จาน) — ใช้ตัดสต็อกอัตโนมัติเมื่อส่งออเดอร์ |
| `settings` | ข้อมูลร้านสำหรับใบเสร็จ (ชื่อร้าน ที่อยู่ เบอร์โทร PromptPay) |

หลักการสำคัญ:
- ทุกตารางใช้ `utf8mb4_unicode_ci` รองรับภาษาไทย, Engine InnoDB (รองรับ Transaction / FK)
- จำนวนเงินใช้ `DECIMAL`, ปริมาณวัตถุดิบใช้ `DECIMAL(12,3)`, สถานะใช้ `ENUM`
- `UNIQUE` ป้องกันข้อมูลซ้ำ (username, ชื่อหมวด, ชื่อเมนู, ชื่อวัตถุดิบ, เลขออเดอร์)
- `CHECK` ป้องกันราคา/จำนวนติดลบ และเงินที่รับน้อยกว่ายอดชำระ
- Index บนคอลัมน์วันที่/สถานะเพื่อรองรับรายงานเมื่อข้อมูลมีจำนวนมาก
- ไม่มีตาราง Sales แยก — รายงานคำนวณจาก `orders` + `order_items` + `payments`
- Foreign Key: ลบเมนูที่เคยขายแล้ว → `order_items.menu_id` เป็น NULL แต่ snapshot ยังอยู่; ห้ามลบหมวดหมู่ที่ยังมีเมนู; ห้ามลบออเดอร์ที่มีการชำระเงิน

## API ที่ใช้งานได้แล้ว

| Method | Endpoint | คำอธิบาย |
|---|---|---|
| GET | `/api/health` | ตรวจสอบ API, การเชื่อมต่อฐานข้อมูล และความครบถ้วนของตาราง |
| POST | `/api/auth/login` | `{ username, password }` → `{ token, expiresIn, user }` (ผิด 5 ครั้ง/15 นาที ต่อ IP+username จะถูกล็อก → 429) |
| GET | `/api/auth/me` | ข้อมูลผู้ใช้ปัจจุบัน (ต้องส่ง `Authorization: Bearer <token>`) |
| PUT | `/api/auth/change-password` | `{ currentPassword, newPassword }` รหัสใหม่อย่างน้อย 8 ตัวอักษร |
| GET | `/api/dashboard/summary` | admin, cashier — ยอดขายวันนี้/เมื่อวาน, ออเดอร์วันนี้ตามสถานะ, ยอดขาย 7 วัน, เมนูขายดี, เมนูพร้อมขาย, วัตถุดิบใกล้หมด, ออเดอร์ล่าสุด |
| GET | `/api/categories` | ทุก role (`?includeInactive=1` เฉพาะ admin) พร้อม `menuCount` |
| POST / PUT / DELETE | `/api/categories[/:id]` | admin — ลบไม่ได้ถ้ายังมีเมนู, ถ้ามีแค่เมนูที่ถูก soft delete จะปิดใช้งานแทน |
| GET | `/api/menus` | ทุก role — `?categoryId=&status=available|sold_out&search=` |
| GET | `/api/menus/:id` | รายละเอียดเมนู + `options` ที่ใช้ได้ (เฉพาะเมนู + ทั้งหมวด + ทุกเมนู) |
| POST / PUT | `/api/menus[/:id]` | admin — `multipart/form-data`: categoryId, name, description, price, status, image (JPG/PNG/WEBP ≤ 5MB), removeImage |
| PATCH | `/api/menus/:id/status` | admin, cashier, kitchen — `{ status }` พร้อมขาย/หมด |
| DELETE | `/api/menus/:id` | admin — เคยถูกขายแล้ว → soft delete (`is_active = 0`), ยังไม่เคยขาย → ลบจริงพร้อมไฟล์รูป |
| GET / POST / PUT / DELETE | `/api/menu-options[/:id]` | admin — `{ scope: all|category|menu, categoryId?, menuId?, optionType: size|topping, name, extraPrice, isDefault, sortOrder, isActive }` ค่าเริ่มต้นของขนาดมีได้ 1 รายการต่อขอบเขต |
| GET | `/api/pos/catalog` | admin, cashier — หมวดหมู่ + เมนู (รวมที่หมด) + `sizes` / `toppings` ของแต่ละเมนู สำหรับหน้า POS |
| POST | `/api/orders` | admin, cashier — `{ orderType: dine_in|takeaway, tableNo?, note?, items: [{ menuId, optionIds, quantity (1-99), note? }] }` **ไม่รับราคาจาก client** — ไม่เลือกขนาดจะใช้ขนาดค่าเริ่มต้น, ตัดสต็อกตามสูตร (วัตถุดิบไม่พอ → 409 พร้อม `details`) และคืน `stockWarnings` (วัตถุดิบที่ ≤ ขั้นต่ำ) |
| GET | `/api/orders` | admin, cashier — `?status=pending,preparing&paymentStatus=&date=YYYY-MM-DD&search=&page=&pageSize=` → `{ orders, pagination }` |
| GET | `/api/orders/kitchen` | ทุก role — `{ active (pending+preparing เก่าสุดก่อน), recentCompleted (เสร็จวันนี้ 12 รายการล่าสุด) }` |
| GET | `/api/orders/:id` | ทุก role — ออเดอร์ + `items[].options` (อ่านจาก snapshot) |
| PATCH | `/api/orders/:id/status` | `{ status: preparing|completed|cancelled }` ลำดับ pending → preparing → completed, ยกเลิกได้ก่อนเสร็จ (admin/cashier เท่านั้น และต้องยังไม่ชำระเงิน) — ข้ามขั้น/กดซ้ำ → 409 |
| POST | `/api/orders/:id/payment` | admin, cashier — `{ method: cash|promptpay, receivedAmount (cash), referenceNo? (promptpay), discount?: { type: amount|percent, value } }` ชำระซ้ำ/ออเดอร์ยกเลิก → 409, เงินไม่พอ → 400 |
| GET | `/api/orders/:id/receipt` | admin, cashier — `{ shop, order }` (เฉพาะออเดอร์ที่ชำระแล้ว) |
| GET / PUT | `/api/settings` | GET: admin, cashier / PUT: admin — `{ shopName, shopAddress, shopPhone, taxId, promptpayId, receiptFooter }` |
| GET | `/api/ingredients` | admin, kitchen — `?search=&lowOnly=1&includeInactive=1` (includeInactive เฉพาะ admin) |
| POST / PUT / DELETE | `/api/ingredients[/:id]` | admin — `{ name, unit, quantity (ตอนสร้าง), minQuantity, costPerUnit, isActive }` ลบตัวที่มีประวัติ → ปิดใช้งานแทน |
| POST | `/api/ingredients/:id/transactions` | admin, kitchen — `{ type: in|out|adjust, quantity (in/out), newBalance (adjust), unitCost? (in), note? }` |
| GET | `/api/ingredients/transactions` | admin, kitchen — `?ingredientId=&type=&page=&pageSize=` ประวัติการเคลื่อนไหว |
| GET | `/api/menus/:id/recipe` | admin, kitchen — สูตรวัตถุดิบต่อ 1 จาน `[{ ingredientId, name, unit, quantity, stock, isActive }]` |
| PUT | `/api/menus/:id/recipe` | admin — `{ items: [{ ingredientId, quantity }] }` แทนที่สูตรทั้งหมด (quantity > 0, ทศนิยม 3 ตำแหน่ง) — วัตถุดิบที่พิมพ์เองส่งเป็น `{ name, unit, quantity }`: ชื่อตรงกับที่มีอยู่ใช้ตัวเดิม, ไม่มีสร้างใหม่ (คงเหลือ 0) ใน transaction เดียวกัน |
| GET | `/api/users`, `/api/users/roles` | admin — รายชื่อผู้ใช้ (รวมที่ปิดใช้งาน) / ตำแหน่งทั้งหมด |
| POST | `/api/users` | admin — `{ username (a-z0-9._- 3-50), password (≥ 8), fullName, phone?, role }` |
| PUT | `/api/users/:id` | admin — `{ fullName, phone, role, isActive }` (แก้ role/ปิดตัวเองไม่ได้, ต้องเหลือ admin ≥ 1) |
| PUT | `/api/users/:id/password` | admin — `{ password }` ตั้งรหัสผ่านใหม่ให้ผู้ใช้อื่น |
| DELETE | `/api/users/:id` | admin — มีประวัติ → ปิดใช้งาน, ไม่มี → ลบจริง |
| GET | `/api/reports/sales` | admin — `?from=YYYY-MM-DD&to=YYYY-MM-DD` (ไม่เกิน 366 วัน) สรุป, รายวัน, รายชั่วโมง, วิธีชำระ, รายเมนู, รายหมวด, รายการบิล |

การยืนยันตัวตน:
- JWT (HS256) อายุตาม `JWT_EXPIRES_IN` — middleware `authenticate` โหลดผู้ใช้จาก DB ทุก request ผู้ใช้ที่ถูกปิด (`is_active = 0`) จะใช้ token เดิมไม่ได้ทันที
- จำกัดสิทธิ์ด้วย `authorize('admin', 'cashier')` ใน `backend/src/middlewares/auth.js` และ `<ProtectedRoute roles={[...]}>` ฝั่ง Frontend
- Socket.IO ต้องส่ง token ตอนเชื่อมต่อ `io({ auth: { token } })` และจะเข้าห้อง `role:<role>`

Socket.IO events (Server → Client, ส่งหลัง commit แล้วเท่านั้น):

| Event | Payload | เมื่อ |
|---|---|---|
| `order:created` | `{ order }` | สร้างออเดอร์ใหม่ |
| `order:updated` | `{ order }` | เปลี่ยนสถานะออเดอร์ / ชำระเงิน |
| `menu:updated` | `{ menu }` | ตั้งเมนูพร้อมขาย/หมด |

## ความคืบหน้า

| Phase | งาน | สถานะ |
|---|---|---|
| 1 | โครงสร้างโปรเจกต์, ตั้งค่า Frontend/Backend, เชื่อมต่อ MySQL, Schema, Seed Data | ✅ เสร็จ |
| 2 | Authentication (JWT + Role), Dashboard, จัดการเมนู/หมวดหมู่/ตัวเลือกเมนู | ✅ เสร็จ |
| 3 | POS, Order Management, Kitchen (Socket.IO) | ✅ เสร็จ |
| 4 | Payment + ใบเสร็จ, Inventory, Sales Report | ✅ เสร็จ |
| 5 | ทดสอบระบบ / API / Responsive | ✅ เสร็จ |
| 6 | จัดการผู้ใช้, สูตรอาหาร + ตัดสต็อกอัตโนมัติ, รายงาน PDF | ✅ เสร็จ |
| 7 | Security, Backup อัตโนมัติ, Deploy | ⏳ ยังไม่ได้พัฒนา |
| 8 | UAT, คู่มือผู้ใช้/ติดตั้ง/API, สไลด์พรีเซนต์ | ⏳ ยังไม่ได้พัฒนา |

หมายเหตุทางเทคนิค:
- ใช้ `bcryptjs` (pure JavaScript, API เดียวกับ `bcrypt`) เพื่อไม่ต้อง compile native module บน Windows
- ใช้ `mysql2/promise` (ไม่ใช้ ORM) พร้อม helper `withTransaction()` ใน `backend/src/config/database.js` (สร้างออเดอร์, เปลี่ยนสถานะ, ชำระเงิน, รายการสต็อก)
- เลขออเดอร์รันใหม่ทุกวันจาก `order_sequences` — แถวของวันนั้นถูก lock ใน transaction จึงไม่ซ้ำแม้สร้างพร้อมกันหลายเครื่อง
- เปลี่ยนสถานะออเดอร์ใช้ `SELECT ... FOR UPDATE` กันการกดพร้อมกันจากหลายเครื่อง
- ชำระเงินและรายการสต็อกใช้ `SELECT ... FOR UPDATE` — ชำระพร้อมกัน 2 เครื่องสำเร็จแค่ครั้งเดียว, การเบิกและการขายพร้อมกันไม่ทำให้ยอดติดลบ
- ปริมาณวัตถุดิบคำนวณเป็นหน่วย 1/1000 (integer) เพื่อเลี่ยงปัญหาทศนิยม
- QR PromptPay สร้างที่ Frontend (`utils/promptpay.js`, มาตรฐาน EMVCo + CRC16) — **ควรทดลองสแกนด้วยแอปธนาคารก่อนใช้งานจริง**
- ยังไม่มี: แก้ไขรายการในออเดอร์ที่ส่งแล้ว, เหตุผลการยกเลิก, คืนเงิน/ยกเลิกบิลที่ชำระแล้ว, สูตรวัตถุดิบของตัวเลือก (ไข่ดาว/พิเศษ), VAT
