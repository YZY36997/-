<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import {
  Document,
  FolderOpened,
  Collection,
  Edit,
  Files,
  Setting,
  Promotion,
  HomeFilled,
  Plus
} from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const projectStore = useProjectStore()

const isCollapse = ref(false)

const activeMenu = computed(() => route.name as string)

const menuItems = [
  { name: 'home', label: '首页', icon: HomeFilled, path: '/' },
  { name: 'projects', label: '我的项目', icon: FolderOpened, path: '/projects' },
  { name: 'material-center', label: '素材与生成中心', icon: Collection, path: '/material-center' },
  { name: 'templates', label: '爆文模板', icon: Files, path: '/templates' },
  { name: 'settings', label: '设置', icon: Setting, path: '/settings' }
]

function handleMenuSelect(name: string) {
  router.push({ name })
}

onMounted(() => {
  projectStore.fetchProjects()
})
</script>

<template>
  <el-container class="main-layout">
    <!-- 左侧导航 -->
    <el-aside :width="isCollapse ? '64px' : '220px'" class="aside">
      <div class="logo" :class="{ collapsed: isCollapse }">
        <Edit v-if="isCollapse" class="logo-icon" />
        <template v-else>
          <Edit class="logo-icon" />
          <span class="logo-text">灵墨小说工坊</span>
        </template>
      </div>

      <el-menu
        :default-active="activeMenu"
        :collapse="isCollapse"
        :collapse-transition="false"
        class="aside-menu"
        @select="handleMenuSelect"
      >
        <el-menu-item v-for="item in menuItems" :key="item.name" :index="item.name">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.label }}</template>
        </el-menu-item>
      </el-menu>

      <!-- 项目列表 -->
      <div v-if="projectStore.projects.length > 0 && !isCollapse" class="project-list">
        <div class="project-list-header">
          <span>最近项目</span>
        </div>
        <div
          v-for="project in projectStore.sortedProjects.slice(0, 5)"
          :key="project.id"
          class="project-item"
          @click="router.push({ name: 'creation', params: { projectId: project.id } })"
        >
          <Document class="project-icon" />
          <span class="project-name">{{ project.name }}</span>
        </div>
      </div>
    </el-aside>

    <!-- 主内容区 -->
    <el-container>
      <!-- 顶部工具栏 -->
      <el-header class="header">
        <div class="header-left">
          <el-button text @click="isCollapse = !isCollapse">
            <el-icon size="20"><FolderOpened /></el-icon>
          </el-button>
        </div>
        <div class="header-right">
          <el-button type="primary" @click="router.push({ name: 'projects' })">
            <el-icon><Plus /></el-icon>
            新建项目
          </el-button>
        </div>
      </el-header>

      <!-- 内容区 -->
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.main-layout {
  height: 100vh;
}

.aside {
  background: #1a1a2e;
  transition: width 0.3s;
  display: flex;
  flex-direction: column;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  padding: 0 20px;
  color: #fff;
  border-bottom: 1px solid #2a2a4e;
}

.logo.collapsed {
  padding: 0;
  justify-content: center;
}

.logo-icon {
  font-size: 24px;
  color: #7ecfff;
}

.logo-text {
  margin-left: 12px;
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
}

.aside-menu {
  border-right: none;
  background: transparent;
}

:deep(.el-menu-item) {
  color: #a0a0c0;
}

:deep(.el-menu-item:hover),
:deep(.el-menu-item.is-active) {
  background: #2a2a4e;
  color: #fff;
}

.project-list {
  margin-top: auto;
  padding: 12px 0;
  border-top: 1px solid #2a2a4e;
}

.project-list-header {
  padding: 8px 20px;
  color: #606080;
  font-size: 12px;
}

.project-item {
  display: flex;
  align-items: center;
  padding: 8px 20px;
  cursor: pointer;
  color: #a0a0c0;
  transition: all 0.2s;
}

.project-item:hover {
  background: #2a2a4e;
  color: #fff;
}

.project-icon {
  font-size: 14px;
  margin-right: 8px;
}

.project-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header {
  background: #fff;
  border-bottom: 1px solid #eee;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.main {
  background: #f5f5f8;
  padding: 20px;
}
</style>
