/** 角色 / 势力 / 物品 / 伏笔 服务 */
import { getDb } from '../db/index.js';

// ========== 角色 ==========
export const characterService = {
  list(projectId: number): any[] {
    return getDb().prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY (CASE role WHEN \'protagonist\' THEN 1 WHEN \'main\' THEN 2 WHEN \'supporting\' THEN 3 ELSE 4 END), id').all(projectId) as any[];
  },
  create(projectId: number, data: any): number {
    const info = getDb().prepare(
      'INSERT INTO characters (project_id, name, role, appearance, personality, background, abilities, weakness, first_chapter, current_status, avatar_data, pos_x, pos_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(projectId, data.name || '角色', data.role || 'supporting', data.appearance || '', data.personality || '', data.background || '', data.abilities || '', data.weakness || '', data.first_chapter || '', data.current_status || '', data.avatar_data || '', data.pos_x || 0, data.pos_y || 0);
    return Number(info.lastInsertRowid);
  },
  update(id: number, data: any): void {
    getDb().prepare('UPDATE characters SET name = ?, role = ?, appearance = ?, personality = ?, background = ?, abilities = ?, weakness = ?, first_chapter = ?, current_status = ?, avatar_data = ?, pos_x = ?, pos_y = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(data.name, data.role || 'supporting', data.appearance || '', data.personality || '', data.background || '', data.abilities || '', data.weakness || '', data.first_chapter || '', data.current_status || '', data.avatar_data || '', data.pos_x || 0, data.pos_y || 0, id);
  },
  remove(id: number): void {
    getDb().prepare('DELETE FROM characters WHERE id = ?').run(id);
  }
};

export const characterRelationService = {
  list(projectId: number): any[] {
    return getDb().prepare(
      `SELECT r.*, s.name AS source_name, t.name AS target_name
       FROM character_relations r
       LEFT JOIN characters s ON s.id = r.source_id
       LEFT JOIN characters t ON t.id = r.target_id
       WHERE r.project_id = ?`
    ).all(projectId) as any[];
  },
  create(projectId: number, data: any): number {
    const info = getDb().prepare('INSERT INTO character_relations (project_id, source_id, target_id, relation_type, label, weight, note) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(projectId, data.source_id, data.target_id, data.relation_type || 'friend', data.label || '', data.weight || 1, data.note || '');
    return Number(info.lastInsertRowid);
  },
  update(id: number, data: any): void {
    getDb().prepare('UPDATE character_relations SET source_id = ?, target_id = ?, relation_type = ?, label = ?, weight = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(data.source_id, data.target_id, data.relation_type || 'friend', data.label || '', data.weight || 1, data.note || '', id);
  },
  remove(id: number): void {
    getDb().prepare('DELETE FROM character_relations WHERE id = ?').run(id);
  }
};

// ========== 势力 ==========
export const factionService = {
  list(projectId: number): any[] {
    return getDb().prepare('SELECT * FROM factions WHERE project_id = ? ORDER BY id').all(projectId) as any[];
  },
  create(projectId: number, data: any): number {
    const info = getDb().prepare('INSERT INTO factions (project_id, name, category, stance, territory, core_people, description) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(projectId, data.name, data.category || 'sect', data.stance || '', data.territory || '', data.core_people || '', data.description || '');
    return Number(info.lastInsertRowid);
  },
  update(id: number, data: any): void {
    getDb().prepare('UPDATE factions SET name = ?, category = ?, stance = ?, territory = ?, core_people = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(data.name, data.category || 'sect', data.stance || '', data.territory || '', data.core_people || '', data.description || '', id);
  },
  remove(id: number): void {
    getDb().prepare('DELETE FROM factions WHERE id = ?').run(id);
  }
};

// ========== 物品 ==========
export const artifactService = {
  list(projectId: number, category?: string): any[] {
    let sql = 'SELECT * FROM artifacts WHERE project_id = ?';
    const params: any[] = [projectId];
    if (category && category !== '全部') { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY id';
    return getDb().prepare(sql).all(...params) as any[];
  },
  create(projectId: number, data: any): number {
    const info = getDb().prepare('INSERT INTO artifacts (project_id, name, category, attributes, origin, usage, description) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(projectId, data.name, data.category || 'item', data.attributes || '', data.origin || '', data.usage || '', data.description || '');
    return Number(info.lastInsertRowid);
  },
  update(id: number, data: any): void {
    getDb().prepare('UPDATE artifacts SET name = ?, category = ?, attributes = ?, origin = ?, usage = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(data.name, data.category || 'item', data.attributes || '', data.origin || '', data.usage || '', data.description || '', id);
  },
  remove(id: number): void {
    getDb().prepare('DELETE FROM artifacts WHERE id = ?').run(id);
  }
};

// ========== 伏笔 ==========
export const foreshadowService = {
  list(projectId: number): any[] {
    return getDb().prepare('SELECT * FROM foreshadowings WHERE project_id = ? ORDER BY priority DESC, updated_at DESC').all(projectId) as any[];
  },
  create(projectId: number, data: any): number {
    const info = getDb().prepare('INSERT INTO foreshadowings (project_id, title, content, status, planted_chapter_id, recovered_chapter_id, priority, related_characters, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(projectId, data.title, data.content || '', data.status || 'todo', data.planted_chapter_id || null, data.recovered_chapter_id || null, data.priority || 2, data.related_characters || '', data.note || '');
    return Number(info.lastInsertRowid);
  },
  update(id: number, data: any): void {
    getDb().prepare('UPDATE foreshadowings SET title = ?, content = ?, status = ?, planted_chapter_id = ?, recovered_chapter_id = ?, priority = ?, related_characters = ?, note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(data.title, data.content || '', data.status || 'todo', data.planted_chapter_id || null, data.recovered_chapter_id || null, data.priority || 2, data.related_characters || '', data.note || '', id);
  },
  remove(id: number): void {
    getDb().prepare('DELETE FROM foreshadowings WHERE id = ?').run(id);
  }
};
