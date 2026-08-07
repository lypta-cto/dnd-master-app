<script setup lang="ts">
/**
 * Full-size image view — because thumbnails crop, and the DM should always be
 * one click from seeing the whole art. Optionally doubles as a focal-point
 * picker: in that mode a click stores where the crop should centre.
 */
const props = withDefaults(defineProps<{
  src: string
  caption?: string
  /** Turn clicks into focal-point selection */
  pickFocus?: boolean
  focus?: { x: number, y: number } | null
}>(), {
  pickFocus: false,
  focus: null
})

const emit = defineEmits<{
  focusPicked: [point: { x: number, y: number }]
}>()

const open = defineModel<boolean>('open', { default: false })

function onImageClick(event: MouseEvent) {
  if (!props.pickFocus) {
    return
  }
  const target = event.target as HTMLElement
  const rect = target.getBoundingClientRect()
  emit('focusPicked', {
    x: Math.round(((event.clientX - rect.left) / rect.width) * 100),
    y: Math.round(((event.clientY - rect.top) / rect.height) * 100)
  })
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    fullscreen
    :ui="{ content: 'bg-black/95' }"
  >
    <template #content>
      <div
        class="relative flex h-full w-full items-center justify-center p-6"
        @click.self="open = false"
      >
        <div class="relative max-h-full max-w-full">
          <img
            :src="src"
            :alt="caption ?? ''"
            class="max-h-[92vh] max-w-full object-contain"
            :class="pickFocus && 'cursor-crosshair'"
            @click="onImageClick"
          >

          <!-- Current focal point, while picking -->
          <span
            v-if="pickFocus && focus"
            class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            :style="{ left: `${focus.x}%`, top: `${focus.y}%` }"
          >
            <span class="block size-10 rounded-full border-2 border-white/90 shadow-[0_0_0_2000px_rgb(0_0_0/25%)]" />
          </span>
        </div>

        <p
          v-if="pickFocus"
          class="absolute inset-x-0 top-5 text-center text-sm font-medium text-white/80"
        >
          Click where the crop should centre — thumbnails will keep that part in frame.
        </p>
        <p
          v-else-if="caption"
          class="absolute inset-x-0 bottom-5 text-center text-sm text-white/70"
        >
          {{ caption }}
        </p>

        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          class="absolute right-4 top-4 text-white"
          aria-label="Close"
          @click="open = false"
        />
      </div>
    </template>
  </UModal>
</template>
