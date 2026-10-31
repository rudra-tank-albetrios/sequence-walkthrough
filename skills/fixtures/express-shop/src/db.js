const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(text, values) {
  const { rows } = await pool.query(text, values);
  return rows;
}

module.exports = { query };
