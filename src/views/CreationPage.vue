<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { FolderOpen, Search, Edit, Plus, FileText, BookOpen } from 'lucide-vue-next'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import { useMaterialStore, CATEGORY_LABELS } from '@/stores/material'
import { useGeneratorStore, CATEGORY_MAP as GEN_CATEGORY_MAP } from '@/stores/generator'

const route = useRoute()
const router = useRouter()
const projectStore = useProjectStore()
const materialStore = useMaterialStore()
const generatorStore = useGeneratorStore()

const content = ref('')
const promptInput = ref('')
const generatedResult = ref('')
const withMaterialLink = ref(true)

const selectedGenerator = ref<any>(null)
const generatorParams = ref<Record<string, string>>({ input: '' })
const generating = ref(false)

const projectId = computed(() => route.params.projectId as string || null)

const projectMaterials = computed(() => {
  if (!projectId.value) return materialStore.materials
  return materialStore.materials.filter(m => m.project_id === projectId.value)
})

const projectCharacters = computed(() => projectMaterials.value.filter((m: any) => m.category === 'character'))
const projectWorldviews = computed(() => projectMaterials.value.filter((m: any) => m.category === 'worldview'))

const genCategoriesForSelect = computed(() =>
  generatorStore.categories.filter((c: any) => c.id !== 'all')
)

async function loadAll() {
  await projectStore.fetchProjects()
  await generatorStore.fetchGenerators()
  await generatorStore.fetchCategories()

  if (projectId.value) {
    await projectStore.fetchProject(projectId.value)
    await materialStore.fetchMaterials(projectId.value)
  } else {
    await materialStore.fetchGlobalMaterials()
    await materialStore.fetchMaterials()
  }
}

onMounted(loadAll)

watch(() => route.params.projectId, () => {
  if (projectId.value) {
    projectStore.fetchProject(projectId.value)
    materialStore.fetchMaterials(projectId.value)
  }
})

function selectGenerator(gen: any) {
  selectedGenerator.value = gen
  // 解析模板中的变量
  const template = gen.userPromptTemplate || ''
  const params: Record<string, string> = {}
  const regex = /\{(\w+)\}/g
  let match
  while ((match = regex.exec(template)) !== null) {
    params[match[1]] = ''
  }
  // 提供默认 input
  if (!params.input) params.input = ''
  if (projectStore.currentProject) {
    params.genre = params.genre || projectStore.currentProject.settings?.genre || '玄幻'
    params.style = params.style || projectStore.currentProject.settings?.style || '爽文风'
  }
  generatorParams.value = params
  promptInput.value = template
}

function insertMaterialToContent(m: any) {
  content.value += `\n\n【${m.name}】\n${m.content}\n`
  ElMessage.success('已插入到正文')
}

function injectToPrompt(m: any) {
  promptInput.value += `\n\n【${m.name}】\n${m.content}`
  ElMessage.success('已注入到生成提示')
}

async function startGenerate() {
  if (!selectedGenerator.value) {
    ElMessage.warning('请先选择一个生成器')
    return
  }
  generating.value = true
  generatedResult.value = ''
  try {
    const text = await generatorStore.generate(
      selectedGenerator.value.id,
      generatorParams.value,
      projectId.value || undefined,
      withMaterialLink.value
    )
    generatedResult.value = text
    ElMessage.success('生成成功')
  } catch (err: any) {
    ElMessage.error(err.message || '生成失败')
  } finally {
    generating.value = false
  }
}

async function saveAsMaterial() {
  if (!generatedResult.value) {
    ElMessage.warning('没有可保存的内容')
    return
  }
  await materialStore.createMaterial({
    name: `${selectedGenerator.value?.name || 'AI'}生成 - ${new Date().toLocaleTimeString()}`,
    content: generatedResult.value,
    category: selectedGenerator.value?.category === 'outline' || selectedGenerator.value?.category === 'plot' ? 'plot' : 'setting',
    project_id: projectId.value
  })
  ElMessage.success('已保存到素材库')
  loadAll()
}

function copyResult() {
  if (!generatedResult.value) return
  navigator.clipboard.writeText(generatedResult.value)
  ElMessage.success('已复制到剪贴板')
}

