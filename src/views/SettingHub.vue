<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { projectApi, characterApi, factionApi, artifactApi, foreshadowApi, chapterApi, rulesApi, worldTemplateApi, ElMessage, ElMessageBox } from '@/api'
import { ElMessage as Msg, ElMessageBox as MB } from 'element-plus'
import {
  User, Swords, Castle, BookOpen, BookmarkCheck, Sparkles,
  Plus, Save, X, Wand2, Archive, AlertTriangle
} from 'lucide-vue-next'

const route = useRoute()
const projectId = computed(() => route.params.projectId as string)

const activeTab = ref('outline')
const worldTemplate = ref<any>(null)
const worldValues = reactive<Record<string, string>>({})
const projectDetail = ref<any>(null)

// ---- 大纲卡片 ----
const outlineTree = ref<any[]>([])
function addOutlineNode(parent?: any) {
  const n = {
    id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
    title: '新节点',
    content: '',
    children: []
  }
  if (parent) parent.children.push(n)
  else outlineTree.value.push(n)
}
async function saveOutlineTree() {
  try {
    await projectApi.saveOutlineTree(projectId.value, outlineTree.value)
    Msg.success('大纲已保存')
  } catch (_) { Msg.error('保存失败') }
}

function refreshWorldTemplate(genre = '玄幻') {
  const map: Record<string, string> = { '玄幻': 'xuanhuan', '都市': 'urban', '科幻': 'scifi', '悬疑': 'suspense', '言情': 'romance' }
  const cat = map[genre] || 'xuanhuan'
  worldTemplateApi.category(cat).then((r: any) => {
    worldTemplate.value = r
    Object.keys(worldValues).forEach(k => delete worldValues[k])
  })
}

async function applyWorldTemplate() {
  const map: Record<string, string> = { '玄幻': 'xuanhuan', '都市': 'urban', '科幻': 'scifi', '悬疑': 'suspense', '言情': 'romance' }
  const cat = map[projectDetail.value?.genre || '玄幻'] || 'xuanhuan'
  try {
    await worldTemplateApi.apply(projectId.value, cat, { ...worldValues })
    Msg.success('设定已保存，后续 AI 生成将作为上下文注入')
  } catch (_) { Msg.error('保存失败') }
}

async function loadProjectDetail() {
  try {
    projectDetail.value = await projectApi.detail(projectId.value)
    refreshWorldTemplate(projectDetail.value?.genre || '玄幻')
    outlineTree.value = projectDetail.value?.outline_tree || []
  } catch (_) {}
}

// ---- 角色 ----
const characters = ref<any[]>([])
const charMeta = ref<any>(null)
const editingChar = ref<any>(null)
function newChar() {
  editingChar.value = {
    name: '', level: 'B', current_status: 'active', personality: '',
    motivation: '', power: [], intro_chapter: null, plot_arc: '',
    relation_snapshot: [], memory: '', ooc_check: [], personality_tags: [], tags: [],
    content: '', category: 'supporting'
  }
}
async function loadCharacters() {
  characters.value = await characterApi.list(projectId.value)
  charMeta.value = await characterApi.meta()
}
async function saveChar() {
  const c = editingChar.value
  if (!c?.name) return Msg.warning('请填写角色名')
  try {
    const saved = c.id
      ? await characterApi.update(c.id, c)
      : await characterApi.create({ ...c, project_id: projectId.value })
    Msg.success('保存成功')
    editingChar.value = null
    loadCharacters()
  } catch (e) { Msg.error('保存失败') }
}
async function deleteChar(c: any) {
  try {
    await MB.confirm(`删除角色【${c.name}】?`, '确认', { type: 'warning' })
    await characterApi.remove(c.id)
    loadCharacters()
  } catch (_) {}
}

// ---- 势力 ----
const factions = ref<any[]>([])
const editingFact = ref<any>(null)
function newFact() { editingFact.value = { name: '新势力', type: '中立', leader: '', slogan: '', territory: '', core_resource: '', power_level: 30, philosophy: '', members: [], allies: [], enemies: [], history: '', tags: [] } }
async function loadFactions() { factions.value = await factionApi.list(projectId.value) }
async function saveFact() {
  const f = editingFact.value
  if (!f?.name) return Msg.warning('请填写势力名')
  try {
    const saved = f.id
      ? await factionApi.update(f.id, f)
      : await factionApi.create({ ...f, project_id: projectId.value })
    Msg.success('保存成功')
    editingFact.value = null
    loadFactions()
  } catch (_) { Msg.error('保存失败') }
}
async function deleteFact(f: any) {
  try { await MB.confirm(`删除【${f.name}】?`, '确认', { type: 'warning' }); await factionApi.remove(f.id); loadFactions() } catch (_) {}
}

