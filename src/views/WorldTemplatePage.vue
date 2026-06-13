<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { worldTemplateApi, projectApi } from '@/api'
import { Palette, ChevronRight } from 'lucide-vue-next'

const categories = ref<any[]>([])
const activeCategory = ref<string>('')
const activeTemplate = ref<any>(null)

onMounted(async () => {
  try {
    const data = await worldTemplateApi.list()
    categories.value = data?.categories || data || []
    if (categories.value.length) {
      activeCategory.value = categories.value[0].id
      activeTemplate.value = categories.value[0]
    }
  } catch (e) { /* ignore */ }
})

function select(cat: any) {
  activeCategory.value = cat.id
  activeTemplate.value = cat
}
</script>

<template>
  <div class="page">
    <div class="page-header">
      <h1><Palette /> 14项世界观问卷</h1>
      <p class="subtitle">玄幻 / 都市 / 科幻 / 悬疑 / 言情 · 一键套用到项目</p>
    </div>

    <el-row :gutter="20">
      <el-col :span="6">
        <el-card shadow="never">
          <div v-for="cat in categories" :key="cat.id" class="cat-item"
               :class="{ active: cat.id === activeCategory }"
               @click="select(cat)">
            <b>{{ cat.name || cat.id }}</b>
            <span class="arrow"><ChevronRight /></span>
          </div>
          <el-empty v-if="!categories.length" description="后端未返回模板列表" />
        </el-card>
      </el-col>
      <el-col :span="18">
        <el-card v-if="activeTemplate" shadow="never">
          <template #header>
            <div class="card-header">
              <span>{{ activeTemplate.name || activeTemplate.id }}</span>
            </div>
          </template>
          <p class="desc">{{ activeTemplate.description }}</p>
          <el-divider />
          <el-timeline>
            <el-timeline-item
              v-for="(q, idx) in (activeTemplate.questions || activeTemplate.items || [])"
              :key="idx"
              placement="top"
              :color="idx < 6 ? '#667eea' : idx < 10 ? '#f093fb' : '#11998e'"
            >
              <div class="q-box">
                <b>{{ idx + 1 }}. {{ q.question || q.title || q.label || q }}</b>
                <p v-if="q.hint || q.description">{{ q.hint || q.description }}</p>
              </div>
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<style scoped>
.page { max-width: 1400px; margin: 0 auto; padding: 24px; }
.page-header h1 { display: flex; align-items: center; gap: 12px; margin: 0 0 6px; font-size: 26px; color: #1a1a2e; }
.page-header .subtitle { color: #888; margin: 0 0 24px; }
.card-header { font-weight: 600; color: #1a1a2e; }
.cat-item { padding: 14px 12px; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; color: #444; }
.cat-item:hover { background: #f4f4ff; }
.cat-item.active { background: #eef0ff; color: #667eea; font-weight: 600; }
.cat-item .arrow { opacity: 0.6; display: flex; }
.q-box { line-height: 1.8; }
.q-box p { margin: 6px 0 0; color: #888; font-size: 13px; }
.desc { color: #666; line-height: 1.8; }
</style>
