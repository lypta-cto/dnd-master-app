<script setup lang="ts">
defineProps<{
  /** Hide the wordmark and render the mark only (collapsed sidebar) */
  collapsed?: boolean
}>()

// Falls back to app.config.ts until the workspace has loaded
const { name } = useWorkspace()
</script>

<template>
  <NuxtLink
    to="/"
    class="flex items-center gap-2.5 min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
    :aria-label="name"
  >
    <AppLogoMark class="size-7 shrink-0 text-primary" />

    <span
      v-if="!collapsed"
      class="font-semibold text-highlighted truncate"
    >
      {{ name }}
    </span>
  </NuxtLink>
</template>
