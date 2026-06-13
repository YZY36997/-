<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useMaterialStore } from '@/stores/material'
import { useGeneratorStore } from '@/stores/generator'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Edit,
  FolderOpened,
  Refresh,
  Delete,
  Connection,
  Document,
  Plus
} from '@element-plus/icons-vue'

const route = useRoute()
const projectStore = useProjectStore()
const materialStore = useMaterialStore()
const generatorStore = useGeneratorStore()

const drawerVisible = ref(false)
const content = ref('')
const promptInput = ref('')
const generatedResult = ref('')
const withMaterialLink = ref(true)

const selectedGenerator = ref<any>(null)
const generatorParams = ref<Record<string, string>>({})
const generating = ref(false)
const categoryTag = ref('')

const currentProjectId = computed(() => route.params.projectId as string || null)

onMounted(async () => {
  await projectStore.fetchProjects()
  await materialStore.fetchGlobalMaterials()
  await materialStore.fetchMaterials()
  await generatorStore.fetchGenerators()
  await generatorStore.fetchCategories()

  if (currentProjectId.value) {
    await projectStore.fetchProject(currentProjectId.value)
    await materialStore.fetchMaterials(currentProjectId.value)
  }
})

watch(currentProjectId, async (newId) => {
  if (newId) {
    await projectStore.fetchProject(newId)
    await materialStore.fetchMaterials(newId)
  }
})

const projectMaterials = computed(() => {
  if (!currentProjectId.value) return []
  return materialStore.materials.filter(m => m.project_id === currentProjectId.value)
})

const projectCharacters = computed(() => {
  return projectMaterials.value.filter(m => m.category === 'character')
})

const projectWorldviews = computed(() => {
  return projectMaterials.value.filter(m => m.category === 'worldview')
})

function toggleDrawer() {
  drawerVisible.value = !drawerVisible.value
}

function insertMaterial(material: any) {
  content.value += `\n\n【${material.name}】\n${material.content}`
  ElMessage.success('已插入素材')
}

function injectToPrompt(material: any) {
  promptInput.value += `\n\n【${material.name}】\n${material.content}`
  ElMessage.success('已注入到提示词')
}

function selectGenerator(generator: any) {
  selectedGenerator.value = generator
  generatorParams.value = {}
  promptInput.value = generator.userPromptTemplate
}

async function startGenerate() {
  if (!selectedGenerator.value) {
    ElMessage.warning('请选择生成器')
    return
  }

  generating.value = true
  generatedResult.value = ''

  try {
    const result = await generatorStore.generate(
      selectedGenerator.value.id,
      generatorParams.value,
      currentProjectId.value || undefined,
      withMaterialLink.value
    )
    generatedResult.value = result.generated_text
    ElMessage.success('生成完成')
  } catch (error: any) {
    ElMessage.error(error.response?.data?.error || '生成失败')
  } finally {
    generating.value = false
  }
}

async function saveResultAsMaterial() {
  if (!generatedResult.value) {
    ElMessage.warning('没有可保存的内容')
    return
  }

  const name = await ElMessageBox.prompt('请输入素材名称', {
    inputValue: 'AI生成素材'
  }).then(({ value }) => value)

  if (name) {
    await materialStore.createMaterial({
      name,
      content: generatedResult.value,
      category: 'setting',
      project_id: currentProjectId.value
    })
    ElMessage.success('已保存到素材库')
  }
}
</script>

