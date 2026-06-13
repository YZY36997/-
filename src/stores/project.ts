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

  const sortedProjects = computed(() => {
    return [...projects.value].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
  })

  async function fetchProjects() {
    loading.value = true
    try {
      const response = await api.get('/api/projects')
      projects.value = response.data
    } catch (error) {
      console.error('获取项目列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  async function fetchProject(id: string) {
    try {
      const response = await api.get(`/api/projects/${id}`)
      currentProject.value = response.data
      return response.data
    } catch (error) {
      console.error('获取项目详情失败:', error)
      return null
    }
  }

  async function createProject(data: Partial<Project>) {
    try {
      const response = await api.post('/api/projects', data)
      projects.value.push(response.data)
      return response.data
    } catch (error) {
      console.error('创建项目失败:', error)
      return null
    }
  }

  async function updateProject(id: string, data: Partial<Project>) {
    try {
      const response = await api.put(`/api/projects/${id}`, data)
      const index = projects.value.findIndex(p => p.id === id)
      if (index !== -1) projects.value[index] = response.data
      if (currentProject.value?.id === id) currentProject.value = response.data
      return response.data
    } catch (error) {
      console.error('更新项目失败:', error)
      return null
    }
  }

  async function deleteProject(id: string) {
    try {
      await api.delete(`/api/projects/${id}`)
      projects.value = projects.value.filter(p => p.id !== id)
      if (currentProject.value?.id === id) currentProject.value = null
      return true
    } catch (error) {
      console.error('删除项目失败:', error)
      return false
    }
  }

  // 导入大纲
  async function importOutline(params: {
    outline: any
    project_name?: string
    project_id?: string
    auto_split?: boolean
  }) {
    try {
      const response = await api.post('/api/outline/import', params)
      await fetchProjects()
      return response.data
    } catch (error) {
      console.error('导入大纲失败:', error)
      return null
    }
  }

  // 补全大纲
  async function completeOutline(params: {
    incomplete_outline: string
    style?: string
    project_id?: string
  }) {
    try {
      const response = await api.post('/api/outline/complete', params)
      return response.data
    } catch (error) {
      console.error('补全大纲失败:', error)
      return null
    }
  }

  // 合成大纲
  async function mergeOutlines(params: {
    outlines: string[]
    style?: string
    project_id?: string
  }) {
    try {
      const response = await api.post('/api/outline/merge', params)
      return response.data
    } catch (error) {
      console.error('合成大纲失败:', error)
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
