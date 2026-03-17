<script setup lang="ts">
defineProps<{
  size?: number
}>()
</script>

<template>
  <svg
    :width="size || 16"
    :height="size || 16"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- 茎 -->
    <path
      d="M12 2C12 2 13 4 13 5.5C13 6.5 12.5 7 12 7C11.5 7 11 6.5 11 5.5C11 4 12 2 12 2Z"
      fill="#6B7280"
    />
    <!-- 葡萄们 - 紫色渐变 -->
    <circle cx="12" cy="10" r="3.5" fill="#8B5CF6" class="grape grape-1" />
    <circle cx="8" cy="13" r="3.5" fill="#7C3AED" class="grape grape-2" />
    <circle cx="16" cy="13" r="3.5" fill="#7C3AED" class="grape grape-3" />
    <circle cx="10" cy="17" r="3.5" fill="#6D28D9" class="grape grape-4" />
    <circle cx="14" cy="17" r="3.5" fill="#6D28D9" class="grape grape-5" />
    <circle cx="12" cy="21" r="3.5" fill="#5B21B6" class="grape grape-6" />
    <!-- 高光 -->
    <circle cx="10.5" cy="9" r="1" fill="white" opacity="0.4" />
    <circle cx="6.5" cy="12" r="0.8" fill="white" opacity="0.4" />
    <circle cx="14.5" cy="12" r="0.8" fill="white" opacity="0.4" />
    <circle cx="8.5" cy="16" r="0.8" fill="white" opacity="0.4" />
    <circle cx="12.5" cy="16" r="0.8" fill="white" opacity="0.4" />
    <circle cx="10.5" cy="20" r="0.8" fill="white" opacity="0.3" />
  </svg>
</template>

<style scoped>
.grape {
  transition: transform 0.1s ease;
}
</style>
