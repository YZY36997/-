<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useProjectStore } from '@/stores/project'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Document } from '@element-plus/icons-vue'

const projectStore = useProjectStore()

const dialogVisible = ref(false)
const formData = ref({
  name: '',
  description: '',
  genre: '玄幻',
  style: '爽文风'
})

const genreOptions = [
  { label: '玄幻', value: '玄幻' },
  { label: '仙侠', value: '仙侠' },
  { label: '都市', value: '都市' },
  { label: '古代言情', value: '古言' },
  { label: '现代言情', value: '现言' },
  { label: '悬疑', value: '悬疑' },
  { label: '科幻', value: '科幻' }
]

const styleOptions = [
  { label: '爽文风', value: '爽文风' },
  { label: '剧情流', value: '剧情流' },
  { label: '人设向', value: '人设向' }
]

onMounted(() => {
  projectStore.fetchProjects()
})

function openCreateDialog() {
  formData.value = {
    name: '',
    description: '',
    genre: '玄幻',
    style: '爽文风'
  }
  dialogVisible.value = true
}

async function createProject() {
  if (!formData.value.name.trim()) {
    ElMessage.warning('请输入项目名称')
    return
  }

  const result = await projectStore.createProject({
    name: formData.value.name,
    description: formData.value.description,
    settings: {
      genre: formData.value.genre,
      style: formData.value.style
    },
    outline: {
      title: '',
      summary: '',
      chapters: []
    }
  })

  if (result) {
    ElMessage.success('项目创建成功')
    dialogVisible.value = false
  }
}

async function deleteProject(project: any) {
  try {
    await ElMessageBox.confirm(
      `确定要删除项目「${project.name}」吗？此操作不可恢复。`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    const success = await projectStore.deleteProject(project.id)
    if (success) {
      ElMessage.success('项目已删除')
    }
  } catch {
    // 用户取消
  }
}

function openProject(project: any) {
  projectStore.setCurrentProject(project)
}
</script>

<template>
  <div class="project-list-page">
    <div class="page-header">
      <h1 class="page-title">我的项目</h1>
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon>
        新建项目
      </el-button>
    </div>

    <el-empty v-if="projectStore.projects.length === 0" description="还没有项目">
      <el-button type="primary" @click="openCreateDialog">创建第一个项目</el-button>
    </el-empty>

    <el-row v-else :gutter="20">
      <el-col v-for="project in projectStore.sortedProjects" :key="project.id" :span="8">
        <el-card class="project-card" shadow="hover">
          <template #header>
            <div class="project-header">
              <span class="project-name">{{ project.name }}</span>
              <el-tag size="small">{{ project.settings?.genre }}</el-tag>
            </div>
          </template>
          <div class="project-content">
            <p class="project-desc">{{ project.description || '暂无描述' }}</p>
            <div class="project-info">
              <span class="info-item">
                <el-icon><Document /></el-icon>
                {{ project.outline?.chapters?.length || 0 }} 章节
              </span>
              <span class="info-item">
                更新于 {{ new Date(project.updatedAt).toLocaleDateString() }}
              </span>
            </div>
          </div>
          <template #footer>
            <div class="project-actions">
              <el-button type="primary" link @click="openProject(project); $router.push({ name: 'creation', params: { projectId: project.id } })">
                打开
              </el-button>
              <el-button type="danger" link @click="deleteProject(project)">
                删除
              </el-button>
            </div>
          </template>
        </el-card>
      </el-col>
    </el-row>

    <!-- 创建项目对话框 -->
    <el-dialog v-model="dialogVisible" title="创建新项目" width="500px">
      <el-form :model="formData" label-width="80px">
        <el-form-item label="项目名称" required>
          <el-input v-model="formData.name" placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input v-model="formData.description" type="textarea" :rows="3" placeholder="请输入项目描述" />
        </el-form-item>
        <el-form-item label="题材类型">
          <el-select v-model="formData.genre" placeholder="请选择题材">
            <el-option v-for="item in genreOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="创作风格">
          <el-select v-model="formData.style" placeholder="请选择风格">
            <el-option v-for="item in styleOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="createProject">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.project-list-page {
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

.project-card {
  margin-bottom: 20px;
}

.project-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.project-name {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.project-content {
  min-height: 100px;
}

.project-desc {
  color: #666;
  font-size: 14px;
  margin-bottom: 16px;
}

.project-info {
  display: flex;
  gap: 16px;
  color: #999;
  font-size: 12px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.project-actions {
  display: flex;
  justify-content: space-between;
}
</style>
