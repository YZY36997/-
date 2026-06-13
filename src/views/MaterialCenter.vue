<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useMaterialStore } from '@/stores/material'
import { useGeneratorStore } from '@/stores/generator'
import { ElMessage } from 'element-plus'
import {
  FolderOpened,
  Collection,
  Edit,
  Delete,
  Plus,
  Search,
  Refresh,
  Connection
} from '@element-plus/icons-vue'

const route = useRoute()
const projectStore = useProjectStore()
const materialStore = useMaterialStore()
const generatorStore = useGeneratorStore()

const leftTab = ref('global')
const categoryTab = ref('all')
const viewMode = ref('list')

const materialDialogVisible = ref(false)
const generatorDialogVisible = ref(false)
const selectedMaterial = ref<any>(null)
const selectedGenerator = ref<any>(null)

const generatorForm = ref({
  name: '',
  category: 'tool',
  description: '',
  systemPrompt: '',
  userPromptTemplate: ''
})

const materialForm = ref({
  name: '',
  category: 'setting',
  subCategory: '',
  content: '',
  tags: [] as string[]
})

const categories = [
  { id: 'all', name: '全部' },
  { id: 'worldview', name: '世界观' },
  { id: 'character', name: '人物' },
  { id: 'scene', name: '场景' },
  { id: 'plot', name: '剧情' },
  { id: 'setting', name: '设定' }
]

const generatorCategories = [
  { id: 'all', name: '全部' },
  { id: 'worldview', name: '世界观设定' },
  { id: 'character', name: '人物角色' },
  { id: 'plot', name: '剧情桥段' },
  { id: 'copywriting', name: '文案包装' },
  { id: 'tool', name: '辅助工具' }
]

const filteredMaterials = computed(() => {
  let materials = leftTab.value === 'global'
    ? materialStore.globalMaterials
    : materialStore.materials

  if (categoryTab.value !== 'all') {
    materials = materials.filter((m: any) => m.category === categoryTab.value)
  }

  return materials
})

const filteredGenerators = computed(() => {
  let generators = generatorStore.generators

  if (categoryTab.value !== 'all') {
    generators = generators.filter((g: any) => g.category === categoryTab.value)
  }

  return generators
})

onMounted(async () => {
  await projectStore.fetchProjects()
  await materialStore.fetchGlobalMaterials()
  await materialStore.fetchMaterials()
  await generatorStore.fetchGenerators()
  await generatorStore.fetchCategories()

  if (projectStore.currentProject) {
    leftTab.value = 'project'
  }
})

watch(() => projectStore.currentProject, (project) => {
  if (project) {
    leftTab.value = 'project'
    materialStore.fetchMaterials(project.id)
  }
})

function openMaterialDialog(material?: any) {
  if (material) {
    selectedMaterial.value = material
    materialForm.value = {
      name: material.name,
      category: material.category,
      subCategory: material.subCategory || '',
      content: material.content,
      tags: material.tags || []
    }
  } else {
    selectedMaterial.value = null
    materialForm.value = {
      name: '',
      category: 'setting',
      subCategory: '',
      content: '',
      tags: []
    }
  }
  materialDialogVisible.value = true
}

async function saveMaterial() {
  const data: any = {
    ...materialForm.value,
    project_id: leftTab.value === 'project' && projectStore.currentProject
      ? projectStore.currentProject.id
      : null
  }

  if (selectedMaterial.value) {
    await materialStore.updateMaterial(selectedMaterial.value.id, data)
    ElMessage.success('素材更新成功')
  } else {
    await materialStore.createMaterial(data)
    ElMessage.success('素材创建成功')
  }
  materialDialogVisible.value = false
}

async function deleteMaterial(material: any) {
  await materialStore.deleteMaterial(material.id)
  ElMessage.success('素材已删除')
}

