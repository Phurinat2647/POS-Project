const http = require('http');
const env = require('./config/env');
const app = require('./app');
const { initSocket } = require('./config/socket');
const { testConnection } = require('./config/database');

const server = http.createServer(app);
initSocket(server);

server.listen(env.port, async () => {
  console.log(`[server] Food POS API running at http://localhost:${env.port}/api`);
  try {
    const info = await testConnection();
    console.log(`[database] connected: ${info.version}`);
  } catch (err) {
    console.error(`[database] connection failed (${err.code || err.message}) - ตรวจสอบค่า DB_* ใน .env`);
  }
});

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});
