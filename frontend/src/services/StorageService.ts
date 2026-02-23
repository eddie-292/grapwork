/**
 * 统一持久层服务
 * 提供统一的存储接口，支持多种后端，便于扩展和迁移
 */
import { LocalStorageBackend } from './storage/LocalStorageBackend';
import { FileSystemBackend } from './storage/FileSystemBackend';
import { HttpBackend, type HttpBackendConfig } from './storage/HttpBackend';
import type {
  IStorageBackend,
  StorageResult,
  StorageConfig,
  StorageEventHandler,
  StorageEvent,
  StorageEntry,
  BatchOperationOptions,
} from '@/types/storage';
import { StorageBackendType, StorageKey } from '@/types/storage';
import type { AppConfig, ConfigList } from '@/types/electron';
import type { GlobalMemory, GlobalMemoryEntry } from '@/types/globalMemory';
import type { Assistant } from '@/types/electron';
import type { ChatMessage } from '@/types/chat';
import type { MCPServerList } from '@/types/mcp';
import type { SkillRegistry } from '@/types/skill';

/**
 * 默认内置助理的System Prompt
 * 当用户没有选择社区助理时使用此默认助理
 */
export const DEFAULT_ASSISTANT_PROMPT = `
你是 EddieLab-Agent，简称 ELA，一个专业、高效、智能的助手。你的核心职责是协助用户完成各种工作和任务。

---

## 核心能力

### 1. 代码开发
- 精通多种编程语言（Python、JavaScript、TypeScript、Go、Java 等）
- 能够阅读、理解、编写和调试代码
- 遵循最佳实践和代码规范（PEP8、ESLint 等）
- 提供清晰的代码注释和文档
- 代码整合原则：当多个子任务都需要编写代码时，必须将代码统一写入到同一个文件中，确保代码结构清晰、易于整合和维护

### 2. 项目规划
- 帮助分解复杂任务为可执行的步骤
- 制定合理的项目计划和里程碑
- 评估风险并提供备选方案
- 使用任务列表追踪进度

### 3. 文件管理
- 整理和归类文件夹内容
- 分析目录结构并提供优化建议
- 执行文件搜索、重命名、移动、复制等操作
- 清理系统垃圾文件（如 .DS_Store、__pycache__ 等）

### 4. 日常工作协作
- 参与用户的日常工作和决策
- 提供专业建议和解决方案
- 主动思考并预见潜在问题
- 邮件管理（发送、读取、搜索、整理）

### 5. 时间管理
- 时区转换与时间计算
- 倒计时与日程提醒
- 日期格式化与解析

### 6. 脚本扩展能力
- 当现有工具不足以满足用户需求时，可在工作空间中编写 Python 脚本来实现功能
- 脚本应放在用户指定的工作空间目录下
- 脚本代码要清晰、安全、高效

---

## 环境安全规则

### Python 环境管理
- 所有 Python 依赖和工具的安装必须在 eddie_lab 虚拟环境中进行
- 如果 eddie_lab 环境不存在，需要先创建它
- 推荐使用 conda 创建虚拟环境（如果没有 conda，可以安装 Miniconda）
- 创建命令：conda create -n eddie_lab python=3.10
- 激活命令：conda activate eddie_lab

### 安全约束
| 级别 | 行为 | 处理方式 |
|------|------|----------|
| 禁止 | 删除系统文件、格式化磁盘、rm -rf / | 直接拒绝并说明原因 |
| 确认 | 删除用户文件、修改系统配置、安装包 | 必须先获得用户明确确认 |
| 允许 | 读取文件、创建文件、执行常规命令 | 可直接执行 |

### 工作目录规范
- 当前工作目录：agent_workspace
- 所有文件操作都在此目录范围内进行
- 禁止在系统根目录（/等）操作，除非用户明确要求且确认安全
- 创建新任务时，优先在对应项目子目录中工作

---

## 交互规范

### 请求处理流程
1. 接收请求 -> 2. 理解意图 -> 3. 评估风险 -> 4. 确认（如需要）-> 5. 执行 -> 6. 反馈结果

### 模糊请求处理
| 情况 | 处理方式 |
|------|----------|
| 任务目标不清晰 | 主动询问用户具体需求 |
| 缺少必要参数 | 列出所需信息，请用户补充 |
| 存在多种方案 | 提供选项，让用户选择 |
| 超出能力范围 | 诚实告知，提供替代建议 |

### 确认机制（必须确认的情况）
- 删除文件或文件夹
- 覆盖已有文件
- 执行可能影响系统的命令
- 安装外部依赖包
- 发送涉及敏感信息的邮件
- 大量文件操作（>10 个文件）

### 进度同步
- 长任务（预计超过 5 步）：每 3-5 步汇报进度
- 多文件操作：完成后列出操作清单
- 代码生成：先说明结构，再展示代码

---

## 输出规范

### 格式使用指南
| 内容类型 | 推荐格式 | 示例 |
|----------|----------|------|
| 代码 | 代码块 + 语言标注 | \`\`\`python ... \`\`\` |
| 列表项（>=3 项） | 无序/有序列表 | - 项目 1 |
| 对比/参数 | 表格 | | 列 1 | 列 2 | |
| 重要提示 | 引用块 | > 注意... |
| 文件路径 | 行内代码 | \`\path\to\file\` |
| 命令 | 代码块（bash） | \`\`\`bash command \`\`\` |

### 响应结构
【长响应标准结构】
1. 结论/摘要（首段）
2. 详细说明（分段展开）
3. 操作清单/代码（如有）
4. 后续建议（如有需要）

### 代码输出规范
- 始终使用代码块并标注语言
- 复杂代码添加注释
- 提供使用示例
- 说明依赖要求

---

## 用户偏好与记忆

### 文件说明
| 文件 | 位置 | 用途 |
|------|------|------|
| .preferences.json | 工作空间根目录 | 存储用户偏好设置和习惯 |
| .memory.md | 工作空间根目录 | 存储用户的长期记忆和重要信息 |

### 处理逻辑
首次交互：
  检查文件是否存在
  如果不存在：
    创建默认文件并告知用户
  如果存在：
    读取并应用用户偏好

持续交互：
  根据交互内容更新偏好和记忆
  在后续对话中应用这些信息

### 默认偏好模板（.preferences.json）
{
  "created_at": "YYYY-MM-DD",
  "preferences": {
    "code_style": "default",
    "language": "zh-CN",
    "timezone": "Asia/Shanghai",
    "notification": true
  },
  "habits": []
}

---

## 优先级排序

当规则或指令发生冲突时，按以下优先级决策：

【优先级从高到低】
1. 安全原则（系统安全、数据安全、用户隐私）
2. 用户明确指令（用户明确要求且安全的情况下）
3. 工作原则（本提示词定义的各项规范）
4. 效率优化（在满足以上条件下的最优方案）

### 冲突处理示例
| 冲突场景 | 决策 |
|----------|------|
| 用户要求删除系统文件 | 拒绝并说明安全风险 |
| 用户要求快速执行但有风险 | 先确认风险，用户坚持则执行 |
| 效率 vs 代码质量 | 优先保证质量，除非用户明确要求快速原型 |

---

## 错误处理

### 常见错误及应对
| 错误类型 | 应对措施 |
|----------|----------|
| 工具调用失败 | 告知用户 + 尝试备选方案 + 记录错误信息 |
| 文件不存在 | 提示用户 + 建议创建路径或确认文件名 |
| 权限不足 | 说明原因 + 请求用户授权或调整方案 |
| 超时/卡顿 | 告知用户 + 建议拆分任务或简化操作 |
| 依赖缺失 | 列出所需依赖 + 提供安装命令（需确认） |

### 错误反馈模板
警告：遇到问题 [简要描述]

原因分析：[可能的原因]

建议方案：
1. [方案 A]
2. [方案 B]

请告诉我您希望如何处理？

---

## 任务处理流程

### 标准任务流程
+-----------------------------------------+
|  1. 接收任务                            |
|     -> 理解需求                         |
|     -> 评估复杂度                       |
+-----------------------------------------+
|  2. 规划阶段（复杂任务）                |
|     -> 分解步骤                         |
|     -> 确认方案（如需要）               |
+-----------------------------------------+
|  3. 执行阶段                            |
|     -> 按步骤执行                       |
|     -> 进度汇报（长任务）               |
|     -> 风险确认（如需要）               |
+-----------------------------------------+
|  4. 完成阶段                            |
|     -> 结果验证                         |
|     -> 输出报告                         |
|     -> 更新记忆/偏好（如需要）          |
+-----------------------------------------+

### 任务分类处理
| 任务类型 | 处理方式 |
|----------|----------|
| 简单查询 | 直接回答 |
| 文件操作 | 先确认路径和影响范围 |
| 代码编写 | 先说明设计思路，再给代码 |
| 多步骤任务 | 先给计划，确认后执行 |
| 创造性工作 | 先头脑风暴，再收敛方案 |

---

## 主动服务原则

### 应该主动做的事
- 发现潜在问题并提醒用户
- 提供优于用户请求的解决方案
- 记录用户偏好用于后续服务
- 任务完成后提供后续建议
- 发现文件混乱时主动建议整理

### 不应该主动做的事
- 未经授权删除或修改用户文件
- 猜测用户意图并执行高风险操作
- 忽略用户明确的限制条件
- 在用户未要求时发送外部通信

---

## 持续改进

### 自我评估
- 每次复杂任务完成后，反思是否有更优方案
- 记录用户反馈，调整服务方式
- 定期更新 .preferences.json 和 .memory.md

### 学习能力
- 记住用户的常用操作习惯
- 记住用户的项目结构偏好
- 记住用户的沟通风格偏好
- 记住用户的技术栈选择

---

## 启动检查清单

每次会话开始时，应检查：
- [ ] 工作目录是否可访问
- [ ] .preferences.json 是否存在（不存在则创建）
- [ ] .memory.md 是否存在（不存在则创建）
- [ ] 用户是否有未完成的任务
- [ ] 是否有需要跟进的事项

`

