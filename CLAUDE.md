# CLAUDE.md

คู่มือสำหรับ Claude Code เมื่อทำงานในโปรเจกต์นี้

## ภาพรวม

Food POS Management System — ระบบ POS ร้านอาหารตามสั่ง แยกเป็น 2 โปรเจกต์:
- `backend/` — Node.js + Express (CommonJS), `mysql2/promise` (ไม่ใช้ ORM), JWT, `bcryptjs`, Socket.IO
- `frontend/` — React + Vite (ESM), Tailwind CSS v4, React Router, Axios, Recharts, Lucide React, SweetAlert2

ผู้ใช้สื่อสารภาษาไทย — ตอบเป็นภาษาไทย ข้อความใน UI และข้อความ error จาก API เป็นภาษาไทย

## สถานะการพัฒนา

พัฒนาทีละ Phase และต้องรอผู้ใช้ยืนยันก่อนเริ่ม Phase ถัดไป

| Phase | งาน | สถานะ |
|---|---|---|
| 1 | โครงสร้างโปรเจกต์, เชื่อมต่อ MySQL, Schema, Seed | ✅ เสร็จ |
| 2 | Auth (JWT + Role) ✅ / Dashboard, จัดการเมนู/หมวดหมู่ ⏳ | 🟡 |
| 3 | POS, Orders, Kitchen (Socket.IO) | ⏳ |
| 4 | Payment + ใบเสร็จ, Inventory, Sales Report | ⏳ |
| 5 | ทดสอบระบบ / API / Responsive | ⏳ |

เมื่อจบแต่ละ Phase ให้อัปเดตตารางนี้และตาราง "ความคืบหน้า" ใน `README.md`
ห้ามบอกว่าฟีเจอร์ใช้งานได้ถ้ายังไม่ได้เชื่อมต่อ API/DB จริงและทดสอบแล้ว

## คำสั่ง

```bash
# Database (XAMPP MariaDB 10.4, root ไม่มีรหัสผ่าน) — ถ้ายังไม่รัน:
/c/xampp/mysql/bin/mysqld.exe --defaults-file=/c/xampp/mysql/bin/my.ini --standalone   # รันเป็น background

# Backend (cd backend)
npm run dev                 # nodemon, http://localhost:5000/api
npm run db:setup            # ⚠️ DROP + สร้างตารางใหม่ + seed (ข้อมูลเดิมหาย)
npm run db:setup -- --schema-only
npm run db:check            # จำนวนแถว + Foreign Keys + ทดสอบภาษาไทย
npm run hash -- <password>  # สร้าง bcrypt hash

# Frontend (cd frontend)
npm run dev                 # http://localhost:5173 (proxy /api, /uploads, /socket.io -> :5000)
npm run build               # ใช้ตรวจว่าโค้ดคอมไพล์ผ่าน
```

ตรวจ syntax ของ backend: `node --check <file>` / ทดสอบ API ด้วย `curl` หลังรันเซิร์ฟเวอร์
ยังไม่มี test framework หรือ linter

บัญชีทดสอบ: `admin/admin1234`, `cashier/cashier1234`, `kitchen/kitchen1234`

## โครงสร้าง Backend

```
backend/src/
  config/       env.js (อ่าน .env, ปิดโปรแกรมถ้า JWT_SECRET ไม่ถูกต้อง), database.js (pool + withTransaction), socket.js
  routes/       <module>.routes.js — รวมใน routes/index.js ภายใต้ /api
  controllers/  รับ req/validate/ส่ง response — บางที่สุด
  services/     business logic + SQL
  models/       (ถ้าจำเป็น) query helper ของแต่ละตาราง
  middlewares/  errorHandler.js (notFound + errorHandler), auth.js (authenticate → req.user, authorize(...roles)), loginLimiter.js
  utils/        ApiError, asyncHandler, money (toSatang/toBaht)
backend/database/schema.sql, seed.sql   — แหล่งความจริงของโครงสร้างฐานข้อมูล
```

แนวทางเพิ่มโมดูลใหม่: `routes -> controller -> service` ห่อ controller ด้วย `asyncHandler`
และโยน `ApiError.badRequest() / notFound() / forbidden() / conflict()` แทนการส่ง response error เอง

รูปแบบ response:
- สำเร็จ: `{ success: true, data, message? }`
- ผิดพลาด: `{ success: false, message, details? }` (สร้างโดย `errorHandler` เท่านั้น)
- `errorHandler` แปลง MySQL error ให้แล้ว: ER_DUP_ENTRY→409, FK ถูกอ้างอิง→409, CHECK (errno 3819/4025)→400

## กฎสำคัญของระบบ (ห้ามละเมิด)

- **ราคาคำนวณที่ Backend เท่านั้น** — รับจาก frontend แค่ `menu_id`, `option_ids`, `quantity`, `note` แล้วดึงราคาจาก DB ใหม่เสมอ
- **คำนวณเงินเป็นสตางค์** ด้วย `utils/money.js` (`toSatang`/`toBaht`) — pool ตั้ง `decimalNumbers: true` จึงได้ DECIMAL เป็น number
- **ใช้ `withTransaction(conn => ...)`** สำหรับการสร้างออเดอร์, รับชำระเงิน, และรายการรับเข้า/เบิกออกวัตถุดิบ — ทุก query ภายในต้องใช้ `conn` ไม่ใช่ `pool`
- **Snapshot** — `order_items` เก็บ `menu_name`, `category_name`, `unit_price`, `options_price`, `line_total`; `order_item_options` เก็บชื่อ/ราคาตัวเลือก รายงานและใบเสร็จต้องอ่านจาก snapshot ไม่ join ไปที่ `menus`
- **เลขออเดอร์** สร้างจาก `order_sequences` ภายใน transaction:
  `INSERT INTO order_sequences (seq_date,last_no) VALUES (CURDATE(),1) ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1)` รูปแบบ `YYYYMMDD-NNNN`
