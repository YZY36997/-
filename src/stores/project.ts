import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'

export interface Project {
  id: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
  outline: {
    title: string
    summary: string
    content?: string
    chapters: any[]
  }
  settings: {
    genre: string
    style: string
  }
  generations?: Array<{
    generator: string
    prompt: string
    result: string
    createdAt: string
  }>
}

export const useProjectStore = defineStore('project', () => {
  const projects = ref<Project[]>([])
  const currentProject = ref<Project | null>(null)
  const loading = ref(false)
  const error = ref<string>('')

  const sortedProjects = computed(() => {
    return [...projects.value].sort((a, b) => {
      const timeA = new Date(a.updatedAt || a.createdAt).getTime()
      const timeB = new Date(b.updatedAt || b.createdAt).getTime()
      return timeB - timeA
    })
  })

  async function fetchProjects(): Promise<Project[]> {
    loading.value = true
    error.value = ''
    try {
      const response = await api.get('/api/projects')
      projects.value = Array.isArray(response.data) ? response.data : []
      return projects.value
    } catch (err: any) {
      error.value = err.message
      console.error('获取项目列表失败:', err)
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchProject(id: string): Promise<Project | null> {
    try {
      const response = await api.get(`/api/projects/${id}`)
      currentProject.value = response.data
      return response.data
    } catch (err) {
      // 如果后端不支持单个获取，从列表中查找
      const found = projects.value.find(p => p.id === id)
      if (found) {
        currentProject.value = found
        return found
      }
      console.error('获取项目详情失败:', err)
      return null
    }
  }

  async function createProject(data: Partial<Project>): Promise<Project | null> {
    try {
      const payload = {
        name: data.name || '未命名项目',
        description: data.description || '',
        outline: data.outline || { title: '', summary: '', chapters: [] },
        settings: data.settings || { genre: '玄幻', style: '爽文风' }
      }
      const response = await api.post('/api/projects', payload)
      projects.value.push(response.data)
      currentProject.value = response.data
      return response.data
    } catch (err) {
      console.error('创建项目失败:', err)
      return null
    }
  }

  async function updateProject(id: string, data: Partial<Project>): Promise<Project | null> {
    try {
      const response = await api.put(`/api/projects/${id}`, data)
      const idx = projects.value.findIndex(p => p.id === id)
      if (idx !== -1) projects.value[idx] = response.data
      if (currentProject.value?.id === id) currentProject.value = response.data
      return response.data
    } catch (err) {
      console.error('更新项目失败:', err)
      return null
    }
  }

  async function deleteProject(id: string): Promise<boolean> {
    try {
      await api.delete(`/api/projects/${id}`)
      projects.value = projects.value.filter(p => p.id !== id)
      if (currentProject.value?.id === id) currentProject.value = null
      return true
    } catch (err) {
      console.error('删除项目失败:', err)
      return false
    }
  }

  // 大纲处理:残缺大纲补全
  async function completeOutline(params: {
    incomplete_outline: string
    style?: string
    project_id?: string
  }): Promise<string | null> {
    try {
      const response = await api.post('/api/outline/complete', {
        incomplete_outline: params.incomplete_outline,
        style: params.style || '爽文风',
        project_id: params.project_id
      })
      return response.data.completed_outline || response.data
    } catch (err) {
      console.error('补全大纲失败:', err)
      return null
    }
  }

  // 大纲合成
  async function mergeOutlines(params: {
    outlines: string[]
    style?: string
    project_id?: string
  }): Promise<string | null> {
    try {
      const response = await api.post('/api/outline/merge', {
        outlines: params.outlines,
        style: params.style || '爽文风',
        project_id: params.project_id
      })
      return response.data.merged_outline || response.data
    } catch (err) {
      console.error('合成大纲失败:', err)
      return null
    }
  }

  // 导入大纲
  async function importOutline(params: {
    outline: any
    project_name?: string
    project_id?: string
    auto_split?: boolean
  }): Promise<any | null> {
    try {
      const response = await api.post('/api/outline/import', params)
      if (response.data?.project_id) {
        await fetchProjects()
      }
      return response.data
    } catch (err) {
      console.error('导入大纲失败:', err)
      return null
    }
  }

  function setCurrentProject(project: Project | null) {
    currentProject.value = project
  }

  return {
    projects,
    currentProject,
    loading,
    error,
    sortedProjects,
    fetchProjects,
    fetchProject,
    createProject,
    updateProject,
    deleteProject,
    importOutline,
    completeOutline,
    mergeOutlines,
    setCurrentProject
  }
})
