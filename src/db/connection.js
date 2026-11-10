import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA_PATH = fileURLToPath(new URL('./schema.sql', import.meta.url));

export function openDatabase(databasePath) {
  if (typeof databasePath !== 'string' || databasePath.trim() === '') {
    throw new TypeError('Database path must be a non-empty string.');
  }
  if (databasePath !== ':memory:') {
    mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  }

  const database = new DatabaseSync(databasePath);
  try {
    database.exec('PRAGMA foreign_keys = ON');
    database.exec(readFileSync(SCHEMA_PATH, 'utf8'));
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

export function closeDatabase(database) {
  database.close();
}
