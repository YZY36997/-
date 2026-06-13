<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { projectApi } from '@/api'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Sparkles, BookOpen, FolderOpen, Trash2, Import,
  ChevronDown, Filter, Star, Clock, Search
} from 'lucide-vue-next'

const router = useRouter()
const loading = ref(true)
const projects = ref<any[]>([])
const recycleList = ref<any[]>([])
const sortBy = ref<'recent' | 'chapter' | 'name'>('recent')
const filterGenre = ref('')
const keyword = ref('')
const showRecycle = ref(false)
const showNewDialog = ref(false)
const showImportDialog = ref(false)
const showTemplateDialog = ref(false)
const projectCategories = ['玄幻', '都市', '科幻', '悬疑', '言情', '历史军事', '仙侠', '其他']

const newForm = ref({
  name: '',
  description: '',
  genre: '玄幻'
})

const importText = ref('')
const importName = ref('')

async function loadProjects() {
  loading.value = true
  try {
    projects.value = await projectApi.list()
  } catch (e) { ElMessage.error('加载失败') }
  finally { loading.value = false }
}
async function loadRecycle() {
  try {
    recycleList.value = await projectApi.recycleList()
  } catch (_) {}
}
onMounted(() => {
  loadProjects()
})

const filteredProjects = computed(() => {
  let list = projects.value || []
  if (filterGenre.value) list = list.filter((p: any) => p.genre === filterGenre.value)
  if (keyword.value) {
    const k = keyword.value.toLowerCase()
    list = list.filter((p: any) =>
      (p.name || '').toLowerCase().includes(k) || (p.description || '').toLowerCase().includes(k)
    )
  }
  if (sortBy.value === 'chapter') list = [...list].sort((a, b) => (b.chapter_count || 0) - (a.chapter_count || 0))
  else if (sortBy.value === 'name') list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  else list = [...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  return list
})

const totalChapters = computed(() => (projects.value || []).reduce((s: number, p: any) => s + (p.chapter_count || 0), 0))

function openProject(p: any) {
  router.push({ name: 'creation', params: { projectId: p.id } })
}

async function createProject() {
  if (!newForm.value.name.trim()) { ElMessage.warning('请填写作品名称'); return }
  try {
    const p = await projectApi.create({
      name: newForm.value.name,
      description: newForm.value.description,
      genre: newForm.value.genre
    })
    ElMessage.success('作品创建成功')
    showNewDialog.value = false
    newForm.value = { name: '', description: '', genre: '玄幻' }
    await loadProjects()
    openProject(p)
  } catch (_) { ElMessage.error('创建失败') }
}

function confirmDelete(p: any) {
  ElMessageBox.confirm(`将【${p.name}】放入回收站，可恢复`, '确认删除', { type: 'warning' })
    .then(async () => {
      await projectApi.recycle([p.id])
      await loadProjects()
      ElMessage.success('已放入回收站')
    }).catch(() => {})
}

function restoreProject(p: any) {
  projectApi.restore([p.id]).then(() => {
    ElMessage.success('已恢复')
    loadProjects()
  })
}

async function importAsProject() {
  if (!importName.value.trim() || !importText.value.trim()) {
    ElMessage.warning('请填写作品名和内容')
    return
  }
  try {
    const r = await projectApi.importText(null, importText.value, importName.value)
    ElMessage.success('导入成功，已自动切分为 ' + (r.chapter_created || 0) + ' 个章节')
    importText.value = ''
    importName.value = ''
    showImportDialog.value = false
    await loadProjects()
  } catch (e) {
    ElMessage.error('导入失败')
  }
}

function formatDate(d: any) {
  if (!d) return ''
  const t = new Date(d)
  return t.toLocaleString('zh-CN', { hour12: false }).slice(0, 16)
}
</script>

<template>
  <div class="project-list-page">
    <!-- 顶部操作栏 -->
    <div class="page-header">
      <div class="header-left">
        <h2><BookOpen :size="22" /> 我的作品</h2>
        <p class="subtitle">共 {{ projects.length }} 个作品，累计 {{ totalChapters }} 章节</p>
      </div>
      <div class="header-right">
        <div class="search-box">
          <Search :size="16" style="opacity:.7" />
          <input v-model="keyword" placeholder="搜索作品..." />
        </div>
        <el-select v-model="filterGenre" placeholder="选择题材" clearable style="width:130px">
          <el-option v-for="g in projectCategories" :key="g" :label="g" :value="g" />
        </el-select>
        <el-select v-model="sortBy" style="width:130px">
          <el-option label="最近编辑" value="recent" />
          <el-option label="章节最多" value="chapter" />
          <el-option label="作品名称" value="name" />
        </el-select>
        <el-button type="primary" @click="showNewDialog = true">
          <el-icon><Sparkles /></el-icon>新建作品
        </el-button>
        <el-button @click="showImportDialog = true">
          <el-icon><Import /></el-icon>导入作品
        </el-button>
        <el-button @click="showRecycle = !showRecycle">
          <el-icon><Trash2 /></el-icon>回收站
        </el-button>
      </div>
    </div>

    <!-- 作品卡片列表 -->
    <div v-if="!showRecycle" class="cards-grid">
      <div v-if="loading.value" class="loading-hint">加载中...</div>
      <div v-else-if="!filteredProjects.length" class="empty-hint">
        <Sparkles :size="48" />
        <p>还没有作品，点击「新建作品」开始创作</p>
      </div>
      <div v-for="p in filteredProjects" :key="p.id" class="project-card" :class="{ 'is-empty': !p.chapter_count }">
        <div class="card-header">
          <div class="genre-tag">{{ p.genre || '未分类' }}</div>
          <div class="options-menu">
            <el-button size="small" text @click.stop="confirmDelete(p)">
              <el-icon><Trash2 /></el-icon>
            </el-button>
          </div>
        </div>
        <h3 class="project-title">{{ p.name }}</h3>
        <p class="project-desc">{{ p.description || '暂无简介' }}</p>
        <div class="card-meta">
          <span><Clock :size="14" /> {{ formatDate(p.updatedAt) }}</span>
          <span class="chapter-count">{{ p.chapter_count || 0 }} 章</span>
        </div>
        <div class="card-actions">
          <el-button type="primary" @click="openProject(p)">进入创作空间</el-button>
          <el-button @click="openProject(p)">大纲/设定</el-button>
        </div>
      </div>
    </div>

    <!-- 回收站 -->
    <div v-else class="cards-grid">
      <div v-if="!recycleList.length" class="empty-hint">
        <FolderOpen :size="48" />
        <p>回收站是空的</p>
      </div>
      <div v-for="p in recycleList" :key="p.id" class="project-card recycled">
        <h3 class="project-title">{{ p.name }}</h3>
        <p class="project-desc">{{ p.description || '无简介' }}</p>
        <div class="card-actions">
          <el-button type="success" @click="restoreProject(p)">恢复</el-button>
        </div>
      </div>
    </div>

    <!-- 新建作品 -->
    <el-dialog v-model="showNewDialog" title="新建作品" width="480px">
      <el-form label-width="80px">
        <el-form-item label="作品名称">
          <el-input v-model="newForm.name" placeholder="例：天道之轮" maxlength="40" show-word-limit />
        </el-form-item>
        <el-form-item label="题材">
          <el-select v-model="newForm.genre" style="width:100%">
            <el-option v-for="g in projectCategories" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
        <el-form-item label="简介">
          <el-input v-model="newForm.description" type="textarea" :rows="4" placeholder="一句话描述你的故事" maxlength="400" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showNewDialog = false">取消</el-button>
        <el-button type="primary" @click="createProject">创建</el-button>
      </template>
    </el-dialog>

    <!-- 导入作品 -->
    <el-dialog v-model="showImportDialog" title="导入作品" width="560px">
      <el-form label-width="90px">
        <el-form-item label="作品名称">
          <el-input v-model="importName" placeholder="例：我的第一本小说" maxlength="40" show-word-limit />
        </el-form-item>
        <el-form-item label="粘贴内容">
          <el-input v-model="importText" type="textarea" :rows="12" placeholder="粘贴完整小说内容，系统会按段落/章节自动切分..." />
        </el-form-item>
      </el-form>
      <p class="hint-text">
        * 我们会根据常见章节号（第X章 / 卷X / 数字序号）自动切分为章节；也会将简介、人物描述导入为素材。
      </p>
      <template #footer>
        <el-button @click="showImportDialog = false">取消</el-button>
        <el-button type="primary" @click="importAsProject">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.project-list-page {
  padding: 24px;
  background: var(--page-bg, #f5f7fa);
  min-height: 100vh;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}
.page-header h2 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 20px;
}
.subtitle {
  margin: 4px 0 0;
  color: #909399;
  font-size: 13px;
}
.header-right {
  display: flex;
  gap: 8px;
  align-items: center;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fff;
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  padding: 0 10px;
  height: 36px;
  width: 200px;
}
.search-box input {
  border: none;
  outline: none;
  flex: 1;
  background: transparent;
  font-size: 13px;
}
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.project-card {
  background: #fff;
  border-radius: 12px;
  padding: 18px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, .04);
  display: flex;
  flex-direction: column;
  transition: transform .15s ease, box-shadow .15s ease;
  border: 1px solid #ebedf0;
  position: relative;
}
.project-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 22px rgba(0, 0, 0, .08);
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.genre-tag {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
  background: #ecf5ff;
  color: #409eff;
}
.project-title {
  margin: 10px 0 6px;
  font-size: 17px;
  font-weight: 600;
}
.project-desc {
  color: #606266;
  font-size: 13px;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.card-meta {
  display: flex;
  justify-content: space-between;
  margin: 14px 0;
  color: #909399;
  font-size: 12px;
}
.card-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.chapter-count {
  font-weight: 600;
  color: #409eff;
}
.card-actions {
  display: flex;
  gap: 8px;
}
.loading-hint, .empty-hint {
  grid-column: 1 / -1;
  padding: 60px 20px;
  text-align: center;
  color: #909399;
}
.hint-text {
  font-size: 12px;
  color: #909399;
  margin: 0;
  line-height: 1.6;
}
.recycled {
  opacity: .8;
  border-style: dashed;
}
</style>
