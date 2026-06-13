import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

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
}

export const useGeneratorStore = defineStore('generator', () => {
  const generators = ref<Generator[]>([])
  const categories = ref<GeneratorCategory[]>([])
  const loading = ref(false)
  const generating = ref(false)
  const lastResult = ref('')

  const generatorsByCategory = computed(() => {
    const grouped: Record<string, Generator[]> = {}
    generators.value.forEach(g => {
      if (!grouped[g.category]) {
        grouped[g.category] = []
      }
      grouped[g.category].push(g)
    })
    return grouped
  })

  async function fetchGenerators(category?: string) {
    loading.value = true
    try {
      let url = '/api/generators'
      if (category) {
        url += `?category=${category}`
      }
      const response = await axios.get(url)
      generators.value = response.data
    } catch (error) {
      console.error('获取生成器列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  async function fetchCategories() {
    try {
      const response = await axios.get('/api/generators/categories')
      categories.value = response.data
    } catch (error) {
      console.error('获取分类失败:', error)
    }
  }

  async function createGenerator(data: Partial<Generator>) {
    try {
      const response = await axios.post('/api/generators', data)
      generators.value.push(response.data)
      return response.data
    } catch (error) {
      console.error('创建生成器失败:', error)
      return null
    }
  }

  async function updateGenerator(id: string, data: Partial<Generator>) {
    try {
      const response = await axios.put(`/api/generators/${id}`, data)
      const index = generators.value.findIndex(g => g.id === id)
      if (index !== -1) {
        generators.value[index] = response.data
      }
      return response.data
    } catch (error) {
      console.error('更新生成器失败:', error)
      return null
    }
  }

  async function deleteGenerator(id: string) {
    try {
      await axios.delete(`/api/generators/${id}`)
      generators.value = generators.value.filter(g => g.id !== id)
      return true
    } catch (error) {
      console.error('删除生成器失败:', error)
      return false
    }
  }

  async function generate(generatorId: string, params: Record<string, string>, projectId?: string, withProjectMaterial = false) {
    generating.value = true
    lastResult.value = ''
    try {
      const response = await axios.post('/api/generators/generate', {
        generator_id: generatorId,
        params,
        project_id: projectId,
        with_project_material: withProjectMaterial
      })
      lastResult.value = response.data.generated_text
      return response.data
    } catch (error: any) {
      console.error('生成失败:', error)
      throw error
    } finally {
      generating.value = false
    }
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
    generate
  }
})
