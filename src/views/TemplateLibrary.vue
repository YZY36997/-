<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Refresh, Star, CopyDocument, FolderOpened } from '@element-plus/icons-vue'

const router = useRouter()
const projectStore = useProjectStore()

const templates = ref<any[]>([])
const loading = ref(false)
const genreFilter = ref('')
const functionFilter = ref('')

const genres = [
  { label: '全部题材', value: '' },
  { label: '玄幻', value: '玄幻' },
  { label: '仙侠', value: '仙侠' },
  { label: '都市', value: '都市' },
  { label: '古代言情', value: '古言' },
  { label: '现代言情', value: '现言' }
]

const functions = [
  { label: '全部功能', value: '' },
  { label: '开局', value: '开局' },
  { label: '反转', value: '反转' },
  { label: '高潮', value: '高潮' },
  { label: '收尾', value: '收尾' }
]

const filteredTemplates = computed(() => {
  return templates.value.filter(t => {
    if (genreFilter.value && t.genre !== genreFilter.value) return false
    if (functionFilter.value && t.function !== functionFilter.value) return false
    return true
  })
})

onMounted(async () => {
  await fetchTemplates()
})

async function fetchTemplates() {
  loading.value = true
  try {
    const response = await axios.get('/api/templates')
    templates.value = response.data
  } catch (error) {
    console.error('获取模板失败:', error)
  } finally {
    loading.value = false
  }
}

async function toggleFavorite(template: any) {
  try {
    await axios.put(`/api/templates/${template.id}`, {
      isFavorite: !template.isFavorite
    })
    template.isFavorite = !template.isFavorite
  } catch (error) {
    ElMessage.error('操作失败')
  }
}

function copyTemplate(content: string) {
  navigator.clipboard.writeText(content)
  ElMessage.success('已复制到剪贴板')
}

async function importToProject(template: any) {
  if (!projectStore.currentProject && projectStore.projects.length > 0) {
    const action = await ElMessageBox({
      title: '选择项目',
      message: '请选择要导入的项目',
      confirmButtonText: '创建新项目',
      cancelButtonText: '取消'
    }).catch(() => 'cancel')

    if (action === 'confirm') {
      router.push({ name: 'projects' })
      return
    }
  }

  if (projectStore.currentProject) {
    ElMessage.success('已导入到当前项目')
    router.push({
      name: 'creation',
      params: { projectId: projectStore.currentProject.id }
    })
  } else {
    ElMessage.warning('请先创建或选择一个项目')
  }
}
</script>

<template>
  <div class="template-library">
    <div class="page-header">
      <h1 class="page-title">爆文模板库</h1>
      <div class="header-actions">
        <el-select v-model="genreFilter" placeholder="题材筛选" style="width: 120px">
          <el-option v-for="g in genres" :key="g.value" :label="g.label" :value="g.value" />
        </el-select>
        <el-select v-model="functionFilter" placeholder="功能筛选" style="width: 120px">
          <el-option v-for="f in functions" :key="f.value" :label="f.label" :value="f.value" />
        </el-select>
        <el-button @click="fetchTemplates">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>
    </div>

    <el-empty v-if="filteredTemplates.length === 0" description="暂无模板" />

    <el-row v-else :gutter="20">
      <el-col v-for="tpl in filteredTemplates" :key="tpl.id" :span="8">
        <el-card class="template-card" shadow="hover">
          <template #header>
            <div class="template-header">
              <div class="template-title">
                <el-tag size="small" type="success">{{ tpl.genre }}</el-tag>
                <el-tag size="small">{{ tpl.function }}</el-tag>
              </div>
              <el-button
                :type="tpl.isFavorite ? 'warning' : 'info'"
                link
                @click="toggleFavorite(tpl)"
              >
                <el-icon><Star /></el-icon>
              </el-button>
            </div>
          </template>
          <div class="template-content">
            <h4 class="template-name">{{ tpl.title }}</h4>
            <p class="template-text">{{ tpl.content }}</p>
          </div>
          <template #footer>
            <div class="template-actions">
              <el-button type="primary" link @click="copyTemplate(tpl.content)">
                <el-icon><CopyDocument /></el-icon>
                复制
              </el-button>
              <el-button type="primary" link @click="importToProject(tpl)">
                <el-icon><FolderOpened /></el-icon>
                导入项目
              </el-button>
            </div>
          </template>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.template-library {
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  color: #333;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.template-card {
  margin-bottom: 20px;
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.template-title {
  display: flex;
  gap: 8px;
}

.template-content {
  min-height: 150px;
}

.template-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin: 0 0 12px 0;
}

.template-text {
  font-size: 14px;
  color: #666;
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
}

.template-actions {
  display: flex;
  justify-content: space-around;
}
</style>
