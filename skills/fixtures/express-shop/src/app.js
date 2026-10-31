const express = require('express');

const orderRoutes = require('./routes/order.routes');
const healthRoutes = require('./routes/health.routes');
const { AppError } = require('./errors');

const app = express();
app.use(express.json());

app.use('/api/v1/orders', orderRoutes);
app.use('/health', healthRoutes);

// Every error on every route leaves through here.
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: 'internal', message: 'Something went wrong' });
});

module.exports = app;
