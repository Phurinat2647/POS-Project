const v = require('../utils/validate');
const ApiError = require('../utils/ApiError');
const service = require('../services/menu.service');
const recipeService = require('../services/recipe.service');
const menuAvailability = require('../services/menuAvailability.service');
const { menuImageUrl, removeMenuImage } = require('../config/upload');
const { emitEvent } = require('../config/socket');

const STATUSES = ['available', 'sold_out'];

/** body มาจาก multipart/form-data (ค่าเป็น string) หรือ JSON */
function parseBody(body = {}) {
  return {
    categoryId: v.id(body.categoryId, 'หมวดหมู่'),
    name: v.requiredString(body.name, 'ชื่อเมนู', 150),
    nameEn: v.optionalString(body.nameEn, 'ชื่อภาษาอังกฤษ', 150),
    description: v.optionalString(body.description, 'คำอธิบาย', 500),
    price: v.money(body.price, 'ราคา'),
    status: v.oneOf(body.status || 'available', STATUSES, 'สถานะ'),
  };
}

/** ถ้าบันทึกไม่สำเร็จ ให้ลบไฟล์ที่เพิ่งอัปโหลดทิ้ง */
async function withUploadedFile(req, work) {
  const uploadedUrl = req.file ? menuImageUrl(req.file.filename) : null;
  try {
    return await work(uploadedUrl);
  } catch (err) {
    if (uploadedUrl) removeMenuImage(uploadedUrl);
    throw err;
  }
}

async function list(req, res) {
  const includeInactive = req.user.role === 'admin' && v.bool(req.query.includeInactive);
  const data = await service.list({
    categoryId: v.optionalId(req.query.categoryId, 'หมวดหมู่'),
    status: req.query.status ? v.oneOf(req.query.status, STATUSES, 'สถานะ') : null,
    search: v.optionalString(req.query.search, 'คำค้นหา', 100),
    includeInactive,
  });
  res.json({ success: true, data });
}

async function getOne(req, res) {
  const data = await service.getById(v.id(req.params.id), {
    withOptions: true,
    includeInactive: req.user.role === 'admin',
  });
  res.json({ success: true, data });
}

async function create(req, res) {
  const data = await withUploadedFile(req, (imageUrl) => service.create({ ...parseBody(req.body), imageUrl }));
  res.status(201).json({ success: true, data, message: 'เพิ่มเมนูสำเร็จ' });
}

async function update(req, res) {
  const id = v.id(req.params.id);
  const data = await withUploadedFile(req, (newUrl) =>
    service.update(id, parseBody(req.body), { newUrl, remove: v.bool(req.body?.removeImage) })
  );
  emitEvent('menu:updated', { menu: data });
  res.json({ success: true, data, message: 'บันทึกเมนูสำเร็จ' });
}

async function updateStatus(req, res) {
  const status = v.oneOf(req.body?.status, STATUSES, 'สถานะ');
  const data = await service.updateStatus(v.id(req.params.id), status);
  emitEvent('menu:updated', { menu: data }); // หน้า POS อัปเดตเมนูที่หมดทันที
  res.json({ success: true, data, message: status === 'available' ? 'เปิดขายเมนูแล้ว' : 'ตั้งเป็นเมนูหมดแล้ว' });
}

async function remove(req, res) {
  const { softDeleted } = await service.remove(v.id(req.params.id));
  res.json({
    success: true,
    data: { softDeleted },
    message: softDeleted ? 'ลบเมนูแล้ว (เก็บไว้เป็นประวัติการขาย)' : 'ลบเมนูสำเร็จ',
  });
}

const MAX_RECIPE_ITEMS = 50;

async function getRecipe(req, res) {
  res.json({ success: true, data: await recipeService.getRecipe(v.id(req.params.id)) });
}

/**
 * PUT /menus/:id/recipe — แทนที่สูตรทั้งหมด
 * { items: [{ ingredientId, quantity }] } หรือวัตถุดิบใหม่ที่พิมพ์เอง { name, unit, quantity }
 */
async function setRecipe(req, res) {
  const items = parseRecipeItems(req.body?.items);
  const menuId = v.id(req.params.id);
  const data = await recipeService.setRecipe(menuId, items);
  const { soldOut } = await menuAvailability.syncAndNotify();
  res.json({
    success: true,
    data,
    message: soldOut.includes(menuId)
      ? 'บันทึกสูตรแล้ว — เมนูถูกตั้งเป็น "หมด" เพราะวัตถุดิบในคลังไม่พอ (รับเข้าวัตถุดิบแล้วจะเปิดขายเอง)'
      : 'บันทึกสูตรอาหารสำเร็จ',
  });
}

/** ตรวจรายการวัตถุดิบในสูตร (ใช้ทั้งสูตรเมนูและสูตรตัวเลือก) */
function parseRecipeItems(raw) {
  if (!Array.isArray(raw)) throw ApiError.badRequest('รายการวัตถุดิบไม่ถูกต้อง');
  if (raw.length > MAX_RECIPE_ITEMS) throw ApiError.badRequest(`ใส่วัตถุดิบได้ไม่เกิน ${MAX_RECIPE_ITEMS} รายการ`);
  return raw.map((r, i) => {
    const label = `รายการที่ ${i + 1}`;
    const quantity = v.quantity(r?.quantity, `ปริมาณ${label}`, { positive: true, max: 99999.999 });
    if (r?.ingredientId !== undefined && r?.ingredientId !== null && r?.ingredientId !== '') {
      return { ingredientId: v.id(r.ingredientId, `วัตถุดิบ${label}`), quantity };
    }
    return {
      name: v.requiredString(r?.name, `ชื่อวัตถุดิบ${label}`, 150),
      unit: v.requiredString(r?.unit, `หน่วยนับของวัตถุดิบ${label}`, 20),
      quantity,
    };
  });
}

module.exports = { list, getOne, create, update, updateStatus, remove, getRecipe, setRecipe, parseRecipeItems };
