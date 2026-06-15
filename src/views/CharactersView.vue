<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { lingmo } from '@/api/lingmo'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const projectId = ref<number | null>(null)
const characters = ref<any[]>([])
const editing = ref<any>(null)
const empty = () => ({
  name: '', role: 'protagonist', appearance: '', personality: '', background: '',
  abilities: '', weakness: '', relationships: '', first_appearance_chapter: '', status: 'alive'
})

async function load() {
  const pid = route.params.projectId ? Number(route.params.projectId) : ui.currentProjectId
  if (!pid) { router.push('/home'); return }
  projectId.value = pid
  const r = await lingmo.invoke(lingmo.ACTIONS.CHARACTER_LIST, { project_id: pid })
  characters.value = r.ok ? (r.data || []) : []
}

function openNew() { editing.value = empty() }
function openEdit(c: any) { editing.value = { ...c } }

async function save() {
  if (!editing.value.name) { ElMessage.warning('请填写姓名'); return }
  const data = { project_id: projectId.value, ...editing.value }
  const r = editing.value.id
    ? await lingmo.invoke(lingmo.ACTIONS.CHARACTER_UPDATE, data)
    : await lingmo.invoke(lingmo.ACTIONS.CHARACTER_CREATE, data)
  if (r.ok) { ElMessage.success('已保存'); editing.value = null; load() }
}

async function remove(id: number) {
  try {
    await ElMessageBox.confirm('删除该角色？', '提示', { type: 'warning' })
    await lingmo.invoke(lingmo.ACTIONS.CHARACTER_DELETE, { id })
    load()
  } catch {}
}

const roleMap: Record<string, string> = { protagonist: '主角', main: '重要配角', minor: '次要人物', extra: '龙套' }

onMounted(load)
</script>

<template>
  <div style="height:100%;overflow:auto;background:var(--bg)">
    <div class="page-header">
      <h2>角色管理</h2>
      <p>维护角色卡片，包括外貌、性格、动机、力量、关系。AI 生成时将按角色约束写作。</p>
    </div>
    <div style="padding:16px 28px 60px;max-width:1400px;margin:0 auto">
      <div class="card between">
        <span class="muted">共 {{ characters.length }} 位角色</span>
        <el-button type="primary" @click="openNew">+ 新建角色</el-button>
      </div>
      <div class="ch-grid mt-16">
        <div v-for="c in characters" :key="c.id" class="ch-card card">
          <div class="between">
            <b>{{ c.name }}</b>
            <el-tag size="small">{{ roleMap[c.role] || c.role }}</el-tag>
          </div>
          <div class="mt-8 muted" style="font-size:12.5px">
            <div v-if="c.personality">性格：{{ c.personality.slice(0, 50) }}</div>
            <div v-if="c.background">背景：{{ c.background.slice(0, 60) }}</div>
            <div v-if="c.abilities">能力：{{ c.abilities.slice(0, 50) }}</div>
          </div>
          <div class="mt-16 between">
            <el-button size="small" @click="openEdit(c)">编辑</el-button>
            <el-button size="small" type="danger" @click="remove(c.id)">删除</el-button>
          </div>
        </div>
        <div v-if="characters.length === 0" class="card center" style="padding:60px">
          <span class="muted">暂无角色，点击右上角新建</span>
        </div>
      </div>
    </div>

    <el-dialog v-model="editing" :title="editing && editing.id ? '编辑角色' : '新建角色'" width="720px">
      <template v-if="editing">
        <el-form label-width="90px">
          <el-form-item label="姓名"><el-input v-model="editing.name" /></el-form-item>
          <el-form-item label="角色定位">
            <el-select v-model="editing.role"><el-option v-for="(v,k) in roleMap" :key="k" :label="v" :value="k" /></el-select>
          </el-form-item>
          <el-form-item label="外貌"><el-input v-model="editing.appearance" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="性格 / 动机"><el-input v-model="editing.personality" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="身世背景"><el-input v-model="editing.background" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="特殊能力 / 战力"><el-input v-model="editing.abilities" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="弱点"><el-input v-model="editing.weakness" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="人际关系"><el-input v-model="editing.relationships" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="首次登场章节"><el-input v-model="editing.first_appearance_chapter" /></el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="editing = null">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.ch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.ch-card { padding: 16px; }
</style>
