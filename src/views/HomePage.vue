<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useMaterialStore } from '@/stores/material'
import { useGeneratorStore } from '@/stores/generator'
import { FolderOpen, Sparkles, BookOpen, FileText } from 'lucide-vue-next'

const router = useRouter()
const projectStore = useProjectStore()
const materialStore = useMaterialStore()
const generatorStore = useGeneratorStore()

const loading = ref(true)

onMounted(async () => {
  await Promise.all([
    projectStore.fetchProjects(),
    materialStore.fetchGlobalMaterials(),
    materialStore.fetchMaterials(),
    generatorStore.fetchGenerators()
  ])
  loading.value = false
})

const recentProjects = () => projectStore.sortedProjects.slice(0, 6)

function quickStartProject() {
  router.push({ name: 'projects' })
}

function openProject(p: any) {
  projectStore.setCurrentProject(p)
  router.push({ name: 'creation', params: { projectId: p.id } })
}
</script>

<template>
  <div class="home-page">
    <!-- 欢迎横幅 -->
    <div class="hero">
      <div class="hero-content">
        <h1 class="hero-title">灵墨小说工坊</h1>
        <p class="hero-subtitle">AI 智能创作助手 · 大纲规划 · 素材管理 · 智能生成</p>
        <div class="hero-actions">
          <el-button type="primary" size="large" @click="quickStartProject">
            <el-icon><Sparkles /></el-icon>开始创作
          </el-button>
          <el-button size="large" @click="router.push({ name: 'material-center' })">
            <el-icon><BookOpen /></el-icon>素材中心
          </el-button>
          <el-button size="large" @click="router.push({ name: 'templates' })">
            <el-icon><FileText /></el-icon>爆文模板
          </el-button>
        </div>
      </div>
    </div>

    <!-- 统计卡片 -->
    <el-row :gutter="20" class="stats-row">
      <el-col :span="8">
        <div class="stat-card" @click="router.push({ name: 'projects' })">
          <div class="stat-icon projects">
            <FolderOpen />
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ projectStore.projects.length }}</div>
            <div class="stat-label">我的项目</div>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="stat-card" @click="router.push({ name: 'material-center' })">
          <div class="stat-icon materials">
            <BookOpen />
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ materialStore.materials.length + materialStore.globalMaterials.length }}</div>
            <div class="stat-label">素材总数</div>
          </div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="stat-card" @click="router.push({ name: 'material-center' })">
          <div class="stat-icon generators">
            <Sparkles />
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ generatorStore.generators.length }}</div>
            <div class="stat-label">AI生成器</div>
          </div>
        </div>
      </el-col>
    </el-row>

    <!-- 最近项目 -->
    <div class="recent-section">
      <h2 class="section-title">最近项目</h2>
      <el-row :gutter="16" v-if="projectStore.projects.length > 0">
        <el-col v-for="p in recentProjects()" :key="p.id" :span="8">
          <div class="project-card" @click="openProject(p)">
            <div class="project-card-header">
              <span class="project-title">{{ p.name }}</span>
              <el-tag size="small" type="primary">{{ p.settings?.genre || '玄幻' }}</el-tag>
            </div>
            <p class="project-desc">{{ p.description || '暂无描述...' }}</p>
            <div class="project-meta">
              <span>更新于 {{ new Date(p.updatedAt || p.createdAt).toLocaleDateString() }}</span>
            </div>
          </div>
        </el-col>
      </el-row>
      <el-empty v-else description="还没有项目，点击右上角'开始创作'创建你的第一个小说项目">
        <el-button type="primary" @click="quickStartProject">创建项目</el-button>
      </el-empty>
    </div>

    <!-- 快捷入口 -->
    <div class="quick-section">
      <h2 class="section-title">快捷入口</h2>
      <el-row :gutter="16">
        <el-col :span="6">
          <div class="quick-card" @click="router.push({ name: 'projects' })">
            <el-icon class="quick-icon"><FolderOpen /></el-icon>
            <span>项目管理</span>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="quick-card" @click="router.push({ name: 'material-center' })">
            <el-icon class="quick-icon"><BookOpen /></el-icon>
            <span>素材管理</span>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="quick-card" @click="router.push({ name: 'creation' })">
            <el-icon class="quick-icon"><Sparkles /></el-icon>
            <span>AI创作</span>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="quick-card" @click="router.push({ name: 'templates' })">
            <el-icon class="quick-icon"><FileText /></el-icon>
            <span>爆文模板</span>
          </div>
        </el-col>
      </el-row>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 20px 40px;
}

.hero {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  padding: 50px 40px;
  margin-bottom: 30px;
  color: #fff;
  text-align: center;
  box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
}

.hero-title {
  font-size: 42px;
  font-weight: 700;
  margin: 0 0 12px 0;
  color: #fff;
  letter-spacing: 2px;
}

.hero-subtitle {
  font-size: 16px;
  opacity: 0.9;
  margin: 0 0 28px 0;
}

.hero-actions {
  display: flex;
  justify-content: center;
  gap: 14px;
}

.hero-actions .el-button {
  font-size: 15px;
  padding: 18px 28px;
}

.stats-row {
  margin-bottom: 40px;
}

.stat-card {
  background: #fff;
  border-radius: 14px;
  padding: 28px;
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
  width: 64px;
  height: 64px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 30px;
  margin-right: 20px;
}

.stat-icon.projects { background: linear-gradient(135deg, #667eea, #764ba2); }
.stat-icon.materials { background: linear-gradient(135deg, #11998e, #38ef7d); }
.stat-icon.generators { background: linear-gradient(135deg, #f093fb, #f5576c); }

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: #1a1a2e;
  line-height: 1.2;
}

.stat-label {
  font-size: 14px;
  color: #888;
  margin-top: 4px;
}

.section-title {
  font-size: 20px;
  color: #1a1a2e;
  margin: 0 0 20px 0;
  padding-left: 14px;
  border-left: 4px solid #667eea;
}

.recent-section {
  margin-bottom: 40px;
}

.project-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  border: 1px solid #f0f0f5;
  margin-bottom: 16px;
}

.project-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.15);
  border-color: #c8c8ff;
}

.project-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.project-title {
  font-weight: 600;
  color: #1a1a2e;
  font-size: 16px;
}

.project-desc {
  color: #666;
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 14px;
  min-height: 40px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.project-meta {
  font-size: 12px;
  color: #aaa;
  border-top: 1px dashed #eee;
  padding-top: 10px;
}

.quick-section {
  margin-bottom: 40px;
}

.quick-card {
  background: #fff;
  border-radius: 12px;
  padding: 30px 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  color: #666;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.quick-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.15);
  color: #667eea;
}

.quick-icon {
  font-size: 36px;
  color: #667eea;
}
</style>
