<script setup lang="ts">
/**
 * Pinning this entity onto its parent's map.
 *
 * The Woods sits in Emberfall Kingdom; the kingdom has a map; so The Woods
 * can stand on it — click where it belongs and a pin with this entity's name
 * (and a link back to it) lands on the map entity's own pins. No parent, no
 * button; a parent without a mapped map, no button either. One pin per
 * entity per map: re-pinning moves it rather than breeding copies.
 */
const props = defineProps<{
  entity: EntityDetail
  parentId: string
  parentName: string
}>()

const entities = useEntities()
const mediaUrl = useMediaUrl()
const toast = useToast()

/** The parent's maps: map entities placed inside it, pictures required */
const parentMaps = ref<LinkedEntity[]>([])

watch(
  () => props.parentId,
  async (id) => {
    parentMaps.value = []
    try {
      const parent = await entities.read(id)
      parentMaps.value = parent.backlinks.filter(
        link => link.relation === 'located_in'
          && link.type === 'map'
          && link.image_url
          // A map that lives in the kingdom is the kingdom's map — offering
          // to pin it onto itself is an escape room, not a feature
          && link.id !== props.entity.id
      )
    } catch {
      // No maps found means no button — never an error worth raising
    }
  },
  { immediate: true }
)

const open = ref(false)

/** Which map is on the table in the dialog — auto-picked when there's one */
const chosen = ref<LinkedEntity | null>(null)

watch(open, (isOpen) => {
  if (isOpen) {
    chosen.value = parentMaps.value.length === 1 ? parentMaps.value[0]! : null
    spot.value = currentPin.value
  }
})

/** Where the pin stands now, if this entity is already on the chosen map */
const currentPin = computed(() => {
  if (!chosen.value) {
    return null
  }
  const pins = Array.isArray(chosen.value.data.pins)
    ? (chosen.value.data.pins as MapPin[])
    : []
  const mine = pins.find(pin => pin.entity_id === props.entity.id)
  return mine ? { x: mine.x, y: mine.y } : null
})

/** The other pins, for context — placing blind next to them helps nobody */
const otherPins = computed(() => {
  if (!chosen.value) {
    return []
  }
  const pins = Array.isArray(chosen.value.data.pins)
    ? (chosen.value.data.pins as MapPin[])
    : []
  return pins.filter(pin => pin.entity_id !== props.entity.id)
})

const spot = ref<{ x: number, y: number } | null>(null)

watch(chosen, () => {
  spot.value = currentPin.value
})

function place(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  spot.value = {
    x: Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10,
    y: Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10
  }
}

const saving = ref(false)

async function save() {
  if (!chosen.value || !spot.value) {
    return
  }
  saving.value = true

  try {
    // Read first: `data` is replaced whole, and the map may have gained fog
    // or pins since this page loaded
    const fresh = await entities.read(chosen.value.id)
    const pins = (Array.isArray(fresh.data.pins) ? (fresh.data.pins as MapPin[]) : [])
      .filter(pin => pin.entity_id !== props.entity.id)

    pins.push({
      id: Math.random().toString(36).slice(2, 10),
      x: spot.value.x,
      y: spot.value.y,
      entity_id: props.entity.id,
      label: props.entity.name
    })

    await entities.update(chosen.value.id, { data: { ...fresh.data, pins } })

    toast.add({
      title: `“${props.entity.name}” pinned on ${chosen.value.name}`,
      icon: 'i-lucide-map-pin-check',
      color: 'success'
    })
    open.value = false
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="parentMaps.length">
    <UButton
      :label="`Pin on ${parentName}'s map`"
      icon="i-lucide-map-pin-plus"
      color="neutral"
      variant="outline"
      size="xs"
      @click="open = true"
    />

    <UModal
      v-model:open="open"
      :title="`Where in ${parentName}?`"
      description="Click the map where this belongs. Saving moves the old pin if there was one."
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <div class="space-y-3">
          <!-- More than one map: say which one first -->
          <div
            v-if="!chosen"
            class="space-y-1"
          >
            <button
              v-for="map in parentMaps"
              :key="map.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-lg p-1.5 text-left text-sm hover:bg-elevated"
              @click="chosen = map"
            >
              <img
                :src="mediaUrl(map.image_url!)!"
                :alt="map.name"
                class="h-12 w-20 shrink-0 rounded-lg object-cover"
              >
              <span class="truncate">{{ map.name }}</span>
            </button>
          </div>

          <template v-else>
            <div
              class="relative cursor-crosshair overflow-hidden rounded-xl"
              @click="place"
            >
              <img
                :src="mediaUrl(chosen.image_url!)!"
                :alt="chosen.name"
                class="w-full select-none"
                draggable="false"
              >

              <!-- The neighbours, faded — placing blind helps nobody -->
              <span
                v-for="pin in otherPins"
                :key="pin.id"
                class="pointer-events-none absolute -translate-x-1/2 -translate-y-full opacity-50"
                :style="{ left: `${pin.x}%`, top: `${pin.y}%` }"
              >
                <span class="block size-2.5 rounded-full border-2 border-white/70 bg-neutral-400" />
              </span>

              <!-- The pin being decided -->
              <span
                v-if="spot"
                class="pointer-events-none absolute flex -translate-x-1/2 -translate-y-full flex-col items-center"
                :style="{ left: `${spot.x}%`, top: `${spot.y}%` }"
              >
                <span class="block size-3.5 rounded-full border-2 border-white bg-primary shadow-lg" />
                <span class="mt-0.5 rounded-full bg-black/75 px-1.5 py-px text-[10px] font-semibold whitespace-nowrap text-white">
                  {{ entity.name }}
                </span>
              </span>
            </div>

            <div class="flex items-center justify-between gap-2">
              <UButton
                v-if="parentMaps.length > 1"
                label="Another map"
                icon="i-lucide-arrow-left"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="chosen = null"
              />
              <span
                v-else
                class="text-xs text-dimmed"
              >{{ chosen.name }}</span>
              <UButton
                :label="currentPin ? 'Move the pin here' : 'Pin it here'"
                icon="i-lucide-map-pin-check"
                size="sm"
                :disabled="!spot"
                :loading="saving"
                @click="save"
              />
            </div>
          </template>
        </div>
      </template>
    </UModal>
  </div>
</template>
