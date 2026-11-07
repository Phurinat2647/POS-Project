# Food POS Management System

ระบบบริหารจัดการร้านอาหารตามสั่ง (POS) — React + Vite + Tailwind CSS / Node.js + Express / MySQL

> **สถานะปัจจุบัน: Phase 1 เสร็จ, Phase 2 เสร็จเฉพาะส่วน Authentication**
> Dashboard, จัดการเมนู/หมวดหมู่ และ Phase 3–5 **ยังไม่ได้พัฒนา** ดูตาราง [ความคืบหน้า](#ความคืบหน้า) ด้านล่าง

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
│   │   ├── config/             # env, database pool + transaction helper, socket.io
│   │   ├── controllers/
│   │   ├── models/
│   │   ├── routes/             # /api/health, /api/auth
│   │   ├── middlewares/        # error handler, 404, auth (authenticate/authorize), loginLimiter
│   │   ├── services/
│   │   ├── utils/              # ApiError, asyncHandler, money (คำนวณเป็นสตางค์)
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

เปิด http://localhost:5173 → จะพบหน้า **เข้าสู่ระบบ** (ใช้บัญชีทดสอบด้านล่าง) หน้า **สถานะระบบ** (`/system-status`) เปิดได้เฉพาะ admin

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

การยืนยันตัวตน:
- JWT (HS256) อายุตาม `JWT_EXPIRES_IN` — middleware `authenticate` โหลดผู้ใช้จาก DB ทุก request ผู้ใช้ที่ถูกปิด (`is_active = 0`) จะใช้ token เดิมไม่ได้ทันที
- จำกัดสิทธิ์ด้วย `authorize('admin', 'cashier')` ใน `backend/src/middlewares/auth.js` และ `<ProtectedRoute roles={[...]}>` ฝั่ง Frontend
- Socket.IO ต้องส่ง token ตอนเชื่อมต่อ `io({ auth: { token } })` และจะเข้าห้อง `role:<role>`

## ความคืบหน้า

| Phase | งาน | สถานะ |
|---|---|---|
| 1 | โครงสร้างโปรเจกต์, ตั้งค่า Frontend/Backend, เชื่อมต่อ MySQL, Schema, Seed Data | ✅ เสร็จ |
| 2 | Authentication (JWT + Role) | ✅ เสร็จ |
| 2 | Dashboard, จัดการเมนูและหมวดหมู่ | ⏳ ยังไม่ได้พัฒนา |
| 3 | POS, Order Management, Kitchen (Socket.IO) | ⏳ ยังไม่ได้พัฒนา |
| 4 | Payment + ใบเสร็จ, Inventory, Sales Report | ⏳ ยังไม่ได้พัฒนา |
| 5 | ทดสอบระบบ / API / Responsive | ⏳ ยังไม่ได้พัฒนา |

หมายเหตุทางเทคนิค:
- ใช้ `bcryptjs` (pure JavaScript, API เดียวกับ `bcrypt`) เพื่อไม่ต้อง compile native module บน Windows
- ใช้ `mysql2/promise` (ไม่ใช้ ORM) พร้อม helper `withTransaction()` ใน `backend/src/config/database.js` สำหรับการสร้างออเดอร์และชำระเงินใน Phase ถัดไป
- Socket.IO ยืนยันตัวตนผ่าน JWT แล้ว แต่ยังไม่มี event (Phase 3)
