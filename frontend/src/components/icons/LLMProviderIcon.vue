<script setup lang="ts">
import { computed } from 'vue'

// 显式导入所有供应商图标
import openaiIcon from '@/assets/provider-icons/openai.svg'
import deepseekIcon from '@/assets/provider-icons/deepseek.svg'
import moonshotIcon from '@/assets/provider-icons/moonshot.svg'
import zhipuIcon from '@/assets/provider-icons/zhipu.svg'
import qwenIcon from '@/assets/provider-icons/qwen.svg'
import openrouterIcon from '@/assets/provider-icons/openrouter.svg'
import mistralIcon from '@/assets/provider-icons/mistral.svg'
import groqIcon from '@/assets/provider-icons/groq.svg'
import togetherIcon from '@/assets/provider-icons/together.svg'
import fireworksIcon from '@/assets/provider-icons/fireworks.svg'
import siliconflowIcon from '@/assets/provider-icons/siliconflow.svg'
import ollamaIcon from '@/assets/provider-icons/ollama.svg'
import lmstudioIcon from '@/assets/provider-icons/lmstudio.svg'

const props = defineProps<{
  provider: string
  size?: number
}>()

// 图标映射
const iconMap: Record<string, string> = {
  openai: openaiIcon,
  deepseek: deepseekIcon,
  moonshot: moonshotIcon,
  zhipu: zhipuIcon,
  qwen: qwenIcon,
  openrouter: openrouterIcon,
  mistral: mistralIcon,
  groq: groqIcon,
  together: togetherIcon,
  fireworks: fireworksIcon,
  siliconflow: siliconflowIcon,
  ollama: ollamaIcon,
  lmstudio: lmstudioIcon,
}

// 获取图标 URL
const iconUrl = computed(() => {
  const provider = props.provider.toLowerCase()
  return iconMap[provider] || undefined
})

// 是否使用默认图标
const useDefaultIcon = computed(() => !iconUrl.value)
</script>

<template>
  <span class="llm-provider-icon" :style="{ width: size + 'px', height: size + 'px' }">
    <img
      v-if="!useDefaultIcon"
      :src="iconUrl"
      :alt="provider"
      class="provider-img"
    />
    <!-- Default/Custom -->
    <svg v-else viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
    </svg>
  </span>
</template>

<style scoped>
.llm-provider-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.llm-provider-icon svg,
.llm-provider-icon .provider-img {
  width: 100%;
  height: 100%;
}

.provider-img {
  object-fit: contain;
}
</style>
