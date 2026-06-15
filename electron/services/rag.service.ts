/** RAG 三级长效记忆 + 简易 BM25
 *  L1 简易：只注入最近章节片段与少量设定
 *  L2 混合：RAG 片段 + 知识图谱角色 + 势力 + 物品
 *  L3 兜底：关键词 LIKE 全项目检索
 * 向量缺失时自动降级为 BM25，用户无感知。
 */
import { getDb } from '../db/index.js';

function bm25Like(projectId: number, query: string, limit = 10): string[] {
  if (!query) return [];
  const keywords = query.split(/[\s,，。、|]+/).filter(Boolean).slice(0, 6);
  const hits: string[] = [];
  // 章节片段
  for (const kw of keywords) {
    const rows = getDb().prepare(
      `SELECT c.id, c.title, cc.content FROM chapters c
       LEFT JOIN (SELECT chapter_id, content FROM chapter_contents WHERE id IN (SELECT MAX(id) FROM chapter_contents GROUP BY chapter_id)) cc ON cc.chapter_id = c.id
       WHERE c.project_id = ? AND (c.title LIKE ? OR cc.content LIKE ?) LIMIT 5`
    ).all(projectId, `%${kw}%`, `%${kw}%`) as any[];
    for (const r of rows) hits.push(`[章节] ${r.title}：${String(r.content || '').slice(0, 240)}`);
    if (hits.length >= limit) break;
  }
  return hits.slice(0, limit);
}

/** 根据作品生成上下文（注入 system prompt 用）
 * level: 1 L1 极简 · 2 L2 图谱+角色+片段 · 3 L3 全量兜底
 */
export function ragBuildContext(projectId: number, query: string, level: number): string {
  const parts: string[] = [];
  if (level === 1) {
    // L1：只取最近 2 个章节 + 主角
    const rows = getDb().prepare(
      `SELECT c.id, c.title FROM chapters c WHERE c.project_id = ? ORDER BY c.id DESC LIMIT 2`
    ).all(projectId) as any[];
    for (const r of rows) parts.push(`- 章节《${r.title}》上下文保留（续写时注意衔接）`);
    const chars = getDb().prepare('SELECT name FROM characters WHERE project_id = ? AND role IN (\'protagonist\', \'main\') LIMIT 3').all(projectId) as any[];
    if (chars.length) parts.push('- 主角：' + chars.map((c: any) => c.name).join('、'));
    return parts.length ? parts.join('\n') : '';
  }
  if (level === 2) {
    // L2：角色卡 + 关系 + 势力 + 物品 + 伏笔 + 近期片段关键词
    const chars = getDb().prepare('SELECT * FROM characters WHERE project_id = ? LIMIT 8').all(projectId) as any[];
    if (chars.length) {
      parts.push('【角色卡】');
      for (const c of chars) parts.push(`· ${c.name}(${c.role}) 性格:${(c.personality || '').slice(0, 80)} 能力:${(c.abilities || '').slice(0, 80)} 状态:${(c.current_status || '').slice(0, 60)}`);
    }
    const rels = getDb().prepare(
      `SELECT s.name AS s_name, t.name AS t_name, r.label, r.relation_type FROM character_relations r
       LEFT JOIN characters s ON s.id = r.source_id LEFT JOIN characters t ON t.id = r.target_id
       WHERE r.project_id = ? LIMIT 15`
    ).all(projectId) as any[];
    if (rels.length) parts.push('【角色关系】' + rels.map((r: any) => `${r.s_name} → ${r.label || r.relation_type} → ${r.t_name}`).join('；'));
    const factions = getDb().prepare('SELECT name, stance FROM factions WHERE project_id = ? LIMIT 6').all(projectId) as any[];
    if (factions.length) parts.push('【势力】' + factions.map((f: any) => `${f.name}(${f.stance || ''})`).join('，'));
    const arts = getDb().prepare('SELECT name, category FROM artifacts WHERE project_id = ? LIMIT 8').all(projectId) as any[];
    if (arts.length) parts.push('【物品】' + arts.map((a: any) => `${a.name}(${a.category})`).join('，'));
    const fores = getDb().prepare('SELECT * FROM foreshadowings WHERE project_id = ? AND status != \'recovered\' ORDER BY priority DESC LIMIT 8').all(projectId) as any[];
    if (fores.length) {
      parts.push('【未回收伏笔】');
      for (const f of fores) parts.push(`· ${f.title}：${(f.content || '').slice(0, 80)}`);
    }
    // 关键词片段
    if (query) {
      const hits = bm25Like(projectId, query, 4);
      if (hits.length) {
        parts.push('【相关片段】');
        for (const h of hits) parts.push(h);
      }
    }
    return parts.join('\n');
  }
  // L3 全量兜底：遍历作品的所有设定、角色、章节片段
  const extra: string[] = [];
  extra.push('【全量设定·L3 兜底】');
  const world = getDb().prepare('SELECT * FROM worldviews WHERE project_id = ?').get(projectId) as any;
  if (world) extra.push(`世界观基础规则:${(world.base_rules || '').slice(0, 400)}；力量体系:${(world.power_levels || '').slice(0, 400)}`);
  const chars = getDb().prepare('SELECT * FROM characters WHERE project_id = ?').all(projectId) as any[];
  for (const c of chars) extra.push(`· ${c.name}：${[c.personality, c.abilities, c.current_status].filter(Boolean).join(' / ').slice(0, 240)}`);
  const fores = getDb().prepare('SELECT * FROM foreshadowings WHERE project_id = ?').all(projectId) as any[];
  for (const f of fores) extra.push(`· 伏笔:${f.title}（${f.status}）${(f.content || '').slice(0, 120)}`);
  if (query) {
    for (const h of bm25Like(projectId, query, 8)) extra.push(h);
  }
  return extra.join('\n');
}

