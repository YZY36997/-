<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Folder,
  Search,
  Plus,
  Edit,
  Delete,
  Sparkles
} from 'lucide-vue-next'
import { useMaterialStore, CATEGORY_LABELS } from '@/stores/material'
import { useProjectStore } from '@/stores/project'
import { useGeneratorStore, CATEGORY_MAP as GEN_CATEGORY_MAP } from '@/stores/generator'

const materialStore = useMaterialStore()
const projectStore = useProjectStore()
const generatorStore = useGeneratorStore()

// 左侧:素材来源
const sourceTab = ref<'global' | 'project'>('global')
const materialCategory = ref('all')
const searchKeyword = ref('')

// 右侧:生成器
const generatorCategory = ref('all')
const generatorForm = ref({
  name: '',
  category: 'custom',
  description: '',
  systemPrompt: '',
  userPromptTemplate: ''
})

// 生成器对话框
const showGenDialog = ref(false)
const editingGen = ref<any>(null)

// 素材编辑对话框
const showMatDialog = ref(false)
const editingMat = ref<any>(null)
const matForm = ref({
  name: '',
  category: 'setting',
  subCategory: '',
  content: '',
  tags: ''
})

// 分类列表
const materialCategories = computed(() => [
  { id: 'all', name: '全部' },
  ...Object.entries(CATEGORY_LABELS).map(([id, name]) => ({ id, name }))
])

const genCategories = computed(() => {
  const list = generatorStore.categories.filter(c => c.id !== 'all')
  return [{ id: 'all', name: '全部' }, ...list]
})

// 过滤后的素材列表
const filteredMaterials = computed(() => {
  let list = sourceTab.value === 'global'
    ? materialStore.globalMaterials
    : materialStore.materials.filter((m: any) =>
        projectStore.currentProject
          ? m.project_id === projectStore.currentProject.id
          : m.project_id !== null
      )

  if (materialCategory.value !== 'all') {
    list = list.filter((m: any) => m.category === materialCategory.value)
  }

  if (searchKeyword.value.trim()) {
    const kw = searchKeyword.value.trim().toLowerCase()
    list = list.filter((m: any) =>
      (m.name || '').toLowerCase().includes(kw) ||
      (m.content || '').toLowerCase().includes(kw)
    )
  }

  return list
})

// 过滤后的生成器列表
const filteredGenerators = computed(() => {
  if (generatorCategory.value === 'all') return generatorStore.generators
  return generatorStore.generators.filter((g: any) => g.category === generatorCategory.value)
})

function getGenCategoryName(id: string): string {
  return GEN_CATEGORY_MAP[id] || id
}

function getMatCategoryName(id: string): string {
  return CATEGORY_LABELS[id] || id
}

// 切换素材来源后加载
async function loadMaterials() {
  if (sourceTab.value === 'global') {
    await materialStore.fetchGlobalMaterials(materialCategory.value !== 'all' ? materialCategory.value : undefined)
  } else if (projectStore.currentProject) {
    await materialStore.fetchMaterials(projectStore.currentProject.id)
  }
}

watch([sourceTab, materialCategory], () => {
  loadMaterials()
})

// 当项目切换时刷新
watch(() => projectStore.currentProject?.id, () => {
  if (sourceTab.value === 'project' && projectStore.currentProject) {
    materialStore.fetchMaterials(projectStore.currentProject.id)
  }
})

onMounted(async () => {
  await materialStore.fetchGlobalMaterials()
  await materialStore.fetchMaterials()
  await generatorStore.fetchGenerators()
  await generatorStore.fetchCategories()
  await projectStore.fetchProjects()
})

// ----素材操作----
function openNewMaterial() {
  editingMat.value = null
  matForm.value = { name: '', category: materialCategory.value !== 'all' ? materialCategory.value : 'setting', subCategory: '', content: '', tags: '' }
  showMatDialog.value = true
}

function editMaterial(m: any) {
  editingMat.value = m
  matForm.value = {
    name: m.name,
    category: m.category,
    subCategory: m.subCategory || '',
    content: m.content,
    tags: (m.tags || []).join(', ')
  }
  showMatDialog.value = true
}

async function saveMaterial() {
  if (!matForm.value.name.trim() || !matForm.value.content.trim()) {
    ElMessage.warning('请填写素材名称和内容')
    return
  }
  const payload = {
    ...matForm.value,
    tags: matForm.value.tags ? matForm.value.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    project_id: sourceTab.value === 'project' && projectStore.currentProject
      ? projectStore.currentProject.id
      : null
  }

  if (editingMat.value) {
    await materialStore.updateMaterial(editingMat.value.id, payload)
    ElMessage.success('素材已更新')
  } else {
    await materialStore.createMaterial(payload)
    ElMessage.success('素材已创建')
  }
  showMatDialog.value = false
  loadMaterials()
}

async function confirmDeleteMaterial(m: any) {
  try {
    await ElMessageBox.confirm(`确认删除素材「${m.name}」?`, '提示', { type: 'warning' })
    await materialStore.deleteMaterial(m.id)
    ElMessage.success('已删除')
    loadMaterials()
  } catch (_) { /* 取消 */ }
}

