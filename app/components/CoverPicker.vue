<script setup lang="ts">
/**
 * The picture, chosen while the thing is being made.
 *
 * It used to live only on the entity's own page, so making a map meant
 * filling in a form with no image in it, saving, navigating, and only then
 * uploading the thing the map actually is. The file is held here and sent the
 * moment the entity exists — an image can't be attached to something without
 * an id.
 *
 * `hero` for places, where the picture is the subject; the smaller frame for
 * a face or an object, where it's a thumbnail and shouldn't dominate the form.
 */
const file = defineModel<File | null>({ default: null })

const props = defineProps<{
  hero?: boolean
  label?: string
}>()

const input = useTemplateRef<HTMLInputElement>('input')
const dragging = ref(false)

/** Revoked on replace and unmount — an object URL is a leak until you do */
const preview = ref<string | null>(null)

watch(file, (next) => {
  if (preview.value) {
    URL.revokeObjectURL(preview.value)
  }
  preview.value = next ? URL.createObjectURL(next) : null
})

onBeforeUnmount(() => {
  if (preview.value) {
    URL.revokeObjectURL(preview.value)
  }
})

function take(candidate: File | null | undefined) {
  // Only images: the API would refuse anything else after the entity had
  // already been created, which is a confusing place to learn it
  if (candidate?.type.startsWith('image/')) {
    file.value = candidate
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  take(event.dataTransfer?.files?.[0])
}

const hint = computed(() => props.label ?? (props.hero ? 'Drop the map here' : 'Add a picture'))
</script>

<template>
  <div>
    <input
      ref="input"
      type="file"
      accept="image/*"
      class="hidden"
      @change="take(($event.target as HTMLInputElement).files?.[0]); ($event.target as HTMLInputElement).value = ''"
    >

    <button
      type="button"
      class="group relative flex w-full items-center justify-center overflow-hidden rounded-2xl border border-dashed transition-colors"
      :class="[
        // Capped, because a square slot in a side column grows with the
        // window until a thumbnail is the biggest thing on the page
        hero ? 'aspect-[16/9]' : 'aspect-square max-w-56',
        dragging ? 'border-primary bg-primary/5' : 'border-accented hover:border-primary/60'
      ]"
      @click="input?.click()"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <img
        v-if="preview"
        :src="preview"
        alt=""
        class="size-full object-cover"
      >

      <span
        v-else
        class="flex flex-col items-center gap-1.5 p-4 text-center"
      >
        <UIcon
          name="i-lucide-image-plus"
          class="size-6 text-dimmed"
        />
        <span class="text-xs text-muted">{{ hint }}</span>
      </span>
    </button>

    <div
      v-if="file"
      class="mt-1.5 flex items-center gap-2"
    >
      <span class="min-w-0 flex-1 truncate text-xs text-dimmed">{{ file.name }}</span>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Remove picture"
        @click="file = null"
      />
    </div>
  </div>
</template>
