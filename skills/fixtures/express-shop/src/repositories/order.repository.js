const db = require('../db');

async function findProduct(productId) {
  const rows = await db.query('SELECT id, price, stock FROM products WHERE id = $1', [productId]);
  return rows[0];
}

async function insert({ userId, productId, quantity, total }) {
  const rows = await db.query(
    'INSERT INTO orders (user_id, product_id, quantity, total, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
    [userId, productId, quantity, total, 'placed'],
  );
  return rows[0];
}

async function findById(id) {
  const rows = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
  return rows[0];
}

module.exports = { findProduct, insert, findById };
