import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { DB } from './types';

/**
 * Tiny JSON-file datastore so the shop runs with zero infrastructure.
 * Swap this module for Postgres/SQLite before going to production
 * (serverless hosts such as Vercel have a read-only filesystem).
 */
const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

const empty = (): DB => ({ candidates: [], listings: [], orders: [], outbox: [], runs: [] });

export function readDb(): DB {
  try {
    return { ...empty(), ...JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) };
  } catch {
    return empty();
  }
}

function writeDb(db: DB) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

/** Read-modify-write. Synchronous, so it is atomic within one Node process. */
export function updateDb<T>(fn: (db: DB) => T): T {
  const db = readDb();
  const result = fn(db);
  writeDb(db);
  return result;
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
export const now = () => new Date().toISOString();
