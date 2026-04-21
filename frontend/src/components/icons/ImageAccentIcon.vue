<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue'

interface Props {
  size?: number | string
}

withDefaults(defineProps<Props>(), {
  size: 16
})

const instance = getCurrentInstance()
const gradientPrefix = `image-accent-${instance?.uid ?? 'icon'}`
const frameGradientId = computed(() => `${gradientPrefix}-frame`)
const fillGradientId = computed(() => `${gradientPrefix}-fill`)
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient :id="frameGradientId" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#8B5CF6"/>
        <stop offset="0.5" stop-color="#EC4899"/>
        <stop offset="1" stop-color="#F59E0B"/>
      </linearGradient>
      <linearGradient :id="fillGradientId" x1="6" y1="6" x2="18" y2="18" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#8B5CF6" stop-opacity="0.22"/>
        <stop offset="1" stop-color="#F59E0B" stop-opacity="0.12"/>
      </linearGradient>
    </defs>
    <rect x="4" y="5" width="14" height="13" rx="3" :fill="`url(#${fillGradientId})`" :stroke="`url(#${frameGradientId})`" stroke-width="1.8"/>
    <circle cx="9" cy="9.5" r="1.4" fill="#FBBF24"/>
    <path d="M6.8 15.2L10.1 12.1C10.45 11.77 10.99 11.77 11.34 12.1L12.4 13.11C12.72 13.42 13.22 13.45 13.58 13.18L14.81 12.25C15.19 11.96 15.73 12 16.07 12.34L18 14.25" :stroke="`url(#${frameGradientId})`" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M18.9 4.2L19.23 5.14C19.34 5.44 19.56 5.66 19.86 5.77L20.8 6.1L19.86 6.43C19.56 6.54 19.34 6.76 19.23 7.06L18.9 8L18.57 7.06C18.46 6.76 18.24 6.54 17.94 6.43L17 6.1L17.94 5.77C18.24 5.66 18.46 5.44 18.57 5.14L18.9 4.2Z" fill="#FDE68A"/>
  </svg>
</template>
