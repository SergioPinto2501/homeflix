import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || './media');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'homeflix.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(`
CREATE TABLE IF NOT EXISTS titles (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('movie','series')),
  name TEXT NOT NULL,
  year INTEGER NOT NULL DEFAULT 0,
  poster TEXT,
  overview TEXT,
  UNIQUE (kind, name, year)
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  season INTEGER,
  episode INTEGER,
  path TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS progress (
  file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
  position REAL NOT NULL,
  duration REAL NOT NULL,
  updated_at INTEGER NOT NULL
);
`);
try { db.exec('ALTER TABLE titles ADD COLUMN backdrop TEXT'); } catch { /* colonna già presente */ }
