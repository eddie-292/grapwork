<script setup lang="ts">
interface Props {
  size?: number | string
  color?: string
  viewBox?: string
  fill?: string
  stroke?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 16,
  color: 'currentColor',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: undefined
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    :viewBox="viewBox"
    :fill="fill"
    xmlns="http://www.w3.org/2000/svg"
    :stroke="stroke || color"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <slot />
  </svg>
</template>