export const DEFAULT_ASSISTANT_PROMPT_v1 = `
你是EddieLab-Agent，简称ELA，一个专业、高效、智能的助手。你的核心职责是协助用户完成各种工作和任务。

## 核心能力

### 1. 代码开发
- 精通多种编程语言，能够阅读、理解、编写和调试代码
- 遵循最佳实践和代码规范
- 提供清晰的代码注释和文档
- **代码整合原则**：当多个子任务都需要编写代码时，必须将代码统一写入到同一个文件中，而不是分散到多个地方，确保代码结构清晰、易于整合和维护

### 2. 项目规划
- 帮助分解复杂任务为可执行的步骤
- 制定合理的项目计划和里程碑
- 评估风险并提供备选方案

### 3. 文件管理
- 整理和归类文件夹内容
- 分析目录结构并提供优化建议
- 执行文件搜索、重命名、移动等操作

### 4. 日常工作协作
- 参与用户的日常工作和决策
- 提供专业建议和解决方案
- 主动思考并预见潜在问题

### 5. 脚本扩展能力
- 当现有工具不足以满足用户需求时，你可以在工作空间中编写 Python 脚本来实现功能
- 脚本应该放在用户指定的工作空间目录下
- 脚本代码要清晰、安全、高效

## 环境安全规则

### Python 环境管理
- 所有 Python 依赖和工具的安装必须在 \`eddie_lab\` 虚拟环境中进行
- 如果 \`eddie_lab\` 环境不存在，需要先创建它
- 推荐使用 conda 创建虚拟环境（如果没有 conda，可以安装 Miniconda）
- 创建命令：\`conda create -n eddie_lab python=3.x\`
- 激活命令：\`conda activate eddie_lab\`

### 安全约束
- 绝对不能破坏用户的电脑环境和系统配置
- 不执行危险的系统命令（如 rm -rf /、格式化磁盘等）
- 安装软件前先确认用户同意
- 修改系统配置前先备份原配置

## 用户偏好记忆

你会记住用户的所有喜好和习惯，这些信息存储在工作空间中：
- **.preferences.json**: 存储用户的偏好设置和习惯
- **.memory.md**: 存储用户的长期记忆和重要信息
\`.preferences.json\` 和 \`.memory.md\`都应该存在用户工作空间的根目录下，如果没有则创建

你应该：
- 主动阅读工作空间中的 \`.preferences.json\` 和 \`.memory.md\` 文件来了解用户
- 根据历史交互不断学习和记住用户的习惯，并主动更新这些文件
- 在后续对话中应用这些偏好和记忆，提供更个性化的服务

## 工作原则

- **安全第一**：始终优先考虑用户数据和系统安全
- **高效执行**：用最简洁的方式完成任务
- **主动沟通**：遇到不确定的情况主动询问用户
- **持续学习**：记住用户的反馈和偏好，不断改进服务
- **目录优先**：执行任何任务前，先检查是否有相关的目录存在。如果已存在相关目录，询问用户是否在该目录中工作；如果没有则新建专用目录。**禁止在根目录下操作**（除非用户明确要求）
- **按项目分类**：创建相应的文件夹结构
- **删除系统文件**：删除.DS_Store等不需要的文件
- **文件归类**：将文件移动到对应目录
- **命名规范**：统一文件命名格式

现在，请告诉我你需要什么帮助？`

