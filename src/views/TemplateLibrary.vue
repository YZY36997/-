<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/project'
import api from '../api'
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

const BUILTIN_TEMPLATES: any[] = [
  { id: 'tpl_hook_01', title: '开局：重生打脸', genre: '玄幻', function: '开局', isFavorite: false,
    content: '【模板】开局重生 + 打脸前任：主角被爱人背叛身死——醒来发现重生回三年前/新身体——第一件事就是利用先知优势，在即将发生的关键事件中翻盘打脸——首杀小BOSS立威——揭示金手指。\n\n【核心KPI】300字内完成"死→醒→惊→反→爽"五重节奏，前200字必须完成重生设定并抛出悬念。' },
  { id: 'tpl_hook_02', title: '开局：穿越金手指', genre: '都市', function: '开局', isFavorite: false,
    content: '【模板】穿越/系统流开局：现代社畜猝死→穿越到平行世界/古代→绑定系统/特殊金手指→新手任务带来第一桶金→被他人嘲笑→打脸成功→确立目标主线。\n\n【核心KPI】开篇300字让读者"看懂+共鸣+期待"，完读率需保持在65%以上。' },
  { id: 'tpl_reverse_01', title: '反转：身份揭密', genre: '古言', function: '反转', isFavorite: false,
    content: '【模板】身份反转：表面身份A实际是身份B——敌对势力错认→被当作棋子→关键时刻身份反转→反控棋局。\n\n【核心KPI】前文中铺垫的"不起眼细节"必须在反转时被串联解释，让读者有"原来如此"的畅快感。' },
  { id: 'tpl_climax_01', title: '高潮：决战式冲突', genre: '玄幻', function: '高潮', isFavorite: false,
    content: '【模板】决战高潮：大BOSS主动出击→重要角色重伤/牺牲→主角被逼至绝境→金手指升华→反杀→留下新的悬念。\n\n【核心KPI】冲突层级需比上一高潮高出两个量级，读者情绪必须在章节结尾被推至顶点。' },
  { id: 'tpl_ending_01', title: '结尾：开放式留白', genre: '现言', function: '收尾', isFavorite: false,
    content: '【模板】开放式结局：主线冲突解决→主角获得成长→留白的感情线/世界观未解之谜→尾声用一个象征性场景收束全文→给读者留下想象空间。\n\n【核心KPI】追读率需保持在30%以上的章节才能使用开放式结局，否则读者体验会断档。' },
  { id: 'tpl_title_01', title: '标题：悬念型', genre: '玄幻', function: '开局', isFavorite: false,
    content: '【标题模板】疑问/悬念型：\n- "他明明只是凡人，为何诸天大佬都要跪拜？"\n- "被休弃的废物小姐，一夜之间让整个家族跪着道歉"\n- "重生三天前，我亲手杀死了上辈子害死我的那个人"\n\n【核心KPI】标题须包含"身份反差+动作承诺+好奇点"，点击率需高于行业均值20%。' }
]

async function fetchTemplates() {
  loading.value = true
  try {
    const response = await api.get('/api/templates')
    const serverTemplates = Array.isArray(response.data) ? response.data : []
    templates.value = [...BUILTIN_TEMPLATES, ...serverTemplates]
  } catch (error) {
    console.error('获取模板失败:', error)
    templates.value = BUILTIN_TEMPLATES
  } finally {
    loading.value = false
  }
}

async function toggleFavorite(template: any) {
  try {
    await api.put(`/api/templates/${template.id}`, {
      isFavorite: !template.isFavorite
    })
    template.isFavorite = !template.isFavorite
  } catch (error) {
    // 即使服务端报错也更新本地
    template.isFavorite = !template.isFavorite
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
