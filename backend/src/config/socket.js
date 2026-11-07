const { Server } = require('socket.io');
const env = require('./env');

let io = null;

/**
 * เริ่มต้น Socket.IO (ใช้แจ้งเตือนออเดอร์ใหม่/เปลี่ยนสถานะแบบ Real-time)
 * การยืนยันตัวตนของ socket จะเพิ่มใน Phase 2 (JWT)
 */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrls, credentials: true },
  });

  io.on('connection', (socket) => {
    if (env.nodeEnv === 'development') {
      console.log(`[socket] connected ${socket.id}`);
    }
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO ยังไม่ได้ถูก initialize');
  return io;
}

module.exports = { initSocket, getIO };
