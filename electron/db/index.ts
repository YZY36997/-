/**
 * 灵墨小说工坊 · SQLite 数据层
 * 使用 better-sqlite3 同步 API，兼顾性能与开发效率
 * 数据文件位于用户目录：%APPDATA%/灵墨小说工坊/lingmo.db
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';
import { seed } from './seed.js';

let _db: Database.Database | null = null;

export function getDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'lingmo-data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDbPath(): string {
  return path.join(getDataDir(), 'lingmo.db');
}

export function getDb(): Database.Database {
  if (_db) return _db;
  const dbFile = getDbPath();
  _db = new Database(dbFile);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  _db.pragma('synchronous = NORMAL');
  // 应用 schema
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  _db.exec(schema);
  // 初始种子数据（首次启动时）
  seed(_db);
  return _db;
}

// -------------------- 工具函数 --------------------
export function queryMany<T = any>(sql: string, params: any[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}
export function queryOne<T = any>(sql: string, params: any[] = []): T | null {
  return (getDb().prepare(sql).get(...params) as T) || null;
}
export function runSql(sql: string, params: any[] = []): { changes: number; lastInsertRowid: number | bigint } {
  const info = getDb().prepare(sql).run(...params);
  return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
}
export function runInTx(fn: () => void): void {
  const db = getDb();
  const tx = db.transaction(fn);
  (tx as any)();
}
