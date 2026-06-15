/** 作品服务 */
import { getDb, runSql } from '../db/index.js';

export interface Project {
  id: number; name: string; genre: string; description?: string;
  cover_data?: string; status?: string; word_count?: number; progress?: number;
  ai_level?: number; default_style?: string;
  created_at?: string; updated_at?: string;
}

export const projectService = {
  list(genre?: string, keyword?: string): Project[] {
    let sql = 'SELECT * FROM projects WHERE deleted = 0';
    const params: any[] = [];
    if (genre && genre !== '全部') { sql += ' AND genre = ?'; params.push(genre); }
    if (keyword) { sql += ' AND name LIKE ?'; params.push(`%${keyword}%`); }
    sql += ' ORDER BY updated_at DESC';
    return getDb().prepare(sql).all(...params) as Project[];
  },
  get(id: number): Project | null {
    return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | null;
  },
  create(data: Partial<Project>): Project {
    const r = runSql(
      'INSERT INTO projects (name, genre, description, cover_data, status, ai_level, default_style) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.name || '未命名作品', data.genre || '玄幻', data.description || '', data.cover_data || '', data.status || 'draft', data.ai_level || 2, data.default_style || '']
    );
    const id = Number(r.lastInsertRowid);
    // 自动创建一卷两章，给用户一个可操作的骨架
    getDb().prepare('INSERT INTO volumes (project_id, title, sort_order) VALUES (?, ?, 1)').run(id, '第一卷');
    const v = getDb().prepare('SELECT id FROM volumes WHERE project_id = ? ORDER BY id LIMIT 1').get(id) as any;
    if (v) {
      getDb().prepare('INSERT INTO chapters (project_id, volume_id, title, sort_order, status) VALUES (?, ?, ?, 1, ?)').run(id, v.id, '第一章 初入江湖', 'draft');
      getDb().prepare('INSERT INTO chapters (project_id, volume_id, title, sort_order, status) VALUES (?, ?, ?, 2, ?)').run(id, v.id, '第二章 风云初现', 'todo');
    }
    return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project;
  },
  update(id: number, data: Partial<Project>): Project | null {
    const fields = [];
    const params: any[] = [];
    for (const k of ['name', 'genre', 'description', 'cover_data', 'status', 'word_count', 'progress', 'ai_level', 'default_style']) {
      if ((data as any)[k] !== undefined) {
        fields.push(`${k} = ?`);
        params.push((data as any)[k]);
      }
    }
    if (!fields.length) return get(id);
    params.push(id);
    getDb().prepare(`UPDATE projects SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...params);
    return get(id);
  },
  softDelete(id: number): void {
    const p = get(id);
    if (p) {
      getDb().prepare('INSERT INTO recycle_bin (entity_type, entity_id, snapshot) VALUES (?, ?, ?)').run('project', id, JSON.stringify(p));
      getDb().prepare('UPDATE projects SET deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    }
  }
};
