/**
 * 灵墨小说工坊 - 追读力分析（核心指标：
 *   1) 开头 Hook 强度（前 XXX 检测 + 首段冲突/反转/提问/悬念）
 *   2) 爽点密度（按章节统计命中关键句）
 *   3) 伏笔埋设 / 回收比（调用 foreshadow.js 数据）
 *   4) 微兑现校验（承诺在后续章节兑现）
 *   5) 情节债务（未回收伏笔数）
 *   6) 综合追读力分数（仪表盘）
 *   7) AI 侧边栏建议（根据分析结果生成文本建议）
 */
import express from 'express';
import { readFile, writeFile } from '../utils/fileHelper.js';

const router = express.Router();

// -------- 关键词库（可在 settings 中扩展）
const HOOK_PATTERNS = [
  { id: 'question', label: '提问式开篇', regex: /为什么|怎么|难道|究竟/g, score: 2 },
  { id: 'conflict', label: '冲突式开篇', regex: /怒吼|大骂|怒斥|反抗|对峙|冷笑|冷笑/g, score: 3 },
  { id: 'reversal', label: '反转式开篇', regex: /没想到|居然|竟然|可|谁知道|哪知|反倒|谁知/g, score: 4 },
  { id: 'dialogue', label: '悬念式开篇', regex: /秘密|真相|原来|其实|不知|没有人|秘密|可怕/g, score: 3 },
  { id: 'foreshadow', label: '伏笔式开篇', regex: /多年以后|后来|将来|有一天|那一天|日后/g, score: 2 }
];

const CLIMAX_PATTERNS = [
  { id: 'power_up', label: '修为突破', regex: /突破|突破|晋升|境界|修为|达到|境界|瞬间|气息|轰然|嗡|气势|修为|大喝|一掌|一刀|剑|惊|势不可挡|势如破竹|一鼓作气|势如|不可挡/g },
  { id: 'treasure', label: '宝物 / 捡漏', regex: /竟然是|原来是|乃是|此物|宝物|法器|灵丹|丹|金色|红光|光芒|光泽|珠光|宝气|熠熠|闪烁|流动|气息|灵气|灵气涌动|光芒|灵气|丹|炉|炉|鼎/g },
  { id: 'face_slap', label: '打脸 / 反转', regex: /打脸|冷笑|冷哼|鄙夷|不屑|震惊|惊呆|目瞪|口呆|哗然|难以置信|不敢置信|脸色|瞬间|众人|骇然|悚然|众人|骇然/g },
  { id: 'reward', label: '奖励 / 兑现', regex: /奖励|获得|得到|得到|到手|获得|获得|收获|赢|得到|成功|达成|完成|成就|拿到|得到|获得|收获/g },
  { id: 'emotion', label: '情感爆发', regex: /热泪|感动|哭|笑|激动|狂喜|狂喜|大笑|泪流|眼泪|颤抖|颤抖|心里|暖|软|甜|心动|感动|温暖|心酸|心痛/g },
  { id: 'mystery', label: '悬念揭露', regex: /原来|竟然|果然|居然|真相|秘密|揭晓|公开|竟是|原来|就是|竟是|秘密|真相|原来是|竟是/g }
];

const SETTING_CHECK = [
  '竟然', '居然', '果然', '原来', '其实', '乃是', '便是', '乃是', '就是'
];

function countMatches(text, patterns) {
  const hits = {}; let total = 0;
  for (const p of patterns) {
    const m = text.match(p.regex);
    const c = m ? m.length : 0;
    if (c > 0) hits[p.id] = { count: c, label: p.label };
    total += c;
  }
  return { hits, total };
}

router.post('/chapter', async (req, res) => {
  const { chapter_id, content, project_id } = req.body;
  const text = String(content || '');
  const hits = countMatches(text, CLIMAX_PATTERNS);
  const hookResult = countMatches(text.slice(0, 200), HOOK_PATTERNS);

  // 开头 hook 强度（0-100）
  const hookStrength = Math.min(100, Math.round(hookResult.total * 12));
  // 爽点密度（单位：每千字命中数）
  const density = text.length ? +(hits.total / (text.length / 1000)).toFixed(2) : 0;

  res.json({
    chapter_id, project_id, word_count: text.length,
    hook_strength: hookStrength,
    hook_hits: hookResult.hits,
    climax_hits: hits.hits,
    climax_total: hits.total,
    density_per_1k: density,
    sentence_count: text.split(/[。！？.!?\n]/g).length - 1,
    dialogue_count: (text.match(/[“""]/g) || []).length / 2 | 0,
    timestamp: new Date().toISOString()
  });
});

