<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { lingmo } from '@/api/lingmo'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const projectId = ref<number | null>(null)
const tab = ref('project')

const project = ref<any>({ name: '', genre: '', summary: '', core_conflict: '', writing_style: '' })
const worldview = ref<any>({ world_rules: '', timeline: '', regions: '', power_system: '', terminology: '' })
const foreshadow = ref<any[]>([])
const foreshadowForm = ref<any>({ title: '', content: '', status: 'planted', chapter_id: null })

async function load() {
  const pid = route.params.projectId ? Number(route.params.projectId) : ui.currentProjectId
  if (!pid) { router.push('/home'); return }
  projectId.value = pid
  const [r1, r2, r3, r4] = await Promise.all([
    lingmo.invoke(lingmo.ACTIONS.PROJECT_GET, { id: pid }),
    lingmo.invoke(lingmo.ACTIONS.PROJECT_SETTINGS_GET, { project_id: pid }),
    lingmo.invoke(lingmo.ACTIONS.WORLDVIEW_GET, { project_id: pid }),
    lingmo.invoke(lingmo.ACTIONS.FORESHADOW_LIST, { project_id: pid })
  ])
  project.value = r1.ok && r1.data ? r1.data : project.value
  if (r1.ok && r1.data) ui.setProject(pid, r1.data.name)
  if (r2.ok && r2.data) Object.assign(project.value, r2.data)
  if (r3.ok && r3.data) worldview.value = { ...worldview.value, ...r3.data }
  foreshadow.value = r4.ok ? (r4.data || []) : []
}

async function saveProject() {
  await lingmo.invoke(lingmo.ACTIONS.PROJECT_UPDATE, { id: projectId.value, ...project.value })
  await lingmo.invoke(lingmo.ACTIONS.PROJECT_SETTINGS_SAVE, { project_id: projectId.value, ...project.value })
  ElMessage.success('已保存')
}

async function saveWorldview() {
  await lingmo.invoke(lingmo.ACTIONS.WORLDVIEW_SAVE, { project_id: projectId.value, ...worldview.value })
  ElMessage.success('已保存')
}

async function addForeshadow() {
  if (!foreshadowForm.value.title.trim()) return
  await lingmo.invoke(lingmo.ACTIONS.FORESHADOW_CREATE, { project_id: projectId.value, ...foreshadowForm.value })
  foreshadowForm.value = { title: '', content: '', status: 'planted', chapter_id: null }
  load()
}
async function removeForeshadow(id: number) {
  await lingmo.invoke(lingmo.ACTIONS.FORESHADOW_DELETE, { id })
  load()
}

const statusMap: Record<string, string> = { planted: '已埋设', active: '激活中', resolved: '已回收' }

onMounted(load)
</script>

<template>
  <div class="hub-page" style="height:100%;overflow:auto">
    <div class="page-header">
      <h2>设定中枢 · {{ project.name || '加载中' }}</h2>
      <p>统一管理世界观、角色、势力、功法、伏笔等设定，AI 生成时自动读取。</p>
    </div>
    <div style="padding:16px 28px 40px;max-width:1400px;margin:0 auto">
      <el-tabs v-model="tab">
        <el-tab-pane label="项目总设定" name="project">
          <div class="card">
            <el-form label-width="120px">
              <el-form-item label="作品名称"><el-input v-model="project.name" /></el-form-item>
              <el-form-item label="题材"><el-input v-model="project.genre" /></el-form-item>
              <el-form-item label="故事核心卖点"><el-input v-model="project.summary" type="textarea" :rows="2" /></el-form-item>
              <el-form-item label="核心冲突 / 钩子"><el-input v-model="project.core_conflict" type="textarea" :rows="3" /></el-form-item>
              <el-form-item label="文风要求"><el-input v-model="project.writing_style" type="textarea" :rows="3" placeholder="例如：古风、节奏紧凑、对话自然" /></el-form-item>
            </el-form>
            <el-button type="primary" @click="saveProject">保存</el-button>
          </div>
        </el-tab-pane>

        <el-tab-pane label="世界观 / 势力 / 功法" name="world">
          <div class="card">
            <el-form label-width="120px">
              <el-form-item label="世界基础规则"><el-input v-model="worldview.world_rules" type="textarea" :rows="3" /></el-form-item>
              <el-form-item label="时间线"><el-input v-model="worldview.timeline" type="textarea" :rows="3" /></el-form-item>
              <el-form-item label="地域划分"><el-input v-model="worldview.regions" type="textarea" :rows="3" /></el-form-item>
              <el-form-item label="力量体系 / 功法"><el-input v-model="worldview.power_system" type="textarea" :rows="4" /></el-form-item>
              <el-form-item label="专属术语"><el-input v-model="worldview.terminology" type="textarea" :rows="3" /></el-form-item>
            </el-form>
            <el-button type="primary" @click="saveWorldview">保存</el-button>
          </div>
        </el-tab-pane>

        <el-tab-pane label="伏笔追踪" name="foreshadow">
          <div class="card">
            <el-form :inline="true" label-width="70px">
              <el-form-item label="标题"><el-input v-model="foreshadowForm.title" style="width:220px" /></el-form-item>
              <el-form-item label="状态">
                <el-select v-model="foreshadowForm.status" style="width:140px">
                  <el-option label="已埋设" value="planted" />
                  <el-option label="激活中" value="active" />
                  <el-option label="已回收" value="resolved" />
                </el-select>
              </el-form-item>
            </el-form>
            <el-input v-model="foreshadowForm.content" type="textarea" :rows="3" placeholder="伏笔内容 / 关联章节 / 回收方式..." />
            <el-button type="primary" style="margin-top:12px" @click="addForeshadow">添加伏笔</el-button>

            <el-table :data="foreshadow" class="mt-16">
              <el-table-column prop="title" label="标题" width="180" />
              <el-table-column prop="content" label="内容" />
              <el-table-column prop="status" label="状态" width="120">
                <template #default="{ row }"><el-tag :type="row.status==='resolved'?'success':row.status==='active'?'warning':'info'">{{ statusMap[row.status] || row.status }}</el-tag></template>
              </el-table-column>
              <el-table-column label="操作" width="120">
                <template #default="{ row }"><el-button size="small" type="danger" @click="removeForeshadow(row.id)">删除</el-button></template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<style scoped>
.hub-page { background: var(--bg); }
</style>