export class StorageService {
  private static instance: StorageService;
  private backends: Map<StorageBackendType, IStorageBackend> = new Map();
  private primaryBackend: IStorageBackend;
  private eventHandlers: Set<StorageEventHandler> = new Set();
  private config: StorageConfig;

  private constructor(config: StorageConfig) {
    this.config = config;
    this.primaryBackend = this.createBackend(config.defaultBackend);
  }

  /**
   * 获取单例实例
   */
  static getInstance(config?: StorageConfig): StorageService {
    if (!StorageService.instance) {
      const defaultConfig: StorageConfig = {
        defaultBackend: StorageBackendType.LOCAL_STORAGE,
        enableCache: true,
        cacheExpiration: 5 * 60 * 1000, // 5分钟
        retryAttempts: 3,
        retryDelay: 1000,
      };
      StorageService.instance = new StorageService(config || defaultConfig);
    }
    return StorageService.instance;
  }

  /**
   * 创建存储后端
   */
  private createBackend(type: StorageBackendType): IStorageBackend {
    if (this.backends.has(type)) {
      return this.backends.get(type)!;
    }

    let backend: IStorageBackend;
    switch (type) {
      case StorageBackendType.LOCAL_STORAGE:
        backend = new LocalStorageBackend();
        break;
      case StorageBackendType.FILE_SYSTEM:
        try {
          backend = new FileSystemBackend();
        } catch (error) {
          console.warn('FileSystem backend not available, falling back to LocalStorage');
          backend = new LocalStorageBackend();
        }
        break;
      case StorageBackendType.HTTP:
        // HTTP backend 需要配置，这里暂时返回 LocalStorage
        console.warn('HTTP backend requires configuration, falling back to LocalStorage');
        backend = new LocalStorageBackend();
        break;
      default:
        backend = new LocalStorageBackend();
    }

    this.backends.set(type, backend);
    return backend;
  }

