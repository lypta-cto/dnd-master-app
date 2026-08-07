<script setup lang="ts">
const props = defineProps<{
  entity: EntityDetail
}>()

const emit = defineEmits<{
  coverChanged: [url: string | null]
}>()

const toast = useToast()
const { confirm } = useConfirm()
const entities = useEntities()
const cast = useCast()
const mediaUrl = useMediaUrl()

const input = useTemplateRef<HTMLInputElement>('input')
const gallery = ref<EntityImage[]>([])
const loading = ref(true)
const busy = ref(false)

async function load() {
  loading.value = true
  try {
    gallery.value = await entities.images(props.entity.id)
  } finally {
    loading.value = false
  }
}

watch(() => props.entity.id, load, { immediate: true })

async function onFileChange(event: Event) {
  const files = [...((event.target as HTMLInputElement).files ?? [])]
  if (!files.length) {
    return
  }

  busy.value = true

  try {
    // Multi-select uploads land in order, one request each
    for (const file of files) {
      const image = await entities.addImage(props.entity.id, file)
      gallery.value = [...gallery.value, image]
    }

    // The first upload may have become the cover server-side
    if (!props.entity.image_url && gallery.value.length) {
      emit('coverChanged', gallery.value[0]!.url)
    }

    toast.add({
      title: files.length > 1 ? `${files.length} images added` : 'Image added',
      icon: 'i-lucide-images',
      color: 'success'
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error, 'Upload failed'), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = false
    if (input.value) {
      input.value.value = ''
    }
  }
}

async function castImage(image: EntityImage) {
  try {
    const result = await cast.set({
      mode: 'image',
      payload: { image_url: image.url, caption: image.caption || props.entity.name }
    })
    toast.add({
      title: 'Cast to the table',
      description: result.displays_connected ? undefined : 'No display connected',
      icon: 'i-lucide-cast',
      color: result.displays_connected ? 'success' : 'warning'
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  }
}

async function makeCover(image: EntityImage) {
  await entities.setCover(props.entity.id, image.id)
  emit('coverChanged', image.url)
  toast.add({ title: 'Cover updated', icon: 'i-lucide-image', color: 'success' })
}

async function saveCaption(image: EntityImage, caption: string) {
  const trimmed = caption.trim()
  if (trimmed === (image.caption ?? '')) {
    return
  }
  const updated = await entities.updateImage(props.entity.id, image.id, {
    caption: trimmed || null
  })
  gallery.value = gallery.value.map(g => (g.id === image.id ? updated : g))
}

async function removeOne(image: EntityImage) {
  const ok = await confirm({
    title: 'Remove this image?',
    description: 'The file is deleted. If it was the cover, another image takes over.',
    confirmLabel: 'Remove',
    color: 'error'
  })

  if (!ok) {
    return
  }

  await entities.removeImage(props.entity.id, image.id)
  gallery.value = gallery.value.filter(g => g.id !== image.id)

  if (props.entity.image_url === image.url) {
    emit('coverChanged', gallery.value[0]?.url ?? null)
  }
}
</script>

<template>
  <ContentCard
    title="Gallery"
    icon="i-lucide-images"
    description="Portraits, battle art, floor plans. Any of them can go to the table."
  >
    <template #actions>
      <UButton
        label="Add images"
        icon="i-lucide-image-plus"
        color="neutral"
        variant="outline"
        size="sm"
        :loading="busy"
        @click="input?.click()"
      />
    </template>

    <div
      v-if="loading"
      class="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      <USkeleton
        v-for="i in 3"
        :key="i"
        class="aspect-video rounded-xl"
      />
    </div>

    <p
      v-else-if="!gallery.length"
      class="py-4 text-sm text-muted"
    >
      No images yet.
    </p>

    <div
      v-else
      class="grid grid-cols-2 gap-3 sm:grid-cols-3"
    >
      <figure
        v-for="image in gallery"
        :key="image.id"
        class="group relative overflow-hidden rounded-xl border border-default"
      >
        <img
          :src="mediaUrl(image.url)"
          :alt="image.caption ?? entity.name"
          class="aspect-video w-full object-cover"
        >

        <UBadge
          v-if="entity.image_url === image.url"
          label="Cover"
          color="primary"
          variant="solid"
          size="sm"
          class="absolute left-1.5 top-1.5"
        />

        <!-- Hover controls -->
        <div class="absolute inset-x-0 top-0 flex justify-end gap-1 bg-gradient-to-b from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <UTooltip text="Cast to the table">
            <UButton
              icon="i-lucide-cast"
              size="xs"
              color="neutral"
              variant="solid"
              aria-label="Cast"
              @click="castImage(image)"
            />
          </UTooltip>
          <UTooltip
            v-if="entity.image_url !== image.url"
            text="Use as cover"
          >
            <UButton
              icon="i-lucide-star"
              size="xs"
              color="neutral"
              variant="solid"
              aria-label="Use as cover"
              @click="makeCover(image)"
            />
          </UTooltip>
          <UTooltip text="Remove">
            <UButton
              icon="i-lucide-trash-2"
              size="xs"
              color="error"
              variant="solid"
              aria-label="Remove"
              @click="removeOne(image)"
            />
          </UTooltip>
        </div>

        <figcaption class="border-t border-default bg-default">
          <input
            :value="image.caption ?? ''"
            placeholder="Caption…"
            class="w-full bg-transparent px-2 py-1.5 text-xs text-toned outline-none placeholder:text-dimmed"
            @change="saveCaption(image, ($event.target as HTMLInputElement).value)"
          >
        </figcaption>
      </figure>
    </div>

    <input
      ref="input"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif"
      multiple
      class="hidden"
      @change="onFileChange"
    >
  </ContentCard>
</template>