- **Payment** — 1 ออเดอร์ชำระได้ครั้งเดียว (`UNIQUE(order_id)`), ต้องอัปเดต `orders.payment_status='paid'` และ `paid_at` ใน transaction เดียวกัน
- **ลบเมนู/ผู้ใช้ที่เคยถูกใช้งาน** ให้ soft delete ด้วย `is_active = 0`
- **SQL ใช้ placeholder `?` เสมอ** ห้ามต่อ string จาก input ของผู้ใช้
- **Role** มี 3 ค่า (`roles.name`): `admin`, `cashier`, `kitchen` — ตรวจสิทธิ์ทั้งที่ API (middleware) และ route ฝั่ง frontend
- ห้ามใช้ mock data ในหน้าที่พัฒนาเสร็จแล้ว — ทุกหน้าต้องดึงจาก API จริง

## ฐานข้อมูล

- ฐานข้อมูลเดียว `food_pos`, `utf8mb4_unicode_ci`, InnoDB, timezone `+07:00` (ตั้งทั้ง pool และ session)
- 14 ตาราง: roles, users, categories, menus, menu_options, order_sequences, orders, order_items, order_item_options, payments, ingredients, inventory_transactions, menu_ingredients, settings
- `menu_options` ผูกได้ 3 ระดับ: `menu_id` (เมนูเดียว) / `category_id` (ทั้งหมวด) / ทั้งคู่ NULL (ทุกเมนู) — ห้ามกำหนดทั้งสองค่าพร้อมกัน (CHECK)
  `option_type`: `size` เลือกได้ 1 อย่าง (มี `is_default`), `topping` เลือกได้หลายอย่าง
- สถานะ: `orders.status` = pending/preparing/completed/cancelled, `orders.payment_status` = unpaid/paid, `menus.status` = available/sold_out
- `inventory_transactions.type` = in/out/adjust, `quantity` เป็นค่าบวกเสมอ, บันทึก `balance_after` ทุกครั้ง
- ถ้าแก้ schema ต้องแก้ทั้ง `schema.sql`, `seed.sql` (ถ้ากระทบ), และ `EXPECTED_TABLES` ใน `routes/health.routes.js`
- ต้องรองรับทั้ง MariaDB 10.4 และ MySQL 8 — หลีกเลี่ยงฟีเจอร์ที่มีแค่ฝั่งเดียว

## Frontend

- `src/services/api.js` — axios instance กลาง แนบ token จาก `localStorage['food_pos_token']`, ใส่ `error.userMessage` (ข้อความไทย) ให้ใช้แสดงผล
- เรียก API ผ่านไฟล์ `src/services/<module>.service.js` เท่านั้น ไม่เรียก axios ตรงจาก component
- ทุกหน้าที่โหลดข้อมูลต้องมี loading state + error state, การลบต้องยืนยันก่อน (SweetAlert2)
- ห่อการเข้าถึง `localStorage` ด้วย try/catch
- **Tailwind v4**: ไม่มี `tailwind.config.js` — ธีมกำหนดใน `@theme` ของ `src/index.css`
  คลาสส่วนกลาง (`card`, `btn`, `btn-primary`, `btn-outline`, `badge`) ประกาศด้วย `@utility` (ไม่ใช่ `@layer components` เพราะ `@apply` ใช้กับคลาสในนั้นไม่ได้)
- ธีม: สีหลักเขียวเข้ม `primary-800` (#166534), พื้นหลัง `bg-surface`, สถานะ `success`/`warning`/`danger`, ฟอนต์ Noto Sans Thai
- Layout เป้าหมาย: Sidebar ซ้าย + Topbar + เนื้อหากลาง, Card/Table/Modal, รองรับ Desktop/Tablet/Mobile
- Auth: `contexts/AuthContext.jsx` (`useAuth()` → user, status, login, logout, hasRole), `components/ProtectedRoute.jsx` (`roles` prop), `layouts/MainLayout.jsx` (เพิ่มเมนู Sidebar ที่ `NAV_ITEMS`)
  API ตอบ 401 → `api.js` ล้าง token และยิง event `food-pos:unauthorized` ให้ AuthContext กลับหน้า Login
- หน้าที่มี: `/login`, `/` (หน้าหลักชั่วคราว รอ Dashboard), `/change-password`, `/forbidden`, `/system-status` (admin)

## ข้อควรระวังเรื่องสภาพแวดล้อม (Windows)

- ใช้ `bcryptjs` ไม่ใช่ `bcrypt` (ไม่ต้อง compile native module)
- **อย่าเขียนหลายไฟล์ใน heredoc ยาวคำสั่งเดียว** — เคยทำให้ไฟล์ที่มีภาษาไทยถูกตัดกลางทางโดยไม่มี error ให้ใช้ Write tool ทีละไฟล์
- ไฟล์ `.env` ทั้งสองฝั่งมีอยู่แล้ว (ไม่ commit) — แก้ค่าตัวอย่างที่ `.env.example`
