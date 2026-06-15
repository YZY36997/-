/** 软件设置 / 回收站 */
import { getDb } from '../db/index.js';

export const settingsService = {
  get(key: string): string | null {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
    return row?.value ?? null;
  },
  set(key: string, value: string): void {
    getDb().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP').run(key, value, value);
  },
  all(): Record<string, string> {
    const rows = getDb().prepare('SELECT key, value FROM settings').all() as any[];
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }
};

export const recycleService = {
  list(): any[] {
    return getDb().prepare('SELECT * FROM recycle_bin ORDER BY deleted_at DESC').all() as any[];
  },
  restore(id: number): void {
    const row = getDb().prepare('SELECT * FROM recycle_bin WHERE id = ?').get(id) as any;
    if (!row) return;
    if (row.entity_type === 'project') {
      getDb().prepare('UPDATE projects SET deleted = 0 WHERE id = ?').run(row.entity_id);
    }
    getDb().prepare('DELETE FROM recycle_bin WHERE id = ?').run(id);
  },
  empty(): void {
    const ids = getDb().prepare('SELECT entity_id FROM recycle_bin WHERE entity_type = \'project\'').all() as any[];
    for (const r of ids) getDb().prepare('DELETE FROM projects WHERE id = ?').run(r.entity_id);
    getDb().prepare('DELETE FROM recycle_bin').run();
  }
};
