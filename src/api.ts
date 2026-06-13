import axios, { type AxiosInstance } from 'axios'

// 检测是否运行在 Electron 环境
const isElectron = typeof window !== 'undefined' && 'electronAPI' in window

// Electron 生产模式下，API 由本地 Electron 主进程启动，端口 3001
// Web 开发模式下，使用 Vite 代理 (/api -> http://localhost:3001)
const baseURL = isElectron
  ? 'http://localhost:3001'
  : ''

const api: AxiosInstance = axios.create({
  baseURL,
  timeout: 120000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 统一错误拦截
api.interceptors.response.use(
  response => response,
  error => {
    console.error('API 请求错误:', error?.response?.data || error?.message || error)
    return Promise.reject(error)
  }
)

export default api
export { isElectron, baseURL }
