<script setup lang="ts">
const colorMode = useColorMode()

const isDark = computed({
  get: () => colorMode.value === 'dark',
  set: (value) => {
    colorMode.preference = value ? 'dark' : 'light'
  }
})
</script>

<template>
  <ClientOnly>
    <UButton
      class="app-icon-btn"
      color="neutral"
      variant="ghost"
      :icon="isDark ? 'i-lucide-moon' : 'i-lucide-sun'"
      :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
      @click="isDark = !isDark"
    />

    <template #fallback>
      <div class="app-icon-btn size-9" />
    </template>
  </ClientOnly>
</template>
