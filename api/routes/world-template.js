// 14 项世界观问卷模板（参考网文常见分类）
// 支持一键填入项目设定
import express from 'express';

const router = express.Router();

const CATEGORIES = [
  {
    id: 'xuanhuan',
    name: '玄幻修仙',
    questions: [
      { key: 'world_name', label: '世界名称', type: 'text', placeholder: '如：九天大陆' },
      { key: 'world_size', label: '世界规模', type: 'select', options: ['小型秘境', '一城一地', '多国大陆', '多界并存', '诸天万界'] },
      { key: 'power_system', label: '核心力量体系', type: 'text', placeholder: '如：灵气修炼 / 金丹 / 元婴' },
      { key: 'power_rank', label: '境界等级序列', type: 'textarea', placeholder: '如：练气 → 筑基 → 金丹 → 元婴 → 化神' },
      { key: 'main_resource', label: '主要修炼资源', type: 'text', placeholder: '如：灵石 / 丹药 / 灵脉' },
      { key: 'faction_map', label: '势力格局', type: 'textarea', placeholder: '各大宗门/帝国/敌对关系' },
      { key: 'geography', label: '主要地理', type: 'textarea', placeholder: '大陆分布 / 禁地 / 秘境' },
      { key: 'history', label: '世界历史与关键事件', type: 'textarea', placeholder: '万年前的浩劫' },
      { key: 'gods_or_legacy', label: '神/魔/传承', type: 'text', placeholder: '神话体系或失落文明' },
      { key: 'currency', label: '通行货币/经济', type: 'text', placeholder: '灵石 / 银两' },
      { key: 'tech_level', label: '科技/功法水平', type: 'text', placeholder: '古代修仙 / 低武 / 高武' },
      { key: 'taboo', label: '禁忌与危险', type: 'textarea', placeholder: '不能说的名字 / 禁地' },
      { key: 'protagonist_stage', label: '主角当前所处阶段', type: 'text', placeholder: '练气三层，刚进宗门' },
      { key: 'end_goal', label: '剧情终点/长线悬念', type: 'textarea', placeholder: '如：飞升 / 破除天道' }
    ]
  },
  {
    id: 'urban',
    name: '都市现实',
    questions: [
      { key: 'city', label: '主要城市/时代背景', type: 'text', placeholder: '2025 年·海港市' },
      { key: 'world_scale', label: '世界规模', type: 'select', options: ['单城', '一国内', '跨国', '全球', '跨次元'] },
      { key: 'social_rule', label: '核心社会规则/潜规则', type: 'textarea', placeholder: '如：资本游戏/地下势力' },
      { key: 'hidden_world', label: '隐藏世界/超自然元素', type: 'textarea', placeholder: '古武世家 / 修真 / 异能者' },
      { key: 'main_industry', label: '主要行业/产业', type: 'text', placeholder: '互联网 / 金融 / 古董' },
      { key: 'opponent', label: '主要反派/敌对势力', type: 'textarea', placeholder: '跨国公司 / 黑帮' },
      { key: 'tech_level', label: '科技水平', type: 'text', placeholder: '现代 / 近未来 / 赛博朋克' },
      { key: 'currency', label: '经济与货币', type: 'text', placeholder: '人民币 / 美元' },
      { key: 'law', label: '法律与秩序', type: 'textarea', placeholder: '合法 / 灰色 / 无政府' },
      { key: 'history', label: '关键历史事件', type: 'textarea', placeholder: '三年前的背叛' },
      { key: 'love_or_relation', label: '感情线/人际网络', type: 'textarea', placeholder: '女主 / 伙伴' },
      { key: 'mystery', label: '核心悬念/秘密', type: 'textarea', placeholder: '主角身世之谜' },
      { key: 'protagonist_stage', label: '主角当前阶段', type: 'text', placeholder: '刚被公司解雇' },
      { key: 'end_goal', label: '剧情终点', type: 'textarea', placeholder: '站上行业顶端' }
    ]
  },
  {
    id: 'scifi',
    name: '科幻未来',
    questions: [
      { key: 'world_name', label: '世界/星球名称', type: 'text', placeholder: '如：新地球联邦' },
      { key: 'era', label: '年代/纪元', type: 'text', placeholder: '公元 2475 年' },
      { key: 'power_system', label: '核心技术体系', type: 'text', placeholder: '曲率引擎 / 意识上传' },
      { key: 'power_rank', label: '科技等级序列', type: 'textarea', placeholder: 'T0~T9' },
      { key: 'main_resource', label: '核心资源/能源', type: 'text', placeholder: '反物质 / 暗能量' },
      { key: 'faction_map', label: '势力分布', type: 'textarea', placeholder: '联邦 / 帝国 / 殖民地起义军' },
      { key: 'geography', label: '主要地理/星域', type: 'textarea', placeholder: '太阳系 / 半人马座' },
      { key: 'history', label: '世界史关键事件', type: 'textarea', placeholder: '第三次星际战争' },
      { key: 'ai_or_aliens', label: 'AI/外星文明', type: 'textarea', placeholder: '古老 AI 觉醒' },
      { key: 'life_style', label: '日常生活方式', type: 'text', placeholder: 'VR 社交 / 脑机接口' },
      { key: 'tech_level', label: '科技水平上限', type: 'text', placeholder: '近光速飞船 / 克隆人' },
      { key: 'taboo', label: '禁忌科技/法律', type: 'textarea', placeholder: '禁止意识上传' },
      { key: 'protagonist_stage', label: '主角当前阶段', type: 'text', placeholder: '普通船员' },
      { key: 'end_goal', label: '剧情终点', type: 'textarea', placeholder: '对抗终极 AI' }
    ]
  },
  {
    id: 'suspense',
    name: '悬疑惊悚',
    questions: [
      { key: 'world_name', label: '主要场景', type: 'text', placeholder: '如：雾港市 / 废弃公寓' },
      { key: 'world_scale', label: '故事范围', type: 'select', options: ['一间房', '一栋楼', '一座城', '跨国', '跨次元'] },
      { key: 'social_rule', label: '社会规则/潜规则', type: 'textarea', placeholder: '不可回头 / 午夜十二点' },
      { key: 'hidden_world', label: '隐藏世界/灵异元素', type: 'textarea', placeholder: '鬼市 / 规则类怪谈' },
      { key: 'main_industry', label: '主要行业/职业', type: 'text', placeholder: '灵异调查员 / 警察' },
      { key: 'opponent', label: '主要反派/怪物', type: 'textarea', placeholder: '不可名状的存在' },
      { key: 'tech_level', label: '科技水平', type: 'text', placeholder: '现代' },
      { key: 'curse', label: '诅咒/规则/机制', type: 'textarea', placeholder: '违反就会死' },
      { key: 'law', label: '官方/秩序方如何看待', type: 'textarea', placeholder: '神秘部门' },
      { key: 'history', label: '关键历史事件', type: 'textarea', placeholder: '30 年前的事故' },
      { key: 'mystery', label: '核心悬念/秘密', type: 'textarea', placeholder: '主角失忆之谜' },
      { key: 'horror_element', label: '恐怖元素', type: 'text', placeholder: '精神污染 / 规则怪谈' },
      { key: 'protagonist_stage', label: '主角当前阶段', type: 'text', placeholder: '刚进入诡异事件' },
      { key: 'end_goal', label: '剧情终点', type: 'textarea', placeholder: '破除全部规则' }
    ]
  },
  {
    id: 'romance',
    name: '言情/女频',
    questions: [
      { key: 'world_name', label: '故事场景', type: 'text', placeholder: '如：现代上海 / 古代宫廷' },
      { key: 'world_scale', label: '故事范围', type: 'select', options: ['校园', '都市', '豪门', '宫廷', '跨次元'] },
      { key: 'social_rule', label: '社会规则/婚恋观', type: 'textarea', placeholder: '门第观念' },
      { key: 'hidden_world', label: '隐藏元素', type: 'textarea', placeholder: '重生 / 穿书' },
      { key: 'main_industry', label: '主要行业', type: 'text', placeholder: '演艺圈 / 商界' },
      { key: 'opponent', label: '对手/情敌', type: 'textarea', placeholder: '女二 / 家族长辈' },
      { key: 'tech_level', label: '时代', type: 'text', placeholder: '现代 / 古代' },
      { key: 'love_or_relation', label: '感情线核心', type: 'textarea', placeholder: '先婚后爱 / 暗恋' },
      { key: 'history', label: '关键历史事件', type: 'textarea', placeholder: '十年前的相遇' },
      { key: 'mystery', label: '核心悬念/秘密', type: 'textarea', placeholder: '身世之谜' },
      { key: 'family_map', label: '家庭/家世', type: 'textarea', placeholder: '主角家族状况' },
      { key: 'personality_hint', label: '人物性格关键词', type: 'textarea', placeholder: '冷静 / 温柔 / 毒舌' },
      { key: 'protagonist_stage', label: '主角当前阶段', type: 'text', placeholder: '刚回国 / 刚离婚' },
      { key: 'end_goal', label: '剧情终点', type: 'textarea', placeholder: '携手余生' }
    ]
  }
];

router.get('/categories', (req, res) => {
  res.json({ count: CATEGORIES.length, categories: CATEGORIES.map(c => ({ id: c.id, name: c.name })) });
});

router.get('/category/:categoryId', (req, res) => {
  const cat = CATEGORIES.find(c => c.id === req.params.categoryId);
  if (!cat) return res.status(404).json({ error: '分类不存在' });
  res.json(cat);
});

router.post('/apply', (req, res) => {
  const { project_id, category, values } = req.body || {};
  if (!project_id) return res.status(400).json({ error: '缺少 project_id' });
  const cat = CATEGORIES.find(c => c.id === category);
  if (!cat) return res.status(404).json({ error: '分类不存在' });
  const kv = values || {};
  // 此处为模板应用演示：返回整理后的世界观设定
  const applied = {
    project_id,
    category: cat.id,
    category_name: cat.name,
    fields: cat.questions.map(q => ({ key: q.key, label: q.label, value: kv[q.key] || '' })),
    summary: cat.questions
      .filter(q => kv[q.key])
      .map(q => `【${q.label}】${kv[q.key]}`)
      .join('\n')
  };
  res.json(applied);
});

export default router;
export { CATEGORIES };
