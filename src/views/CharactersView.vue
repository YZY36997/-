<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox, ElTag } from 'element-plus'
import { lingmo } from '@/api/lingmo'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const characters = ref<any[]>([])
const relations = ref<any[]>([])
const editingChar = ref<any>(null)
const editingRel = ref<any>(null)

const roleMap: Record<string, string> = { protagonist: '主角', main: '重要配角', minor: '次要人物', extra: '龙套' }
const relTypes: Record<string, string> = { friend: '朋友', ally: '盟友', enemy: '敌对', rival: '竞争', family: '家人', teacher: '师徒', subordinate: '从属', other: '其他' }

async function load() {
  if (!ui.currentProjectId) return
  const c = await lingmo.invoke(lingmo.ACTIONS.CHARACTER_LIST, { project_id: ui.currentProjectId })
  const r = await lingmo.invoke(lingmo.ACTIONS.CHARACTER_RELATION_LIST, { project_id: ui.currentProjectId })
  characters.value = c.ok ? (c.data || []) : []
  relations.value = r.ok ? (r.data || []) : []
}

function newChar() {
  editingChar.value = { id: null, name: '', role: 'protagonist', appearance: '', personality: '', background: '',
    abilities: '', weakness: '', relationships: '', first_chapter: '', current_status: '活跃' }
}
function editChar(c: any) { editingChar.value = { ...c } }

async function saveChar() {
  if (!editingChar.value?.name) { ElMessage.warning('请填写姓名'); return }
  const data = { project_id: ui.currentProjectId, ...editingChar.value }
  const r = editingChar.value.id
    ? await lingmo.invoke(lingmo.ACTIONS.CHARACTER_UPDATE, data)
    : await lingmo.invoke(lingmo.ACTIONS.CHARACTER_CREATE, data)
  if (r.ok) { editingChar.value = null; ElMessage.success('已保存'); load() }
  else ElMessage.error(r.error || '保存失败')
}

async function removeChar(id: number) {
  try {
    await ElMessageBox.confirm('确定删除该角色？', '提示', { type: 'warning' })
    await lingmo.invoke(lingmo.ACTIONS.CHARACTER_DELETE, { id })
    load()
  } catch (_) {}
}

function newRel() { editingRel.value = { id: null, source_id: null, target_id: null, relation_type: 'friend', label: '', weight: 1, note: '' } }
function editRel(row: any) { editingRel.value = { ...row } }

async function saveRel() {
  if (!editingRel.value.source_id || !editingRel.value.target_id) { ElMessage.warning('请选择角色'); return }
  const data = { project_id: ui.currentProjectId, ...editingRel.value }
  const r = editingRel.value.id
    ? await lingmo.invoke(lingmo.ACTIONS.CHARACTER_RELATION_UPDATE, data)
    : await lingmo.invoke(lingmo.ACTIONS.CHARACTER_RELATION_CREATE, data)
  if (r.ok) { editingRel.value = null; ElMessage.success('已保存'); load() }
}

async function removeRel(id: number) {
  await lingmo.invoke(lingmo.ACTIONS.CHARACTER_RELATION_DELETE, { id })
  load()
}

onMounted(load)
</script>

