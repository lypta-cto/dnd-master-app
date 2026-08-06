<script setup lang="ts">
const props = defineProps<{
  label: string
  value: string
  icon: string
  /** Percentage change vs the previous period, e.g. 12.5 or -3.1 */
  change?: number
  hint?: string
}>()

const isUp = computed(() => (props.change ?? 0) >= 0)
</script>

<template>
  <div class="app-card p-4 sm:p-5">
    <div class="flex items-start justify-between gap-3">
      <p class="text-sm text-muted">
        {{ label }}
      </p>

      <span class="flex items-center justify-center size-9 shrink-0 rounded-xl bg-primary/10 text-primary">
        <UIcon
          :name="icon"
          class="size-[18px]"
        />
      </span>
    </div>

    <p class="mt-3 text-2xl font-semibold text-highlighted tabular-nums">
      {{ value }}
    </p>

    <div class="mt-2 flex items-center gap-2">
      <UBadge
        v-if="change !== undefined"
        :color="isUp ? 'success' : 'error'"
        variant="subtle"
        size="sm"
        :icon="isUp ? 'i-lucide-trending-up' : 'i-lucide-trending-down'"
        :label="`${isUp ? '+' : ''}${change}%`"
      />
      <span
        v-if="hint"
        class="text-xs text-muted truncate"
      >{{ hint }}</span>
    </div>
  </div>
</template>
