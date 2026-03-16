<script setup lang="ts">
</script>

<template>
  <router-view v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" />
    </Transition>
  </router-view>
</template>

<style scoped>
/* Page transition styles - Apple smooth effect */
.page-enter-active {
  transition: all 300ms cubic-bezier(0.25, 0.1, 0.25, 1);
  transition-delay: 0ms;
}

.page-leave-active {
  transition: all 250ms cubic-bezier(0.25, 0.1, 0.25, 1);
  transition-delay: 0ms;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

.page-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.98);
}
</style>
