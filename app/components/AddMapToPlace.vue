<script setup lang="ts">
/**
 * Giving a place its map.
 *
 * The map is an attribute of the location, not a thing of its own — the
 * dungeon's floor plan belongs to the dungeon. This sets `map_image_url` in
 * the place's data: upload a picture, or point at one already in the
 * gallery. The moment it's set, the place's page grows the full board —
 * pins, fog, casting — and children can pin themselves onto it.
 */
const props = defineProps<{
  entity: EntityDetail
}>()

const emit = defineEmits<{ changed: [] }>()

const open = defineModel<boolean>('open', { required: true })

const entities = useEntities()
const mediaUrl = useMediaUrl()
const ai = useAi()
const toast = useToast()

const busy = ref(false)

/**
 * The map, drawn from what the page already says.
 *
 * Same pipeline as illustrating the location, asked for as cartography: a
 * top-down map with the landmarks the description names, no grid and no
 * lettering. It lands in the gallery like any picture, then becomes the map.
 */
const generating = ref<'draft' | 'good' | null>(null)

/**
 * Wide by default — the board and the cast TV are 16:9. Square remains for
 * dungeons that go as deep as they go wide.
 */
const aspect = ref<'16:9' | '1:1'>('16:9')
const ASPECT_CHOICES = [
  { value: '16:9' as const, label: 'Wide 16:9' },
  { value: '1:1' as const, label: 'Square 1:1' }
]

async function generateMap(quality: 'draft' | 'good') {
  generating.value = quality
  try {
    const image = await ai.illustrate(props.entity.id, {
      quality,
      as_map: true,
      aspect: aspect.value
    })
    await setMap(image.url)
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    generating.value = null
  }
}

const currentMap = computed(() => {
  const url = props.entity.data.map_image_url
  return typeof url === 'string' && url ? url : null
})

/** The gallery, fetched when the dialog opens — it lives behind its own GET */
const gallery = ref<EntityImage[]>([])

watch(open, async (isOpen) => {
  if (!isOpen) {
    return
  }
  try {
    gallery.value = await entities.images(props.entity.id)
  } catch {
    gallery.value = []
  }
})

/** Point the attribute somewhere and reload — one write, whole story */
async function setMap(url: string | null) {
  busy.value = true
  try {
    // Read first: `data` is replaced whole and this page's copy may be stale
    const fresh = await entities.read(props.entity.id)
    const data: Record<string, unknown> = { ...fresh.data }

    if (url) {
      data.map_image_url = url
    } else {
      // The picture goes; pins, fog and grid go with it — they were
      // percentages of an image that no longer exists
      delete data.map_image_url
      delete data.pins
      delete data.fog
      delete data.grid
    }

    await entities.update(props.entity.id, { data })
    toast.add({
      title: url ? `${props.entity.name} has its map` : 'Map removed',
      icon: url ? 'i-lucide-map' : 'i-lucide-map-off',
      color: 'success'
    })
    open.value = false
    emit('changed')
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = false
  }
}

/** A new picture lands in the gallery first, so it's kept like any other */
async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) {
    return
  }
  busy.value = true
  try {
    const image = await entities.addImage(props.entity.id, file, 'Map')
    await setMap(image.url)
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
    busy.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`The map of ${entity.name}`"
    description="Upload a picture, or use one already in the gallery. Pins, fog and casting live on it."
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <div class="space-y-3">
        <label class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-default p-5 text-center transition-colors hover:border-accented">
          <UIcon
            name="i-lucide-upload"
            class="size-6 text-dimmed"
          />
          <span class="text-sm font-medium text-highlighted">Upload a map picture</span>
          <span class="text-xs text-dimmed">It joins the gallery too</span>
          <input
            type="file"
            accept="image/*"
            class="hidden"
            :disabled="busy"
            @change="onFile"
          >
        </label>

        <USeparator label="or draw it from the description" />

        <div class="flex items-center justify-center gap-1">
          <UButton
            v-for="choice in ASPECT_CHOICES"
            :key="choice.value"
            :label="choice.label"
            size="xs"
            color="neutral"
            :variant="aspect === choice.value ? 'solid' : 'ghost'"
            :disabled="!!generating"
            @click="aspect = choice.value"
          />
        </div>

        <div class="flex items-center gap-2">
          <UButton
            label="Generate — draft"
            icon="i-lucide-sparkles"
            color="neutral"
            variant="outline"
            size="sm"
            class="flex-1 justify-center"
            :loading="generating === 'draft'"
            :disabled="!!generating"
            @click="generateMap('draft')"
          />
          <UButton
            label="Generate — good"
            icon="i-lucide-sparkles"
            variant="soft"
            size="sm"
            class="flex-1 justify-center"
            :loading="generating === 'good'"
            :disabled="!!generating"
            @click="generateMap('good')"
          />
        </div>
        <p class="text-xs text-dimmed">
          Top-down map with the landmarks the description mentions — no grid,
          no lettering. Drawn from the summary and body, so write those first.
        </p>

        <template v-if="gallery.length">
          <USeparator label="or pick from the gallery" />
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="image in gallery"
              :key="image.id"
              type="button"
              class="group relative overflow-hidden rounded-lg border-2 transition-colors"
              :class="currentMap === image.url ? 'border-primary' : 'border-transparent hover:border-accented'"
              :disabled="busy"
              @click="setMap(image.url)"
            >
              <img
                :src="mediaUrl(image.url)!"
                :alt="image.caption ?? entity.name"
                class="aspect-video w-full object-cover"
              >
              <span
                v-if="currentMap === image.url"
                class="absolute top-1 right-1 rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-inverted"
              >
                current
              </span>
            </button>
          </div>
        </template>

        <UButton
          v-if="currentMap"
          label="Remove the map"
          icon="i-lucide-map-off"
          color="error"
          variant="ghost"
          size="sm"
          block
          :loading="busy"
          @click="setMap(null)"
        />
      </div>
    </template>
  </UModal>
</template>
