/**
 * 灵墨小说工坊 - 规则引擎（禁词 / 题材规则 / 自定义规则 / 生成后校验）
 *
 * 规则文档：
 *   { id, type: 'forbidden'|'genre'|'custom'|'style'|'plot', scope, project_id,
 *     patterns: [ { regex, level: 'warn'|'block', note } ],
 *     enabled, updatedAt }
 *
 * 校验接口：/validate，返回 violations 数组
 */
import express from 'express';
import { readFile, writeFile } from '../utils/fileHelper.js';

const router = express.Router();

const BUILTIN_FORBIDDEN = [
  { regex: '色情|淫秽|淫荡|强暴|强奸|性交', level: 'block', note: '色情禁词（平台高风险）' },
  { regex: '屠杀|虐杀|血肉横飞|肢解|断头|开膛|血腥', level: 'block', note: '血腥暴力禁词' },
  { regex: '歧视|种族|民族|黑人|白皮|白猪|黄祸|支|支那', level: 'block', note: '种族/民族歧视' },
  { regex: '共产党|政府|国家领导人|习近平', level: 'warn', note: '敏感政治话题，建议避免' }
];

const BUILTIN_GENRE = {
  '玄幻仙侠': [
    { regex: '凡人|修仙|灵气复苏|宗门|秘境|金丹|元婴', level: 'suggest', note: '玄幻高频词 · 可保留' },
    { regex: '校花|总裁|豪门|选秀', level: 'warn', note: '与玄幻仙侠风格冲突的都市元素，建议替换' }
  ],
  '都市': [
    { regex: '修仙|宗门|金丹|元婴|灵气复苏', level: 'warn', note: '都市题材中出现修仙元素，建议明确区分灵气复苏 vs 纯都市' },
    { regex: '老总|总裁|豪门|富二代', level: 'suggest', note: '都市爽文高频词' }
  ],
  '历史军事': [
    { regex: '皇帝|将军|朝廷|宦官|诸侯|世家|战功', level: 'suggest', note: '历史军事高频词' },
    { regex: '手机|电脑|互联网|AI|高铁|现代', level: 'warn', note: '穿越/历史背景避免现代词' }
  ],
  '恐怖悬疑': [
    { regex: '阴森|诡异|诡谲|寂静|冰冷|尸体|血|血腥味', level: 'suggest', note: '恐怖氛围强化词' },
    { regex: '哈哈|大笑|开心|欢乐|阳光|温暖|明媚', level: 'warn', note: '温馨词可能消解恐怖氛围' }
  ],
  '科幻': [
    { regex: '飞船|星舰|机甲|跃迁|曲率|维度|黑洞|量子|基因', level: 'suggest', note: '科幻科技词' },
    { regex: '修仙|灵气|宗门|丹', level: 'warn', note: '科幻中避免奇幻元素' }
  ],
  '女频言情': [
    { regex: '心动|拥抱|吻|表白|脸红|心跳|温柔|宠溺', level: 'suggest', note: '言情核心情绪词' },
    { regex: '怒吼|怒骂|暴打|血腥|砍|打', level: 'warn', note: '言情需注意暴力比例' }
  ]
};

async function readRules() {
  const d = (await readFile('rules.json').catch(() => ({}))) || {};
  return { custom: d.custom || [], project: d.project || {}, enabled: d.enabled !== false };
}
async function writeRules(data) { await writeFile('rules.json', data); }

router.get('/meta', (req, res) => {
  res.json({
    builtin_forbidden: BUILTIN_FORBIDDEN,
    genres: Object.keys(BUILTIN_GENRE),
    note: '自定义规则通过 /custom 管理；/validate 会同时应用全局禁词、当前题材内置规则、自定义规则、项目绑定规则'
  });
});

router.get('/', async (req, res) => {
  const { custom, project, enabled } = await readRules();
  res.json({ enabled, custom, project_ids: Object.keys(project) });
});

