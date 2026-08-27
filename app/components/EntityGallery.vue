<script setup lang="ts">
const props = defineProps<{
  entity: EntityDetail
}>()

const emit = defineEmits<{
  coverChanged: [url: string | null]
  focusChanged: [point: { x: number, y: number }]
}>()

const toast = useToast()
const { confirm } = useConfirm()
const { isDm } = useCampaigns()
const entities = useEntities()
const cast = useCast()
const mediaUrl = useMediaUrl()

/* Drawing from the page, when a key is configured */
const ai = useAi()
const campaigns = useCampaigns()
const aiImages = ref(false)
const illustrating = ref(false)

/**
 * The look, chosen for the campaign rather than for the click.
 *
 * A gallery where every portrait came out in a different style reads as a
 * mistake rather than as variety, so the choice is stored on the campaign and
 * every picture after it matches. The list comes from the API because the
 * prompts live there — a style added in the service shows up here on its own.
 */
const artStyles = ref<ArtStyle[]>([])
const artStyle = ref('rulebook')
const providers = ref<ImageProvider[]>([])
const provider = ref('openai')

onMounted(async () => {
  if (!isDm.value) {
    return
  }
  try {
    const status = await ai.status()
    aiImages.value = status.images
    artStyles.value = status.styles
    artStyle.value = status.style
    providers.value = status.providers
    provider.value = status.provider
  } catch {
    aiImages.value = false
  }
})

const currentStyle = computed(() =>
  artStyles.value.find(style => style.value === artStyle.value)
)

/**
 * Both choices live on the campaign, so the next picture and the next session
 * match. Written optimistically and rolled back on failure — the menu closes
 * on click, and a tick that waits for the server reads as a dead control.
 */
async function remember(patch: Partial<CampaignData>, said: string, rollback: () => void) {
  const campaign = campaigns.current.value
  if (!campaign) {
    return
  }

  try {
    await campaigns.update(campaign.id, { data: { ...campaign.data, ...patch } })
    toast.add({ title: said, icon: 'i-lucide-palette', color: 'success' })
  } catch (error) {
    rollback()
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  }
}

function pickStyle(value: string) {
  const previous = artStyle.value
  artStyle.value = value
  const label = artStyles.value.find(style => style.value === value)?.label
  return remember({ art_style: value }, `Pictures now drawn in “${label}”`, () => {
    artStyle.value = previous
  })
}

function pickProvider(value: string) {
  const previous = provider.value
  provider.value = value
  const label = providers.value.find(who => who.value === value)?.label
  return remember({ image_provider: value }, `Pictures now drawn by ${label}`, () => {
    provider.value = previous
  })
}

/**
 * One menu, two decisions. They were nearly two buttons, which put three
 * controls in a row above a gallery that might hold nothing — and both are
 * set once a campaign, not per click.
 */
const styleMenu = computed(() => [
  [{ type: 'label' as const, label: 'Style' }],
  artStyles.value.map(style => ({
    label: style.label,
    // The result, not the technique — nobody picks art by hearing "cel-shaded"
    icon: style.value === artStyle.value ? 'i-lucide-check' : 'i-lucide-palette',
    onSelect: () => pickStyle(style.value)
  })),
  [{ type: 'label' as const, label: 'Drawn by' }],
  providers.value.map(who => ({
    label: who.available ? who.label : `${who.label} — no key`,
    icon: who.value === provider.value ? 'i-lucide-check' : 'i-lucide-sparkles',
    disabled: !who.available,
    onSelect: () => pickProvider(who.value)
  }))
])

/**
 * Two price points, because the DM is spending real money a cent at a time.
 * Draft is the default and is genuinely usable — the difference between the
 * tiers is much smaller than the difference a good prompt makes.
 */
const QUALITIES = [
  { value: 'draft' as const, label: 'Draft' },
  { value: 'good' as const, label: 'Good' }
]

/**
 * Wide leads because everything downstream is widescreen — the thumbnails,
 * the cover crop, the TV the table casts to. The wide canvas costs about
 * half as much again, which is why each shape quotes its own price.
 * Coins, because that's the unit the purse in the top bar counts down in —
 * quoting cents here and coins there made the DM do the conversion.
 */
const ASPECTS = [
  { value: '16:9' as const, label: 'Wide 16:9', hints: { draft: '~36 coins', good: '~130 coins, richer' } },
  { value: '1:1' as const, label: 'Square 1:1', hints: { draft: '~24 coins', good: '~87 coins, richer' } }
]

const illustrateMenu = computed(() =>
  ASPECTS.map(aspect => [
    { type: 'label' as const, label: aspect.label },
    ...QUALITIES.map(quality => ({
      label: `${quality.label} — ${aspect.hints[quality.value]}`,
      icon: 'i-lucide-sparkles',
      onSelect: () => illustrate(quality.value, aspect.value)
    }))
  ])
)

