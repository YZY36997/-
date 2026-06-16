<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { lingmo } from '@/api/lingmo'

const models = ref<any[]>([])
const form = ref<any>({ id: null, name: 'DeepSeek', provider: 'deepseek', base_url: 'https://api.deepseek.com/v1/chat/completions', api_key: '', model_name: 'deepseek-chat', temperature: 0.7, max_tokens: 2048, is_default: 0 })

async function load() {
  const r = await lingmo.invoke(lingmo.ACTIONS.AI_MODEL_LIST)
  models.value = r.ok ? (r.data || []) : []
}

async function save() {
  if (!form.value.api_key) { ElMessage.warning('请填写 API Key'); return }
  const r = await lingmo.invoke(lingmo.ACTIONS.AI_MODEL_SAVE, form.value)
  if (r.ok) { ElMessage.success('已保存'); load() }
}

async function remove(id: number) {
  await lingmo.invoke(lingmo.ACTIONS.AI_MODEL_DELETE, { id }); load()
}

async function testModel(id: number) {
  const r = await lingmo.invoke(lingmo.ACTIONS.AI_MODEL_TEST, { id })
  if (r.ok && r.data) ElMessage.success('测试通过：' + (r.data.status || 'ok'))
  else ElMessage.error('测试失败：' + (r.error || '未知'))
}

onMounted(load)
</script>

<template>
  <div style="height:100%;overflow:auto;background:var(--bg)">
    <div class="page-header"><h2>AI 接口配置</h2><p>管理多模型 / 多供应商，可快速切换默认模型与参数。</p></div>
    <div style="padding:16px 28px 60px;max-width:1400px;margin:0 auto">
      <div class="card">
        <b>新增 / 编辑配置</b>
        <el-form label-width="110px" class="mt-12">
          <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
          <el-form-item label="供应商">
            <el-select v-model="form.provider" style="width:220px">
              <el-option label="DeepSeek" value="deepseek" />
              <el-option label="OpenAI" value="openai" />
              <el-option label="通义千问" value="qwen" />
              <el-option label="Ollama" value="ollama" />
            </el-select>
          </el-form-item>
          <el-form-item label="API URL"><el-input v-model="form.base_url" /></el-form-item>
          <el-form-item label="API Key"><el-input v-model="form.api_key" show-password /></el-form-item>
          <el-form-item label="模型"><el-input v-model="form.model_name" /></el-form-item>
          <el-form-item label="温度"><el-input-number v-model="form.temperature" :min="0" :max="2" :step="0.1" /></el-form-item>
          <el-form-item label="最大 token"><el-input-number v-model="form.max_tokens" :min="256" :max="32768" :step="256" /></el-form-item>
          <el-form-item label="设为默认"><el-switch v-model="form.is_default" :active-value="1" :inactive-value="0" /></el-form-item>
        </el-form>
        <el-button type="primary" @click="save">保存配置</el-button>
      </div>
      <div class="card mt-16">
        <b>已配置模型</b>
        <el-table :data="models" class="mt-12">
          <el-table-column prop="name" label="名称" width="160" />
          <el-table-column prop="provider" label="供应商" width="120" />
          <el-table-column prop="model" label="模型" width="180" />
          <el-table-column prop="temperature" label="温度" width="100" />
          <el-table-column label="默认" width="80"><template #default="{row}">{{ row.is_default ? '✓' : '' }}</template></el-table-column>
          <el-table-column label="操作" width="200">
            <template #default="{row}">
              <el-button size="small" @click="testModel(row.id)">连通测试</el-button>
              <el-button size="small" type="danger" @click="remove(row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>
