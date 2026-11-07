-- =====================================================================
--  Food POS Management System - Database Schema
--  Target : MySQL 8.0+ / MariaDB 10.4+
--  Charset: utf8mb4 (รองรับภาษาไทยและอีโมจิ)
--
--  คำเตือน: สคริปต์นี้จะ DROP ตารางเดิมทั้งหมดแล้วสร้างใหม่ (ใช้สำหรับติดตั้ง/รีเซ็ต)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `food_pos`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `food_pos`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `inventory_transactions`;
DROP TABLE IF EXISTS `menu_ingredients`;
DROP TABLE IF EXISTS `ingredients`;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `order_item_options`;
DROP TABLE IF EXISTS `order_items`;
DROP TABLE IF EXISTS `orders`;
DROP TABLE IF EXISTS `order_sequences`;
DROP TABLE IF EXISTS `menu_options`;
DROP TABLE IF EXISTS `menus`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `roles`;
DROP TABLE IF EXISTS `settings`;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- roles : ประเภทผู้ใช้งาน (admin / cashier / kitchen)
-- ---------------------------------------------------------------------
CREATE TABLE `roles` (
  `id`           TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(30)  NOT NULL COMMENT 'รหัส role ใช้ในโค้ด: admin, cashier, kitchen',
  `display_name` VARCHAR(100) NOT NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- users : พนักงาน / ผู้ใช้งานระบบ
-- ---------------------------------------------------------------------
CREATE TABLE `users` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_id`       TINYINT UNSIGNED NOT NULL,
  `username`      VARCHAR(50)  NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL COMMENT 'bcrypt hash - ห้ามเก็บรหัสผ่านจริง',
  `full_name`     VARCHAR(150) NOT NULL,
  `phone`         VARCHAR(20)  NULL,
  `is_active`     TINYINT(1)   NOT NULL DEFAULT 1,
  `last_login_at` DATETIME NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  KEY `idx_users_role` (`role_id`),
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- categories : หมวดหมู่อาหาร
-- ---------------------------------------------------------------------
CREATE TABLE `categories` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL,
  `sort_order`  INT NOT NULL DEFAULT 0,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_categories_name` (`name`),
  KEY `idx_categories_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- menus : เมนูอาหาร
--   status   : available = พร้อมขาย, sold_out = หมด
--   is_active: 0 = ลบแบบ soft delete (กรณีเมนูเคยถูกขายแล้ว)
-- ---------------------------------------------------------------------
CREATE TABLE `menus` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category_id` INT UNSIGNED NOT NULL,
  `name`        VARCHAR(150) NOT NULL,
  `description` VARCHAR(500) NULL,
  `price`       DECIMAL(10,2) NOT NULL,
  `image_url`   VARCHAR(255) NULL,
  `status`      ENUM('available','sold_out') NOT NULL DEFAULT 'available',
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_menus_name` (`name`),
  KEY `idx_menus_category` (`category_id`),
  KEY `idx_menus_status` (`status`, `is_active`),
  CONSTRAINT `fk_menus_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `chk_menus_price` CHECK (`price` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- menu_options : ตัวเลือกเพิ่มเติม (ขนาด / ท็อปปิ้ง)
--   ขอบเขตการใช้งาน:
--     menu_id     ไม่เป็น NULL -> ใช้กับเมนูนั้นเท่านั้น
--     category_id ไม่เป็น NULL -> ใช้กับทุกเมนูในหมวดนั้น
--     ทั้งคู่เป็น NULL           -> ใช้ได้กับทุกเมนู
--   option_type: size = เลือกได้ 1 อย่าง, topping = เลือกได้หลายอย่าง
-- ---------------------------------------------------------------------
CREATE TABLE `menu_options` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `menu_id`     INT UNSIGNED NULL,
  `category_id` INT UNSIGNED NULL,
  `option_type` ENUM('size','topping') NOT NULL,
  `name`        VARCHAR(100) NOT NULL,
  `extra_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `is_default`  TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'ค่าเริ่มต้นของกลุ่ม size',
  `sort_order`  INT NOT NULL DEFAULT 0,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_menu_options_menu` (`menu_id`),
  KEY `idx_menu_options_category` (`category_id`),
  CONSTRAINT `fk_menu_options_menu` FOREIGN KEY (`menu_id`) REFERENCES `menus` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_menu_options_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `chk_menu_options_price` CHECK (`extra_price` >= 0),
  CONSTRAINT `chk_menu_options_scope` CHECK (`menu_id` IS NULL OR `category_id` IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- order_sequences : ตัวนับเลขออเดอร์รายวัน (ใช้ร่วมกับ transaction
-- เพื่อสร้างเลขออเดอร์ที่ไม่ซ้ำ เช่น 20261107-0001)
-- ---------------------------------------------------------------------
CREATE TABLE `order_sequences` (
  `seq_date` DATE NOT NULL,
  `last_no`  INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`seq_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- orders : คำสั่งซื้อ
--   status         : สถานะในครัว
--   payment_status : สถานะการชำระเงิน
--   ราคาทั้งหมดคำนวณโดย Backend จากฐานข้อมูล (ไม่เชื่อราคาจาก Frontend)
-- ---------------------------------------------------------------------
CREATE TABLE `orders` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no`       VARCHAR(20) NOT NULL,
  `order_type`     ENUM('dine_in','takeaway') NOT NULL DEFAULT 'dine_in',
  `table_no`       VARCHAR(20) NULL,
  `status`         ENUM('pending','preparing','completed','cancelled') NOT NULL DEFAULT 'pending',
  `payment_status` ENUM('unpaid','paid') NOT NULL DEFAULT 'unpaid',
  `subtotal`       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `discount`       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total`          DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `note`           VARCHAR(500) NULL,
  `cashier_id`     INT UNSIGNED NULL,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `preparing_at`   DATETIME NULL,
  `completed_at`   DATETIME NULL,
  `cancelled_at`   DATETIME NULL,
  `paid_at`        DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orders_order_no` (`order_no`),
  KEY `idx_orders_created` (`created_at`),
  KEY `idx_orders_status` (`status`, `created_at`),
  KEY `idx_orders_payment` (`payment_status`, `paid_at`),
  KEY `idx_orders_cashier` (`cashier_id`),
  CONSTRAINT `fk_orders_cashier` FOREIGN KEY (`cashier_id`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `chk_orders_amounts` CHECK (`subtotal` >= 0 AND `discount` >= 0 AND `total` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- order_items : รายการอาหารในออเดอร์ (Snapshot ชื่อ/ราคา ณ เวลาสั่ง)
--   unit_price    = ราคาเมนูพื้นฐาน ณ เวลาสั่ง
--   options_price = ราคาตัวเลือกรวมต่อ 1 หน่วย ณ เวลาสั่ง
--   line_total    = (unit_price + options_price) * quantity
-- ---------------------------------------------------------------------
CREATE TABLE `order_items` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`      BIGINT UNSIGNED NOT NULL,
  `menu_id`       INT UNSIGNED NULL COMMENT 'อ้างอิงเมนูต้นทาง (อาจเป็น NULL ถ้าเมนูถูกลบ)',
  `menu_name`     VARCHAR(150) NOT NULL,
  `category_name` VARCHAR(100) NULL,
  `unit_price`    DECIMAL(10,2) NOT NULL,
  `options_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `quantity`      INT UNSIGNED NOT NULL,
  `line_total`    DECIMAL(12,2) NOT NULL,
  `note`          VARCHAR(255) NULL COMMENT 'หมายเหตุ เช่น ไม่เผ็ด ไม่ใส่ผัก',
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_order_items_order` (`order_id`),
  KEY `idx_order_items_menu` (`menu_id`),
  CONSTRAINT `fk_order_items_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_order_items_menu` FOREIGN KEY (`menu_id`) REFERENCES `menus` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `chk_order_items_qty` CHECK (`quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- order_item_options : ตัวเลือกที่เลือกในแต่ละรายการ (Snapshot)
-- ---------------------------------------------------------------------
CREATE TABLE `order_item_options` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_item_id`  BIGINT UNSIGNED NOT NULL,
  `menu_option_id` INT UNSIGNED NULL,
  `option_type`    ENUM('size','topping') NOT NULL,
  `option_name`    VARCHAR(100) NOT NULL,
  `extra_price`    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  KEY `idx_oio_item` (`order_item_id`),
  KEY `idx_oio_option` (`menu_option_id`),
  CONSTRAINT `fk_oio_item` FOREIGN KEY (`order_item_id`) REFERENCES `order_items` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_oio_option` FOREIGN KEY (`menu_option_id`) REFERENCES `menu_options` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- payments : การชำระเงิน (1 ออเดอร์ชำระได้ 1 ครั้ง ในเวอร์ชันแรก)
--   method: cash = เงินสด, promptpay = QR PromptPay (บันทึกวิธีชำระเท่านั้น)
-- ---------------------------------------------------------------------
CREATE TABLE `payments` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`        BIGINT UNSIGNED NOT NULL,
  `method`          ENUM('cash','promptpay') NOT NULL,
  `amount`          DECIMAL(12,2) NOT NULL COMMENT 'ยอดที่ต้องชำระ',
  `received_amount` DECIMAL(12,2) NOT NULL COMMENT 'จำนวนเงินที่รับ',
  `change_amount`   DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'เงินทอน',
  `reference_no`    VARCHAR(100) NULL COMMENT 'เลขอ้างอิงการโอน (ถ้ามี)',
  `received_by`     INT UNSIGNED NULL,
  `paid_at`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payments_order` (`order_id`),
  KEY `idx_payments_paid_at` (`paid_at`),
  KEY `idx_payments_method` (`method`, `paid_at`),
  CONSTRAINT `fk_payments_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT `fk_payments_user` FOREIGN KEY (`received_by`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `chk_payments_amounts` CHECK (`amount` >= 0 AND `received_amount` >= `amount` AND `change_amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- ingredients : วัตถุดิบ
-- ---------------------------------------------------------------------
CREATE TABLE `ingredients` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(150) NOT NULL,
  `unit`          VARCHAR(20)  NOT NULL COMMENT 'หน่วยนับ เช่น กิโลกรัม กรัม ชิ้น ลิตร',
  `quantity`      DECIMAL(12,3) NOT NULL DEFAULT 0.000 COMMENT 'จำนวนคงเหลือ',
  `min_quantity`  DECIMAL(12,3) NOT NULL DEFAULT 0.000 COMMENT 'จำนวนขั้นต่ำก่อนแจ้งเตือน',
  `cost_per_unit` DECIMAL(10,2) NULL,
  `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ingredients_name` (`name`),
  CONSTRAINT `chk_ingredients_qty` CHECK (`quantity` >= 0 AND `min_quantity` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- menu_ingredients : สูตรอาหาร (เตรียมไว้สำหรับตัดสต็อกอัตโนมัติในอนาคต)
-- ---------------------------------------------------------------------
CREATE TABLE `menu_ingredients` (
  `menu_id`       INT UNSIGNED NOT NULL,
  `ingredient_id` INT UNSIGNED NOT NULL,
  `quantity`      DECIMAL(12,3) NOT NULL COMMENT 'ปริมาณที่ใช้ต่อ 1 จาน',
  PRIMARY KEY (`menu_id`, `ingredient_id`),
  KEY `idx_mi_ingredient` (`ingredient_id`),
  CONSTRAINT `fk_mi_menu` FOREIGN KEY (`menu_id`) REFERENCES `menus` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_mi_ingredient` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `chk_mi_qty` CHECK (`quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- inventory_transactions : ประวัติรับเข้า / เบิกออก / ปรับยอด
--   quantity      : จำนวนที่เปลี่ยน (ค่าบวกเสมอ, ทิศทางดูจาก type)
--   balance_after : ยอดคงเหลือหลังทำรายการ (ตรวจสอบย้อนหลังได้)
-- ---------------------------------------------------------------------
CREATE TABLE `inventory_transactions` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ingredient_id` INT UNSIGNED NOT NULL,
  `type`          ENUM('in','out','adjust') NOT NULL,
  `quantity`      DECIMAL(12,3) NOT NULL,
  `balance_after` DECIMAL(12,3) NOT NULL,
  `unit_cost`     DECIMAL(10,2) NULL,
  `note`          VARCHAR(255) NULL,
  `order_id`      BIGINT UNSIGNED NULL COMMENT 'สำหรับการตัดสต็อกจากออเดอร์ในอนาคต',
  `created_by`    INT UNSIGNED NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_inv_tx_ingredient` (`ingredient_id`, `created_at`),
  KEY `idx_inv_tx_created` (`created_at`),
  KEY `idx_inv_tx_order` (`order_id`),
  CONSTRAINT `fk_inv_tx_ingredient` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients` (`id`)
    ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT `fk_inv_tx_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `fk_inv_tx_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`)
    ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT `chk_inv_tx_qty` CHECK (`quantity` >= 0 AND `balance_after` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- settings : ตั้งค่าระบบ (ชื่อร้าน ที่อยู่ เบอร์โทร PromptPay ฯลฯ)
-- ---------------------------------------------------------------------
CREATE TABLE `settings` (
  `setting_key`   VARCHAR(50)  NOT NULL,
  `setting_value` VARCHAR(500) NULL,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