async function illustrate(quality: 'draft' | 'good', aspect: '16:9' | '1:1') {
  illustrating.value = true
  try {
    const image = await ai.illustrate(props.entity.id, { quality, aspect })
    gallery.value = [...gallery.value, image]

    if (!props.entity.image_url) {
      emit('coverChanged', image.url)
    }

    // The provider's own figure, not our estimate of it
    toast.add({
      // Coins: the same unit the purse counts down in, from the provider's
      // own figure rather than the menu's estimate
      title: `Illustration added — ${Math.round(image.cents * 100).toLocaleString()} coins`,
      icon: 'i-lucide-sparkles',
      color: 'success'
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    illustrating.value = false
  }
}

const input = useTemplateRef<HTMLInputElement>('input')
const gallery = ref<EntityImage[]>([])
const loading = ref(true)
const busy = ref(false)
const dragging = ref(false)

/* Full-size view + focal point picking */
const lightbox = reactive({ open: false, src: '', caption: '', pickFocus: false })

const coverFocus = computed(() => {
  const focus = props.entity.data.cover_focus as { x: number, y: number } | undefined
  return focus && typeof focus.x === 'number' ? focus : null
})

function view(image: EntityImage) {
  lightbox.src = mediaUrl(image.url)!
  lightbox.caption = image.caption ?? props.entity.name
  lightbox.pickFocus = false
  lightbox.open = true
}

function pickFocus() {
  if (!props.entity.image_url) {
    return
  }
  lightbox.src = mediaUrl(props.entity.image_url)!
  lightbox.caption = ''
  lightbox.pickFocus = true
  lightbox.open = true
}

async function onFocusPicked(point: { x: number, y: number }) {
  // Read first: `data` is replaced whole on write, and the copy in props is
  // whatever the page loaded with. On a map that has been painted since,
  // sending it back would erase the fog — the same trap the map viewer hit.
  const fresh = await entities.read(props.entity.id)

  await entities.update(props.entity.id, {
    data: { ...fresh.data, cover_focus: point }
  })
  emit('focusChanged', point)
  toast.add({
    title: 'Thumbnail set',
    description: 'That point stays in frame wherever this is cropped.',
    icon: 'i-lucide-crop',
    color: 'success'
  })
}

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
  await uploadFiles([...((event.target as HTMLInputElement).files ?? [])])
  if (input.value) {
    input.value.value = ''
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const files = [...(event.dataTransfer?.files ?? [])].filter(f => f.type.startsWith('image/'))
  uploadFiles(files)
}

/* Reordering: thumbnails are draggable; drop one onto another to swap places.
   Distinct from file-drop — while a thumb is in flight the upload zone stays quiet. */
const reorderingId = ref<string | null>(null)

function onThumbDragStart(image: EntityImage) {
  reorderingId.value = image.id
}

async function onThumbDrop(target: EntityImage) {
  const fromId = reorderingId.value
  reorderingId.value = null
  dragging.value = false
  if (!fromId || fromId === target.id) {
    return
  }

  const items = [...gallery.value]
  const from = items.findIndex(i => i.id === fromId)
  const to = items.findIndex(i => i.id === target.id)
  items.splice(to, 0, ...items.splice(from, 1))
  gallery.value = items.map((img, index) => ({ ...img, position: index }))

  await Promise.all(
    items.map((img, index) =>
      img.position === index
        ? null
        : entities.updateImage(props.entity.id, img.id, { position: index })
    ).filter(Boolean)
  )
}

// ⌘V an image copied from anywhere — maps, art, screenshots
function onPaste(event: ClipboardEvent) {
  const files = [...(event.clipboardData?.files ?? [])].filter(f => f.type.startsWith('image/'))
  if (files.length) {
    uploadFiles(files)
  }
}

onMounted(() => window.addEventListener('paste', onPaste))
onUnmounted(() => window.removeEventListener('paste', onPaste))

async function uploadFiles(files: File[]) {
  if (!files.length || busy.value) {
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
    :description="dragging ? 'Drop to upload' : 'Portraits, battle art, floor plans. Drop files or ⌘V to add; drag thumbnails to reorder.'"
    :class="dragging && 'ring-2 ring-primary'"
    @dragover.prevent="dragging = !reorderingId"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <template #actions>
      <!-- "Crop focus" meant nothing to anyone who hadn't written it. What it
           does is decide which part of the picture survives being squared off
           into a thumbnail — usually a face, rather than the sky above it. -->
      <UTooltip text="Lists crop this picture to a square. Pick what stays in frame.">
        <UButton
          v-if="entity.image_url"
          label="Thumbnail"
          icon="i-lucide-crop"
          color="neutral"
          variant="outline"
          size="sm"
          @click="pickFocus"
        />
      </UTooltip>
      <UTooltip
        v-if="aiImages"
        :text="currentStyle ? currentStyle.hint : 'The look every picture is drawn in'"
      >
        <UDropdownMenu :items="styleMenu">
          <UButton
            :label="currentStyle?.label ?? 'Style'"
            icon="i-lucide-palette"
            trailing-icon="i-lucide-chevron-down"
            color="neutral"
            variant="ghost"
            size="sm"
          />
        </UDropdownMenu>
      </UTooltip>
      <UDropdownMenu
        v-if="aiImages"
        :items="illustrateMenu"
      >
        <UButton
          label="Illustrate"
          icon="i-lucide-sparkles"
          trailing-icon="i-lucide-chevron-down"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="illustrating"
        />
      </UDropdownMenu>
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
        class="group relative overflow-hidden rounded-xl border border-default transition-opacity"
        :class="reorderingId === image.id && 'opacity-40'"
        draggable="true"
        @dragstart="onThumbDragStart(image)"
        @dragend="reorderingId = null"
        @dragover.prevent
        @drop.prevent.stop="onThumbDrop(image)"
      >
        <button
          type="button"
          class="block w-full cursor-zoom-in"
          :aria-label="`View ${image.caption ?? entity.name} full size`"
          @click="view(image)"
        >
          <img
            :src="mediaUrl(image.url)"
            :alt="image.caption ?? entity.name"
            class="aspect-video w-full object-cover"
          >
        </button>

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
          <UTooltip
            v-if="isDm"
            text="Cast to the table"
          >
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

    <ImageLightbox
      v-model:open="lightbox.open"
      :src="lightbox.src"
      :caption="lightbox.caption"
      :pick-focus="lightbox.pickFocus"
      :focus="coverFocus"
      @focus-picked="onFocusPicked"
    />

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
