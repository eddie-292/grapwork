<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { storage } from '../services/StorageService'

const router = useRouter()
const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function handleLogin() {
  if (!username.value || !password.value) {
    error.value = '请输入用户名和密码'
    return
  }

  loading.value = true
  error.value = ''

  // 模拟登录验证（实际项目中应该调用后端 API）
  setTimeout(async () => {
    if (username.value === 'admin' && password.value === 'admin') {
      // 登录成功，保存登录状态到持久层
      await storage.setIsLoggedIn(true)
      await storage.setUsername(username.value)
      // 重定向到主页
      router.push('/')
    } else {
      error.value = '用户名或密码错误'
    }
    loading.value = false
  }, 500)
}
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <div class="brand">
          <div class="brand-dot" />
          <span>OpenChat Desktop</span>
        </div>
        <h2>欢迎回来</h2>
        <p>请登录以继续使用</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label for="username">用户名</label>
          <input
            id="username"
            v-model="username"
            type="text"
            placeholder="请输入用户名"
            autocomplete="username"
          />
        </div>

        <div class="form-group">
          <label for="password">密码</label>
          <input
            id="password"
            v-model="password"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
          />
        </div>

        <div v-if="error" class="error-message">{{ error }}</div>

        <button type="submit" class="btn login-btn" :disabled="loading">
          {{ loading ? '登录中...' : '登录' }}
        </button>

        <div class="demo-hint">
          <p>演示账号：admin / admin</p>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-primary);
  padding: 20px;
}

.login-card {
  background: var(--color-bg-primary);
  border-radius: 16px;
  padding: 48px 40px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.login-header {
  text-align: center;
  margin-bottom: 40px;
}

.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--color-text-primary);
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 24px;
}

.brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--color-primary);
}

.login-header h2 {
  margin: 0 0 8px 0;
  color: var(--color-text-primary);
  font-size: 28px;
  font-weight: 700;
}

.login-header p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.form-group input {
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text-primary);
  outline: none;
  transition: all 0.2s;
}

.form-group input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(16, 163, 127, 0.1);
}

.form-group input::placeholder {
  color: var(--color-text-tertiary);
}

.error-message {
  padding: 12px 16px;
  background: #fee2e2;
  color: #dc2626;
  border-radius: 8px;
  font-size: 14px;
}

/* login-btn styles moved to global style.css */
.login-btn {
  padding: 14px;
  font-size: 16px;
  font-weight: 600;
}

.demo-hint {
  text-align: center;
  padding: 12px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
}

.demo-hint p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 13px;
}
</style>
