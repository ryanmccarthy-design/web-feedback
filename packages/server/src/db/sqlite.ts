import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const sqlite = new Database(path.join(dataDir, 'feedback.sqlite'));

// Enable WAL mode for fast concurrency
sqlite.pragma('journal_mode = WAL');

// Initialize schema tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email_provider TEXT DEFAULT 'none',
    email_config TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    picture TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    url TEXT NOT NULL,
    user_id TEXT NOT NULL,
    comment TEXT NOT NULL,
    image TEXT,
    x_percent REAL NOT NULL,
    y_percent REAL NOT NULL,
    width_percent REAL,
    height_percent REAL,
    status TEXT DEFAULT 'open',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS replies (
    id TEXT PRIMARY KEY,
    comment_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS reactions (
    id TEXT PRIMARY KEY,
    comment_id TEXT NOT NULL,
    reply_id TEXT,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// Insert default project if missing
const defaultProjectStmt = sqlite.prepare('SELECT id FROM projects WHERE id = ?');
if (!defaultProjectStmt.get('default')) {
  sqlite.prepare(`
    INSERT INTO projects (id, name, email_provider, email_config, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('default', 'Default Project', 'none', '{}', new Date().toISOString());
}