// ---- 道具 / 功法 / 秘闻 ----
const artifactList = ref<any[]>([])
const editingArt = ref<any>(null)
const artifactTypes = ['道具', '功法', '秘闻', '武器', '宝物', '法术', '地图']
function newArt() { editingArt.value = { name: '', type: '道具', level: '', summary: '', description: '', owner: '', power_level: 0, origin_story: '', tags: [] } }
async function loadArts() { artifactList.value = await artifactApi.list(projectId.value) }
async function saveArt() {
  const a = editingArt.value
  if (!a?.name) return Msg.warning('请填写名称')
  try {
    const saved = a.id
      ? await artifactApi.update(a.id, a)
      : await artifactApi.create({ ...a, project_id: projectId.value })
    Msg.success('保存成功')
    editingArt.value = null
    loadArts()
  } catch (_) { Msg.error('保存失败') }
}
async function deleteArt(a: any) {
  try { await MB.confirm(`删除【${a.name}】?`, '确认', { type: 'warning' }); await artifactApi.remove(a.id); loadArts() } catch (_) {}
}

// ---- 伏笔库 ----
const foreshadowList = ref<any[]>([])
const editingFore = ref<any>(null)
function newFore() { editingFore.value = { content: '', hint_text: '', payoff_target_chapter: null, priority: 'medium', tags: [] } }
async function loadForeshadow() { foreshadowList.value = await foreshadowApi.list(projectId.value) }
async function saveFore() {
  const f = editingFore.value
  if (!f?.content) return Msg.warning('请填写伏笔内容')
  try {
    const saved = f.id
      ? await foreshadowApi.update(f.id, f)
      : await foreshadowApi.create({ ...f, project_id: projectId.value, status: 'planted' })
    Msg.success('保存成功')
    editingFore.value = null
    loadForeshadow()
  } catch (_) { Msg.error('保存失败') }
}
async function payoffFore(f: any) {
  try {
    await foreshadowApi.update(f.id, { ...f, status: 'recovered', recovered_at: new Date().toISOString() })
    loadForeshadow()
    Msg.success('已标记回收')
  } catch (_) {}
}
async function deleteFore(f: any) {
  try { await MB.confirm(`删除此伏笔?`, '确认', { type: 'warning' }); await foreshadowApi.remove(f.id); loadForeshadow() } catch (_) {}
}

const pendingCount = computed(() => (foreshadowList.value || []).filter((f: any) => f.status === 'planted').length)
const recoveredCount = computed(() => (foreshadowList.value || []).filter((f: any) => f.status === 'recovered').length)

// ---- 规则引擎 ----
const customRules = ref<any[]>([])
const enabledRules = ref(true)
const editingRule = ref<any>(null)
async function loadRules() {
  const r: any = await rulesApi.list(projectId.value)
  customRules.value = r?.custom || []
  enabledRules.value = r?.enabled !== false
}
function newRule() { editingRule.value = { title: '自定义规则', note: '', patterns: [{ regex: '', level: 'warn', note: '' }] } }
async function saveRule() {
  const r = editingRule.value
  if (!r?.title) return Msg.warning('请填写标题')
  try {
    const saved = r.id
      ? await rulesApi.update(r.id, r)
      : await rulesApi.create({ ...r, project_id: projectId.value, enabled: true })
    Msg.success('保存成功')
    editingRule.value = null
    loadRules()
  } catch (_) { Msg.error('保存失败') }
}
async function deleteRule(r: any) {
  try { await rulesApi.remove(r.id); loadRules() } catch (_) {}
}

watch(() => activeTab.value, (t: string) => {
  if (t === 'characters' && !characters.value.length) loadCharacters()
  if (t === 'factions' && !factions.value.length) loadFactions()
  if (t === 'artifacts' && !artifactList.value.length) loadArts()
  if (t === 'foreshadow' && !foreshadowList.value.length) loadForeshadow()
  if (t === 'rules' && !customRules.value.length) loadRules()
})

