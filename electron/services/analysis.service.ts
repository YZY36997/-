/** 追读力分析（Hook 强度、爽点密度、伏笔回收比例、OOC 风险）
 * 这里做轻量级离线分析 —— 不依赖 AI；若要 AI 深度点评可走 ai.checkOoc / ai.continue
 */
import { getDb } from '../db/index.js';

const HOOK_KEYWORDS = ['难道', '究竟', '为什么', '居然', '竟然', '不料', '谁知', '秘密', '真相', '多年以后', '忽然', '就在此时'];
const CLIMAX_KEYWORDS = ['突破', '晋级', '冷笑', '打脸', '宝物', '灵丹', '气势', '热泪', '震动', '全场', '出手', '一剑', '一掌', '神秘'];

export function analyzeChapter(chapterText: string): any {
  const text = chapterText || '';
  let hookHits = 0;
  for (const k of HOOK_KEYWORDS) hookHits += (text.match(new RegExp(k, 'g')) || []).length;
  const hookStrength = Math.min(100, hookHits * 6 + (text.includes('？') ? 5 : 0));

  let climaxHits = 0;
  for (const k of CLIMAX_KEYWORDS) climaxHits += (text.match(new RegExp(k, 'g')) || []).length;
  const density1k = text.length ? +((climaxHits / (text.length / 1000)).toFixed(2)) : 0;

  const paragraphs = text.split(/\n{2,}|\r{2,}/).filter((s: string) => s.trim().length > 10).length;
  const avgLen = paragraphs ? Math.round(text.length / paragraphs) : 0;
  const wordCount = text.replace(/\s/g, '').length;
  const composite = Math.min(100, Math.round(hookStrength * 0.35 + density1k * 10 + Math.min(25, paragraphs * 2) + (wordCount > 1500 ? 10 : 0)));

  const issues: string[] = [];
  if (wordCount < 1500) issues.push('字数 < 1500，建议扩充到 1500~2500 字以保持节奏。');
  if (hookStrength < 30) issues.push('Hook 强度偏低，建议在章节开头/结尾加入悬念、反转或问题。');
  if (density1k < 1) issues.push('爽点密度偏低，可在关键情节加入打脸/反转/宝物获取。');
  if (avgLen > 600) issues.push('段落过长，建议按场景/对话拆分，便于手机阅读。');

  return {
    hook_hits: hookHits,
    hook_strength: hookStrength,
    climax_hits: climaxHits,
    density_per_1k: density1k,
    paragraphs,
    avg_paragraph_len: avgLen,
    word_count: wordCount,
    composite,
    rating: composite >= 80 ? 'A' : composite >= 60 ? 'B' : composite >= 40 ? 'C' : 'D',
    issues
  };
}

export function analyzeProject(projectId: number): any {
  const chapters = getDb().prepare('SELECT * FROM chapters WHERE project_id = ? ORDER BY id').all(projectId) as any[];
  const fores = getDb().prepare('SELECT * FROM foreshadowings WHERE project_id = ?').all(projectId) as any[];
  const recovered = fores.filter((f: any) => f.status === 'recovered').length;
  const foresRatio = fores.length ? +(recovered / fores.length).toFixed(2) : 0;

  let totalHook = 0; let totalDensity = 0; let totalWords = 0;
  for (const c of chapters) {
    const row = getDb().prepare('SELECT content FROM chapter_contents WHERE chapter_id = ? ORDER BY id DESC LIMIT 1').get(c.id) as any;
    if (row?.content) {
      const anal = analyzeChapter(row.content);
      totalHook += anal.hook_strength;
      totalDensity += anal.density_per_1k;
      totalWords += anal.word_count;
    }
  }
  const avgHook = chapters.length ? Math.round(totalHook / chapters.length) : 0;
  const avgDensity = chapters.length ? +(totalDensity / chapters.length).toFixed(2) : 0;
  const composite = Math.min(100, Math.round(avgHook * 0.3 + avgDensity * 10 + foresRatio * 30 + (chapters.length >= 3 ? 15 : 0)));

  return {
    chapter_count: chapters.length,
    total_words: totalWords,
    avg_hook_strength: avgHook,
    avg_density_1k: avgDensity,
    foreshadow_total: fores.length,
    foreshadow_recovered: recovered,
    foreshadow_ratio: foresRatio,
    composite,
    rating: composite >= 80 ? 'A' : composite >= 60 ? 'B' : composite >= 40 ? 'C' : 'D'
  };
}
