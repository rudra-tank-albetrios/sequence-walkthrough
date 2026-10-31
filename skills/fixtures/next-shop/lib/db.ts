import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function query(text: string, values: unknown[]) {
  const { rows } = await pool.query(text, values);
  return rows;
}
