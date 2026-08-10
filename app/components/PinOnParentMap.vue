<script setup lang="ts">
/**
 * Pinning this entity onto its parent's map.
 *
 * The Woods sits in the kingdom; the kingdom's map is an attribute of the
 * kingdom — so the pin lands in the kingdom's own `data.pins`, next to its
 * fog and grid, exactly where the map board reads them. Click where it
 * belongs and a pin with this entity's name (and a link back to it) stands
 * there. No parent, no button; a parent without a map, no button either.
 * One pin per entity: re-pinning moves it rather than breeding copies.
 */
const props = defineProps<{
  entity: EntityDetail
  parentId: string
  parentName: string
}>()

const entities = useEntities()
const mediaUrl = useMediaUrl()
const toast = useToast()

/** The parent, fetched to learn whether it has a map to stand on */
const parent = ref<EntityDetail | null>(null)

watch(
  () => props.parentId,
  async (id) => {
    parent.value = null
    try {
      parent.value = await entities.read(id)
    } catch {
      // No parent readable means no button — never an error worth raising
    }
  },
  { immediate: true }
)

const mapSrc = computed(() => (parent.value ? mapImageOf(parent.value) : null))

const open = ref(false)

/** Where the pin stands now, if this entity is already on the map */
const currentPin = computed(() => {
  const pins = Array.isArray(parent.value?.data.pins)
    ? (parent.value!.data.pins as MapPin[])
    : []
  const mine = pins.find(pin => pin.entity_id === props.entity.id)
  return mine ? { x: mine.x, y: mine.y } : null
})

/** The other pins, for context — placing blind next to them helps nobody */
const otherPins = computed(() => {
  const pins = Array.isArray(parent.value?.data.pins)
    ? (parent.value!.data.pins as MapPin[])
    : []
  return pins.filter(pin => pin.entity_id !== props.entity.id)
})

const spot = ref<{ x: number, y: number } | null>(null)

watch(open, (isOpen) => {
  if (isOpen) {
    spot.value = currentPin.value
  }
})

function place(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  spot.value = {
    x: Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10,
    y: Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10
  }
}

const saving = ref(false)

/** The pin comes off the parent's map — read fresh, drop ours, write back */
async function removePin() {
  saving.value = true
  try {
    const fresh = await entities.read(props.parentId)
    const pins = (Array.isArray(fresh.data.pins) ? (fresh.data.pins as MapPin[]) : [])
      .filter(pin => pin.entity_id !== props.entity.id)

    parent.value = await entities.update(props.parentId, { data: { ...fresh.data, pins } })
    spot.value = null

    toast.add({
      title: `Pin removed from ${props.parentName}'s map`,
      icon: 'i-lucide-map-pin-off',
      color: 'success'
    })
    open.value = false
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function save() {
  if (!spot.value) {
    return
  }
  saving.value = true

  try {
    // Read first: `data` is replaced whole, and the parent may have gained
    // fog or pins since this page loaded
    const fresh = await entities.read(props.parentId)
    const pins = (Array.isArray(fresh.data.pins) ? (fresh.data.pins as MapPin[]) : [])
      .filter(pin => pin.entity_id !== props.entity.id)

    pins.push({
      id: Math.random().toString(36).slice(2, 10),
      x: spot.value.x,
      y: spot.value.y,
      entity_id: props.entity.id,
      label: props.entity.name
    })

    parent.value = await entities.update(props.parentId, { data: { ...fresh.data, pins } })

    toast.add({
      title: `“${props.entity.name}” pinned on ${props.parentName}'s map`,
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
  <div v-if="mapSrc">
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
          <div
            class="relative cursor-crosshair overflow-hidden rounded-xl"
            @click="place"
          >
            <img
              :src="mediaUrl(mapSrc)!"
              :alt="parentName"
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

          <div class="flex items-center justify-end gap-2">
            <UButton
              v-if="currentPin"
              label="Remove pin"
              icon="i-lucide-map-pin-off"
              color="error"
              variant="ghost"
              size="sm"
              :loading="saving"
              @click="removePin"
            />
            <UButton
              :label="currentPin ? 'Move the pin here' : 'Pin it here'"
              icon="i-lucide-map-pin-check"
              size="sm"
              :disabled="!spot"
              :loading="saving"
              @click="save"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
