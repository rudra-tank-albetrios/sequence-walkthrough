const db = require('../db');

// The monthly sales report. Not part of placing an order.
function monthlySales(month) {
  return db.query('SELECT SUM(total) AS total FROM orders WHERE month = $1', [month]);
}

module.exports = { monthlySales };