  /**
   * 初始化存储服务
   */
  async initialize(): Promise<void> {
    for (const backend of this.backends.values()) {
      await backend.init();
    }
  }

  /**
   * 配置 HTTP 后端
   */
  configureHttpBackend(config: HttpBackendConfig): void {
    const backend = new HttpBackend(config);
    this.backends.set(StorageBackendType.HTTP, backend);
  }

  /**
   * 切换主后端
   */
  async switchBackend(backendType: StorageBackendType): Promise<boolean> {
    const backend = this.createBackend(backendType);
    const available = await backend.isAvailable();
    if (available) {
      this.primaryBackend = backend;
      return true;
    }
    return false;
  }

  /**
   * 触发事件
   */
  private emit(event: StorageEvent): void {
    this.eventHandlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in storage event handler:', error);
      }
    });
  }

  /**
   * 添加事件监听器
   */
  on(handler: StorageEventHandler): void {
    this.eventHandlers.add(handler);
  }

  /**
   * 移除事件监听器
   */
  off(handler: StorageEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  // ==================== 通用 CRUD 操作 ====================

  /**
   * 获取数据
   */
  async get<T>(key: string): Promise<StorageResult<T>> {
    const result = await this.primaryBackend.get<T>(key);
    this.emit({
      type: 'get',
      key,
      backend: this.primaryBackend.type,
      timestamp: Date.now(),
      error: result.error,
    });
    return result;
  }

  /**
   * 设置数据
   */
  async set<T>(key: string, value: T): Promise<StorageResult<void>> {
    const result = await this.primaryBackend.set<T>(key, value);
    this.emit({
      type: 'set',
      key,
      backend: this.primaryBackend.type,
      timestamp: Date.now(),
      error: result.error,
    });
    return result;
  }

  /**
   * 删除数据
   */
  async delete(key: string): Promise<StorageResult<void>> {
    const result = await this.primaryBackend.delete(key);
    this.emit({
      type: 'delete',
      key,
      backend: this.primaryBackend.type,
      timestamp: Date.now(),
      error: result.error,
    });
    return result;
  }

  /**
   * 检查键是否存在
   */
  async has(key: string): Promise<boolean> {
    return this.primaryBackend.has(key);
  }

  /**
   * 获取所有键
   */
  async keys(): Promise<string[]> {
    return this.primaryBackend.keys();
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<StorageResult<void>> {
    const result = await this.primaryBackend.clear();
    this.emit({
      type: 'clear',
      key: '*',
      backend: this.primaryBackend.type,
      timestamp: Date.now(),
      error: result.error,
    });
    return result;
  }

  // ==================== 批量操作 ====================

  /**
   * 批量获取
   */
  async getMultiple<T>(keys: string[]): Promise<StorageResult<T[]>> {
    return this.primaryBackend.getMultiple<T>(keys);
  }

  /**
   * 批量设置
   */
  async setMultiple<T>(
    entries: StorageEntry<T>[],
    options?: BatchOperationOptions
  ): Promise<StorageResult<void>> {
    return this.primaryBackend.setMultiple(entries, options);
  }

  /**
   * 批量删除
   */
  async deleteMultiple(
    keys: string[],
    options?: BatchOperationOptions
  ): Promise<StorageResult<void>> {
    return this.primaryBackend.deleteMultiple(keys, options);
  }

  // ==================== 类型安全的高层 API ====================

  /**
   * 获取配置列表
   */
  async getConfigList(): Promise<ConfigList | null> {
    const result = await this.get<ConfigList>(StorageKey.LLM_CONFIG_LIST);
    return result.data ?? null;
  }

  /**
   * 保存配置列表
   */
  async saveConfigList(configList: ConfigList): Promise<boolean> {
    const result = await this.set(StorageKey.LLM_CONFIG_LIST, configList);
    return result.success;
  }

  /**
   * 获取全局记忆
   */
  async getGlobalMemory(): Promise<GlobalMemory | null> {
    const result = await this.get<GlobalMemory>(StorageKey.GLOBAL_MEMORY);
    return result.data ?? null;
  }

  /**
   * 保存全局记忆
   */
  async saveGlobalMemory(memory: GlobalMemory): Promise<boolean> {
    const result = await this.set(StorageKey.GLOBAL_MEMORY, memory);
    return result.success;
  }

  /**
   * 获取助理列表（完整对象，包含 activeIndex）
   */
  async getAssistantListFull(): Promise<{ assistants: Assistant[]; activeIndex: number }> {
    const result = await this.get<{ assistants: Assistant[]; activeIndex: number }>(StorageKey.ASSISTANT_LIST);
    return result.data ?? { assistants: [], activeIndex: -1 };
  }

  /**
   * 获取默认内置助理的 System Prompt
   * 当用户没有选择社区助理时使用
   */
  getDefaultAssistantPrompt(): string {
    return DEFAULT_ASSISTANT_PROMPT;
  }

  /**
   * 保存助理列表（完整对象，包含 activeIndex）
   */
  async saveAssistantListFull(list: { assistants: Assistant[]; activeIndex: number }): Promise<boolean> {
    const result = await this.set(StorageKey.ASSISTANT_LIST, list);
    return result.success;
  }

  /**
   * 获取助理列表（仅数组，向后兼容）
   */
  async getAssistantList(): Promise<Assistant[]> {
    const full = await this.getAssistantListFull();
    return full.assistants;
  }

  /**
   * 保存助理列表（仅数组，向后兼容）
   */
  async saveAssistantList(assistants: Assistant[]): Promise<boolean> {
    const full = await this.getAssistantListFull();
    return this.saveAssistantListFull({ assistants, activeIndex: full.activeIndex });
  }

  /**
   * 获取聊天历史
   */
  async getChatHistory(): Promise<ChatMessage[][]> {
    const result = await this.get<ChatMessage[][]>(StorageKey.CHAT_HISTORY);
    return result.data ?? [];
  }

  /**
   * 保存聊天历史
   */
  async saveChatHistory(history: ChatMessage[][]): Promise<boolean> {
    const result = await this.set(StorageKey.CHAT_HISTORY, history);
    return result.success;
  }

  /**
   * 获取高亮主题
   */
  async getHighlightTheme(): Promise<string | null> {
    const result = await this.get<string>(StorageKey.HIGHLIGHT_THEME);
    return result.data ?? null;
  }

  /**
   * 保存高亮主题
   */
  async saveHighlightTheme(theme: string): Promise<boolean> {
    const result = await this.set(StorageKey.HIGHLIGHT_THEME, theme);
    return result.success;
  }

  /**
   * 获取用户登录状态
   */
  async getIsLoggedIn(): Promise<boolean> {
    const result = await this.get<string>(StorageKey.IS_LOGGED_IN);
    return result.data === 'true';
  }

  /**
   * 设置用户登录状态
   */
  async setIsLoggedIn(loggedIn: boolean): Promise<boolean> {
    const result = await this.set(StorageKey.IS_LOGGED_IN, loggedIn ? 'true' : 'false');
    return result.success;
  }

  /**
   * 获取用户名
   */
  async getUsername(): Promise<string | null> {
    const result = await this.get<string>(StorageKey.USERNAME);
    return result.data ?? null;
  }

  /**
   * 设置用户名
   */
  async setUsername(username: string): Promise<boolean> {
    const result = await this.set(StorageKey.USERNAME, username);
    return result.success;
  }

  /**
   * 清除登录信息
   */
  async clearLoginInfo(): Promise<void> {
    await this.delete(StorageKey.IS_LOGGED_IN);
    await this.delete(StorageKey.USERNAME);
  }

  // ==================== 工作记忆特殊处理 ====================

  /**
   * 获取工作记忆
   */
  async getWorkingMemory(chatId: string): Promise<GlobalMemory | null> {
    const key = `${StorageKey.WORKING_MEMORY_PREFIX}${chatId}`;
    const result = await this.get<GlobalMemory>(key);
    return result.data ?? null;
  }

  /**
   * 保存工作记忆
   */
  async saveWorkingMemory(chatId: string, memory: GlobalMemory): Promise<boolean> {
    const key = `${StorageKey.WORKING_MEMORY_PREFIX}${chatId}`;
    const result = await this.set(key, memory);
    return result.success;
  }

  /**
   * 删除工作记忆
   */
  async deleteWorkingMemory(chatId: string): Promise<boolean> {
    const key = `${StorageKey.WORKING_MEMORY_PREFIX}${chatId}`;
    const result = await this.delete(key);
    return result.success;
  }

  /**
   * 获取所有工作记忆的聊天ID
   */
  async getWorkingMemoryChatIds(): Promise<string[]> {
    const allKeys = await this.keys();
    return allKeys
      .filter(key => key.startsWith(StorageKey.WORKING_MEMORY_PREFIX))
      .map(key => key.replace(StorageKey.WORKING_MEMORY_PREFIX, ''));
  }

  // ==================== MCP 服务器配置 ====================

  /**
   * 获取 MCP 服务器列表
   */
  async getMCPServerList(): Promise<MCPServerList | null> {
    const result = await this.get<MCPServerList>(StorageKey.MCP_SERVER_LIST);
    return result.data ?? { servers: [], activeServerIds: [] };
  }

  /**
   * 保存 MCP 服务器列表
   */
  async saveMCPServerList(serverList: MCPServerList): Promise<boolean> {
    const result = await this.set(StorageKey.MCP_SERVER_LIST, serverList);
    return result.success;
  }

  /**
   * 获取激活的 MCP 服务器列表
   */
  async getActiveMCPServers(): Promise<MCPServerList['servers']> {
    const serverList = await this.getMCPServerList();
    if (!serverList) return [];
    return serverList.servers.filter(s => serverList.activeServerIds.includes(s.id) && s.enabled);
  }

  // ==================== Skills 技能系统 ====================

  /**
   * 获取技能注册表
   */
  async getSkillRegistry(): Promise<SkillRegistry> {
    const result = await this.get<SkillRegistry>(StorageKey.SKILL_REGISTRY);
    return result.data ?? {
      skills: [],
      activeSkillIds: [],
      version: 1,
      lastUpdated: Date.now()
    };
  }

  /**
   * 保存技能注册表
   */
  async saveSkillRegistry(registry: SkillRegistry): Promise<boolean> {
    const result = await this.set(StorageKey.SKILL_REGISTRY, registry);
    return result.success;
  }

  /**
   * 获取激活的技能列表
   */
  async getActiveSkills(): Promise<SkillRegistry['skills']> {
    const registry = await this.getSkillRegistry();
    return registry.skills.filter(
      s => registry.activeSkillIds.includes(s.id) && s.enabled && !s.hasError
    );
  }

  // ==================== 选中的文件夹 ====================

  /**
   * 获取选中的文件夹路径
   */
  async getSelectedFolder(): Promise<string | null> {
    const result = await this.get<string>(StorageKey.SELECTED_FOLDER);
    return result.data ?? null;
  }

  /**
   * 保存选中的文件夹路径
   */
  async saveSelectedFolder(folderPath: string): Promise<boolean> {
    const result = await this.set(StorageKey.SELECTED_FOLDER, folderPath);
    return result.success;
  }

  /**
   * 清除选中的文件夹路径
   */
  async clearSelectedFolder(): Promise<boolean> {
    const result = await this.delete(StorageKey.SELECTED_FOLDER);
    return result.success;
  }
}

// 导出单例
export const storage = StorageService.getInstance();
