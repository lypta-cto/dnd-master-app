<script setup lang="ts">
/**
 * A slideshow is built, not dumped.
 *
 * The first version poured every image in the campaign onto the cast page as
 * one enormous grid — impossible to scan past a handful of entities, and
 * nobody casts a random pile of art. It's a dialog now: search and filter by
 * type, hand-pick the slides, and the order you click is the order the table
 * sees. The page keeps only a quiet card with a button.
 */
const emit = defineEmits<{
  cast: [status: CastStatus]
}>()

const toast = useToast()
const entities = useEntities()
const cast = useCast()
const mediaUrl = useMediaUrl()
const { currentId } = useCampaigns()

const open = ref(false)

/** Every gallery image in the campaign — not just covers */
const pool = ref<CampaignImage[]>([])
const loading = ref(false)
const loadedFor = ref<string | null>(null)

const selected = ref<string[]>([])
const interval = ref(8)
const busy = ref(false)
const query = ref('')
const typeFilter = ref<EntityType | null>(null)

/** Fetched when the dialog opens, not when the page does — it can be heavy */
watch(open, async (isOpen) => {
  if (!isOpen || loadedFor.value === currentId.value) {
    return
  }
  loading.value = true
  try {
    pool.value = await entities.campaignImages()
    loadedFor.value = currentId.value
  } finally {
    loading.value = false
  }
})

watch(() => currentId.value, () => {
  pool.value = []
  loadedFor.value = null
  selected.value = []
})

/** Only the types that actually have art get a filter chip */
const typesInPool = computed(() => {
  const present = new Set(pool.value.map(item => item.entity_type))
  return ENTITY_TYPES.filter(type => present.has(type.value))
})

const shown = computed(() => {
  const needle = fold(query.value.trim())
  return pool.value.filter((item) => {
    if (typeFilter.value && item.entity_type !== typeFilter.value) {
      return false
    }
    if (!needle) {
      return true
    }
    return fold(item.entity_name).includes(needle)
      || fold(item.caption ?? '').includes(needle)
  })
})

function toggle(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter(s => s !== id)
    : [...selected.value, id]
}

/** The picked slides in click order, faces on, for the strip up top */
const picked = computed(() =>
  selected.value
    .map(id => pool.value.find(item => item.id === id))
    .filter((item): item is CampaignImage => !!item)
)

async function castSlideshow() {
  // Preserve click order: the DM sequenced the story, not the list
  const images = picked.value.map(item => ({
    image_url: item.url,
    caption: item.caption || item.entity_name
  }))

  if (!images.length) {
    return
  }

  busy.value = true

  try {
    const status = await cast.set({
      mode: 'slideshow',
      payload: { images, interval_seconds: interval.value }
    })
    emit('cast', status)
    toast.add({
      title: `Slideshow of ${images.length} live`,
      icon: 'i-lucide-images',
      color: 'success'
    })
    open.value = false
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ContentCard
    title="Slideshow"
    icon="i-lucide-images"
    description="Hand-picked art, rotating on the table — recap faces, tonight's places, a mood."
  >
    <template #actions>
      <UButton
        label="Build a slideshow"
        icon="i-lucide-images"
        color="neutral"
        variant="outline"
        size="sm"
        @click="open = true"
      />
    </template>

    <UModal
      v-model:open="open"
      title="Build the slideshow"
      description="Search, pick, and the order you click is the order the table sees."
      :ui="{ content: 'max-w-3xl' }"
    >
      <template #body>
        <div class="space-y-3">
          <!-- The reel so far, in show order -->
          <div
            v-if="picked.length"
            class="flex flex-wrap items-center gap-1.5 rounded-xl bg-elevated/60 p-2"
          >
            <button
              v-for="(item, index) in picked"
              :key="item.id"
              type="button"
              class="group relative"
              :title="`Remove ${item.caption || item.entity_name}`"
              @click="toggle(item.id)"
            >
              <img
                :src="mediaUrl(item.url)"
                :alt="item.entity_name"
                class="size-12 rounded-lg object-cover transition-opacity group-hover:opacity-60"
              >
              <span class="absolute -top-1 -left-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-inverted">
                {{ index + 1 }}
              </span>
            </button>
            <UButton
              label="Clear"
              size="xs"
              color="neutral"
              variant="ghost"
              class="ml-auto"
              @click="selected = []"
            />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <UInput
              v-model="query"
              icon="i-lucide-search"
              placeholder="Search by name…"
              class="w-full sm:w-64"
            />
            <div class="flex flex-wrap gap-1">
              <UButton
                label="All"
                size="xs"
                :color="typeFilter === null ? 'primary' : 'neutral'"
                :variant="typeFilter === null ? 'solid' : 'ghost'"
                @click="typeFilter = null"
              />
              <UButton
                v-for="type in typesInPool"
                :key="type.value"
                :label="type.plural"
                :icon="type.icon"
                size="xs"
                :color="typeFilter === type.value ? 'primary' : 'neutral'"
                :variant="typeFilter === type.value ? 'solid' : 'ghost'"
                @click="typeFilter = typeFilter === type.value ? null : type.value"
              />
            </div>
          </div>

          <div
            v-if="loading"
            class="grid grid-cols-4 gap-2 sm:grid-cols-6"
          >
            <USkeleton
              v-for="i in 6"
              :key="i"
              class="aspect-square rounded-xl"
            />
          </div>

          <p
            v-else-if="!pool.length"
            class="py-4 text-sm text-muted"
          >
            Nothing here has an image yet. Add art to an NPC or location first.
          </p>

          <p
            v-else-if="!shown.length"
            class="py-4 text-sm text-muted"
          >
            Nothing matches — different search, or another type.
          </p>

          <div
            v-else
            class="grid max-h-80 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6"
          >
            <button
              v-for="item in shown"
              :key="item.id"
              type="button"
              class="group relative aspect-square overflow-hidden rounded-xl border-2 transition-colors"
              :class="selected.includes(item.id)
                ? 'border-primary'
                : 'border-transparent hover:border-accented'"
              @click="toggle(item.id)"
            >
              <img
                :src="mediaUrl(item.url)"
                :alt="item.caption ?? item.entity_name"
                class="size-full object-cover"
                loading="lazy"
              >
              <span
                class="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-left text-xs text-white"
              >
                {{ item.caption || item.entity_name }}
              </span>
              <span
                v-if="selected.includes(item.id)"
                class="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-inverted"
              >
                {{ selected.indexOf(item.id) + 1 }}
              </span>
            </button>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-default pt-3">
            <UFormField label="Seconds per slide">
              <UInputNumber
                v-model="interval"
                :min="3"
                :max="120"
                class="w-32"
              />
            </UFormField>

            <UButton
              :label="picked.length ? `Cast ${picked.length} slide${picked.length === 1 ? '' : 's'}` : 'Pick some art'"
              icon="i-lucide-cast"
              :loading="busy"
              :disabled="!picked.length"
              @click="castSlideshow"
            />
          </div>
        </div>
      </template>
    </UModal>
  </ContentCard>
</template>
