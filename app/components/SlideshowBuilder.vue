<script setup lang="ts">
const emit = defineEmits<{
  cast: [status: CastStatus]
}>()

const toast = useToast()
const entities = useEntities()
const cast = useCast()
const mediaUrl = useMediaUrl()
const { currentId } = useCampaigns()

/** Every gallery image in the campaign — not just covers */
const pool = ref<CampaignImage[]>([])
const loading = ref(true)

const selected = ref<string[]>([])
const interval = ref(8)
const busy = ref(false)

async function loadPool() {
  if (!currentId.value) {
    return
  }

  loading.value = true

  try {
    pool.value = await entities.campaignImages()
  } finally {
    loading.value = false
  }
}

watch(() => currentId.value, loadPool, { immediate: true })

function toggle(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter(s => s !== id)
    : [...selected.value, id]
}

async function castSlideshow() {
  // Preserve click order: the DM sequenced the story, not the list
  const images = selected.value
    .map(id => pool.value.find(item => item.id === id))
    .filter((item): item is CampaignImage => !!item)
    .map(item => ({ image_url: item.url, caption: item.caption || item.entity_name }))

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
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ContentCard
    title="Cast a slideshow"
    icon="i-lucide-images"
    description="Pick entities with art — the table rotates through them. Click order is show order."
  >
    <div
      v-if="loading"
      class="grid grid-cols-3 gap-2 sm:grid-cols-4"
    >
      <USkeleton
        v-for="i in 4"
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

    <template v-else>
      <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
        <button
          v-for="item in pool"
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
          >
          <span
            class="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-0.5 text-left text-xs text-white"
          >
            {{ item.caption || item.entity_name }}
          </span>
          <span
            v-if="selected.includes(item.id)"
            class="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-inverted"
          >
            {{ selected.indexOf(item.id) + 1 }}
          </span>
        </button>
      </div>

      <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
        <UFormField label="Seconds per slide">
          <UInputNumber
            v-model="interval"
            :min="3"
            :max="120"
            class="w-32"
          />
        </UFormField>

        <UButton
          :label="selected.length ? `Cast ${selected.length} slide(s)` : 'Pick some art'"
          icon="i-lucide-cast"
          :loading="busy"
          :disabled="!selected.length"
          @click="castSlideshow"
        />
      </div>
    </template>
  </ContentCard>
</template>
