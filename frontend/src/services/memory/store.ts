/**
 * 记忆存储模块
 * 
 * 负责记忆数据的持久化存储，支持：
 * - 原子写入
 * - 内存缓存
 * - 文件变更检测
 * 
 * 注意：此模块使用 Node.js API，仅可在 Electron 主进程中使用
 */

import type { MemoryData } from './types'
import { createEmptyMemory } from './types'

/**
 * 存储接口
 * 可以有不同的实现（文件、数据库等）
 */
export interface IMemoryStore {
  load(): Promise<MemoryData>
  save(data: MemoryData): Promise<boolean>
  clear(): Promise<boolean>
}

/**
 * 文件存储实现
 * 用于 Electron 主进程
 */
export class FileMemoryStore implements IMemoryStore {
  private filePath: string
  private cache: MemoryData | null = null
  private lastMtime: number = 0

  constructor(filePath: string) {
    this.filePath = filePath
  }

  /**
   * 加载记忆数据
   */
  async load(): Promise<MemoryData> {
    try {
      // 动态导入 Node.js 模块
      const fs = await import('fs')
      const exists = fs.existsSync(this.filePath)

      if (!exists) {
        // 创建空记忆并保存
        const emptyMemory = createEmptyMemory()
        await this.save(emptyMemory)
        return emptyMemory
      }

      // 检查文件修改时间
      const stats = fs.statSync(this.filePath)
      const currentMtime = stats.mtimeMs

      // 如果缓存有效，直接返回
      if (this.cache && currentMtime === this.lastMtime) {
        return this.cache
      }

      // 读取文件
      const content = fs.readFileSync(this.filePath, 'utf-8')
      const data = JSON.parse(content) as MemoryData

      // 更新缓存
      this.cache = data
      this.lastMtime = currentMtime

      return data
    } catch (error) {
      console.error('[MemoryStore] 加载记忆失败:', error)
      // 返回空记忆
      return createEmptyMemory()
    }
  }

  /**
   * 保存记忆数据（原子写入）
   */
  async save(data: MemoryData): Promise<boolean> {
    try {
      // 动态导入 Node.js 模块
      const fs = await import('fs')
      const path = await import('path')

      // 确保目录存在
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      // 更新时间戳
      data.lastUpdated = new Date().toISOString()

      // 原子写入：先写临时文件，再重命名
      const tempPath = this.filePath + '.tmp'
      const content = JSON.stringify(data, null, 2)

      fs.writeFileSync(tempPath, content, 'utf-8')
      fs.renameSync(tempPath, this.filePath)

      // 更新缓存
      this.cache = data
      this.lastMtime = Date.now()

      return true
    } catch (error) {
      console.error('[MemoryStore] 保存记忆失败:', error)
      return false
    }
  }

  /**
   * 清空记忆
   */
  async clear(): Promise<boolean> {
    try {
      const emptyMemory = createEmptyMemory()
      return await this.save(emptyMemory)
    } catch (error) {
      console.error('[MemoryStore] 清空记忆失败:', error)
      return false
    }
  }

  /**
   * 获取文件路径
   */
  getFilePath(): string {
    return this.filePath
  }
}

/**
 * 内存存储实现
 * 用于测试或临时存储
 */
export class InMemoryStore implements IMemoryStore {
  private data: MemoryData

  constructor() {
    this.data = createEmptyMemory()
  }

  async load(): Promise<MemoryData> {
    return { ...this.data }
  }

  async save(data: MemoryData): Promise<boolean> {
    this.data = { ...data }
    return true
  }

  async clear(): Promise<boolean> {
    this.data = createEmptyMemory()
    return true
  }
}

/**
 * 存储管理器
 * 单例模式，管理全局存储实例
 */
let storeInstance: IMemoryStore | null = null

/**
 * 初始化存储
 */
export function initMemoryStore(store: IMemoryStore): void {
  storeInstance = store
}

/**
 * 获取存储实例
 */
export function getMemoryStore(): IMemoryStore {
  if (!storeInstance) {
    throw new Error('[MemoryStore] 存储未初始化，请先调用 initMemoryStore')
  }
  return storeInstance
}

/**
 * 创建默认文件存储
 * 在 Electron 主进程中使用
 */
export async function createDefaultFileStore(userDataPath: string): Promise<FileMemoryStore> {
  const path = await import('path')
  const memoryFilePath = path.join(userDataPath, 'memory', 'memory.json')
  return new FileMemoryStore(memoryFilePath)
}