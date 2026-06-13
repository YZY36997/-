<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { rulesEngineApi, projectApi } from '@/api'
import { ShieldCheck, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-vue-next'
import type { FormInstance, FormRules } from 'element-plus'

const rules = ref<any[]>([])
const projects = ref<any[]>([])
const activeProject = ref<string>('')
const dialogVisible = ref(false)
const formRef = ref<FormInstance>()
const form = ref<any>({ name: '', category: 'custom', content: '', severity: 'warn' })
const projectBind = ref<any>({ projectId: '', ruleIds: [] })
const bindVisible = ref(false)
const builtin = ref<string[]>(['全局禁词：色情/暴力/种族歧视/未成年人不良导向', '题材约束：玄幻不可出现现代枪械', '都市避免使用政治敏感话题', '言情避免强取豪夺/PUA 暗示', '科幻避免出现违反基本物理定律'])

onMounted(async () => {
  try {
    projects.value = await projectApi.list() || []
    const data = await rulesEngineApi.list()
    rules.value = data?.rules || []
  } catch (e) { /* ignore */ }
})

async function createRule() {
  if (!form.value.name || !form.value.content) return
  const data = await rulesEngineApi.create(form.value)
  rules.value.push(data)
  dialogVisible.value = false
  form.value = { name: '', category: 'custom', content: '', severity: 'warn' }
}
async function removeRule(id: string) {
  await rulesEngineApi.remove(id)
  rules.value = rules.value.filter(r => r.id !== id)
}
async function toggleRule(r: any) {
  await rulesEngineApi.toggle(r.id)
  r.enabled = !r.enabled
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1><ShieldCheck /> 规则引擎</h1>
      <p class="subtitle">全局禁词 · 题材内置规则 · 作者自定义约束 · 生成后违规校验</p>
    </div>

    <el-card shadow="never">
      <template #header>
      <div class="card-header">
        <span>内置规则（系统内置，不可删除）</span>
      </div>
      </template>
      <el-timeline>
        <el-timeline-item
          v-for="(r, i) in builtin" :key="i"
          :color="i === 0 ? '#f56c6c' : '#67c23a'"
          placement="top"
        >
          {{ r }}
        </el-timeline-item>
      </el-timeline>
    </el-card>

    <el-card class="mt-20" shadow="never">
      <template #header>
        <div class="card-header">
          <span>自定义规则</span>
          <el-button type="primary" @click="dialogVisible = true"><Plus icon="Plus" /></el-button>
        </div>
      </template>
      <el-table :data="rules" stripe empty-text="尚未添加规则">
        <el-table-column prop="name" label="名称" width="180" />
        <el-table-column prop="category" label="分类" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ row.category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="规则内容" />
        <el-table-column prop="severity" label="级别" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.severity === 'block' ? 'danger' : 'warning'">{{ row.severity }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="100">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled !== false" @change="toggleRule(row)" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" type="danger" @click="removeRule(row.id)"><Trash2 /></el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新建规则对话框 -->
    <el-dialog v-model="dialogVisible" title="新建规则" width="520px">
      <el-form ref="formRef" :model="form" :rules="{}" label-width="80px">
        <el-form-item label="规则名"><el-input v-model="form.name" placeholder="例如 禁词" /></el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.category">
            <el-option label="禁词" value="forbidden" />
            <el-option label="文风" value="style" />
            <el-option label="自定义" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="form.content" type="textarea" :rows="4" placeholder="使用正则或关键词，多个用英文逗号分隔" />
        </el-form-item>
        <el-form-item label="违规级别">
          <el-radio-group v-model="form.severity">
            <el-radio-button label="warn" />
            <el-radio-button label="block" />
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createRule">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; padding: 24px; }
.page-header h1 { display: flex; align-items: center; gap: 12px; margin: 0 0 6px; font-size: 26px; color: #1a1a2e; }
.page-header .subtitle { color: #888; margin: 0 0 24px; }
.mt-20 { margin-top: 24px; }
.card-header { font-weight: 600; color: #1a1a2e; display: flex; justify-content: space-between; align-items: center; }
</style>
