const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: env.clientUrls, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
if (env.nodeEnv !== 'test') app.use(morgan('dev'));

// ไฟล์รูปภาพเมนูที่อัปโหลด
app.use('/uploads', express.static(env.upload.dir, { maxAge: '7d' }));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
