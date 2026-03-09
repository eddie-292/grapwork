<script setup lang="ts">
import { useRouter } from 'vue-router'
import EnvironmentCheckPanel from './settings/EnvironmentCheckPanel.vue'

const router = useRouter()

function handleContinue() {
  // 标记首次环境检查已完成（持久化到 localStorage）
  localStorage.setItem('firstEnvCheckDone', 'true')
  router.replace('/login')
}
</script>

<template>
  <div class="env-check-container">
    <div class="env-check-card">
      <div class="env-check-header">
        <div class="brand">
          <div class="brand-dot" />
          <span>MirrorGrap Work</span>
        </div>
        <h2>环境检查</h2>
        <p>正在检查运行环境，请稍候...</p>
      </div>

      <EnvironmentCheckPanel @continue="handleContinue">
        <template #actions="{ canContinue }">
          <button
            v-if="canContinue"
            class="btn primary"
            @click="handleContinue"
          >
            继续使用
          </button>
        </template>
      </EnvironmentCheckPanel>
    </div>
  </div>
</template>

<style scoped>
.env-check-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-primary);
  padding: 20px;
}

.env-check-card {
  background: var(--color-bg-primary);
  border-radius: 16px;
  padding: 48px 40px;
  width: 100%;
  max-width: 900px;
}

.env-check-header {
  text-align: center;
  margin-bottom: 32px;
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

.env-check-header h2 {
  margin: 0 0 8px 0;
  color: var(--color-text-primary);
  font-size: 28px;
  font-weight: 700;
}

.env-check-header p {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.btn {
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn.primary {
  background: var(--color-primary);
  color: white;
}

.btn.primary:hover {
  background: var(--color-primary-hover);
}
</style>
