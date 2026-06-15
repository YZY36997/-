<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { lingmo } from '@/api/lingmo'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const projectId = ref<number | null>(null)
const outline = ref<any[]>([])
const aiDraft = ref('')
const busy = ref(false)
const editing = ref<any>(null)

async function load() {
  const pid = route.params.projectId ? Number(route.params.projectId) : ui.currentProjectId
  if (!pid) { router.push('/home'); return }
  projectId.value = pid
  const r = await lingmo.invoke(lingmo.ACTIONS.OUTLINE_TREE, { project_id: pid })
  outline.value = r.ok ? (r.data || []) : []
}

function addRoot() {
  editing.value = { parent_id: null, title: '新章节', summary: '', core_goal: '', plot: '', foreshadow: '', mood: '', order_index: outline.value.length + 1 }
}

async function saveNode() {
  if (!editing.value?.title) { ElMessage.warning('请填写标题'); return }
  await lingmo.invoke(lingmo.ACTIONS.OUTLINE_NODE_SAVE, { project_id: projectId.value, ...editing.value })
  editing.value = null; load()
}

async function removeNode(id: number) {
  await lingmo.invoke(lingmo.ACTIONS.OUTLINE_NODE_DELETE, { id }); load()
}

async function aiGenOutline() {
  busy.value = true
  const r = await lingmo.invoke(lingmo.ACTIONS.AI_GENERATE_OUTLINE, { project_id: projectId.value, hint: '请生成本作品的分卷大纲和主要章节要点' })
  aiDraft.value = r.ok && r.data ? (typeof r.data === 'string' ? r.data : r.data.text) : '失败'
  busy.value = false
}

onMounted(load)
</script>

<template>
  <div style="height:100%;overflow:auto;background:var(--bg)">
    <div class="page-header"><h2>大纲创作</h2><p>分层次结构管理小说大纲；AI 可根据设定自动生成分章要点。</p></div>
    <div style="padding:16px 28px 60px;max-width:1400px;margin:0 auto">
      <div class="card between">
        <span class="muted">共 {{ outline.length }} 条节点</span>
        <div class="flex gap-12">
          <el-button @click="addRoot">+ 新增节点</el-button>
          <el-button type="primary" @click="aiGenOutline" :loading="busy">AI 生成大纲</el-button>
        </div>
      </div>
      <div class="card mt-16" v-if="aiDraft">
        <b>AI 草稿</b>
        <pre style="white-space:pre-wrap;background:var(--surface-2);padding:12px;border-radius:8px;margin-top:10px">{{ aiDraft }}</pre>
      </div>
      <el-table :data="outline" class="mt-16 card">
        <el-table-column prop="title" label="标题" width="220" />
        <el-table-column prop="summary" label="剧情走向" />
        <el-table-column prop="core_goal" label="核心目标" width="200" />
        <el-table-column prop="order_index" label="顺序" width="80" />
        <el-table-column label="操作" width="160">
          <template #default="{ row }">
            <el-button size="small" @click="editing = { ...row }">编辑</el-button>
            <el-button size="small" type="danger" @click="removeNode(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="editing" :title="editing && editing.id ? '编辑节点' : '新增节点'" width="680px">
      <template v-if="editing">
        <el-form label-width="90px">
          <el-form-item label="标题"><el-input v-model="editing.title" /></el-form-item>
          <el-form-item label="核心目标"><el-input v-model="editing.core_goal" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="剧情走向"><el-input v-model="editing.summary" type="textarea" :rows="3" /></el-form-item>
          <el-form-item label="爽点 / 情绪"><el-input v-model="editing.mood" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="预埋伏笔"><el-input v-model="editing.foreshadow" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="顺序"><el-input-number v-model="editing.order_index" /></el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="editing = null">取消</el-button>
        <el-button type="primary" @click="saveNode">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
