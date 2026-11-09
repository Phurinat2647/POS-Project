const { Server } = require('socket.io');
const env = require('./env');
const { verifyToken } = require('../utils/jwt');

let io = null;

/**
 * เริ่มต้น Socket.IO (แจ้งเตือนออเดอร์ใหม่/เปลี่ยนสถานะแบบ Real-time — ดู emitEvent)
 * ต้องส่ง JWT มาตอนเชื่อมต่อ: io({ auth: { token } })
 * socket ที่ผ่านการยืนยันจะเข้าห้อง `role:<role>` เช่น role:kitchen
 */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrls, credentials: true },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('กรุณาเข้าสู่ระบบ'));
    try {
      const payload = verifyToken(token);
      // require ตอนใช้งาน เพื่อเลี่ยง circular dependency กับ database/env ตอนเริ่มระบบ
      const { findActiveUserById } = require('../services/auth.service');
      const user = await findActiveUserById(Number(payload.sub));
      if (!user) return next(new Error('บัญชีนี้ไม่พร้อมใช้งาน'));
      socket.data.user = user;
      next();
    } catch {
      next(new Error('Token ไม่ถูกต้องหรือหมดอายุ'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    socket.join(`role:${user.role}`);
    if (env.nodeEnv === 'development') {
      console.log(`[socket] connected ${socket.id} (${user.username}/${user.role})`);
    }
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO ยังไม่ได้ถูก initialize');
  return io;
}

const STAFF_ROOMS = ['role:admin', 'role:cashier', 'role:kitchen'];

/**
 * ส่ง event ไปยังผู้ใช้ที่เข้าสู่ระบบ (ค่าเริ่มต้น: ทุก role)
 * เรียกหลัง commit transaction แล้วเท่านั้น — ถ้าส่งไม่สำเร็จจะไม่ทำให้ request ล้มเหลว
 *
 * Event ที่ใช้:
 *   order:created  { order }        ออเดอร์ใหม่
 *   order:updated  { order }        เปลี่ยนสถานะออเดอร์
 *   menu:updated   { menu }         เปลี่ยนสถานะพร้อมขาย/หมด
 */
function emitEvent(event, payload, rooms = STAFF_ROOMS) {
  if (!io) return;
  try {
    io.to(rooms).emit(event, payload);
  } catch (err) {
    console.error(`[socket] emit ${event} failed`, err);
  }
}

module.exports = { initSocket, getIO, emitEvent };
