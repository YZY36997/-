import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'

export interface Generator {
  id: string
  category: string
  name: string
  description: string
  systemPrompt: string
  userPromptTemplate: string
  defaultParams: {
    temperature: number
    maxTokens: number
  }
  isCustom: boolean
  project_id: string | null
  createdAt: string
}

export interface GeneratorCategory {
  id: string
  name: string
  description?: string
}

const BUILTIN_CATEGORIES: GeneratorCategory[] = [
  { id: 'outline', name: '大纲类' },
  { id: 'character', name: '人物类' },
  { id: 'worldview', name: '世界观类' },
  { id: 'plot', name: '情节类' },
  { id: 'dialogue', name: '对话类' },
  { id: 'writing', name: '文风/润色类' },
  { id: 'tool', name: '工具类' },
  { id: 'template', name: '爆文模板类' },
  { id: 'custom', name: '自定义' }
]

const BUILTIN_GENERATORS: Generator[] = [
  {
    id: 'gen_outline_basic',
    category: 'outline',
    name: '通用大纲生成器',
    description: '从一个简短创意生成完整小说大纲',
    systemPrompt: '你是一个资深网文编辑，擅长将创意打磨成完整可行的小说大纲。请严格按照大纲结构输出：核心卖点、主题、主线、分卷、章节列表、结局设计。',
    userPromptTemplate: '用户创意：\n{input}\n\n题材：{genre}\n文风：{style}\n请输出完整大纲。',
    defaultParams: { temperature: 0.9, maxTokens: 3000 },
    isCustom: false,
    project_id: null,
    createdAt: new Date().toISOString()
  },
  {
    id: 'gen_outline_brokeback',
    category: 'outline',
    name: '爽文大纲生成器',
    description: '按爆文套路生成爽文型大纲',
    systemPrompt: '你是爽文大神，精通扮猪吃虎、升级打脸、金手指无敌等套路。请设计节奏紧凑、冲突明确的爽文大纲。',
    userPromptTemplate: '主题：{input}\n请按以下结构输出：1)金手指设计 2)主角人设 3)主线冲突 4)分卷大事件 5)高潮与结局',
    defaultParams: { temperature: 0.9, maxTokens: 3000 },
    isCustom: false,
    project_id: null,
    createdAt: new Date().toISOString()
  },
  {
    id: 'gen_character_card',
    category: 'character',
    name: '人物卡片生成器',
    description: '生成完整的人物设定卡片',
    systemPrompt: '你是网文人物设计专家。请生成生动、立体的人物设定，包含外貌、性格、成长轨迹、关系网络等。',
    userPromptTemplate: '人物定位：{input}\n请输出：姓名/外貌/性格/动机/背景/关系网络/成长轨迹',
    defaultParams: { temperature: 0.8, maxTokens: 2000 },
    isCustom: false,
    project_id: null,
    createdAt: new Date().toISOString()
  },
  {
    id: 'gen_worldview_basic',
    category: 'worldview',
    name: '世界观设定生成器',
    description: '构建完整世界观体系',
    systemPrompt: '你是世界级奇幻/科幻设定专家，请构建严谨自洽的世界观体系，包含地理、历史、力量体系、社会结构、文化风俗等。',
    userPromptTemplate: '核心创意：{input}\n请输出完整世界观。',
    defaultParams: { temperature: 0.85, maxTokens: 2500 },
    isCustom: false,
    project_id: null,
    createdAt: new Date().toISOString()
  },
  {
    id: 'gen_plot_conflict',
    category: 'plot',
    name: '冲突桥段生成器',
    description: '设计高潮/反转/冲突桥段',
    systemPrompt: '你是顶级剧情设计顾问，擅长设计令人拍案叫绝的剧情冲突、反转和高潮。',
    userPromptTemplate: '当前章节背景：{input}\n请设计一个精彩冲突桥段（含起因、经过、反转、结果）。',
    defaultParams: { temperature: 0.95, maxTokens: 2000 },
    isCustom: false,
    project_id: null,
    createdAt: new Date().toISOString()
  },
  {
    id: 'gen_dialogue_smart',
    category: 'dialogue',
    name: '智慧对话生成器',
    description: '生成机智/嘴炮/深情的对话',
    systemPrompt: '你是台词大师，请为人物生成符合人设、有张力、信息量高的对话。',
    userPromptTemplate: '人物A：{characterA}\n人物B：{characterB}\n场景：{scene}\n请输出5-8回合精彩对话。',
    defaultParams: { temperature: 0.9, maxTokens: 1500 },
    isCustom: false,
    project_id: null,
    createdAt: new Date().toISOString()
  },
  {
    id: 'gen_writing_enhance',
    category: 'writing',
    name: '文本润色器',
    description: '提升已有文字的表达质量',
    systemPrompt: '你是文学编辑，擅长将普通文字改写成有画面感、有节奏、有张力的高质量文字。',
    userPromptTemplate: '原文：\n{input}\n请润色，要求：{requirement}',
    defaultParams: { temperature: 0.8, maxTokens: 2500 },
    isCustom: false,
    project_id: null,
    createdAt: new Date().toISOString()
  },
  {
    id: 'gen_tool_names',
    category: 'tool',
    name: '批量起名助手',
    description: '批量生成人名/地名/势力名/功法名',
    systemPrompt: '你是起名大师，请根据风格生成有创意、好记、符合题材的名称。',
    userPromptTemplate: '类型：{type}(人名/地名/势力名/功法名/武器名)\n数量：{count}\n风格：{style}\n题材：{genre}\n请输出。',
    defaultParams: { temperature: 1.0, maxTokens: 1500 },
    isCustom: false,
    project_id: null,
    createdAt: new Date().toISOString()
  },
  {
    id: 'gen_template_kpi',
    category: 'template',
    name: '爆文KPI模板',
    description: '按爆文KPI数据生成高点击率标题和开头',
    systemPrompt: '你是网文爆款内容专家，熟悉行业KPI数据（开头300字停留时间、章节完读率、追读率等）。请按爆款模板生成内容。',
    userPromptTemplate: '题材：{genre}\n核心卖点：{sellingPoint}\n请生成：5个高点击率标题 + 300字黄金开头（包含悬念/冲突/金手指亮点）',
    defaultParams: { temperature: 0.9, maxTokens: 2500 },
    isCustom: false,
    project_id: null,
    createdAt: new Date().toISOString()
  },
  {
    id: 'gen_template_hooks',
    category: 'template',
    name: '钩子模板生成器',
    description: '章节结尾钩子/悬念',
    systemPrompt: '你是网文悬念大师，擅长在章节结尾设计让读者欲罢不能的钩子。',
    userPromptTemplate: '当前章节内容：{input}\n请设计3个不同方向的结尾钩子（悬念、反转、危机）。',
    defaultParams: { temperature: 0.9, maxTokens: 1500 },
    isCustom: false,
    project_id: null,
    createdAt: new Date().toISOString()
  }
]

