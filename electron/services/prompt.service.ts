/** 大纲 / 提示词 / AI 模型配置 */
import { getDb } from '../db/index.js';

// ========== 大纲（递归树，parent_id 指向父节点）==========
export const outlineService = {
  tree(projectId: number): any[] {
    const rows = getDb().prepare('SELECT * FROM outlines WHERE project_id = ? ORDER BY parent_id IS NULL DESC, parent_id, sort_order, id').all(projectId) as any[];
    const byId = new Map<number, any>();
    const roots: any[] = [];
    for (const r of rows) {
      const node = { ...r, children: [] };
      byId.set(r.id, node);
    }
    for (const r of rows) {
      if (r.parent_id && byId.has(r.parent_id)) {
        byId.get(r.parent_id).children.push(byId.get(r.id));
      } else {
        roots.push(byId.get(r.id));
      }
    }
    return roots;
  },
  save(projectId: number, data: any): number {
    if (data.id) {
      getDb().prepare('UPDATE outlines SET title = ?, parent_id = ?, level = ?, goal = ?, plot = ?, pleasure = ?, foreshadow = ?, mood = ?, body = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(data.title, data.parent_id || null, data.level || 0, data.goal || '', data.plot || '', data.pleasure || '', data.foreshadow || '', data.mood || '', data.body || '', data.sort_order || 0, data.id);
      return data.id;
    } else {
      const info = getDb().prepare('INSERT INTO outlines (project_id, title, parent_id, level, goal, plot, pleasure, foreshadow, mood, body, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(projectId, data.title, data.parent_id || null, data.level || 0, data.goal || '', data.plot || '', data.pleasure || '', data.foreshadow || '', data.mood || '', data.body || '', data.sort_order || 0);
      return Number(info.lastInsertRowid);
    }
  },
  remove(id: number): void {
    getDb().prepare('DELETE FROM outlines WHERE id = ?').run(id);
  }
};

// ========== 提示词分组 / 提示词 ==========
export const promptGroupService = {
  list(): any[] {
    return getDb().prepare('SELECT * FROM prompt_groups ORDER BY sort_order, id').all() as any[];
  },
  save(data: any): number {
    if (data.id) {
      getDb().prepare('UPDATE prompt_groups SET name = ?, sort_order = ? WHERE id = ?').run(data.name, data.sort_order || 0, data.id);
      return data.id;
    }
    const info = getDb().prepare('INSERT INTO prompt_groups (name, builtin, sort_order) VALUES (?, 0, ?)').run(data.name, data.sort_order || 0);
    return Number(info.lastInsertRowid);
  },
  remove(id: number): void {
    getDb().prepare('DELETE FROM prompt_groups WHERE id = ? AND builtin = 0').run(id);
  }
};

export const promptService = {
  list(projectId?: number): any[] {
    let sql = `SELECT p.*, g.name AS group_name FROM prompts p LEFT JOIN prompt_groups g ON g.id = p.group_id WHERE 1=1`;
    const params: any[] = [];
    if (projectId) { sql += ' AND (p.project_id IS NULL OR p.project_id = ?)'; params.push(projectId); }
    sql += ' ORDER BY g.sort_order, p.priority DESC, p.id';
    return getDb().prepare(sql).all(...params) as any[];
  },
  create(data: any): number {
    const info = getDb().prepare('INSERT INTO prompts (group_id, project_id, name, content, enabled, priority) VALUES (?, ?, ?, ?, ?, ?)')
      .run(data.group_id, data.project_id || null, data.name, data.content, data.enabled ? 1 : 0, data.priority || 1);
    return Number(info.lastInsertRowid);
  },
  update(id: number, data: any): void {
    getDb().prepare('UPDATE prompts SET group_id = ?, name = ?, content = ?, enabled = ?, priority = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(data.group_id, data.name, data.content, data.enabled ? 1 : 0, data.priority || 1, id);
  },
  remove(id: number): void {
    getDb().prepare('DELETE FROM prompts WHERE id = ?').run(id);
  }
};

// ========== AI 模型配置 ==========
export const aiModelService = {
  list(): any[] {
    return getDb().prepare('SELECT * FROM ai_models ORDER BY is_default DESC, id').all() as any[];
  },
  save(data: any): number {
    // 如果设置为默认，先把其它的默认取消
    if (data.is_default) getDb().prepare('UPDATE ai_models SET is_default = 0').run();
    if (data.id) {
      getDb().prepare('UPDATE ai_models SET name = ?, provider = ?, base_url = ?, api_key = ?, model_name = ?, temperature = ?, max_tokens = ?, context_len = ?, is_default = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(data.name, data.provider, data.base_url || '', data.api_key || '', data.model_name, data.temperature || 0.7, data.max_tokens || 2048, data.context_len || 8000, data.is_default ? 1 : 0, data.enabled ? 1 : 0, data.id);
      return data.id;
    }
    const info = getDb().prepare('INSERT INTO ai_models (name, provider, base_url, api_key, model_name, temperature, max_tokens, context_len, is_default, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(data.name, data.provider, data.base_url || '', data.api_key || '', data.model_name, data.temperature || 0.7, data.max_tokens || 2048, data.context_len || 8000, data.is_default ? 1 : 0, data.enabled ? 1 : 0);
    return Number(info.lastInsertRowid);
  },
  remove(id: number): void {
    getDb().prepare('DELETE FROM ai_models WHERE id = ?').run(id);
  },
  getDefault(): any | null {
    return (getDb().prepare('SELECT * FROM ai_models WHERE enabled = 1 AND is_default = 1 LIMIT 1').get() as any) || null;
  }
};
