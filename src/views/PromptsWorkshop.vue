<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { promptsApi } from '@/api'
import { Wand2, Plus, Trash2, Edit } from 'lucide-vue-next'

const categoryLabels: Record<string, string> = {
  anti_ai: '去 AI 味',
  style: '文风控制',
  dialogue: '对话优化',
  scene: '场景描写',
  character_binding: '角色绑定',
  project: '项目专属',
  generic: '通用'
}

const prompts = ref<any[]>([])
const dialogVisible = ref(false)
const form = ref<any>({ name: '', category: 'generic', content: '', priority: 1 })
const editId = ref<string | null>(null)

onMounted(async () => {
  try {
    const data = await promptsApi.list()
    prompts.value = data?.prompts || []
  } catch (e) { /* ignore */ }
})

async function openCreate() {
  editId.value = null
  form.value = { name: '', category: 'generic', content: '', priority: 1, enabled: true }
  dialogVisible.value = true
}
async function openEdit(p: any) {
  editId.value = p.id
  form.value = { ...p }
  dialogVisible.value = true
}
async function save() {
  if (editId.value) {
    const data = await promptsApi.update(editId.value, form.value)
    const idx = prompts.value.findIndex(p => p.id === editId.value)
    if (idx > -1) prompts.value[idx] = data
  } else {
    const data = await promptsApi.create({ ...form.value, enabled: true })
    prompts.value.push(data)
  }
  dialogVisible.value = false
}
async function remove(id: string) {
  await promptsApi.remove(id)
  prompts.value = prompts.value.filter(p => p.id !== id)
}
async function toggle(p: any) {
  p.enabled = !p.enabled
  await promptsApi.update(p.id, { enabled: p.enabled })
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1><Wand2 /> 提示词仓库</h1>
      <p class="subtitle">按分类管理：去 AI 味 / 文风 / 对话 / 场景 / 角色绑定 / 项目专属</p>
    </div>

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>全部提示词 · {{ prompts.length }}</span>
          <el-button type="primary" @click="openCreate"><Plus icon="Plus" /> 新建</el-button>
        </div>
      </template>
      <el-alert type="info" :closable="false" show-icon class="mb-16">
        <template #title>提示词会在章节续写 / 润色时自动按分类注入到 AI 上下文，按 priority 排序取 TopN。</template>
      </el-alert>
      <el-table :data="prompts" stripe empty-text="暂无提示词">
        <el-table-column prop="name" label="名称" width="180" />
        <el-table-column label="分类" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ categoryLabels[row.category] || row.category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容" show-overflow-tooltip />
        <el-table-column prop="priority" label="优先级" width="90" align="center" />
        <el-table-column label="启用" width="90" align="center">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled !== false" @change="toggle(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" align="center">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)"><Edit /></el-button>
            <el-button size="small" type="danger" @click="remove(row.id)"><Trash2 /></el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editId ? '编辑提示词' : '新建提示词'" width="600px">
      <el-form label-width="80px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.category">
            <el-option v-for="(label, k) in categoryLabels" :key="k" :label="label" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-input-number v-model="form.priority" :min="0" :max="10" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="form.content" type="textarea" :rows="5" placeholder="写一段话告诉 AI 如何输出" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { max-width: 1400px; margin: 0 auto; padding: 24px; }
.page-header h1 { display: flex; align-items: center; gap: 12px; margin: 0 0 6px; font-size: 26px; color: #1a1a2e; }
.page-header .subtitle { color: #888; margin: 0 0 24px; }
.card-header { font-weight: 600; color: #1a1a2e; display: flex; justify-content: space-between; align-items: center; }
.mb-16 { margin-bottom: 16px; }
</style>
