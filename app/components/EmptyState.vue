<script setup lang="ts">
defineProps<{
  icon: string
  title: string
  description?: string
}>()
</script>

<template>
  <div class="app-card flex flex-col items-center justify-center text-center gap-3 px-6 py-16">
    <span class="flex items-center justify-center size-12 rounded-2xl bg-elevated text-dimmed">
      <UIcon
        :name="icon"
        class="size-6"
      />
    </span>

    <div>
      <p class="font-medium text-highlighted">
        {{ title }}
      </p>
      <p
        v-if="description"
        class="mt-1 text-sm text-muted max-w-sm"
      >
        {{ description }}
      </p>
    </div>

    <slot />
  </div>
</template>
