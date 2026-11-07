const { Server } = require('socket.io');
const env = require('./env');
const { verifyToken } = require('../utils/jwt');

let io = null;

/**
 * เริ่มต้น Socket.IO (ใช้แจ้งเตือนออเดอร์ใหม่/เปลี่ยนสถานะแบบ Real-time — event จะเพิ่มใน Phase 3)
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

module.exports = { initSocket, getIO };