function goToMaterials() {
  router.push({ name: 'material-center' })
}

function getGenCategoryName(id: string): string {
  return GEN_CATEGORY_MAP[id] || id
}
</script>

<template>
  <div class="creation-page">
    <!-- 项目信息栏 -->
    <div class="project-bar">
      <div class="project-info">
        <el-icon size="18"><FolderOpen /></el-icon>
        <span class="project-name">
          {{ projectStore.currentProject ? projectStore.currentProject.name : '未选择项目' }}
        </span>
        <el-tag v-if="projectStore.currentProject" size="small" type="success">
          {{ projectStore.currentProject.settings?.genre }}
        </el-tag>
        <el-tag v-else size="small" type="info">请先选择项目</el-tag>
      </div>
      <div class="project-actions">
        <el-switch
          v-model="withMaterialLink"
          active-text="关联项目素材"
          inactive-text="不关联"
        />
        <el-button @click="goToMaterials">
          <el-icon><BookOpen /></el-icon>管理素材
        </el-button>
      </div>
    </div>

    <div class="creation-content">
      <!-- 左侧:创作区 -->
      <div class="editor-area">
        <div class="editor-tabs">
          <div class="tab active">正文创作</div>
          <div class="tab">提示词模板</div>
        </div>
        <el-input
          v-model="content"
          type="textarea"
          :rows="12"
          placeholder="在这里开始你的创作...&#10;可以从右侧项目素材中插入人物设定、世界观、剧情桥段等"
          class="main-editor"
        />

        <!-- 生成结果 -->
        <div v-if="generatedResult" class="result-area">
          <div class="result-header">
            <span>
              <el-icon><FileText /></el-icon>
              生成结果
            </span>
            <div class="result-actions">
              <el-button size="small" @click="copyResult">复制</el-button>
              <el-button size="small" type="primary" @click="saveAsMaterial">
                <el-icon><Plus /></el-icon>保存为素材
              </el-button>
            </div>
          </div>
          <div class="result-content">{{ generatedResult }}</div>
        </div>
      </div>

      <!-- 右侧:生成器与素材 -->
      <div class="right-panel">
        <!-- 生成器选择 -->
        <div class="generator-section">
          <h3 class="section-title">AI 生成器</h3>

          <el-select v-if="selectedGenerator" v-model="selectedGenerator.id" placeholder="选择生成器..." @change="(id: string) => { const g = generatorStore.generators.find(x => x.id === id); if (g) selectGenerator(g) }" style="width: 100%; margin-bottom: 12px">
            <el-option-group v-for="cat in genCategoriesForSelect" :key="cat.id" :label="cat.name">
              <el-option
                v-for="g in generatorStore.generators.filter((gen: any) => gen.category === cat.id)"
                :key="g.id"
                :label="g.name"
                :value="g.id"
              />
            </el-option-group>
          </el-select>

          <div v-else class="gen-grid">
            <div
              v-for="g in generatorStore.generators.slice(0, 12)"
              :key="g.id"
              class="gen-card"
              @click="selectGenerator(g)"
            >
              <div class="gen-title">{{ g.name }}</div>
              <div class="gen-category">{{ getGenCategoryName(g.category) }}</div>
            </div>
          </div>

          <!-- 参数输入 -->
          <div v-if="selectedGenerator" class="params-area">
            <div class="current-gen">
              <span class="label">当前生成器:</span>
              <span class="gen-name">{{ selectedGenerator.name }}</span>
              <el-tag size="small" type="success">{{ getGenCategoryName(selectedGenerator.category) }}</el-tag>
            </div>
            <p class="gen-hint">{{ selectedGenerator.description }}</p>

            <div v-for="(value, key) in generatorParams" :key="key" class="param-row">
              <label>{{ key }}</label>
              <el-input
                v-model="generatorParams[key]"
                type="textarea"
                :rows="key === 'input' || key === 'requirement' ? 3 : 1"
                :placeholder="`请输入 ${key}`"
              />
            </div>

            <el-button
              type="primary"
              :loading="generating"
              size="large"
              style="width: 100%; margin-top: 12px"
              @click="startGenerate"
            >
              {{ generating ? '正在生成...' : '✨ 开始生成' }}
            </el-button>
          </div>

          <div v-else class="gen-hint">
            <el-empty description="请在上方选择一个生成器开始创作" :image-size="80" />
          </div>
        </div>

        <!-- 项目素材 -->
        <div class="materials-section">
          <h3 class="section-title">项目素材</h3>
          <div v-if="projectCharacters.length > 0" class="mat-group">
            <div class="group-title">人物角色</div>
            <div v-for="m in projectCharacters.slice(0, 5)" :key="m.id" class="mat-chip">
              <span class="mat-name">{{ m.name }}</span>
              <div class="mat-ops">
                <el-button size="small" link type="primary" @click="insertMaterialToContent(m)">插入</el-button>
                <el-button size="small" link type="success" @click="injectToPrompt(m)">注入</el-button>
              </div>
            </div>
          </div>
          <div v-if="projectWorldviews.length > 0" class="mat-group">
            <div class="group-title">世界观</div>
            <div v-for="m in projectWorldviews.slice(0, 5)" :key="m.id" class="mat-chip">
              <span class="mat-name">{{ m.name }}</span>
              <div class="mat-ops">
                <el-button size="small" link type="primary" @click="insertMaterialToContent(m)">插入</el-button>
                <el-button size="small" link type="success" @click="injectToPrompt(m)">注入</el-button>
              </div>
            </div>
          </div>
          <div v-if="projectMaterials.length === 0" class="empty-hint">
            <el-empty description="暂无项目素材" :image-size="60">
              <el-button size="small" @click="goToMaterials">去创建</el-button>
            </el-empty>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.creation-page {
  padding: 0 20px;
  height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
}

