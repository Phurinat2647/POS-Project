# Food POS Management System

ระบบบริหารจัดการร้านอาหารตามสั่ง (POS) — React + Vite + Tailwind CSS / Node.js + Express / MySQL

> **สถานะปัจจุบัน: Phase 1–3 เสร็จ** (โครงสร้าง + ฐานข้อมูล, Authentication, Dashboard, จัดการเมนู/หมวดหมู่/ตัวเลือก, POS, ออเดอร์, หน้าจอครัว Real-time)
> Phase 4–5 (ชำระเงิน + ใบเสร็จ, คลังวัตถุดิบ, รายงาน, ทดสอบระบบ) **ยังไม่ได้พัฒนา** ดูตาราง [ความคืบหน้า](#ความคืบหน้า) ด้านล่าง

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
│   │   ├── routes/             # health, auth, dashboard, categories, menus, menu-options, pos, orders
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

> ทางเลือก: import `database/schema.sql` แล้วตามด้วย `database/seed.sql` ผ่าน phpMyAdmin หรือ
> `mysql -u root -p < database/schema.sql && mysql -u root -p < database/seed.sql`

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
| ออเดอร์ (`/orders`) | ดู/เปลี่ยนสถานะ/ยกเลิก | ดู/เปลี่ยนสถานะ/ยกเลิก | — |
| ครัว (`/kitchen`) | ✅ | ✅ | เริ่มทำ/เสร็จแล้ว (ยกเลิกไม่ได้) |
| เมนูอาหาร (`/menus`) | เพิ่ม/แก้ไข/ลบ/อัปโหลดรูป | ตั้งพร้อมขาย/หมด | ตั้งพร้อมขาย/หมด |
| หมวดหมู่ (`/categories`), ตัวเลือกเมนู (`/menu-options`), สถานะระบบ (`/system-status`) | ✅ | — | — |

> Dashboard อ่านยอดขายจากออเดอร์ที่ **ชำระเงินแล้ว** — ยอดขายจะยังเป็น 0 จนกว่าจะมีระบบรับชำระเงิน (Phase 4) ส่วนจำนวนออเดอร์วันนี้แสดงได้แล้ว

### การทำงานของ POS → ครัว
1. แคชเชียร์เลือกเมนูที่หน้า `/pos` (เลือกขนาด/ท็อปปิ้ง/หมายเหตุ/จำนวน) → กด **ส่งออเดอร์เข้าครัว**
2. Backend ดึงราคาจาก DB ใหม่ คำนวณเป็นสตางค์ สร้างเลขออเดอร์ `YYYYMMDD-NNNN` และบันทึก snapshot ใน transaction เดียว
3. Socket.IO ส่ง `order:created` → หน้าครัวแสดงการ์ดใหม่ทันที (มีเสียงแจ้งเตือน เปิด/ปิดได้)
4. ครัวกด **เริ่มทำ** → **เสร็จแล้ว** (`order:updated`) → หน้าออเดอร์ / Dashboard ของทุกเครื่องอัปเดตเอง
5. เมนูที่ถูกตั้งเป็น "หมด" (`menu:updated`) จะกดไม่ได้ในหน้า POS ทันที

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
| `menu_ingredients` | สูตรอาหาร (เตรียมไว้สำหรับตัดสต็อกอัตโนมัติในอนาคต) |
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
| POST | `/api/orders` | admin, cashier — `{ orderType: dine_in|takeaway, tableNo?, note?, items: [{ menuId, optionIds, quantity (1-99), note? }] }` **ไม่รับราคาจาก client** — ไม่เลือกขนาดจะใช้ขนาดค่าเริ่มต้น |
| GET | `/api/orders` | admin, cashier — `?status=pending,preparing&paymentStatus=&date=YYYY-MM-DD&search=&page=&pageSize=` → `{ orders, pagination }` |
| GET | `/api/orders/kitchen` | ทุก role — `{ active (pending+preparing เก่าสุดก่อน), recentCompleted (เสร็จวันนี้ 12 รายการล่าสุด) }` |
| GET | `/api/orders/:id` | ทุก role — ออเดอร์ + `items[].options` (อ่านจาก snapshot) |
| PATCH | `/api/orders/:id/status` | `{ status: preparing|completed|cancelled }` ลำดับ pending → preparing → completed, ยกเลิกได้ก่อนเสร็จ (admin/cashier เท่านั้น และต้องยังไม่ชำระเงิน) — ข้ามขั้น/กดซ้ำ → 409 |

การยืนยันตัวตน:
- JWT (HS256) อายุตาม `JWT_EXPIRES_IN` — middleware `authenticate` โหลดผู้ใช้จาก DB ทุก request ผู้ใช้ที่ถูกปิด (`is_active = 0`) จะใช้ token เดิมไม่ได้ทันที
- จำกัดสิทธิ์ด้วย `authorize('admin', 'cashier')` ใน `backend/src/middlewares/auth.js` และ `<ProtectedRoute roles={[...]}>` ฝั่ง Frontend
- Socket.IO ต้องส่ง token ตอนเชื่อมต่อ `io({ auth: { token } })` และจะเข้าห้อง `role:<role>`

Socket.IO events (Server → Client, ส่งหลัง commit แล้วเท่านั้น):

| Event | Payload | เมื่อ |
|---|---|---|
| `order:created` | `{ order }` | สร้างออเดอร์ใหม่ |
| `order:updated` | `{ order }` | เปลี่ยนสถานะออเดอร์ |
| `menu:updated` | `{ menu }` | ตั้งเมนูพร้อมขาย/หมด |

## ความคืบหน้า

| Phase | งาน | สถานะ |
|---|---|---|
| 1 | โครงสร้างโปรเจกต์, ตั้งค่า Frontend/Backend, เชื่อมต่อ MySQL, Schema, Seed Data | ✅ เสร็จ |
| 2 | Authentication (JWT + Role), Dashboard, จัดการเมนู/หมวดหมู่/ตัวเลือกเมนู | ✅ เสร็จ |
| 3 | POS, Order Management, Kitchen (Socket.IO) | ✅ เสร็จ |
| 4 | Payment + ใบเสร็จ, Inventory, Sales Report | ⏳ ยังไม่ได้พัฒนา |
| 5 | ทดสอบระบบ / API / Responsive | ⏳ ยังไม่ได้พัฒนา |

หมายเหตุทางเทคนิค:
- ใช้ `bcryptjs` (pure JavaScript, API เดียวกับ `bcrypt`) เพื่อไม่ต้อง compile native module บน Windows
- ใช้ `mysql2/promise` (ไม่ใช้ ORM) พร้อม helper `withTransaction()` ใน `backend/src/config/database.js` (ใช้กับการสร้างออเดอร์/เปลี่ยนสถานะแล้ว และจะใช้กับการชำระเงินใน Phase 4)
- เลขออเดอร์รันใหม่ทุกวันจาก `order_sequences` — แถวของวันนั้นถูก lock ใน transaction จึงไม่ซ้ำแม้สร้างพร้อมกันหลายเครื่อง
- เปลี่ยนสถานะออเดอร์ใช้ `SELECT ... FOR UPDATE` กันการกดพร้อมกันจากหลายเครื่อง
- ยังไม่มี: แก้ไขรายการในออเดอร์ที่ส่งแล้ว, ส่วนลด (คอลัมน์ `discount` เป็น 0 — มาพร้อม Phase 4), เหตุผลการยกเลิก