onMounted(() => {
  loadProjectDetail()
})
</script>

<template>
  <div class="setting-hub-page">
    <div class="hub-header">
      <div>
        <h2><Sparkles :size="20" /> 设定中枢 · {{ projectDetail?.name || '载入中' }}</h2>
        <p class="sub">集中管理世界观 · 大纲 · 角色 · 势力 · 道具 · 伏笔 · 规则</p>
      </div>
      <el-tabs v-model="activeTab" class="hub-tabs">
        <el-tab-pane label="世界观" name="world" />
        <el-tab-pane label="大纲结构" name="outline" />
        <el-tab-pane label="角色档案" name="characters" />
        <el-tab-pane label="势力设定" name="factions" />
        <el-tab-pane label="道具/功法/秘闻" name="artifacts" />
        <el-tab-pane label="伏笔库" name="foreshadow" />
        <el-tab-pane label="题材/自定义规则" name="rules" />
      </el-tabs>
    </div>

    <!-- 世界观问卷 -->
    <section v-if="activeTab === 'world'" class="hub-section">
      <div class="section-head">
        <h3>世界观问卷 · 14 项快速搭建</h3>
        <div>
          <span>当前题材：</span>
          <el-select v-model="projectDetail.genre" style="width:140px" @change="refreshWorldTemplate(projectDetail.genre)">
            <el-option label="玄幻" value="玄幻" />
            <el-option label="都市" value="都市" />
            <el-option label="科幻" value="科幻" />
            <el-option label="悬疑惊悚" value="悬疑" />
            <el-option label="言情" value="言情" />
          </el-select>
        </div>
      </div>
      <div v-if="worldTemplate" class="world-form-grid">
        <el-form-item
          v-for="q in worldTemplate.questions"
          :key="q.key"
          :label="q.label"
          label-width="140px"
        >
          <el-input
            v-if="q.type === 'text'"
            v-model="worldValues[q.key]"
            :placeholder="q.placeholder"
            maxlength="300"
            show-word-limit
          />
          <el-select v-else-if="q.type === 'select'" v-model="worldValues[q.key]" style="width:100%" placeholder="选择">
            <el-option v-for="opt in q.options" :key="opt" :label="opt" :value="opt" />
          </el-select>
          <el-input v-else v-model="worldValues[q.key]" type="textarea" :rows="4" :placeholder="q.placeholder" maxlength="800" show-word-limit />
        </el-form-item>
      </div>
      <div class="section-footer">
        <el-button type="primary" @click="applyWorldTemplate"><el-icon><Save /></el-icon>保存设定上下文</el-button>
      </div>
    </section>

    <!-- 大纲结构 -->
    <section v-if="activeTab === 'outline'" class="hub-section">
      <div class="section-head">
        <h3>大纲结构 · 可视化章节树</h3>
        <div>
          <el-button @click="addOutlineNode()"><el-icon><Plus /></el-icon>添加根节点</el-button>
          <el-button type="primary" @click="saveOutlineTree"><el-icon><Save /></el-icon>保存大纲</el-button>
        </div>
      </div>
      <div v-if="!outlineTree.length" class="empty-hint">
        <BookOpen :size="48" />
        <p>尚未创建大纲，可点击「添加根节点」创建分卷/主线/支线</p>
      </div>
      <ol v-else class="outline-tree">
        <li v-for="n in outlineTree" :key="n.id" class="tree-node">
          <div class="node-head">
            <input v-model="n.title" placeholder="节点标题，例如：卷一" class="node-title" />
            <el-button size="small" @click="addOutlineNode(n)"><el-icon><Plus /></el-icon>添加子节点</el-button>
          </div>
          <el-input v-model="n.content" type="textarea" :rows="3" placeholder="输入该节点的剧情概要..." />
          <ol v-if="n.children && n.children.length" class="child-tree">
            <li v-for="(c, idx) in n.children" :key="c.id" class="tree-node sub">
              <div class="node-head">
                <span class="node-index">{{ idx + 1 }}.</span>
                <input v-model="c.title" placeholder="章节标题" class="node-title" />
                <el-button size="small" @click="n.children.splice(idx, 1)"><el-icon><X /></el-icon></el-button>
              </div>
              <el-input v-model="c.content" type="textarea" :rows="2" placeholder="此章节剧情概要..." />
            </li>
          </ol>
        </li>
      </ol>
    </section>

    <!-- 角色档案 -->
    <section v-if="activeTab === 'characters'" class="hub-section">
      <div class="section-head">
        <h3>角色档案 · 记忆式管理</h3>
        <el-button type="primary" @click="newChar"><el-icon><Plus /></el-icon>新建角色</el-button>
      </div>
      <div v-if="editingChar" class="card-edit-panel">
        <div class="grid-2">
          <el-form-item label="姓名"><el-input v-model="editingChar.name" /></el-form-item>
          <el-form-item label="角色等级">
            <el-select v-model="editingChar.level" style="width:100%">
              <el-option label="S - 主角" value="S" />
              <el-option label="A - 主要配角" value="A" />
              <el-option label="B - 次要配角" value="B" />
              <el-option label="C - 路人/NPC" value="C" />
            </el-select>
          </el-form-item>
          <el-form-item label="登场章节"><el-input v-model="editingChar.intro_chapter" placeholder="如：第3章" /></el-form-item>
          <el-form-item label="当前状态">
            <el-select v-model="editingChar.current_status" style="width:100%">
              <el-option label="活跃" value="active" />
              <el-option label="冷却中" value="cooling" />
              <el-option label="退场" value="gone" />
              <el-option label="死亡" value="dead" />
              <el-option label="失踪" value="missing" />
            </el-select>
          </el-form-item>
          <el-form-item label="核心动机" label-width="100px"><el-input v-model="editingChar.motivation" /></el-form-item>
          <el-form-item label="主要能力">
            <el-input v-model="editingChar.powerText" placeholder="多个能力用顿号分隔" @blur="editingChar.power = (editingChar.powerText || '').split(/[、,，]/).filter(Boolean)" />
          </el-form-item>
        </div>
        <el-form-item label="性格特征"><el-input v-model="editingChar.personality" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="人物故事/背景"><el-input v-model="editingChar.background" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="角色弧光"><el-input v-model="editingChar.plot_arc" type="textarea" :rows="3" placeholder="该角色在故事中的成长变化..." /></el-form-item>
        <el-form-item label="角色记忆笔记"><el-input v-model="editingChar.memory" type="textarea" :rows="3" placeholder="如：隐瞒的真实身份、与他人过往..." /></el-form-item>
        <div class="edit-actions">
          <el-button @click="editingChar = null">取消</el-button>
          <el-button type="primary" @click="saveChar">保存</el-button>
        </div>
      </div>
      <div v-else class="cards-grid">
        <div v-for="c in characters" :key="c.id" class="character-card" :class="'lv-' + (c.level || 'B')">
          <div class="char-head">
            <div class="avatar"><User :size="16" /></div>
            <div>
              <h4>{{ c.name }}</h4>
              <div class="char-meta">Lv.{{ c.level }} · {{ c.current_status }}</div>
            </div>
          </div>
          <div v-if="c.motivation" class="char-row"><b>核心动机：</b>{{ c.motivation }}</div>
          <div v-if="c.personality" class="char-row"><b>性格：</b>{{ c.personality }}</div>
          <div v-if="c.background" class="char-row"><b>背景：</b>{{ c.background }}</div>
          <div v-if="c.power && c.power.length" class="char-row"><b>能力：</b>{{ Array.isArray(c.power) ? c.power.join(' / ') : c.power }}</div>
          <div v-if="c.plot_arc" class="char-row"><b>角色弧光：</b>{{ c.plot_arc }}</div>
          <div class="card-actions">
            <el-button size="small" @click="editingChar = { ...c, powerText: Array.isArray(c.power) ? c.power.join('、') : '' }">编辑</el-button>
            <el-button size="small" type="danger" plain @click="deleteChar(c)">删除</el-button>
          </div>
        </div>
      </div>
    </section>

    <!-- 势力 -->
    <section v-if="activeTab === 'factions'" class="hub-section">
      <div class="section-head">
        <h3>势力设定</h3>
        <el-button type="primary" @click="newFact"><el-icon><Plus /></el-icon>新建势力</el-button>
      </div>
      <div v-if="editingFact" class="card-edit-panel">
        <div class="grid-2">
          <el-form-item label="名称"><el-input v-model="editingFact.name" /></el-form-item>
          <el-form-item label="阵营">
            <el-select v-model="editingFact.type" style="width:100%">
              <el-option label="正义" value="正义" />
              <el-option label="邪恶" value="邪恶" />
              <el-option label="中立" value="中立" />
              <el-option label="神秘" value="神秘" />
            </el-select>
          </el-form-item>
          <el-form-item label="首领/代表"><el-input v-model="editingFact.leader" /></el-form-item>
          <el-form-item label="势力等级（0-100）"><el-input-number v-model="editingFact.power_level" :min="0" :max="100" style="width:100%" /></el-form-item>
          <el-form-item label="口号/理念"><el-input v-model="editingFact.slogan" /></el-form-item>
          <el-form-item label="地盘/领地"><el-input v-model="editingFact.territory" /></el-form-item>
          <el-form-item label="核心资源"><el-input v-model="editingFact.core_resource" /></el-form-item>
          <el-form-item label="哲学主张"><el-input v-model="editingFact.philosophy" /></el-form-item>
        </div>
        <el-form-item label="历史与背景"><el-input v-model="editingFact.history" type="textarea" :rows="3" /></el-form-item>
        <div class="edit-actions">
          <el-button @click="editingFact = null">取消</el-button>
          <el-button type="primary" @click="saveFact">保存</el-button>
        </div>
      </div>
      <div v-else class="cards-grid">
        <div v-for="f in factions" :key="f.id" class="faction-card">
          <div class="fact-head">
            <h4>{{ f.name }}</h4>
            <span class="fact-tag">{{ f.type }}</span>
          </div>
          <div v-if="f.slogan" class="fact-quote">"{{ f.slogan }}"</div>
          <div v-if="f.leader" class="char-row"><b>首领：</b>{{ f.leader }}</div>
          <div v-if="f.territory" class="char-row"><b>地盘：</b>{{ f.territory }}</div>
          <div v-if="f.core_resource" class="char-row"><b>核心资源：</b>{{ f.core_resource }}</div>
          <div class="power-bar">
            <div class="power-fill" :style="{ width: (f.power_level || 0) + '%' }" />
            <span>势力等级 {{ f.power_level || 0 }}</span>
          </div>
          <div class="card-actions">
            <el-button size="small" @click="editingFact = { ...f }">编辑</el-button>
            <el-button size="small" type="danger" plain @click="deleteFact(f)">删除</el-button>
          </div>
        </div>
      </div>
    </section>

    <!-- 道具/功法/秘闻 -->
    <section v-if="activeTab === 'artifacts'" class="hub-section">
      <div class="section-head">
        <h3>道具 · 功法 · 秘闻</h3>
        <el-button type="primary" @click="newArt"><el-icon><Plus /></el-icon>新建条目</el-button>
      </div>
      <div v-if="editingArt" class="card-edit-panel">
        <div class="grid-2">
          <el-form-item label="名称"><el-input v-model="editingArt.name" /></el-form-item>
          <el-form-item label="类型">
            <el-select v-model="editingArt.type" style="width:100%">
              <el-option v-for="t in artifactTypes" :key="t" :label="t" :value="t" />
            </el-select>
          </el-form-item>
          <el-form-item label="等级/品阶"><el-input v-model="editingArt.level" placeholder="如：天级 / 传奇级" /></el-form-item>
          <el-form-item label="持有者"><el-input v-model="editingArt.owner" /></el-form-item>
          <el-form-item label="威力等级"><el-input-number v-model="editingArt.power_level" style="width:100%" :min="0" :max="100" /></el-form-item>
          <el-form-item label="标签"><el-input v-model="editingArt.tags_text" placeholder="逗号分隔" @blur="editingArt.tags = (editingArt.tags_text || '').split(/[,，]/).filter(Boolean)" /></el-form-item>
        </div>
        <el-form-item label="简介"><el-input v-model="editingArt.summary" type="textarea" :rows="2" /></el-form-item>
        <el-form-item label="详细描述/设定"><el-input v-model="editingArt.description" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="起源故事"><el-input v-model="editingArt.origin_story" type="textarea" :rows="3" /></el-form-item>
        <div class="edit-actions">
          <el-button @click="editingArt = null">取消</el-button>
          <el-button type="primary" @click="saveArt">保存</el-button>
        </div>
      </div>
      <div v-else class="cards-grid">
        <div v-for="a in artifactList" :key="a.id" class="artifact-card">
          <div class="art-head">
            <h4>{{ a.name }}</h4>
            <span class="art-type">{{ a.type }}</span>
          </div>
          <div v-if="a.level" class="char-row"><b>品阶：</b>{{ a.level }}</div>
          <div v-if="a.owner" class="char-row"><b>持有者：</b>{{ a.owner }}</div>
          <div v-if="a.summary" class="char-row"><b>简介：</b>{{ a.summary }}</div>
          <div v-if="a.origin_story" class="char-row"><b>起源：</b>{{ a.origin_story }}</div>
          <div class="card-actions">
            <el-button size="small" @click="editingArt = { ...a, tags_text: (a.tags || []).join(',') }">编辑</el-button>
            <el-button size="small" type="danger" plain @click="deleteArt(a)">删除</el-button>
          </div>
        </div>
      </div>
    </section>

    <!-- 伏笔库 -->
    <section v-if="activeTab === 'foreshadow'" class="hub-section">
      <div class="section-head">
        <h3>伏笔库 · 埋设与回收追踪</h3>
        <div>
          <span class="tag-badge pending">未回收 {{ pendingCount }}</span>
          <span class="tag-badge recovered">已回收 {{ recoveredCount }}</span>
          <el-button type="primary" @click="newFore"><el-icon><Plus /></el-icon>新建伏笔</el-button>
        </div>
      </div>
      <div v-if="editingFore" class="card-edit-panel">
        <el-form-item label="伏笔内容（正文原文或核心提示）">
          <el-input v-model="editingFore.content" type="textarea" :rows="4" />
        </el-form-item>
        <div class="grid-2">
          <el-form-item label="埋设在第几章">
            <el-input-number v-model="editingFore.planted_chapter" :min="0" style="width:100%" />
          </el-form-item>
          <el-form-item label="计划回收章节">
            <el-input-number v-model="editingFore.payoff_target_chapter" :min="0" style="width:100%" />
          </el-form-item>
          <el-form-item label="优先级">
            <el-select v-model="editingFore.priority" style="width:100%">
              <el-option label="低" value="low" />
              <el-option label="中" value="medium" />
              <el-option label="高" value="high" />
            </el-select>
          </el-form-item>
          <el-form-item label="标签"><el-input v-model="editingFore.tags_text" placeholder="逗号分隔" @blur="editingFore.tags = (editingFore.tags_text || '').split(/[,，]/).filter(Boolean)" /></el-form-item>
        </div>
        <div class="edit-actions">
          <el-button @click="editingFore = null">取消</el-button>
          <el-button type="primary" @click="saveFore">保存</el-button>
        </div>
      </div>
      <div v-else class="cards-grid">
        <div v-for="f in foreshadowList" :key="f.id" class="foreshadow-card" :class="{ planted: f.status === 'planted', recovered: f.status === 'recovered' }">
          <div class="fore-head">
            <span class="status-pill" :class="f.status || 'planted'">
              {{ f.status === 'recovered' ? '已回收' : '埋设中' }}
            </span>
            <span v-if="f.priority === 'high'" class="priority high">高优先</span>
            <span v-else-if="f.priority === 'low'" class="priority low">低优先</span>
          </div>
          <div class="fore-content">{{ f.content }}</div>
          <div class="fore-meta">
            <span v-if="f.planted_chapter">埋设: 第{{ f.planted_chapter }}章</span>
            <span v-if="f.payoff_target_chapter">计划回收: 第{{ f.payoff_target_chapter }}章</span>
            <span v-if="f.recovered_at">实际回收: {{ new Date(f.recovered_at).toLocaleDateString() }}</span>
          </div>
          <div class="card-actions">
            <el-button size="small" @click="editingFore = { ...f, tags_text: (f.tags || []).join(',') }">编辑</el-button>
            <el-button v-if="f.status !== 'recovered'" size="small" type="success" @click="payoffFore(f)">标记回收</el-button>
            <el-button size="small" type="danger" plain @click="deleteFore(f)">删除</el-button>
          </div>
        </div>
      </div>
    </section>

    <!-- 规则引擎 -->
    <section v-if="activeTab === 'rules'" class="hub-section">
      <div class="section-head">
        <h3>规则引擎 · 题材护栏 + 自定义约束</h3>
        <div>
          <el-switch v-model="enabledRules" active-text="启用" inactive-text="禁用" />
          <el-button type="primary" @click="newRule"><el-icon><Plus /></el-icon>新建规则</el-button>
        </div>
      </div>
      <div class="builtin-rule">
        <h4>📖 内置题材规则（创建项目时选择题材即生效）</h4>
        <div class="rule-row">
          <b>🎯 题材专属约束：</b>
          <span v-if="projectDetail?.genre === '玄幻'">修仙境界体系需一致，不可出现现代科技（手机/互联网/微信）等干扰元素</span>
          <span v-else-if="projectDetail?.genre === '都市'">避免强行引入修仙/灵气体系；保持现代生活逻辑</span>
          <span v-else-if="projectDetail?.genre === '科幻'">设定需自洽；不建议无解释引入修仙体系</span>
          <span v-else-if="projectDetail?.genre === '悬疑'">保持氛围一致性，避免在惊悚剧情中插入不必要的感情线</span>
          <span v-else-if="projectDetail?.genre === '言情'">情绪细腻，避免过度暴力血腥；不使用现代梗破坏时代感</span>
          <span v-else>（未选择题材，请先在世界观页面选择题材以绑定专属规则）</span>
        </div>
        <div class="rule-row">
          <b>🚫 全局禁词：</b>色情 / 血腥暴力 / 歧视性言论 / 政治敏感词；赌博、毒品、自杀类提示。
        </div>
      </div>
      <div v-if="editingRule" class="card-edit-panel">
        <div class="grid-2">
          <el-form-item label="规则标题"><el-input v-model="editingRule.title" /></el-form-item>
          <el-form-item label="备注/说明"><el-input v-model="editingRule.note" /></el-form-item>
        </div>
        <el-form-item label="匹配正则（或关键词）">
          <el-input v-model="editingRule.patterns[0].regex" placeholder="如：(手机|微信|支付宝)" />
        </el-form-item>
        <el-form-item label="违规级别">
          <el-select v-model="editingRule.patterns[0].level" style="width:100%">
            <el-option label="提醒 (warn)" value="warn" />
            <el-option label="阻止 (block)" value="block" />
          </el-select>
        </el-form-item>
        <div class="edit-actions">
          <el-button @click="editingRule = null">取消</el-button>
          <el-button type="primary" @click="saveRule">保存</el-button>
        </div>
      </div>
      <div v-else-if="customRules.length" class="custom-rule-list">
        <div v-for="r in customRules" :key="r.id" class="rule-card">
          <div class="rule-head">
            <h5>{{ r.title }}</h5>
            <span class="rule-switch">
              <el-switch :model-value="r.enabled !== false" @change="rulesApi.update(r.id, { ...r, enabled: !r.enabled })" />
            </span>
          </div>
          <div v-if="r.note" class="rule-note">{{ r.note }}</div>
          <div class="rule-patterns">
            <span v-for="(p, i) in r.patterns" :key="i" class="pattern-chip" :class="p.level">
              {{ p.level === 'block' ? '🚫' : '⚠️' }} {{ p.regex || p.note }}
            </span>
          </div>
          <div class="card-actions">
            <el-button size="small" @click="editingRule = { ...r }">编辑</el-button>
            <el-button size="small" type="danger" plain @click="deleteRule(r)">删除</el-button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.setting-hub-page { padding: 20px 24px; background: var(--page-bg, #f5f7fa); min-height: 100vh; }
.hub-header {
  background: #fff;
  padding: 16px 24px;
  border-radius: 12px;
  margin-bottom: 18px;
  box-shadow: 0 2px 10px rgba(0,0,0,.03);
}
.hub-header h2 { margin: 0 0 4px; font-size: 20px; display: flex; gap: 8px; align-items: center; }
.sub { margin: 0; color: #909399; font-size: 13px; }
.hub-tabs .el-tabs__item { font-size: 14px; }

.hub-section {
  background: #fff;
  padding: 22px;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0,0,0,.03);
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.section-head h3 { margin: 0; font-size: 16px; }
.section-footer { margin-top: 14px; text-align: right; }

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}

.card-edit-panel {
  background: #fafbfc;
  padding: 18px 20px;
  border-radius: 10px;
  border: 1px dashed #dcdfe6;
  margin-bottom: 18px;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 20px;
}
.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.character-card, .faction-card, .artifact-card, .foreshadow-card, .rule-card {
  background: #fff;
  border: 1px solid #ebedf0;
  border-radius: 10px;
  padding: 16px;
  transition: transform .15s ease, box-shadow .15s ease;
}
.character-card:hover, .faction-card:hover, .artifact-card:hover, .foreshadow-card:hover, .rule-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 22px rgba(0,0,0,.06);
}

.char-head, .fact-head, .art-head, .fore-head, .rule-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}
.char-head h4, .fact-head h4, .art-head h4, .rule-head h5 { margin: 0; }
.char-meta, .fact-tag, .art-type {
  font-size: 12px;
  color: #909399;
  background: #f0f4ff;
  padding: 2px 8px;
  border-radius: 8px;
}