/** 手动调用检索（供前端调试/展示） */
export function ragRetrieve(projectId: number, query: string, level = 2): string[] {
  return ragBuildContext(projectId, query, level).split('\n').filter(Boolean);
}

/** 重新索引：可选——清空 rag_chunks 后重建。这里提供简化版：把所有章节摘要入库。 */
export function ragBuildIndex(projectId: number): number {
  getDb().prepare('DELETE FROM rag_chunks WHERE project_id = ?').run(projectId);
  const chapters = getDb().prepare(
    `SELECT c.id, c.title, cc.content FROM chapters c
     LEFT JOIN (SELECT chapter_id, content FROM chapter_contents WHERE id IN (SELECT MAX(id) FROM chapter_contents GROUP BY chapter_id)) cc ON cc.chapter_id = c.id
     WHERE c.project_id = ?`
  ).all(projectId) as any[];
  const insert = getDb().prepare('INSERT INTO rag_chunks (project_id, source_type, source_id, title, body, token_count) VALUES (?, ?, ?, ?, ?, ?)');
  let count = 0;
  for (const ch of chapters) {
    if (!ch.content) continue;
    const snippets = (ch.content as string).split(/\n{2,}/).filter((s: string) => s.length > 20);
    for (let i = 0; i < Math.min(snippets.length, 5); i++) {
      insert.run(projectId, 'chapter', ch.id, ch.title, snippets[i].slice(0, 800), Math.round(snippets[i].length / 2));
      count++;
    }
  }
  return count;
}

/** RAG 白/黑名单过滤器 */
export function ragFilterGet(projectId: number): any {
  return getDb().prepare('SELECT * FROM rag_filters WHERE project_id = ?').get(projectId) as any;
}
export function ragFilterSave(projectId: number, data: { whitelist?: string; blacklist?: string }): void {
  const existing = getDb().prepare('SELECT 1 FROM rag_filters WHERE project_id = ?').get(projectId);
  if (existing) {
    getDb().prepare('UPDATE rag_filters SET scope = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND filter_type = \'whitelist\'')
      .run(JSON.stringify({ whitelist: data.whitelist, blacklist: data.blacklist }), projectId);
  } else {
    getDb().prepare('INSERT INTO rag_filters (project_id, filter_type, scope) VALUES (?, \'whitelist\', ?)')
      .run(projectId, JSON.stringify({ whitelist: data.whitelist, blacklist: data.blacklist }));
  }
}
