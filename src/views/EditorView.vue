<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { lingmo } from '@/api/lingmo'
import { useUiStore } from '@/stores/ui'
import AiPanel from '@/components/AiPanel.vue'
import NovelEditor from '@/components/NovelEditor.vue'
import ChapterTree from '@/components/ChapterTree.vue'

const ui = useUiStore()
const route = useRoute()
const router = useRouter()

const projectId = ref<number | null>(null)
const volumes = ref<any[]>([])
const chapters = ref<any[]>([])
const currentChapterId = ref<number | null>(null)
const currentChapter = ref<any>(null)
const content = ref('')
const autosaveTimer = ref<any>(null)
const aiPanel = ref<InstanceType<typeof AiPanel> | null>(null)
const editor = ref<InstanceType<typeof NovelEditor> | null>(null)

const breadcrumb = computed(() => ui.currentProjectName || '作品')

async function loadProject() {
  const pid = route.params.projectId ? Number(route.params.projectId) : ui.currentProjectId
  if (!pid) { router.push('/home'); return }
  projectId.value = pid
  const r = await lingmo.invoke(lingmo.ACTIONS.PROJECT_GET, { id: pid })
  if (r.ok && r.data) ui.setProject(pid, r.data.name)
  await Promise.all([loadVolumes(), loadChapters()])
  const cid = route.params.chapterId ? Number(route.params.chapterId) : (chapters.value[0]?.id ?? null)
  if (cid) await selectChapter(cid)
}

async function loadVolumes() {
  const r = await lingmo.invoke(lingmo.ACTIONS.VOLUME_LIST, { project_id: projectId.value })
  volumes.value = r.ok ? (r.data || []) : []
}
async function loadChapters() {
  const r = await lingmo.invoke(lingmo.ACTIONS.CHAPTER_LIST, { project_id: projectId.value })
  chapters.value = r.ok ? (r.data || []) : []
}

async function createChapter(volumeId: number) {
  try {
    const { value }: any = await ElMessageBox.prompt('新章节标题', '新建章节', { inputValue: '新章节' })
    const r = await lingmo.invoke(lingmo.ACTIONS.CHAPTER_CREATE, { project_id: projectId.value, volume_id: volumeId, title: value, word_count: 0 })
    if (r.ok) {
      await loadChapters()
      selectChapter(r.data.id)
    }
  } catch {}
}
async function createVolume() {
  try {
    const { value }: any = await ElMessageBox.prompt('新卷标题', '新建卷', { inputValue: '第一卷' })
    const r = await lingmo.invoke(lingmo.ACTIONS.VOLUME_CREATE, { project_id: projectId.value, title: value })
    if (r.ok) loadVolumes()
  } catch {}
}

async function deleteChapter(id: number) {
  try {
    await ElMessageBox.confirm('确定删除该章节？', '提示', { type: 'warning' })
    await lingmo.invoke(lingmo.ACTIONS.CHAPTER_DELETE, { id })
    await loadChapters()
    if (currentChapterId.value === id) { currentChapterId.value = null; content.value = '' }
  } catch {}
}

async function selectChapter(id: number) {
  currentChapterId.value = id
  const c = chapters.value.find((x: any) => x.id === id)
  currentChapter.value = c
  const r = await lingmo.invoke(lingmo.ACTIONS.CHAPTER_CONTENT_GET, { id })
  content.value = r.ok && r.data?.content ? r.data.content : ''
  editor.value?.setContent(content.value)
}

async function manualSave() {
  if (!currentChapterId.value) return
  await lingmo.invoke(lingmo.ACTIONS.CHAPTER_CONTENT_SAVE, { id: currentChapterId.value, content: content.value, version_tag: 'v' + Date.now() })
  ElMessage.success('已保存')
}

watch(content, () => {
  if (!currentChapterId.value) return
  clearTimeout(autosaveTimer.value)
  autosaveTimer.value = setTimeout(async () => {
    await lingmo.invoke(lingmo.ACTIONS.CHAPTER_CONTENT_SAVE, { id: currentChapterId.value, content: content.value, version_tag: 'auto' })
  }, 2500)
})

function onEditorChange(v: string) { content.value = v }

async function insertAiText(text: string) {
  content.value += text
  editor.value?.setContent(content.value)
  await manualSave()
}

onMounted(loadProject)
</script>

<template>
  <div class="editor-page">
    <div class="ep-left">
      <div class="between" style="padding:10px 14px;border-bottom:1px solid var(--border)">
        <b>章节目录</b>
        <el-button size="small" type="primary" @click="createVolume">+ 新建卷</el-button>
      </div>
      <ChapterTree
        :volumes="volumes"
        :chapters="chapters"
        :current-chapter-id="currentChapterId"
        @create-chapter="createChapter"
        @select="selectChapter"
        @delete="deleteChapter"
      />
    </div>

    <div class="ep-center">
      <div class="ep-header between">
        <div>
          <span class="muted">{{ breadcrumb }}</span>
          <span v-if="currentChapter"> &nbsp;/&nbsp; {{ currentChapter.title }}</span>
        </div>
        <div class="flex gap-12">
          <span class="muted">字数：{{ content.length }}</span>
          <el-button size="small" @click="manualSave">手动保存</el-button>
        </div>
      </div>
      <NovelEditor v-if="currentChapterId" ref="editor" :content="content" @update="onEditorChange" />
      <div v-else class="center" style="height:100%;color:var(--text-muted)">请从左侧选择章节</div>
    </div>

    <div class="ep-right" v-show="ui.rightPanel">
      <div class="between" style="padding:10px 14px;border-bottom:1px solid var(--border)">
        <b>AI 助手</b>
        <el-button size="small" link @click="ui.toggleRight">收起</el-button>
      </div>
      <AiPanel ref="aiPanel" :project-id="projectId" :context="content" @insert="insertAiText" />
    </div>
  </div>
</template>

<style scoped>
.editor-page { display: flex; height: 100%; }
.ep-left { width: 240px; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; }
.ep-center { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.ep-right { width: 320px; background: var(--surface); border-left: 1px solid var(--border); display: flex; flex-direction: column; }
.ep-header { padding: 10px 18px; border-bottom: 1px solid var(--border); background: var(--surface); }
</style>