<template>
  <div class="creation-page">
    <!-- 顶部项目信息 -->
    <div v-if="projectStore.currentProject" class="project-bar">
      <div class="project-info">
        <el-icon><FolderOpened /></el-icon>
        <span class="project-name">{{ projectStore.currentProject.name }}</span>
        <el-tag size="small">{{ projectStore.currentProject.settings?.genre }}</el-tag>
      </div>
      <div class="project-actions">
        <el-switch
          v-model="withMaterialLink"
          active-text="素材联动"
          inactive-text=""
        />
        <el-button @click="toggleDrawer">
          <el-icon><Connection /></el-icon>
          素材面板
        </el-button>
      </div>
    </div>

    <div class="creation-content">
      <!-- 左侧创作区 -->
      <div class="editor-area">
        <el-tabs>
          <el-tab-pane label="正文创作">
            <el-input
              v-model="content"
              type="textarea"
              :rows="20"
              placeholder="在这里开始你的创作..."
              class="content-editor"
            />
          </el-tab-pane>
          <el-tab-pane label="提示词">
            <el-input
              v-model="promptInput"
              type="textarea"
              :rows="10"
              placeholder="输入AI生成提示词..."
              class="prompt-editor"
            />
          </el-tab-pane>
        </el-tabs>

        <!-- AI生成结果 -->
        <div v-if="generatedResult" class="generated-result">
          <div class="result-header">
            <span>生成结果</span>
            <el-button size="small" @click="saveResultAsMaterial">
              <el-icon><Document /></el-icon>
              保存为素材
            </el-button>
          </div>
          <el-input
            v-model="generatedResult"
            type="textarea"
            :rows="10"
            readonly
          />
        </div>
      </div>

      <!-- 右侧生成器面板 -->
      <div class="generator-panel">
        <h3 class="panel-title">AI生成器</h3>

        <div class="generator-categories">
          <el-tag
            v-for="cat in generatorStore.categories"
            :key="cat.id"
            :type="selectedGenerator?.category === cat.id ? 'primary' : 'info'"
            class="category-tag"
            @click="categoryTag = cat.id"
          >
            {{ cat.name }}
          </el-tag>
        </div>

        <div class="generator-list">
          <div
            v-for="gen in generatorStore.generators"
            :key="gen.id"
            class="generator-item"
            :class="{ active: selectedGenerator?.id === gen.id }"
            @click="selectGenerator(gen)"
          >
            <div class="generator-name">{{ gen.name }}</div>
            <div class="generator-desc">{{ gen.description }}</div>
          </div>
        </div>

        <div v-if="selectedGenerator" class="generate-form">
          <h4>{{ selectedGenerator.name }}</h4>
          <p class="generator-hint">请在下方输入生成参数</p>
          <el-input
            v-model="generatorParams.input"
            type="textarea"
            :rows="4"
            :placeholder="selectedGenerator.userPromptTemplate"
          />
          <el-button
            type="primary"
            :loading="generating"
            @click="startGenerate"
            style="margin-top: 12px; width: 100%"
          >
            {{ generating ? '生成中...' : '开始生成' }}
          </el-button>
        </div>
      </div>
    </div>

    <!-- 右侧素材抽屉 -->
    <el-drawer v-model="drawerVisible" title="素材面板" direction="rtl" size="350px">
      <div class="drawer-content">
        <el-tabs>
          <el-tab-pane label="全局素材">
            <div class="material-section">
              <div class="material-group">
                <div class="group-title">人物</div>
                <div
                  v-for="m in materialStore.globalMaterials.filter(m => m.category === 'character')"
                  :key="m.id"
                  class="material-item"
                >
                  <span class="material-name">{{ m.name }}</span>
                  <div class="material-actions">
                    <el-button size="small" link @click="insertMaterial(m)">插入</el-button>
                    <el-button size="small" link @click="injectToPrompt(m)">注入</el-button>
                  </div>
                </div>
              </div>
              <div class="material-group">
                <div class="group-title">世界观</div>
                <div
                  v-for="m in materialStore.globalMaterials.filter(m => m.category === 'worldview')"
                  :key="m.id"
                  class="material-item"
                >
                  <span class="material-name">{{ m.name }}</span>
                  <div class="material-actions">
                    <el-button size="small" link @click="insertMaterial(m)">插入</el-button>
                    <el-button size="small" link @click="injectToPrompt(m)">注入</el-button>
                  </div>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane v-if="currentProjectId" label="项目素材">
            <div class="material-section">
              <div class="material-group">
                <div class="group-title">人物</div>
                <div
                  v-for="m in projectCharacters"
                  :key="m.id"
                  class="material-item"
                >
                  <span class="material-name">{{ m.name }}</span>
                  <div class="material-actions">
                    <el-button size="small" link @click="insertMaterial(m)">插入</el-button>
                    <el-button size="small" link @click="injectToPrompt(m)">注入</el-button>
                  </div>
                </div>
              </div>
              <div class="material-group">
                <div class="group-title">世界观</div>
                <div
                  v-for="m in projectWorldviews"
                  :key="m.id"
                  class="material-item"
                >
                  <span class="material-name">{{ m.name }}</span>
                  <div class="material-actions">
                    <el-button size="small" link @click="insertMaterial(m)">插入</el-button>
                    <el-button size="small" link @click="injectToPrompt(m)">注入</el-button>
                  </div>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.creation-page {
  height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
}

.project-bar {
  background: #fff;
  padding: 12px 20px;
  border-radius: 8px;
  margin-bottom: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.project-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.project-name {
  font-weight: 600;
  color: #333;
}

.project-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.creation-content {
  flex: 1;
  display: flex;
  gap: 16px;
  min-height: 0;
}

.editor-area {
  flex: 1;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
}

.content-editor {
  flex: 1;
}

.content-editor :deep(.el-textarea__inner) {
  font-size: 16px;
  line-height: 1.8;
  resize: none;
}

.generated-result {
  margin-top: 16px;
  border-top: 1px solid #eee;
  padding-top: 16px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  color: #667eea;
  font-weight: 600;
}

.generator-panel {
  width: 320px;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  overflow-y: auto;
}

.panel-title {
  font-size: 16px;
  color: #333;
  margin: 0 0 16px 0;
}

.generator-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.category-tag {
  cursor: pointer;
}

.generator-list {
  max-height: 300px;
  overflow-y: auto;
  margin-bottom: 16px;
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
}

.generator-item.active {
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

.generate-form h4 {
  margin: 0 0 8px 0;
  color: #333;
}

.generator-hint {
  font-size: 12px;
  color: #999;
  margin-bottom: 12px;
}

.drawer-content {
  height: 100%;
}

.material-section {
  max-height: 100%;
  overflow-y: auto;
}

.material-group {
  margin-bottom: 16px;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  color: #667eea;
  margin-bottom: 8px;
}

.material-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  border: 1px solid #eee;
  border-radius: 4px;
  margin-bottom: 4px;
}

.material-name {
  font-size: 13px;
  color: #333;
}

.material-actions {
  display: flex;
  gap: 4px;
}
</style>