// ----生成器操作----
function openNewGenerator() {
  editingGen.value = null
  generatorForm.value = { name: '', category: 'custom', description: '', systemPrompt: '', userPromptTemplate: '' }
  showGenDialog.value = true
}

function editGenerator(g: any) {
  if (!g.isCustom) {
    ElMessage.info('系统内置生成器不可编辑')
    return
  }
  editingGen.value = g
  generatorForm.value = {
    name: g.name,
    category: g.category,
    description: g.description || '',
    systemPrompt: g.systemPrompt || '',
    userPromptTemplate: g.userPromptTemplate || ''
  }
  showGenDialog.value = true
}

async function saveGenerator() {
  if (!generatorForm.value.name.trim()) {
    ElMessage.warning('请填写生成器名称')
    return
  }
  if (editingGen.value) {
    await generatorStore.updateGenerator(editingGen.value.id, generatorForm.value)
    ElMessage.success('生成器已更新')
  } else {
    await generatorStore.createGenerator(generatorForm.value)
    ElMessage.success('生成器已创建')
  }
  showGenDialog.value = false
  generatorStore.fetchGenerators()
}

async function confirmDeleteGenerator(g: any) {
  if (!g.isCustom) { ElMessage.warning('只能删除自定义生成器'); return }
  try {
    await ElMessageBox.confirm(`确认删除生成器「${g.name}」?`, '提示', { type: 'warning' })
    await generatorStore.deleteGenerator(g.id)
    ElMessage.success('已删除')
    generatorStore.fetchGenerators()
  } catch (_) { /* 取消 */ }
}
</script>

