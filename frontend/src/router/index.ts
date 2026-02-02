import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import ChatView from '../components/ChatView.vue'
import LoginView from '../components/LoginView.vue'
import SettingsView from '../components/SettingsView.vue'
import AssistantView from '../components/AssistantView.vue'

// 检查登录状态
function isAuthenticated(): boolean {
  return localStorage.getItem('isLoggedIn') === 'true'
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
  {
    path: '/assistants',
    name: 'Assistants',
    component: AssistantView,
    meta: { requiresAuth: true }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 路由守卫：检查登录状态
router.beforeEach((to, _from, next) => {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)

  if (requiresAuth && !isAuthenticated()) {
    // 需要登录但未登录，重定向到登录页
    next('/login')
  } else if (to.path === '/login' && isAuthenticated()) {
    // 已登录但访问登录页，重定向到主页
    next('/')
  } else {
    next()
  }
})

export default router
