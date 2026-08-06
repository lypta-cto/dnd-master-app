<script setup lang="ts">
defineProps<{
  color: ColorOption
  selected?: boolean
}>()
</script>

<template>
  <button
    type="button"
    :title="color.label"
    :aria-label="color.label"
    :aria-pressed="selected"
    class="relative size-7 rounded-full cursor-pointer ring-1 ring-inset ring-black/10 transition-transform duration-150 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :class="selected && 'ring-2 ring-offset-2 ring-offset-default ring-primary'"
    :style="{ backgroundColor: color.swatch }"
  >
    <UIcon
      v-if="selected"
      name="i-lucide-check"
      class="absolute inset-0 m-auto size-4 text-white drop-shadow-[0_1px_1px_rgb(0_0_0/40%)]"
    />
  </button>
</template>
