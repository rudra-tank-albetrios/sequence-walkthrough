import { db } from '../../shared/db.ts';

export function readStock(item: string) {
  return db.prepare('SELECT remaining, unit_price FROM stock WHERE item = ?').get(item) as
    | { remaining: number; unit_price: number }
    | undefined;
}

export function insertOrder(customer: string, item: string, count: number, due: number) {
  return db
    .prepare('INSERT INTO orders (customer, item, count, due, state) VALUES (?, ?, ?, ?, ?) RETURNING *')
    .get(customer, item, count, due, 'waiting') as { id: number; state: string; due: number };
}
