import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 数据目录（开发模式：<project>/backend/data；生产：<resources>/data）
const DATA_DIR = process.env.VITE_DEV_SERVER_URL
  ? path.join(__dirname, '..', 'backend', 'data')
  : path.join(process.resourcesPath || '', 'data')

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }) } catch (e) { console.warn('数据目录创建失败', e.message) }
}

// 导入路由
import projectsRouter from './routes/projects.js'
import materialsRouter from './routes/materials.js'
import generatorsRouter from './routes/generators.js'
import outlineRouter from './routes/outline.js'
import templatesRouter from './routes/templates.js'
import settingsRouter from './routes/settings.js'
import charactersRouter from './routes/characters.js'
import chaptersRouter from './routes/chapters.js'
import aiChapterRouter from './routes/ai-chapter.js'
import authRouter from './routes/auth.ts'

const app = express()
const PORT = process.env.PORT || 3001

// 中间件
app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 静态文件服务（开发模式下提供数据访问）
app.use('/data', express.static(DATA_DIR))

// API 路由
app.use('/api/projects', projectsRouter)
app.use('/api/materials', materialsRouter)
app.use('/api/generators', generatorsRouter)
app.use('/api/outline', outlineRouter)
app.use('/api/templates', templatesRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/characters', charactersRouter)
app.use('/api/chapters', chaptersRouter)
app.use('/api/ai-chapter', aiChapterRouter)
app.use('/api/auth', authRouter)

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    dataDir: DATA_DIR,
    timestamp: new Date().toISOString(),
    features: ['projects', 'materials', 'chapters', 'characters', 'ai-chapter', 'outline', 'templates', 'generators', 'settings']
  })
})

// 获取数据目录路径
app.get('/api/data-path', (req, res) => {
  res.json({ dataDir: DATA_DIR })
})

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error('Server Error:', err)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

// 启动服务器
app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════')
  console.log('  灵墨小说工坊 API 服务已启动')
  console.log('  监听端口: http://localhost:' + PORT)
  console.log('  数据目录: ' + DATA_DIR)
  console.log('═══════════════════════════════════════════')
})

export default app
