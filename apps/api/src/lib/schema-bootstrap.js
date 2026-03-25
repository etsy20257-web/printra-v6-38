import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { query } from './database.js';

const schemaPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../db/schema.sql');

export async function applyBootstrapSchema() {
  const sql = await readFile(schemaPath, 'utf8');
  await query(sql);
  return { applied: true };
}