function openGeneratorDialog(generator?: any) {
  if (generator) {
    selectedGenerator.value = generator
    generatorForm.value = {
      name: generator.name,
      category: generator.category,
      description: generator.description,
      systemPrompt: generator.systemPrompt,
      userPromptTemplate: generator.userPromptTemplate
    }
  } else {
    selectedGenerator.value = null
    generatorForm.value = {
      name: '',
      category: 'tool',
      description: '',
      systemPrompt: '',
      userPromptTemplate: ''
    }
  }
  generatorDialogVisible.value = true
}

async function saveGenerator() {
  if (selectedGenerator.value) {
    await generatorStore.updateGenerator(selectedGenerator.value.id, generatorForm.value)
    ElMessage.success('生成器更新成功')
  } else {
    await generatorStore.createGenerator(generatorForm.value)
    ElMessage.success('生成器创建成功')
  }
  generatorDialogVisible.value = false
}

async function deleteGenerator(generator: any) {
  if (!generator.isCustom) {
    ElMessage.warning('只能删除自定义生成器')
    return
  }
  await generatorStore.deleteGenerator(generator.id)
  ElMessage.success('生成器已删除')
}

function useMaterialInGenerator(material: any) {
  selectedGenerator.value = null
  generatorDialogVisible.value = true
  ElMessage.info('请选择生成器并使用该素材作为上下文')
}
</script>

<template>
  <div class="material-center">
    <!-- 左侧导航 -->
    <div class="left-nav">
      <div class="nav-section">
        <div class="nav-title">素材库</div>
        <el-radio-group v-model="leftTab" class="source-group">
          <el-radio-button value="global">
            <el-icon><Connection /></el-icon>
            全局素材
          </el-radio-button>
          <el-radio-button v-if="projectStore.currentProject" value="project">
            <el-icon><FolderOpened /></el-icon>
            项目素材
          </el-radio-button>
        </el-radio-group>
      </div>

      <div class="nav-section">
        <div class="nav-title">分类筛选</div>
        <el-menu :default-active="categoryTab" class="category-menu">
          <el-menu-item v-for="cat in categories" :key="cat.id" :index="cat.id" @click="categoryTab = cat.id">
            {{ cat.name }}
          </el-menu-item>
        </el-menu>
      </div>
    </div>

    <!-- 中间列表 -->
    <div class="center-content">
      <div class="content-header">
        <h2 class="content-title">
          {{ leftTab === 'global' ? '全局素材库' : '项目素材库' }}
        </h2>
        <div class="content-actions">
          <el-input placeholder="搜索素材..." :prefix-icon="Search" style="width: 200px" />
          <el-button type="primary" @click="openMaterialDialog()">
            <el-icon><Plus /></el-icon>
            新建素材
          </el-button>
        </div>
      </div>

      <el-empty v-if="filteredMaterials.length === 0" description="暂无素材" />

      <div v-else class="material-list">
        <el-card
          v-for="material in filteredMaterials"
          :key="material.id"
          class="material-card"
          shadow="hover"
        >
          <template #header>
            <div class="material-header">
              <span class="material-name">{{ material.name }}</span>
              <el-tag size="small">{{ material.category }}</el-tag>
            </div>
          </template>
          <div class="material-content">
            <p class="material-text">{{ material.content }}</p>
            <div class="material-tags" v-if="material.tags?.length">
              <el-tag v-for="tag in material.tags" :key="tag" size="small">{{ tag }}</el-tag>
            </div>
          </div>
          <template #footer>
            <div class="material-actions">
              <el-button type="primary" link @click="openMaterialDialog(material)">编辑</el-button>
              <el-button type="danger" link @click="deleteMaterial(material)">删除</el-button>
            </div>
          </template>
        </el-card>
      </div>
    </div>

    <!-- 右侧生成器面板 -->
    <div class="right-panel">
      <div class="panel-header">
        <h3 class="panel-title">AI生成器</h3>
        <el-button size="small" @click="openGeneratorDialog()">
          <el-icon><Plus /></el-icon>
          自定义
        </el-button>
      </div>

      <el-tabs>
        <el-tab-pane v-for="cat in generatorCategories" :key="cat.id" :label="cat.name">
          <div class="generator-list">
            <div
              v-for="gen in filteredGenerators.filter(g => cat.id === 'all' || g.category === cat.id)"
              :key="gen.id"
              class="generator-item"
              @click="openGeneratorDialog(gen)"
            >
              <div class="generator-name">{{ gen.name }}</div>
              <div class="generator-desc">{{ gen.description }}</div>
              <el-tag v-if="gen.isCustom" size="small" type="warning">自定义</el-tag>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 素材编辑对话框 -->
    <el-dialog v-model="materialDialogVisible" :title="selectedMaterial ? '编辑素材' : '新建素材'" width="600px">
      <el-form :model="materialForm" label-width="80px">
        <el-form-item label="素材名称" required>
          <el-input v-model="materialForm.name" placeholder="请输入素材名称" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="materialForm.category">
            <el-option v-for="cat in categories.slice(1)" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="子分类">
          <el-input v-model="materialForm.subCategory" placeholder="如：宗门、功法等" />
        </el-form-item>
        <el-form-item label="素材内容" required>
          <el-input v-model="materialForm.content" type="textarea" :rows="6" placeholder="请输入素材内容" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="materialDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveMaterial">保存</el-button>
      </template>
    </el-dialog>

    <!-- 生成器编辑对话框 -->
    <el-dialog v-model="generatorDialogVisible" :title="selectedGenerator ? '生成器详情' : '创建自定义生成器'" width="700px">
      <el-form :model="generatorForm" label-width="100px">
        <el-form-item label="生成器名称" required>
          <el-input v-model="generatorForm.name" placeholder="请输入生成器名称" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="generatorForm.category">
            <el-option v-for="cat in generatorCategories.slice(1)" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="generatorForm.description" placeholder="请输入生成器描述" />
        </el-form-item>
        <el-form-item label="系统提示词">
          <el-input v-model="generatorForm.systemPrompt" type="textarea" :rows="4" placeholder="请输入系统提示词" />
        </el-form-item>
        <el-form-item label="用户模板">
          <el-input v-model="generatorForm.userPromptTemplate" type="textarea" :rows="4" placeholder="请输入用户提示模板，使用{变量名}占位" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button v-if="selectedGenerator?.isCustom" type="danger" @click="deleteGenerator(selectedGenerator)">删除</el-button>
        <el-button @click="generatorDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveGenerator">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.material-center {
  display: flex;
  height: calc(100vh - 100px);
  gap: 16px;
}

