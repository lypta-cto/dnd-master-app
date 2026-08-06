<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  /** Current selection, shown next to the title */
  value?: string
}>()
</script>

<template>
  <div class="flex flex-col gap-3 py-5 border-b border-default last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
    <div class="min-w-0 sm:max-w-xs">
      <p class="flex items-center gap-2 text-sm font-medium text-highlighted">
        {{ title }}
        <UBadge
          v-if="value"
          :label="value"
          color="neutral"
          variant="subtle"
          size="sm"
        />
      </p>
      <p
        v-if="description"
        class="mt-0.5 text-sm text-muted"
      >
        {{ description }}
      </p>
    </div>

    <div class="sm:flex sm:justify-end sm:shrink-0">
      <slot />
    </div>
  </div>
</template>
