<script setup lang="ts">
interface Props {
  size?: number | string
  color?: string
  viewBox?: string
}

withDefaults(defineProps<Props>(), {
  size: 16,
  color: 'currentColor',
  viewBox: '0 0 24 24'
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    :viewBox="viewBox"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :stroke="color"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <slot />
  </svg>
</template>