.left-nav {
  width: 200px;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  flex-shrink: 0;
}

.nav-section {
  margin-bottom: 20px;
}

.nav-title {
  font-size: 14px;
  color: #999;
  margin-bottom: 12px;
}

.source-group {
  display: flex;
  flex-direction: column;
}

.source-group :deep(.el-radio-button) {
  margin-bottom: 8px;
}

.source-group :deep(.el-radio-button__inner) {
  width: 100%;
  border-radius: 4px;
}

.category-menu {
  border-right: none;
}

.center-content {
  flex: 1;
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  overflow-y: auto;
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.content-title {
  font-size: 18px;
  color: #333;
  margin: 0;
}

.content-actions {
  display: flex;
  gap: 12px;
}

.material-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.material-card {
  margin-bottom: 0;
}

.material-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.material-name {
  font-weight: 600;
  color: #333;
}

.material-content {
  min-height: 80px;
}

.material-text {
  color: #666;
  font-size: 14px;
  margin-bottom: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.material-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.material-actions {
  display: flex;
  gap: 8px;
}

.right-panel {
  width: 300px;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.panel-title {
  font-size: 16px;
  color: #333;
  margin: 0;
}

.generator-list {
  max-height: 500px;
  overflow-y: auto;
}

.generator-item {
  padding: 12px;
  border: 1px solid #eee;
  border-radius: 4px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.generator-item:hover {
  border-color: #667eea;
  background: #f8f8ff;
}

.generator-name {
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.generator-desc {
  font-size: 12px;
  color: #999;
}
</style>