router.get('/dashboard/:projectId', async (req, res) => {
  const chaptersData = (await readFile('chapters.json') || { chapters: [] });
  const fores = (await readFile('foreshadows.json') || { foreshadows: [] });
  const chapters = (chaptersData.chapters || []).filter(c => c.project_id === req.params.projectId);
  const foresList = (fores.foreshadows || []).filter(f => f.project_id === req.params.projectId);
  const planted = foresList.filter(f => f.status === 'planted').length;
  const recovered = foresList.filter(f => f.status === 'recovered').length;
  const totalWords = chapters.reduce((s, c) => s + (c.word_count || 0), 0);

  // 每章粗略打分
  const perChapter = [];
  let totalHook = 0;
  let totalDensity = 0;
  for (const c of chapters) {
    const text = String(c.content || '');
    const hook = countMatches(text.slice(0, 200), HOOK_PATTERNS);
    const climax = countMatches(text, CLIMAX_PATTERNS);
    const hookStr = Math.min(100, Math.round(hook.total * 12 + text.slice(0, 100).length / 8));
    const density = text.length ? +(climax.total / (text.length / 1000)).toFixed(2) : 0;
    totalHook += hookStr; totalDensity += density;
    perChapter.push({ chapter_id: c.id, chapter_no: c.chapter_no, title: c.title, hook_strength: hookStr, climax_total: climax.total, density_per_1k: density, word_count: c.word_count || 0 });
  }
  const avgHook = chapters.length ? +(totalHook / chapters.length).toFixed(1) : 0;
  const avgDensity = chapters.length ? +(totalDensity / chapters.length).toFixed(2) : 0;
  const recoveryRatio = foresList.length ? +(recovered / foresList.length).toFixed(2) : 0;

  // 综合分数（0-100）：hook 权重 30%，爽点密度 35%，伏笔回收 15%，章节长度分布 20%
  const composite = Math.min(100, Math.round(avgHook * 0.3 + avgDensity * 35 + recoveryRatio * 15 + Math.min(30, chapters.length * 0.8)));

  res.json({
    project_id: req.params.projectId,
    chapters_count: chapters.length,
    total_words: totalWords,
    foreshadows: { total: foresList.length, planted, recovered, dropped: foresList.filter(f => f.status === 'dropped').length,
    recovery_ratio: recoveryRatio,
    avg_hook_strength: avgHook,
    avg_density_per_1k: avgDensity,
    composite_score: composite,
    open_plot_debt: planted, // 未回收伏笔 == 情节债务
    per_chapter: perChapter,
    rating: composite >= 80 ? 'A' : composite >= 60 ? 'B' : composite >= 40 ? 'C' : 'D'
  });
});

router.post('/suggestions/:projectId', async (req, res) => {
  const dash = await (await fetch('http://localhost:' + (process.env.PORT || 3001) + '/api/analysis/dashboard/' + req.params.projectId)).json().catch(() => null);
  const list = [];
  if (!dash) return res.status(503).json({ error: '分析数据不可用' });
  if (dash.avg_hook_strength < 30) list.push({ level: 'warn', title: '开头 Hook 偏弱', content: '建议章节开头加入提问/冲突/反转式开头（见 HOOK_PATTERNS），增强读者停留欲。' });
  if (dash.avg_density_per_1k < 0.8) list.push({ level: 'warn', title: '爽点密度偏低', content: '建议在章节中加强「修为突破 / 打脸 / 宝物获取」这类情节，把爽点密度提到 1.0/千字 以上。' });
  if (dash.open_plot_debt > 5) list.push({ level: 'warn', title: '情节债务过多', content: `当前存在 ${dash.open_plot_debt} 条未回收伏笔，建议加快回收节奏，避免读者遗忘。` });
  if (dash.chapters_count < 3) list.push({ level: 'info', title: '章节数过少', content: '当前作品章节过少，建议至少累积到 5 章以上分析会更有意义。' });
  if (dash.composite_score >= 80) list.push({ level: 'success', title: '整体追读力良好', content: `综合分数 ${dash.composite_score} 分（${dash.rating}），建议继续保持当前叙事节奏。` });
  else list.push({ level: 'info', title: '追读力待加强', content: `综合分数 ${dash.composite_score}（${dash.rating}），建议重点强化 hook 和爽点分布。` });
  res.json({ suggestions: list });
});

export default router;
