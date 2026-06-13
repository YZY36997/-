<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { foreshadowApi, projectApi, characterApi } from '@/api'
import { Scroll, Plus, Trash2, CheckCircle2, AlertTriangle } from 'lucide-vue-next'

const route = useRoute()
const projectId = ref<string | null>(null)
const foreshadows = ref<any[]>([])
const projects = ref<any[]>([])
const characters = ref<any[]>([])
const dialogVisible = ref(false)
const form = ref<any>({ title: '', content: '', chapter_buried: '', priority: 'high', related_characters: [], status: 'pending' })

onMounted(async () => {
  projectId.value = (route.params.projectId as string) || null
  try {
    projects.value = await projectApi.list() || []
    if (!projectId.value && projects.value[0]) projectId.value = projects.value[0].id
    if (projectId.value) {
      const data = await foreshadowApi.list(projectId.value)
      foreshadows.value = data?.foreshadows || []
      const cd = await characterApi.list(projectId.value)
      characters.value = cd?.characters || []
    }
  } catch (e) { /* ignore */ }
})

const pendingCount = computed(() => foreshadows.value.filter(f => f.status !== 'retrieved').length)
const retrievedCount = computed(() => foreshadows.value.filter(f => f.status === 'retrieved').length)

async function save() {
  if (!form.value.title) return
  const data = await foreshadowApi.create({ ...form.value, project_id: projectId.value })
  foreshadows.value.push(data)
  dialogVisible.value = false
  form.value = { title: '', content: '', chapter_buried: '', priority: 'high', related_characters: [], status: 'pending' }
}
async function remove(id: string) {
  await foreshadowApi.remove(id)
  foreshadows.value = foreshadows.value.filter(f => f.id !== id)
}
async function markRetrieved(f: any) {
  f.status = 'retrieved'
  await foreshadowApi.update(f.id, { status: 'retrieved' })
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1><Scroll /> 伏笔库</h1>
      <p class="subtitle">埋设 / 回收 · 优先级 · 关联角色 · 情节债务</p>
    </div>

    <el-row :gutter="20">
      <el-col :span="8">
        <div class="metric-card warn">
          <div class="metric-label">未回收</div>
          <div class="metric-value">{{ pendingCount }}</div>
          <small>情节债务</small>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="metric-card ok">
          <div class="metric-label">已回收</div>
          <div class="metric-value">{{ retrievedCount }}</div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="metric-card info">
          <div class="metric-label">总计</div>
          <div class="metric-value">{{ foreshadows.length }}</div>
        </div>
      </el-col>
    </el-row>

    <el-card class="mt-20" shadow="never">
      <template #header>
        <div class="card-header">
          <span>伏笔列表</span>
          <el-button type="primary" @click="dialogVisible = true"><Plus icon="Plus" /> 新建</el-button>
        </div>
      </template>
      <el-table :data="foreshadows" stripe empty-text="还没有埋下任何伏笔">
        <el-table-column prop="title" label="标题" width="180" />
        <el-table-column prop="content" label="内容" show-overflow-tooltip />
        <el-table-column prop="chapter_buried" label="埋设章节" width="130" />
        <el-table-column label="优先级" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.priority === 'high' ? 'danger' : row.priority === 'medium' ? 'warning' : 'info'">
              {{ row.priority }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'retrieved' ? 'success' : 'warning'">
              {{ row.status === 'retrieved' ? '已回收' : '未回收' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="center">
          <template #default="{ row }">
            <el-button v-if="row.status !== 'retrieved'" size="small" type="success" @click="markRetrieved(row)">
              <CheckCircle2 /> 标记回收
            </el-button>
            <el-button size="small" type="danger" @click="remove(row.id)"><Trash2 /></el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" title="新建伏笔" width="540px">
      <el-form label-width="100px">
        <el-form-item label="标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="内容">
          <el-input v-model="form.content" type="textarea" :rows="3" placeholder="简要描述伏笔内容与预计回收时机" />
        </el-form-item>
        <el-form-item label="埋设章节"><el-input v-model="form.chapter_buried" placeholder="例如 第 7 章" /></el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="form.priority" style="width:100%">
            <el-option label="高" value="high" />
            <el-option label="中" value="medium" />
            <el-option label="低" value="low" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联角色">
          <el-select v-model="form.related_characters" multiple filterable style="width:100%" placeholder="选择角色">
            <el-option v-for="c in characters" :key="c.id" :label="c.name" :value="c.name" />
          </el-select>
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
.metric-card { background: #fff; border-radius: 14px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.04); }
.metric-card .metric-label { color: #888; font-size: 14px; margin-bottom: 8px; }
.metric-card .metric-value { font-size: 40px; font-weight: 700; color: #1a1a2e; }
.metric-card small { color: #aaa; font-size: 12px; }
.metric-card.warn { border-left: 4px solid #e74c3c; }
.metric-card.ok { border-left: 4px solid #27ae60; }
.metric-card.info { border-left: 4px solid #3498db; }
.mt-20 { margin-top: 24px; }
.card-header { font-weight: 600; color: #1a1a2e; display: flex; justify-content: space-between; align-items: center; }
</style>