.avatar {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  display: inline-flex; align-items: center; justify-content: center;
  margin-right: 8px;
}
.char-head .avatar + div h4 { margin: 0; font-size: 15px; }

.lv-S { border-left: 4px solid #f56c6c; }
.lv-A { border-left: 4px solid #e6a23c; }
.lv-B { border-left: 4px solid #409eff; }
.lv-C { border-left: 4px solid #909399; }

.char-row {
  font-size: 13px;
  margin: 4px 0;
  color: #606266;
  line-height: 1.6;
}
.char-row b { color: #303133; margin-right: 4px; }

.fact-quote {
  color: #909399;
  font-style: italic;
  font-size: 13px;
  margin-bottom: 8px;
}
.power-bar {
  position: relative;
  height: 8px;
  background: #f0f2f5;
  border-radius: 4px;
  margin: 10px 0;
  overflow: hidden;
}
.power-fill {
  position: absolute;
  top: 0; left: 0;
  height: 100%;
  background: linear-gradient(90deg, #409eff, #67c23a);
  border-radius: 4px;
}
.power-bar span {
  position: absolute;
  right: 0; top: 10px;
  font-size: 11px;
  color: #909399;
}

.foreshadow-card.planted { border-left: 4px solid #f56c6c; }
.foreshadow-card.recovered { border-left: 4px solid #67c23a; background: #f4fbf2; }
.status-pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  background: #fef0f0; color: #f56c6c;
}
.status-pill.recovered { background: #f0f9eb; color: #67c23a; }
.fore-content {
  color: #303133;
  font-size: 14px;
  margin: 8px 0;
  line-height: 1.7;
}
.fore-meta { color: #909399; font-size: 12px; display: flex; gap: 12px; }
.priority.high { background: #fff5f5; color: #f56c6c; padding: 2px 10px; border-radius: 10px; font-size: 11px; }
.priority.low { background: #f4f7fa; color: #909399; padding: 2px 10px; border-radius: 10px; font-size: 11px; }

.tag-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 14px;
  font-size: 12px;
  margin-right: 8px;
}
.tag-badge.pending { background: #fef0f0; color: #f56c6c; }
.tag-badge.recovered { background: #f0f9eb; color: #67c23a; }

.outline-tree { padding-left: 0; }
.tree-node { margin: 8px 0; padding: 10px; background: #fafafa; border-radius: 8px; }
.tree-node.sub { background: #fff; border: 1px dashed #dcdfe6; }
.node-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.node-index { color: #909399; font-size: 12px; }
.node-title {
  border: none;
  background: transparent;
  outline: none;
  font-size: 15px;
  font-weight: 500;
  flex: 1;
}

.world-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 24px;
}

.empty-hint {
  padding: 60px 20px;
  text-align: center;
  color: #909399;
}

.builtin-rule {
  background: linear-gradient(180deg, #f4f7ff, #fff);
  padding: 18px 20px;
  border-radius: 10px;
  margin-bottom: 18px;
}
.builtin-rule h4 { margin: 0 0 10px; }
.rule-row {
  font-size: 13px;
  color: #606266;
  line-height: 1.8;
}
.rule-row b { color: #303133; margin-right: 6px; }

.pattern-chip {
  display: inline-block;
  padding: 3px 10px;
  margin-right: 6px;
  margin-top: 4px;
  border-radius: 10px;
  font-size: 12px;
  background: #f4f7fa;
  color: #606266;
}
.pattern-chip.block { background: #fef0f0; color: #f56c6c; }
.pattern-chip.warn { background: #fdf6ec; color: #e6a23c; }

.card-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
  flex-wrap: wrap;
}
</style>
