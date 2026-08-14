require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initPool, closePool } = require('./db');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const contactRoutes = require('./routes/contactRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Fail at boot rather than issuing forgeable tokens. Both authController and
// adminAuth used to fall back to the literal 'your_jwt_secret'.
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set.');
  process.exit(1);
}

const defaultOrigins = [
  'https://main.d3p1aksfaupd6l.amplifyapp.com',
  'https://main.d205k7v5rgbdfp.amplifyapp.com',
  'http://localhost:5173',
  'http://localhost:5174'
];
const allowedOrigins = (process.env.CORS_ORIGINS || defaultOrigins.join(','))
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header: curl, server-to-server, same-origin.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed: ${origin}`));
    }
  })
);
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || err.statusCode || 500;
  // Don't echo internal driver/Stripe messages to clients in production.
  const message =
    status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal Server Error'
      : err.message || 'Internal Server Error';
  res.status(status).json({ success: false, message });
});

const start = async () => {
  try {
    await initPool();
    console.log('Connected to PostgreSQL');
  } catch (error) {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  }

  const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await closePool().catch(() => {});
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start();

module.exports = app;
