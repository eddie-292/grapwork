<script setup lang="ts">
import GlobalMemoryFormDialog from './GlobalMemoryFormDialog.vue'

interface Props {
  show: boolean
  initialContent?: string
  initialKeywords?: string[]
}

interface Emits {
  (e: 'close'): void
  (e: 'saved'): void
}

defineProps<Props>()
const emit = defineEmits<Emits>()
</script>

<template>
  <GlobalMemoryFormDialog
    :show="show"
    :initial-content="initialContent"
    :initial-keywords="initialKeywords"
    @close="emit('close')"
    @saved="emit('saved')"
  />
</template>