export const useGeneratorStore = defineStore('generator', () => {
  const generators = ref<Generator[]>([])
  const categories = ref<GeneratorCategory[]>(BUILTIN_CATEGORIES)
  const loading = ref(false)
  const generating = ref(false)
  const lastResult = ref('')

  const generatorsByCategory = computed(() => {
    const grouped: Record<string, Generator[]> = {}
    generators.value.forEach(g => {
      if (!grouped[g.category]) grouped[g.category] = []
      grouped[g.category].push(g)
    })
    return grouped
  })

  async function fetchGenerators(category?: string) {
    loading.value = true
    try {
      const response = await api.get('/api/generators')
      // 合并内置生成器 + 用户自定义生成器
      const customGens: Generator[] = Array.isArray(response.data) ? response.data : []
      const all = [...BUILTIN_GENERATORS, ...customGens]
      if (category) {
        generators.value = all.filter(g => g.category === category)
      } else {
        generators.value = all
      }
    } catch (error) {
      // 失败时只显示内置
      generators.value = category ? BUILTIN_GENERATORS.filter(g => g.category === category) : BUILTIN_GENERATORS
      console.error('获取生成器列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  async function fetchCategories() {
    try {
      const response = await api.get('/api/generators/categories')
      if (Array.isArray(response.data) && response.data.length > 0) {
        categories.value = [...BUILTIN_CATEGORIES, ...response.data]
      } else {
        categories.value = BUILTIN_CATEGORIES
      }
    } catch (_error) {
      categories.value = BUILTIN_CATEGORIES
    }
  }

  async function createGenerator(data: Partial<Generator>) {
    try {
      const response = await api.post('/api/generators', {
        ...data,
        isCustom: true,
        category: data.category || 'custom'
      })
      generators.value.push(response.data)
      return response.data
    } catch (error) {
      console.error('创建生成器失败:', error)
      return null
    }
  }

  async function updateGenerator(id: string, data: Partial<Generator>) {
    try {
      const response = await api.put(`/api/generators/${id}`, data)
      const index = generators.value.findIndex(g => g.id === id)
      if (index !== -1) generators.value[index] = response.data
      return response.data
    } catch (error) {
      console.error('更新生成器失败:', error)
      return null
    }
  }

  async function deleteGenerator(id: string) {
    try {
      await api.delete(`/api/generators/${id}`)
      generators.value = generators.value.filter(g => g.id !== id)
      return true
    } catch (error) {
      console.error('删除生成器失败:', error)
      return false
    }
  }

  async function generate(
    generatorId: string,
    params: Record<string, string>,
    projectId?: string,
    withProjectMaterial = false
  ) {
    generating.value = true
    lastResult.value = ''
    try {
      const response = await api.post('/api/generators/generate', {
        generator_id: generatorId,
        params,
        project_id: projectId,
        with_project_material: withProjectMaterial
      })
      lastResult.value = response.data.generated_text
      return response.data
    } catch (error: any) {
      console.error('生成失败:', error)
      const msg = error?.response?.data?.error || error?.message || '生成失败'
      throw new Error(msg)
    } finally {
      generating.value = false
    }
  }

  function setLastResult(text: string) {
    lastResult.value = text
  }

  return {
    generators,
    categories,
    loading,
    generating,
    lastResult,
    generatorsByCategory,
    fetchGenerators,
    fetchCategories,
    createGenerator,
    updateGenerator,
    deleteGenerator,
    generate,
    setLastResult,
    BUILTIN_GENERATORS,
    BUILTIN_CATEGORIES
  }
})
