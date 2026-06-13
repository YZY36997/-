<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { FolderOpened, Edit, Delete, Document } from '@element-plus/icons-vue'

const router = useRouter()
const projectStore = useProjectStore()

const stats = ref({
  totalProjects: 0,
  totalMaterials: 0,
  recentGenerations: 0
})

onMounted(async () => {
  await projectStore.fetchProjects()
  stats.value.totalProjects = projectStore.projects.length
})

function openProject(project: any) {
  projectStore.setCurrentProject(project)
  router.push({ name: 'creation', params: { projectId: project.id } })
}

function goToMaterialCenter() {
  router.push({ name: 'material-center' })
}

function goToCreation() {
  router.push({ name: 'creation' })
}

function goToTemplates() {
  router.push({ name: 'templates' })
}
</script>

<template>
  <div class="home-page">
    <div class="hero">
      <h1 class="hero-title">欢迎使用灵墨小说工坊</h1>
      <p class="hero-subtitle">AI智能小说创作工具，让你的创作更高效</p>
    </div>

    <el-row :gutter="20" class="stats-row">
      <el-col :span="8">
        <div class="stat-card" @click="router.push({ name: 'projects' })">
          <div class="stat-icon">
            <FolderOpened />
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalProjects }}</div>
            <div class="stat-label">我的项目</div>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="stat-card" @click="goToMaterialCenter">
          <div class="stat-icon">
            <Edit />
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalMaterials }}</div>
            <div class="stat-label">素材库</div>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="stat-card" @click="goToTemplates">
          <div class="stat-icon">
            <Document />
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.recentGenerations }}</div>
            <div class="stat-label">爆文模板</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <div class="quick-actions">
      <h2 class="section-title">快捷入口</h2>
      <el-row :gutter="16">
        <el-col :span="6">
          <div class="action-card" @click="router.push({ name: 'projects' })">
            <el-icon class="action-icon"><FolderOpened /></el-icon>
            <span class="action-text">项目管理</span>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="action-card" @click="goToMaterialCenter">
            <el-icon class="action-icon"><Edit /></el-icon>
            <span class="action-text">素材中心</span>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="action-card" @click="goToCreation">
            <el-icon class="action-icon"><Document /></el-icon>
            <span class="action-text">AI创作</span>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="action-card" @click="goToTemplates">
            <el-icon class="action-icon"><Document /></el-icon>
            <span class="action-text">爆文模板</span>
          </div>
        </el-col>
      </el-row>
    </div>

    <div v-if="projectStore.sortedProjects.length > 0" class="recent-projects">
      <h2 class="section-title">最近项目</h2>
      <el-row :gutter="16">
        <el-col v-for="project in projectStore.sortedProjects.slice(0, 4)" :key="project.id" :span="6">
          <el-card class="project-card" shadow="hover" @click="openProject(project)">
            <template #header>
              <div class="project-card-header">
                <span class="project-title">{{ project.name }}</span>
                <el-tag size="small">{{ project.settings?.genre || '玄幻' }}</el-tag>
              </div>
            </template>
            <div class="project-card-content">
              <p class="project-desc">{{ project.description || '暂无描述' }}</p>
              <div class="project-meta">
                <span>更新于 {{ new Date(project.updatedAt).toLocaleDateString() }}</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <div v-else class="empty-state">
      <el-empty description="还没有项目，创建一个开始你的创作之旅吧">
        <el-button type="primary" @click="router.push({ name: 'projects' })">
          创建项目
        </el-button>
      </el-empty>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  max-width: 1200px;
  margin: 0 auto;
}

.hero {
  text-align: center;
  padding: 40px 0;
}

.hero-title {
  font-size: 32px;
  color: #333;
  margin-bottom: 12px;
}

.hero-subtitle {
  font-size: 16px;
  color: #666;
}

.stats-row {
  margin-bottom: 40px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 24px;
  margin-right: 16px;
}

.stat-info {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: #333;
}

.stat-label {
  font-size: 14px;
  color: #999;
  margin-top: 4px;
}

.section-title {
  font-size: 18px;
  color: #333;
  margin-bottom: 16px;
  padding-left: 12px;
  border-left: 4px solid #667eea;
}

.quick-actions {
  margin-bottom: 40px;
}

.action-card {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
}

.action-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.action-icon {
  font-size: 32px;
  color: #667eea;
  margin-bottom: 8px;
}

.action-text {
  display: block;
  font-size: 14px;
  color: #666;
}

.recent-projects {
  margin-top: 40px;
}

.project-card {
  cursor: pointer;
  transition: all 0.3s;
  margin-bottom: 16px;
}

.project-card:hover {
  transform: translateY(-4px);
}

.project-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.project-title {
  font-weight: 600;
  color: #333;
}

.project-card-content {
  min-height: 80px;
}

.project-desc {
  color: #666;
  font-size: 14px;
  margin-bottom: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.project-meta {
  font-size: 12px;
  color: #999;
}

.empty-state {
  margin-top: 60px;
}
</style>
