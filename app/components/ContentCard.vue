<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  description?: string
  icon?: string
  /** Show placeholder lines instead of the body */
  loading?: boolean
  /** Drop the body padding — for tables and lists that reach the card edge */
  flush?: boolean
}>(), {
  loading: false,
  flush: false
})

defineSlots<{
  /** Replaces the whole header */
  header?: () => unknown
  /** Buttons on the right of the header */
  actions?: () => unknown
  default?: () => unknown
  footer?: () => unknown
}>()
</script>

<template>
  <section class="app-card flex flex-col overflow-hidden">
    <div
      v-if="$slots.header || title || $slots.actions"
      class="flex items-start justify-between gap-3 p-4 sm:p-5"
      :class="!flush && ($slots.default || loading) && 'pb-0'"
    >
      <slot name="header">
        <div class="min-w-0">
          <h2 class="flex items-center gap-2 font-semibold text-highlighted">
            <UIcon
              v-if="icon"
              :name="icon"
              class="size-[18px] shrink-0 text-muted"
            />
            {{ title }}
          </h2>
          <p
            v-if="description"
            class="mt-0.5 text-sm text-muted"
          >
            {{ description }}
          </p>
        </div>
      </slot>

      <div
        v-if="$slots.actions"
        class="flex shrink-0 items-center gap-2"
      >
        <slot name="actions" />
      </div>
    </div>

    <div
      class="flex-1 min-w-0"
      :class="!flush && 'p-4 sm:p-5'"
    >
      <div
        v-if="loading"
        class="space-y-3"
        :class="flush && 'p-4 sm:p-5'"
      >
        <USkeleton class="h-4 w-2/5" />
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-4/5" />
      </div>

      <slot v-else />
    </div>

    <div
      v-if="$slots.footer"
      class="flex items-center justify-between gap-3 border-t border-default p-4 sm:px-5 sm:py-3"
    >
      <slot name="footer" />
    </div>
  </section>
</template>
