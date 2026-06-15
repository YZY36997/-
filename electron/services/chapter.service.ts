/** 卷 / 章节 / 正文内容服务 */
import { getDb } from '../db/index.js';

export const volumeService = {
  list(projectId: number): any[] {
    return getDb().prepare('SELECT * FROM volumes WHERE project_id = ? ORDER BY sort_order, id').all(projectId) as any[];
  },
  create(projectId: number, title: string): number {
    const info = getDb().prepare('INSERT INTO volumes (project_id, title, sort_order) VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM volumes WHERE project_id = ?))').run(projectId, title, projectId);
    return Number(info.lastInsertRowid);
  },
  update(id: number, data: any): void {
    getDb().prepare('UPDATE volumes SET title = ?, summary = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(data.title, data.summary || '', id);
  },
  remove(id: number): void {
    getDb().prepare('DELETE FROM volumes WHERE id = ?').run(id);
  }
};

export const chapterService = {
  list(projectId: number): any[] {
    return getDb().prepare('SELECT * FROM chapters WHERE project_id = ? ORDER BY volume_id IS NULL, volume_id, sort_order, id').all(projectId) as any[];
  },
  get(id: number): any | null {
    return getDb().prepare('SELECT * FROM chapters WHERE id = ?').get(id) as any | null;
  },
  create(projectId: number, data: any): number {
    const info = getDb().prepare(
      'INSERT INTO chapters (project_id, volume_id, parent_id, title, summary, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM chapters WHERE project_id = ?))'
    ).run(projectId, data.volume_id || null, data.parent_id || null, data.title || '新章节', data.summary || '', data.status || 'todo', projectId);
    return Number(info.lastInsertRowid);
  },
  update(id: number, data: any): void {
    getDb().prepare('UPDATE chapters SET title = ?, summary = ?, status = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(data.title, data.summary || '', data.status || 'todo', data.sort_order || 0, id);
  },
  remove(id: number): void {
    getDb().prepare('DELETE FROM chapters WHERE id = ?').run(id);
  },
  // 章节正文内容（最新版本）
  getContent(chapterId: number): string {
    const row = getDb().prepare('SELECT content FROM chapter_contents WHERE chapter_id = ? ORDER BY id DESC LIMIT 1').get(chapterId) as any;
    return row?.content || '';
  },
  saveContent(chapterId: number, content: string, versionTag?: string): number {
    const info = getDb().prepare('INSERT INTO chapter_contents (chapter_id, content, version_tag) VALUES (?, ?, ?)').run(chapterId, content, versionTag || '');
    const wordCount = (content || '').replace(/\s/g, '').length;
    getDb().prepare('UPDATE chapters SET word_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(wordCount, chapterId);
    return Number(info.lastInsertRowid);
  },
  history(chapterId: number): any[] {
    return getDb().prepare('SELECT id, version_tag, created_at, LENGTH(content) AS len FROM chapter_contents WHERE chapter_id = ? ORDER BY id DESC LIMIT 20').all(chapterId) as any[];
  }
};

// 项目设置 / 世界观
export const projectSettingsService = {
  get(projectId: number): any {
    return getDb().prepare('SELECT * FROM project_settings WHERE project_id = ?').get(projectId) as any | null;
  },
  save(projectId: number, data: any): void {
    const exist = getDb().prepare('SELECT 1 FROM project_settings WHERE project_id = ?').get(projectId);
    if (exist) {
      getDb().prepare('UPDATE project_settings SET core_sell = ?, core_conflict = ?, opening_hook = ?, target_audience = ?, taboos = ?, style = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?')
        .run(data.core_sell || '', data.core_conflict || '', data.opening_hook || '', data.target_audience || '', data.taboos || '', data.style || '', projectId);
    } else {
      getDb().prepare('INSERT INTO project_settings (project_id, core_sell, core_conflict, opening_hook, target_audience, taboos, style) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(projectId, data.core_sell || '', data.core_conflict || '', data.opening_hook || '', data.target_audience || '', data.taboos || '', data.style || '');
    }
  }
};

export const worldviewService = {
  get(projectId: number): any {
    return getDb().prepare('SELECT * FROM worldviews WHERE project_id = ?').get(projectId) as any | null;
  },
  save(projectId: number, data: any): void {
    const exist = getDb().prepare('SELECT 1 FROM worldviews WHERE project_id = ?').get(projectId);
    if (exist) {
      getDb().prepare('UPDATE worldviews SET base_rules = ?, time_line = ?, geography = ?, terminology = ?, power_levels = ?, extra = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ?')
        .run(data.base_rules || '', data.time_line || '', data.geography || '', data.terminology || '', data.power_levels || '', data.extra || '', projectId);
    } else {
      getDb().prepare('INSERT INTO worldviews (project_id, base_rules, time_line, geography, terminology, power_levels, extra) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(projectId, data.base_rules || '', data.time_line || '', data.geography || '', data.terminology || '', data.power_levels || '', data.extra || '');
    }
  }
};
