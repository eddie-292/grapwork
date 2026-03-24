/**
 * 澄清工具状态管理
 * 使用 Vue 响应式 API 管理澄清请求状态
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import type {
  ClarificationRequest,
  ClarificationState,
  ClarificationType
} from '@/types/clarification'
import {
  CLARIFICATION_TYPE_LABELS
} from '@/types/clarification'

// 全局状态（单例模式）
const pendingRequest = ref<ClarificationRequest | null>(null)
const isWaiting = ref(false)

// 响应回调存储
let resolveCallback: ((answer: string | number) => void) | null = null
let rejectCallback: ((error: Error) => void) | null = null

// 计算属性
const hasPending = computed(() => pendingRequest.value !== null)

const clarificationType = computed(() => pendingRequest.value?.clarificationType)

const typeLabel = computed(() => {
  return clarificationType.value
    ? CLARIFICATION_TYPE_LABELS[clarificationType.value]
    : '澄清'
})

/**
 * 请求用户澄清
 * 返回 Promise，等待用户响应
 */
function requestClarification(
  question: string,
  clarificationType: ClarificationType,
  context?: string,
  options?: string[]
): Promise<string | number> {
  return new Promise((resolve, reject) => {
    // 如果已有待处理的请求，先取消
    if (pendingRequest.value) {
      rejectCallback?.(new Error('New clarification request received'))
    }

    // 创建新请求
    const request: ClarificationRequest = {
      id: `clarification_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      question,
      clarificationType,
      context,
      options,
      timestamp: Date.now()
    }

    // 设置待处理请求
    pendingRequest.value = request
    isWaiting.value = true

    // 保存回调
    resolveCallback = resolve
    rejectCallback = reject

    console.log('[Clarification] Request created:', request.id)
  })
}

// 状态更新函数
function setPending(request: ClarificationRequest | null) {
  pendingRequest.value = request
  isWaiting.value = request !== null
}

function clearPending() {
  pendingRequest.value = null
  isWaiting.value = false
}

// 响应函数
async function respond(answer: string | number): Promise<boolean> {
  if (!pendingRequest.value) return false

  const requestId = pendingRequest.value.id

  try {
    // 调用 IPC 提交响应
    if (window.electronAPI?.clarificationRespond) {
      const result = await window.electronAPI.clarificationRespond(requestId, answer)
      if (!result?.success) {
        console.error('[Clarification] Failed to submit response via IPC')
      }
    }

    // 触发回调
    if (resolveCallback) {
      resolveCallback(answer)
      resolveCallback = null
      rejectCallback = null
    }

    // 清除状态
    clearPending()

    console.log('[Clarification] Response submitted:', requestId, answer)
    return true
  } catch (error) {
    console.error('[Clarification] Failed to submit response:', error)
    return false
  }
}

// 取消函数
async function cancel(): Promise<boolean> {
  if (!pendingRequest.value) return false

  const requestId = pendingRequest.value.id

  try {
    // 调用 IPC 取消请求
    if (window.electronAPI?.clarificationCancel) {
      await window.electronAPI.clarificationCancel(requestId)
    }

    // 触发拒绝回调
    if (rejectCallback) {
      rejectCallback(new Error('User cancelled'))
      resolveCallback = null
      rejectCallback = null
    }

    // 清除状态
    clearPending()

    console.log('[Clarification] Request cancelled:', requestId)
    return true
  } catch (error) {
    console.error('[Clarification] Failed to cancel:', error)
    return false
  }
}

// 初始化监听器
let unsubscribePending: (() => void) | null = null
let unsubscribeState: (() => void) | null = null

function setupListeners(): () => void {
  // 监听新的澄清请求（来自主进程）
  if (window.electronAPI?.onClarificationPending) {
    unsubscribePending = window.electronAPI.onClarificationPending((request) => {
      console.log('[Clarification] Received pending request from main:', request)
      setPending(request)
    })
  }

  // 监听状态变化
  if (window.electronAPI?.onClarificationStateChanged) {
    unsubscribeState = window.electronAPI.onClarificationStateChanged((state) => {
      pendingRequest.value = state.pending
      isWaiting.value = state.isWaiting
    })
  }

  // 返回清理函数
  return () => {
    if (unsubscribePending) {
      unsubscribePending()
      unsubscribePending = null
    }
    if (unsubscribeState) {
      unsubscribeState()
      unsubscribeState = null
    }
  }
}

/**
 * 澄清工具 Store
 * 使用 Vue 响应式 API 实现的状态管理
 */
export function useClarificationStore() {
  return {
    // State
    pendingRequest,
    isWaiting,

    // Getters
    hasPending,
    clarificationType,
    typeLabel,

    // Actions
    requestClarification,
    setPending,
    clearPending,
    respond,
    cancel,
    setupListeners
  }
}

/**
 * 澄清工具 Composable
 * 用于在组件中自动管理监听器的生命周期
 */
export function useClarification() {
  let cleanup: (() => void) | null = null

  onMounted(async () => {
    // 设置监听器
    cleanup = setupListeners()

    // 获取当前待处理的请求
    try {
      const pending = await window.electronAPI?.clarificationGetPending?.()
      if (pending) {
        setPending(pending)
      }
    } catch (error) {
      console.error('[Clarification] Failed to get pending request:', error)
    }
  })

  onUnmounted(() => {
    if (cleanup) {
      cleanup()
      cleanup = null
    }
  })

  return {
    hasPending,
    pendingRequest,
    isWaiting,
    clarificationType,
    typeLabel,
    respond,
    cancel
  }
}

// 导出类型以供组件使用
export type { ClarificationRequest, ClarificationState, ClarificationType }