// 自定义规则
router.post('/custom', async (req, res) => {
  const all = await readRules();
  const rule = {
    id: 'r_' + Date.now().toString(36),
    type: req.body.type || 'custom',
    title: req.body.title || '自定义规则',
    scope: req.body.scope || 'global',
    project_id: req.body.project_id || null,
    patterns: req.body.patterns || [],
    enabled: req.body.enabled !== false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  all.custom.push(rule);
  await writeRules(all);
  res.status(201).json(rule);
});
router.put('/custom/:id', async (req, res) => {
  const all = await readRules();
  const idx = all.custom.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '规则不存在' });
  all.custom[idx] = { ...all.custom[idx], ...req.body, id: req.params.id, updatedAt: new Date().toISOString() };
  await writeRules(all);
  res.json(all.custom[idx]);
});
router.delete('/custom/:id', async (req, res) => {
  const all = await readRules();
  all.custom = all.custom.filter(r => r.id !== req.params.id);
  await writeRules(all);
  res.json({ success: true });
});

// 作品绑定规则
router.put('/project/:projectId/bind', async (req, res) => {
  const all = await readRules();
  all.project[req.params.projectId] = {
    genre: req.body.genre || '',
    extra_rules: req.body.extra_rules || [],
    auto_check_on_generate: req.body.auto_check_on_generate !== false,
    updatedAt: new Date().toISOString()
  };
  await writeRules(all);
  res.json(all.project[req.params.projectId]);
});

// 文本校验
router.post('/validate', async (req, res) => {
  const { text, project_id, extra_genre } = req.body;
  const content = String(text || '');
  const violations = [];
  const all = await readRules();
  if (!all.enabled) return res.json({ enabled: false, skipped: true, violations: [] });

  // 1) 全局禁词
  for (const p of BUILTIN_FORBIDDEN) {
    const reg = new RegExp(p.regex, 'gi');
    const m = content.match(reg);
    if (m) violations.push({ rule: 'forbidden', level: p.level, note: p.note, hits: m.slice(0, 8) });
  }

  // 2) 题材规则（从 project 绑定读取 -> 若无绑定用 extra_genre）
  const project = project_id && all.project[project_id];
  const genre = project?.genre || extra_genre || '';
  if (genre && BUILTIN_GENRE[genre]) {
    for (const p of BUILTIN_GENRE[genre]) {
      const reg = new RegExp(p.regex, 'gi');
      const m = content.match(reg);
      if (m) violations.push({ rule: 'genre:' + genre, level: p.level, note: p.note, hits: m.slice(0, 8) });
    }
  }

  // 3) 项目自定义规则
  if (project && project.extra_rules) {
    for (const r of project.extra_rules) {
      const patterns = r.patterns || [];
      for (const p of patterns) {
        try {
          const reg = new RegExp(p.regex, 'gi');
          const m = content.match(reg);
          if (m) violations.push({ rule: r.title || 'project', level: p.level, note: p.note, hits: m.slice(0, 8) });
        } catch (_) {}
      }
    }
  }

  // 4) 全局自定义规则
  for (const r of all.custom) {
    if (r.enabled === false) continue;
    if (r.project_id && r.project_id !== project_id) continue;
    for (const p of r.patterns || []) {
      try {
        const reg = new RegExp(p.regex, 'gi');
        const m = content.match(reg);
        if (m) violations.push({ rule: r.type + ':' + r.title, level: p.level, note: p.note, hits: m.slice(0, 8) });
      } catch (_) {}
    }
  }

  const blockCount = violations.filter(v => v.level === 'block').length;
  const warnCount = violations.filter(v => v.level === 'warn').length;
  res.json({
    enabled: true,
    total_violations: violations.length,
    blocked: blockCount,
    warned: warnCount,
    suggested: violations.filter(v => v.level === 'suggest').length,
    violations
  });
});

router.put('/toggle', async (req, res) => {
  const all = await readRules();
  all.enabled = req.body.enabled === true || req.body.enabled === 'true';
  await writeRules(all);
  res.json({ enabled: all.enabled });
});

export default router;