<template>
  <div class="char-wrap" v-if="ui.currentProjectId">
    <div class="header">
      <h2>角色管理 · 卡片库</h2>
      <p class="sub">角色分类、详情字段、关系列表。AI 续写时自动读取角色设定，防止人设跑偏。</p>
      <div class="actions">
        <el-button type="primary" @click="newChar">＋ 新建角色</el-button>
        <el-button @click="newRel">＋ 新建关系</el-button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">角色卡片 · 共 {{ characters.length }} 位</div>
      <div class="ch-grid">
        <div v-for="c in characters" :key="c.id" class="ch-card">
          <div class="ch-head"><b>{{ c.name }}</b><el-tag size="small">{{ roleMap[c.role] || c.role }}</el-tag></div>
          <div class="ch-body">
            <div v-if="c.appearance"><span class="tag">外貌</span>{{ c.appearance }}</div>
            <div v-if="c.personality"><span class="tag">性格</span>{{ c.personality }}</div>
            <div v-if="c.abilities"><span class="tag">能力</span>{{ c.abilities }}</div>
            <div v-if="c.weakness"><span class="tag">弱点</span>{{ c.weakness }}</div>
            <div v-if="c.background"><span class="tag">背景</span>{{ c.background }}</div>
            <div v-if="c.first_chapter"><span class="tag">登场</span>{{ c.first_chapter }}</div>
            <div v-if="c.current_status"><span class="tag">状态</span>{{ c.current_status }}</div>
            <div v-if="c.relationships"><span class="tag">关系</span>{{ c.relationships }}</div>
          </div>
          <div class="ch-actions">
            <el-button size="small" @click="editChar(c)">编辑</el-button>
            <el-button size="small" type="danger" @click="removeChar(c.id)">删除</el-button>
          </div>
        </div>
        <div v-if="characters.length === 0" class="muted">暂无角色卡片。</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">关系列表 · 共 {{ relations.length }} 条</div>
      <el-table :data="relations" size="default" stripe style="width:100%;">
        <el-table-column prop="source_name" label="角色 A" width="140"/>
        <el-table-column label="关系类型" width="140">
          <template #default="{ row }"><el-tag size="small">{{ relTypes[row.relation_type] || row.relation_type }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="target_name" label="角色 B" width="140"/>
        <el-table-column prop="label" label="标签"/>
        <el-table-column prop="note" label="备注"/>
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" @click="editRel(row)">编辑</el-button>
            <el-button size="small" type="danger" @click="removeRel(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="editingChar" :title="editingChar && editingChar.id ? '编辑角色' : '新建角色'" width="680px">
      <template v-if="editingChar">
        <div class="dlg-form">
          <div class="field"><label>姓名</label><el-input v-model="editingChar.name"/></div>
          <div class="field"><label>角色定位</label>
            <el-select v-model="editingChar.role" style="width:100%;"><el-option v-for="(v, k) in roleMap" :key="k" :label="v" :value="k"/></el-select>
          </div>
          <div class="field"><label>外貌</label><el-input v-model="editingChar.appearance" type="textarea" :rows="2"/></div>
          <div class="field"><label>性格 / 动机</label><el-input v-model="editingChar.personality" type="textarea" :rows="2"/></div>
          <div class="field"><label>身世背景</label><el-input v-model="editingChar.background" type="textarea" :rows="2"/></div>
          <div class="field"><label>能力 / 战力</label><el-input v-model="editingChar.abilities" type="textarea" :rows="2"/></div>
          <div class="field"><label>弱点</label><el-input v-model="editingChar.weakness" type="textarea" :rows="2"/></div>
          <div class="field"><label>人际关系简述</label><el-input v-model="editingChar.relationships" type="textarea" :rows="2"/></div>
          <div class="field"><label>首次登场章节</label><el-input v-model="editingChar.first_chapter"/></div>
          <div class="field"><label>当前剧情状态</label><el-input v-model="editingChar.current_status"/></div>
        </div>
      </template>
      <template #footer><el-button @click="editingChar = null">取消</el-button><el-button type="primary" @click="saveChar">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="editingRel" :title="editingRel && editingRel.id ? '编辑关系' : '新建关系'" width="600px">
      <template v-if="editingRel">
        <div class="dlg-form">
          <div class="field"><label>角色 A</label>
            <el-select v-model="editingRel.source_id" style="width:100%;"><el-option v-for="c in characters" :key="c.id" :label="c.name" :value="c.id"/></el-select>
          </div>
          <div class="field"><label>关系类型</label>
            <el-select v-model="editingRel.relation_type" style="width:100%;"><el-option v-for="(v, k) in relTypes" :key="k" :label="v" :value="k"/></el-select>
          </div>
          <div class="field"><label>角色 B</label>
            <el-select v-model="editingRel.target_id" style="width:100%;"><el-option v-for="c in characters" :key="c.id" :label="c.name" :value="c.id"/></el-select>
          </div>
          <div class="field"><label>标签</label><el-input v-model="editingRel.label"/></div>
          <div class="field"><label>备注</label><el-input v-model="editingRel.note" type="textarea" :rows="2"/></div>
        </div>
      </template>
      <template #footer><el-button @click="editingRel = null">取消</el-button><el-button type="primary" @click="saveRel">保存</el-button></template>
    </el-dialog>
  </div>
  <div v-else class="no-project">请先在「作品管理中心」选择一个作品。</div>
</template>

<style scoped>
.char-wrap { padding: 20px 28px; height: 100%; overflow: auto; background: var(--bg); color: var(--text); }
.header { display: flex; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.header h2 { margin: 0; }
.sub { flex: 1; margin: 0; color: var(--text-muted); font-size: 13px; }
.actions { display: flex; gap: 8px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; margin-bottom: 14px; }
.card-title { font-weight: 700; font-size: 15px; margin-bottom: 10px; }
.ch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.ch-card { background: var(--bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px; }
.ch-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.ch-body { font-size: 13px; line-height: 1.7; }
.ch-body > div { margin-bottom: 4px; }
.ch-body .tag { display: inline-block; padding: 1px 6px; background: var(--primary); color: #fff; border-radius: 4px; font-size: 11px; margin-right: 6px; }
.ch-actions { display: flex; gap: 6px; margin-top: 10px; }
.muted { color: var(--text-muted); text-align: center; padding: 20px; }
.no-project { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); }
.dlg-form .field { margin-bottom: 10px; }
.dlg-form label { display: block; font-size: 13px; color: var(--text-muted); margin-bottom: 4px; }
</style>
