<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { lingmo } from '@/api/lingmo'
import { useUiStore } from '@/stores/ui'
import { ElMessage } from 'element-plus'

const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const projectId = ref<number | null>(null)
const mode = ref<'l1'|'l2'|'l3'>('l2')
const query = ref('主角动机 / 世界规则')
const hits = ref<any[]>([])
const filter = ref<any>({ allow_character: 1, allow_worldview: 1, allow_foreshadow: 1, allow_outline: 1 })
const built = ref('')
const busy = ref(false)

const modeLabel = computed(() => ({ l1: 'L1 简单模式（当前章节 + 少量设定）', l2: 'L2 混合模式（知识图谱 + 向量检索）', l3: 'L3 兜底模式（全项目关键词检索）' }[mode.value]))

onMounted(async () => {
  const pid = route.params.projectId ? Number(route.params.projectId) : ui.currentProjectId
  if (!pid) { router.push('/home'); return }
  projectId.value = pid
  const r = await lingmo.invoke(lingmo.ACTIONS.RAG_FILTER_GET as any, { project_id: pid })
  if (r.ok && r.data) filter.value = { ...filter.value, ...r.data }
})

async function retrieve() {
  busy.value = true
  const r = await lingmo.invoke(lingmo.ACTIONS.RAG_RETRIEVE, { project_id: projectId.value, query: query.value, level: mode.value === 'l1' ? 1 : mode.value === 'l2' ? 2 : 3 })
  hits.value = r.ok ? (r.data?.hits || []) : []
  busy.value = false
}

async function buildSystem() {
  const r = await lingmo.invoke('rag.buildSystemPrompt', { project_id: projectId.value, hint: query.value, level: mode.value === 'l1' ? 1 : mode.value === 'l2' ? 2 : 3 })
  built.value = r.ok && r.data ? (r.data.text || JSON.stringify(r.data)) : ''
}

async function saveFilter() {
  await lingmo.invoke(lingmo.ACTIONS.RAG_FILTER_SAVE, { project_id: projectId.value, ...filter.value })
  ElMessage.success('已保存检索偏好')
}
</script>

<template>
  <div style="height:100%;overflow:auto;background:var(--bg)">
    <div class="page-header"><h2>RAG 三级长效记忆</h2><p>切换模式，控制 AI 读取作品信息的范围，避免长篇设定崩坏。</p></div>
    <div style="padding:16px 28px 60px;max-width:1400px;margin:0 auto">
      <div class="card">
        <el-radio-group v-model="mode" size="large">
          <el-radio value="l1">L1 简单模式</el-radio>
          <el-radio value="l2">L2 混合模式</el-radio>
          <el-radio value="l3">L3 兜底模式</el-radio>
        </el-radio-group>
        <p class="muted mt-8">{{ modeLabel }}</p>
        <el-input v-model="query" class="mt-12" placeholder="检索关键词 / 章节主题" />
        <div class="flex gap-12 mt-12">
          <el-button type="primary" :loading="busy" @click="retrieve">检索相关设定</el-button>
          <el-button @click="buildSystem">拼装 system prompt 预览</el-button>
        </div>
      </div>
      <div class="card mt-16">
        <b>检索偏好（允许 AI 读取的设定范围）</b>
        <el-form :inline="true" class="mt-12">
          <el-form-item><el-switch v-model="filter.allow_character" :active-value="1" :inactive-value="0" /> 角色</el-form-item>
          <el-form-item><el-switch v-model="filter.allow_worldview" :active-value="1" :inactive-value="0" /> 世界观</el-form-item>
          <el-form-item><el-switch v-model="filter.allow_foreshadow" :active-value="1" :inactive-value="0" /> 伏笔</el-form-item>
          <el-form-item><el-switch v-model="filter.allow_outline" :active-value="1" :inactive-value="0" /> 大纲</el-form-item>
          <el-form-item><el-button type="primary" @click="saveFilter">保存</el-button></el-form-item>
        </el-form>
      </div>
      <div class="card mt-16">
        <b>检索结果（{{ hits.length }} 条）</b>
        <el-table :data="hits" class="mt-12">
          <el-table-column prop="type" label="类型" width="120" />
          <el-table-column prop="title" label="标题" width="200" />
          <el-table-column prop="snippet" label="片段" />
        </el-table>
      </div>
      <div class="card mt-16" v-if="built">
        <b>System Prompt 预览</b>
        <pre style="white-space:pre-wrap;background:var(--surface-2);padding:14px;border-radius:8px;margin-top:12px">{{ built }}</pre>
      </div>
    </div>
  </div>
</template>