.project-bar {
  background: #fff;
  border-radius: 12px;
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.project-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.project-name {
  font-weight: 600;
  color: #1a1a2e;
}

.project-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.creation-content {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 16px;
  overflow: hidden;
}

.editor-area {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.editor-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  border-bottom: 1px solid #f0f0f5;
}

.editor-tabs .tab {
  padding: 10px 16px;
  cursor: pointer;
  color: #888;
  font-size: 14px;
}

.editor-tabs .tab.active {
  color: #409eff;
  border-bottom: 2px solid #409eff;
  margin-bottom: -1px;
  font-weight: 600;
}

.main-editor {
  flex: 1;
  min-height: 280px;
}

.result-area {
  margin-top: 20px;
  border-top: 1px solid #f0f0f5;
  padding-top: 16px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 600;
  color: #409eff;
}

.result-content {
  background: #f8f9ff;
  border-radius: 8px;
  padding: 16px;
  white-space: pre-wrap;
  line-height: 1.8;
  color: #333;
  font-size: 14px;
  max-height: 300px;
  overflow-y: auto;
}

.right-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.generator-section,
.materials-section {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a2e;
  margin: 0 0 14px 0;
  padding-left: 10px;
  border-left: 3px solid #409eff;
}

.gen-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 14px;
}

.gen-card {
  background: #f5f5ff;
  border: 1px solid #e0e0f0;
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.gen-card:hover {
  background: #e8e8ff;
  border-color: #409eff;
  transform: translateY(-2px);
}

.gen-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.gen-category {
  font-size: 11px;
  color: #888;
}

.current-gen {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.current-gen .label {
  color: #999;
  font-size: 12px;
}

.current-gen .gen-name {
  font-weight: 600;
  color: #1a1a2e;
}

.gen-hint {
  font-size: 12px;
  color: #888;
  margin-bottom: 14px;
}

.param-row {
  margin-bottom: 10px;
}

.param-row label {
  display: block;
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
  text-transform: capitalize;
}

.mat-group {
  margin-bottom: 14px;
}

.group-title {
  font-size: 12px;
  font-weight: 600;
  color: #888;
  margin-bottom: 8px;
  padding-left: 6px;
}

.mat-chip {
  background: #f8f9ff;
  border: 1px solid #e0e0f0;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.mat-name {
  font-size: 13px;
  color: #333;
  font-weight: 500;
}

.mat-ops {
  display: flex;
  gap: 6px;
}

.empty-hint {
  padding: 20px 0;
}
</style>
