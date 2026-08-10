<script setup lang="ts">
/**
 * Giving a place its map.
 *
 * A map is its own entity — pins, fog, casting — so "adding a map to the
 * kingdom" means placing a map entity inside it: pick one the campaign
 * already has, or name a new one and go straight to its page to hang the
 * picture. Either way the place's "In this place" card offers it back with
 * a thumbnail from then on.
 */
const props = defineProps<{
  placeId: string
  placeName: string
}>()

const emit = defineEmits<{ added: [] }>()

const open = defineModel<boolean>('open', { required: true })

const entities = useEntities()
const mediaUrl = useMediaUrl()
const toast = useToast()

const query = ref('')
const results = ref<EntitySummary[]>([])
const newName = ref('')
const busy = ref(false)

let searchTimer: ReturnType<typeof setTimeout> | undefined

async function search() {
  const page = await entities.list({
    type: 'map',
    q: query.value.trim() || undefined,
    page_size: 8
  })
  results.value = page.items
}

watch(query, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(search, 300)
})

watch(open, (isOpen) => {
  if (isOpen) {
    query.value = ''
    newName.value = ''
    search()
  }
})

onBeforeUnmount(() => clearTimeout(searchTimer))

/** An existing map moves here — one home at a time, like every placement */
async function attach(map: EntitySummary) {
  busy.value = true
  try {
    if (map.parent) {
      await entities.unlink(map.id, map.parent.id)
    }
    await entities.link(map.id, props.placeId, 'located_in')
    toast.add({
      title: `“${map.name}” is now the map of ${props.placeName}`,
      icon: 'i-lucide-map',
      color: 'success'
    })
    open.value = false
    emit('added')
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = false
  }
}

/** A brand-new map lands placed and opens ready for its picture */
async function createNew() {
  const name = newName.value.trim()
  if (!name) {
    return
  }
  busy.value = true
  try {
    const created = await entities.create({ type: 'map', name })
    await entities.link(created.id, props.placeId, 'located_in')
    open.value = false
    emit('added')
    await navigateTo(`/entities/${created.id}`)
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`A map for ${placeName}`"
    description="Pick a map the campaign already has, or start a new one and hang its picture next."
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <div class="space-y-3">
        <UInput
          v-model="query"
          icon="i-lucide-search"
          placeholder="Search maps…"
          autofocus
          class="w-full"
        />

        <div
          v-if="results.length"
          class="space-y-1"
        >
          <button
            v-for="map in results"
            :key="map.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-lg p-1.5 text-left text-sm hover:bg-elevated"
            :disabled="busy"
            @click="attach(map)"
          >
            <img
              v-if="map.image_url"
              :src="mediaUrl(map.image_url)!"
              :alt="map.name"
              class="size-10 shrink-0 rounded-lg object-cover"
            >
            <div
              v-else
              class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-elevated"
            >
              <UIcon
                name="i-lucide-map"
                class="size-5 text-dimmed"
              />
            </div>
            <span class="min-w-0 flex-1 truncate">{{ map.name }}</span>
            <span
              v-if="map.parent"
              class="shrink-0 text-xs text-dimmed"
            >now in {{ map.parent.name }}</span>
          </button>
        </div>

        <USeparator label="or" />

        <form
          class="flex gap-2"
          @submit.prevent="createNew"
        >
          <UInput
            v-model="newName"
            :placeholder="`Map of ${placeName}`"
            class="flex-1"
          />
          <UButton
            type="submit"
            label="Create"
            icon="i-lucide-plus"
            :loading="busy"
            :disabled="!newName.trim()"
          />
        </form>
      </div>
    </template>
  </UModal>
</template>
