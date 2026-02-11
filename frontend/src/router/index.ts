import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import ChatView from '../components/ChatView.vue'
import LoginView from '../components/LoginView.vue'
import SettingsView from '../components/SettingsView.vue'
import { storage } from '../services/StorageService'

// 检查登录状态（兼容旧版本 localStorage）
async function isAuthenticated(): Promise<boolean> {
  // 先检查新的持久层
  const loggedIn = await storage.getIsLoggedIn()
  // 如果持久层有数据，直接返回
  // 兼容旧版本 localStorage（用于数据迁移）
  if (!loggedIn) {
    const oldLoggedIn = localStorage.getItem('isLoggedIn') === 'true'
    if (oldLoggedIn) {
      // 迁移到新的持久层
      await storage.setIsLoggedIn(true)
      const oldUsername = localStorage.getItem('username')
      if (oldUsername) {
        await storage.setUsername(oldUsername)
      }
      // 清除旧数据
      localStorage.removeItem('isLoggedIn')
      localStorage.removeItem('username')
      return true
    }
  }
  return loggedIn
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    name: 'Chat',
    component: ChatView,
    meta: { requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: SettingsView,
    meta: { requiresAuth: true }
  },
  // 重定向旧路由到统一设置页面
  {
    path: '/assistants',
    redirect: '/settings?tab=assistants'
  },
  {
    path: '/global-memory',
    redirect: '/settings?tab=memory'
  },
  {
    path: '/mcp',
    redirect: '/settings?tab=mcp'
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 路由守卫：检查登录状态
router.beforeEach(async (to, _from, next) => {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  const loggedIn = await isAuthenticated()

  if (requiresAuth && !loggedIn) {
    // 需要登录但未登录，重定向到登录页
    next('/login')
  } else if (to.path === '/login' && loggedIn) {
    // 已登录但访问登录页，重定向到主页
    next('/')
  } else {
    next()
  }
})

export default router
