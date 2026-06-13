<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { chapterApi, projectApi, analysisApi, foreshadowApi } from '@/api'
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle2, BookOpen, Eye, Sparkles, ChevronRight } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const projectId = ref<string | null>(null)
const project = ref<any>(null)
const chapters = ref<any[]>([])
const loading = ref(true)
const analysis = ref<any>(null)
const foreshadows = ref<any[]>([])

onMounted(async () => {
  projectId.value = (route.params.projectId as string) || null
  try {
    const projects = await projectApi.list()
    if (projectId.value) {
      project.value = projects.find((p: any) => p.id === projectId.value)
    } else if (projects?.[0]) {
      project.value = projects[0]
      projectId.value = projects[0].id
    }
    if (project.value) {
      chapters.value = (await chapterApi.list(project.value.id)) || []
    }
    if (projectId.value) {
      const [an, fs] = await Promise.all([
        analysisApi.analyzeProject(projectId.value, {}).catch(() => null),
        foreshadowApi.list(projectId.value).catch(() => ({ foreshadows: [] }))
      ])
      analysis.value = an
      foreshadows.value = fs?.foreshadows || []
    }
  } catch (e) { /* ignore */ }
  loading.value = false
})

const totalWords = computed(() => chapters.value.reduce((sum, c) => sum + ((c.content || '').length), 0))
const pendingForeshadow = computed(() => foreshadows.value.filter(f => f.status !== 'retrieved').length)
const hookStrength = computed(() => {
  const h = chapters.value.reduce((s, c) => {
    const text = c.content || ''
    return s + (text.match(/为什么|怎么|难道|究竟|没想到|居然|秘密|真相|多年以后|后来/g) || []).length
  }, 0)
  return Math.min(100, h * 8 + (chapters.value.length ? 10 : 0))
})
const composite = computed(() => Math.min(100, Math.round(hookStrength.value * 0.35 + (chapters.value.length ? 25 : 0) + Math.min(40, totalWords.value / 200))))
const rating = computed(() => composite.value >= 80 ? 'A' : composite.value >= 60 ? 'B' : composite.value >= 40 ? 'C' : 'D')
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1>
        <BarChart3 /> 追读力分析
        <el-tag v-if="project" type="primary" size="small">{{ project.name }}</el-tag>
      </h1>
      <p class="subtitle">基于 Hook 强度 · 爽点密度 · 伏笔回收 · 章节结构 综合评分</p>
    </div>

    <el-row :gutter="20" v-if="!loading">
      <el-col :span="6">
        <div class="metric-card a">
          <div class="metric-label">综合追读力</div>
          <div class="metric-value">{{ composite }}<small>/100</small></div>
          <el-tag :type="composite >= 80 ? 'success' : composite >= 60 ? 'warning' : 'danger'" effect="dark">{{ rating }}</el-tag>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card b">
          <div class="metric-label">Hook 强度</div>
          <div class="metric-value">{{ hookStrength }}</div>
          <small>悬念/反转/疑问词数量</small>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card c">
          <div class="metric-label">章节数</div>
          <div class="metric-value">{{ chapters.length }}</div>
          <small>总字数 {{ totalWords.toLocaleString() }}</small>
        </div>
      </el-col>
      <el-col :span="6">
        <div class="metric-card d">
          <div class="metric-label">未回收伏笔</div>
          <div class="metric-value warn">{{ pendingForeshadow }}</div>
          <small>共 {{ foreshadows.length }} 条伏笔记录</small>
        </div>
      </el-col>
    </el-row>

    <el-card v-if="!loading && project" class="mt-20" shadow="never">
      <template #header>
        <div class="card-header">
          <span><Sparkles /> 写作诊断与建议</span>
        </div>
      </template>
      <div class="advices">
        <el-alert v-if="hookStrength < 60" type="warning" :closable="false">
          <template #title><b>Hook 强度偏低</b>：建议在章节开头/关键情节加入悬念、反转、伏笔或角色提出的问题（"为什么？""难道？""究竟是怎么回事？"）。</template>
        </el-alert>
        <el-alert v-if="chapters.length < 3" type="info" :closable="false">
          <template #title><b>章节数较少</b>：请至少完成 3 章内容后，才能进行更稳定的结构分析。</template>
        </el-alert>
        <el-alert v-if="pendingForeshadow > 0" type="danger" :closable="false">
          <template #title><b>情节债务</b>：有 {{ pendingForeshadow }} 条伏笔尚未回收，建议在后续章节安排回收，避免读者失望。</template>
        </el-alert>
        <el-alert v-if="composite >= 80" type="success" :closable="false">
          <template #title><b>追读力优秀</b>：整体节奏感良好，继续保持当前节奏推进主线。</template>
        </el-alert>
      </div>
    </el-card>

    <el-card v-if="!loading && chapters.length" class="mt-20" shadow="never">
      <template #header>
        <div class="card-header">
          <span><BookOpen /> 章节级分析</span>
        </div>
      </template>
      <el-table :data="chapters" stripe>
        <el-table-column label="#" width="60">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column prop="title" label="章节标题" min-width="200" />
        <el-table-column label="字数" width="120">
          <template #default="{ row }">{{ ((row.content || '').length).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="结构" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="((row.content || '').length > 2000) ? 'success' : 'info'">
              {{ ((row.content || '').length > 2000) ? '合格' : '偏短' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近更新" prop="updatedAt" width="180" />
      </el-table>
    </el-card>

    <el-empty v-if="!loading && !project" description="请先创建一个项目，或进入项目后再查看分析" />
  </div>
</template>

<style scoped>
.page { max-width: 1400px; margin: 0 auto; padding: 24px; }
.page-header h1 { display: flex; align-items: center; gap: 12px; margin: 0 0 6px; font-size: 26px; color: #1a1a2e; }
.page-header .subtitle { color: #888; margin: 0 0 24px; }
.metric-card { background: #fff; border-radius: 14px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
.metric-card .metric-label { color: #888; font-size: 14px; margin-bottom: 8px; }
.metric-card .metric-value { font-size: 40px; font-weight: 700; color: #1a1a2e; line-height: 1.2; margin-bottom: 6px; }
.metric-card .metric-value small { font-size: 14px; font-weight: 400; color: #999; margin-left: 4px; }
.metric-card .metric-value.warn { color: #e74c3c; }
.metric-card small { color: #aaa; font-size: 12px; }
.metric-card.a { border-left: 4px solid #667eea; }
.metric-card.b { border-left: 4px solid #f093fb; }
.metric-card.c { border-left: 4px solid #11998e; }
.metric-card.d { border-left: 4px solid #e74c3c; }
.mt-20 { margin-top: 24px; }
.card-header { font-weight: 600; color: #1a1a2e; display: flex; align-items: center; gap: 8px; }
.advices > * { margin-bottom: 12px; }
</style>