<template>
  <div class="material-center">
    <!-- 顶部工具栏 -->
    <div class="top-bar">
      <h2 class="page-title">素材与AI生成器管理</h2>
      <div class="top-actions">
        <el-input v-model="searchKeyword" placeholder="搜索素材..." :prefix-icon="Search" style="width: 240px" clearable />
        <el-button type="primary" @click="openNewMaterial">
          <el-icon><Plus /></el-icon>新建素材
        </el-button>
        <el-button type="success" @click="openNewGenerator">
          <el-icon><Sparkles /></el-icon>自定义生成器
        </el-button>
      </div>
    </div>

    <div class="main-grid">
      <!-- 素材面板 -->
      <div class="panel material-panel">
        <div class="panel-header">
          <h3>素材库</h3>
          <div class="source-switch">
            <el-radio-group v-model="sourceTab" size="small">
              <el-radio-button value="global">全局素材</el-radio-button>
              <el-radio-button value="project" :disabled="!projectStore.currentProject">项目素材</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <div class="category-tags">
          <el-tag
            v-for="cat in materialCategories"
            :key="cat.id"
            :type="materialCategory === cat.id ? 'primary' : 'info'"
            class="tag"
            effect="plain"
            @click="materialCategory = cat.id"
          >{{ cat.name }}</el-tag>
        </div>

        <div v-if="sourceTab === 'project' && !projectStore.currentProject" class="empty-hint">
          <el-empty description="请先创建或选择一个项目来管理项目素材">
            <el-button type="primary" @click="$router.push({ name: 'projects' })">前往项目管理</el-button>
          </el-empty>
        </div>

        <div v-else-if="filteredMaterials.length === 0" class="empty-hint">
          <el-empty description="暂无素材，点击右上角新建" />
        </div>

        <div v-else class="material-list">
          <div v-for="mat in filteredMaterials" :key="mat.id" class="material-item" :class="{ active: editingMat?.id === mat.id }">
            <div class="mat-head">
              <el-tag size="small" type="success" effect="dark">{{ getMatCategoryName(mat.category) }}</el-tag>
              <span class="mat-name">{{ mat.name }}</span>
            </div>
            <p class="mat-content">{{ mat.content }}</p>
            <div v-if="mat.tags?.length" class="mat-tags">
              <el-tag v-for="t in mat.tags" :key="t" size="small" class="inline-tag">{{ t }}</el-tag>
            </div>
            <div class="mat-actions">
              <el-button size="small" link type="primary" @click="editMaterial(mat)">
                <el-icon><Edit /></el-icon>编辑
              </el-button>
              <el-button size="small" link type="danger" @click="confirmDeleteMaterial(mat)">
                <el-icon><Delete /></el-icon>删除
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 生成器面板 -->
      <div class="panel generator-panel">
        <div class="panel-header">
          <h3>AI生成器</h3>
          <span class="stat">共 {{ generatorStore.generators.length }} 个</span>
        </div>

        <div class="category-tags">
          <el-tag
            v-for="cat in genCategories"
            :key="cat.id"
            :type="generatorCategory === cat.id ? 'primary' : 'info'"
            class="tag"
            effect="plain"
            @click="generatorCategory = cat.id"
          >{{ cat.name }}</el-tag>
        </div>

        <div v-if="filteredGenerators.length === 0" class="empty-hint">
          <el-empty description="暂无生成器" />
        </div>

        <div v-else class="generator-list">
          <div v-for="gen in filteredGenerators" :key="gen.id" class="generator-item">
            <div class="gen-head">
              <span class="gen-name">{{ gen.name }}</span>
              <el-tag v-if="gen.isCustom" size="small" type="warning">自定义</el-tag>
              <el-tag v-else size="small" type="info">内置</el-tag>
            </div>
            <p class="gen-desc">{{ gen.description }}</p>
            <div class="gen-meta">
              <el-tag size="small">{{ getGenCategoryName(gen.category) }}</el-tag>
            </div>
            <div class="gen-actions">
              <el-button size="small" link type="primary" @click="editGenerator(gen)">
                <el-icon><Edit /></el-icon>{{ gen.isCustom ? '编辑' : '查看' }}
              </el-button>
              <el-button v-if="gen.isCustom" size="small" link type="danger" @click="confirmDeleteGenerator(gen)">
                <el-icon><Delete /></el-icon>删除
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 素材编辑对话框 -->
    <el-dialog v-model="showMatDialog" :title="editingMat ? '编辑素材' : '新建素材'" width="640px">
      <el-form :model="matForm" label-width="100px">
        <el-form-item label="素材名称" required>
          <el-input v-model="matForm.name" placeholder="请输入素材名称" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="matForm.category" style="width: 100%">
            <el-option v-for="cat in materialCategories.filter(c => c.id !== 'all')" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="子分类">
          <el-input v-model="matForm.subCategory" placeholder="如:宗门, 功法, 武器" />
        </el-form-item>
        <el-form-item label="标签">
          <el-input v-model="matForm.tags" placeholder="用逗号分隔，如: 玄幻, 金手指" />
        </el-form-item>
        <el-form-item label="素材内容" required>
          <el-input v-model="matForm.content" type="textarea" :rows="10" placeholder="请输入素材详细内容..." />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showMatDialog = false">取消</el-button>
        <el-button type="primary" @click="saveMaterial">保存</el-button>
      </template>
    </el-dialog>

    <!-- 生成器编辑对话框 -->
    <el-dialog v-model="showGenDialog" :title="editingGen ? '编辑生成器' : '创建自定义生成器'" width="720px">
      <el-form :model="generatorForm" label-width="100px">
        <el-form-item label="生成器名称" required>
          <el-input v-model="generatorForm.name" placeholder="如: 科幻大纲生成器" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="generatorForm.category" style="width: 100%">
            <el-option v-for="cat in genCategories.filter(c => c.id !== 'all')" :key="cat.id" :label="cat.name" :value="cat.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="generatorForm.description" placeholder="该生成器的用途说明" />
        </el-form-item>
        <el-form-item label="系统提示词">
          <el-input v-model="generatorForm.systemPrompt" type="textarea" :rows="4" placeholder="AI的角色定位和规则..." />
        </el-form-item>
        <el-form-item label="用户模板">
          <el-input v-model="generatorForm.userPromptTemplate" type="textarea" :rows="4" placeholder="用户输入模板，使用{变量名}作为占位符，如: {input} {genre}" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showGenDialog = false">取消</el-button>
        <el-button type="primary" @click="saveGenerator">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.material-center {
  height: calc(100vh - 120px);
  display: flex;
  flex-direction: column;
  padding: 0 20px;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 4px 20px;
}

.page-title {
  font-size: 22px;
  color: #1a1a2e;
  margin: 0;
}

.top-actions {
  display: flex;
  gap: 10px;
}

.main-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  overflow: hidden;
}

.panel {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #f0f0f5;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: #1a1a2e;
}

.stat {
  color: #888;
  font-size: 13px;
}

.source-switch {
  display: flex;
  gap: 8px;
}

.category-tags {
  padding: 12px 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  border-bottom: 1px solid #f5f5f8;
}

.tag {
  cursor: pointer;
  transition: all 0.2s;
}

.tag:hover {
  transform: translateY(-1px);
}

.material-list,
.generator-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.material-item,
.generator-item {
  background: #fafafd;
  border: 1px solid #ececf4;
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 12px;
  transition: all 0.2s;
}

.material-item:hover,
.generator-item:hover {
  background: #f5f5ff;
  border-color: #c8c8ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(100, 100, 255, 0.1);
}

.mat-head,
.gen-head {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}

.mat-name,
.gen-name {
  font-weight: 600;
  color: #1a1a2e;
  font-size: 15px;
}

.mat-content,
.gen-desc {
  color: #555;
  font-size: 13px;
  line-height: 1.7;
  margin: 0 0 10px 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.mat-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.inline-tag {
  font-size: 11px;
}

.gen-meta {
  margin-bottom: 8px;
}

.mat-actions,
.gen-actions {
  display: flex;
  gap: 4px;
  padding-top: 8px;
  border-top: 1px dashed #e8e8f0;
}

.empty-hint {
  padding: 40px;
  text-align: center;
}
</style>
