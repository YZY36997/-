<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { lingmo } from '@/api/lingmo'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const projectId = ref<number | null>(null)
const content = ref('粘贴一段正文章节用于快速检测钩子、爽点、错别字等')
const quick = ref<any>({ hook_hits: 0, hook_strength: 0, cool_points: 0, typos: 0 })
const projectReport = ref<any>({ total_chapters: 0, total_words: 0, foreshadow_total: 0, foreshadow_resolved: 0 })

async function analyzeQuick() {
  const r = await lingmo.invoke(lingmo.ACTIONS.ANALYSIS_CHAPTER, { content: content.value })
  quick.value = r.ok && r.data ? r.data : quick.value
}

async function loadReport() {
  const r = await lingmo.invoke(lingmo.ACTIONS.ANALYSIS_PROJECT, { project_id: projectId.value })
  if (r.ok && r.data) projectReport.value = { ...projectReport.value, ...r.data }
}

onMounted(async () => {
  const pid = route.params.projectId ? Number(route.params.projectId) : ui.currentProjectId
  if (!pid) { router.push('/home'); return }
  projectId.value = pid
  await loadReport()
})
</script>

<template>
  <div style="height:100%;overflow:auto;background:var(--bg)">
    <div class="page-header"><h2>追读力数据分析</h2><p>对章节钩子、爽点密度、伏笔埋设率、人设风险进行可视化分析。</p></div>
    <div style="padding:16px 28px 60px;max-width:1400px;margin:0 auto;display:grid;gap:16px;grid-template-columns:1fr 1fr">
      <div class="card">
        <b>作品总览</b>
        <div class="stat-grid mt-16">
          <div class="stat"><div class="n">{{ projectReport.total_chapters }}</div><div class="l muted">章节数</div></div>
          <div class="stat"><div class="n">{{ projectReport.total_words }}</div><div class="l muted">总字数</div></div>
          <div class="stat"><div class="n">{{ projectReport.foreshadow_total }}</div><div class="l muted">伏笔总数</div></div>
          <div class="stat"><div class="n">{{ projectReport.foreshadow_resolved }}</div><div class="l muted">已回收</div></div>
        </div>
        <div class="muted mt-16" style="font-size:13px">
          回收进度：{{ projectReport.foreshadow_total
            ? Math.round(projectReport.foreshadow_resolved / projectReport.foreshadow_total * 100) : 0 }}%
        </div>
      </div>

      <div class="card">
        <b>章节快速分析</b>
        <el-input v-model="content" type="textarea" :rows="6" class="mt-12" />
        <el-button type="primary" class="mt-12" @click="analyzeQuick">开始分析</el-button>
        <div class="stat-grid mt-16">
          <div class="stat"><div class="n">{{ quick.hook_hits }}</div><div class="l muted">钩子命中</div></div>
          <div class="stat"><div class="n">{{ quick.hook_strength }}</div><div class="l muted">钩子强度</div></div>
          <div class="stat"><div class="n">{{ quick.cool_points }}</div><div class="l muted">爽点</div></div>
          <div class="stat"><div class="n">{{ quick.typos }}</div><div class="l muted">疑似错字</div></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.stat { background: var(--surface-2); border-radius: 10px; padding: 14px; text-align: center; }
.stat .n { font-size: 24px; font-weight: 700; color: var(--primary); }
.stat .l { margin-top: 4px; }
</style>
