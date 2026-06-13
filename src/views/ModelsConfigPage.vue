<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { modelApi } from '@/api'
import { Settings2, Plus, Trash2 } from 'lucide-vue-next'

const configs = ref<any[]>([])
const dialogVisible = ref(false)
const form = ref<any>({ name: '', provider: 'deepseek', apiKey: '', baseUrl: '', temperature: 0.7, priority: 1, enabled: true })

onMounted(async () => {
  try {
    const data = await modelApi.list()
    configs.value = (data?.configs || []).length ? data.configs : [
      { id: 'deepseek-default', name: 'DeepSeek Chat', provider: 'deepseek', apiKey: '', baseUrl: 'https://api.deepseek.com', temperature: 0.7, priority: 2, enabled: true },
      { id: 'mimo-free', name: '小米 Mimo（内测免费）', provider: 'mimo', apiKey: '', baseUrl: '', temperature: 0.8, priority: 1, enabled: true }
    ]
  } catch (e) { /* ignore */ }
})

async function openCreate() {
  form.value = { name: '', provider: 'openai', apiKey: '', baseUrl: '', temperature: 0.7, priority: 1, enabled: true }
  dialogVisible.value = true
}
async function save() {
  if (!form.value.name) return
  configs.value.push({ ...form.value, id: 'cfg_' + Date.now() })
  dialogVisible.value = false
}
async function remove(idx: number) {
  configs.value.splice(idx, 1)
}
async function toggle(cfg: any) {
  cfg.enabled = !cfg.enabled
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1><Settings2 /> 多模型配置</h1>
      <p class="subtitle">DeepSeek / OpenAI / 通义 / 文心 / 小米 Mimo · 失败自动切换 · 任务绑定模型</p>
    </div>

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>已配置模型 · {{ configs.length }}</span>
          <el-button type="primary" @click="openCreate"><Plus icon="Plus" /> 新增</el-button>
        </div>
      </template>
      <el-table :data="configs" stripe>
        <el-table-column prop="name" label="名称" width="220" />
        <el-table-column prop="provider" label="供应商" width="140">
          <template #default="{ row }">
            <el-tag size="small">{{ row.provider }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="baseUrl" label="Base URL" />
        <el-table-column prop="temperature" label="Temperature" width="120" align="center" />
        <el-table-column prop="priority" label="优先级" width="100" align="center" />
        <el-table-column label="启用" width="90" align="center">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled" @change="toggle(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ $index }">
            <el-button size="small" type="danger" @click="remove($index)"><Trash2 /></el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card class="mt-20" shadow="never">
      <template #header>
        <div class="card-header"><span>任务-模型绑定（示意）</span></div>
      </template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="章节续写">DeepSeek Chat / 小米 Mimo（失败切换）</el-descriptions-item>
        <el-descriptions-item label="润色">优先使用 DeepSeek Chat</el-descriptions-item>
        <el-descriptions-item label="审稿">DeepSeek Chat（强推理）</el-descriptions-item>
        <el-descriptions-item label="向量/知识库">用户自定义 Embedding 服务</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-dialog v-model="dialogVisible" title="新增模型配置" width="520px">
      <el-form label-width="100px">
        <el-form-item label="名称"><el-input v-model="form.name" placeholder="例如 DeepSeek Chat" /></el-form-item>
        <el-form-item label="供应商">
          <el-select v-model="form.provider">
            <el-option label="DeepSeek" value="deepseek" />
            <el-option label="OpenAI" value="openai" />
            <el-option label="通义千问" value="qwen" />
            <el-option label="文心" value="ernie" />
            <el-option label="小米 Mimo" value="mimo" />
            <el-option label="Ollama（本地）" value="ollama" />
          </el-select>
        </el-form-item>
        <el-form-item label="API Key"><el-input v-model="form.apiKey" type="password" show-password /></el-form-item>
        <el-form-item label="Base URL"><el-input v-model="form.baseUrl" placeholder="https://..." /></el-form-item>
        <el-form-item label="Temperature"><el-input-number v-model="form.temperature" :min="0" :max="2" :step="0.1" /></el-form-item>
        <el-form-item label="优先级"><el-input-number v-model="form.priority" :min="0" :max="10" /></el-form-item>
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
.mt-20 { margin-top: 24px; }
</style>
