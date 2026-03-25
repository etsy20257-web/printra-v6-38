import { Pool } from 'pg';
import { env } from '../config/env.js';

let pool;

export function isDatabaseConfigured() {
  return Boolean(env.DATABASE_URL);
}

export function getPool() {
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (!pool) {
    pool = new Pool({ connectionString: env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000 });
  }
  return pool;
}

export async function query(text, params = []) {
  return getPool().query(text, params);
}

export async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDatabaseHealth() {
  if (!isDatabaseConfigured()) {
    return { configured: false, connected: false };
  }
  try {
    await query('select 1');
    return { configured: true, connected: true };
  } catch (error) {
    return { configured: true, connected: false, error: error instanceof Error ? error.message : 'Unknown database error' };
  }
}
