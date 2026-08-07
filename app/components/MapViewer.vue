<script setup lang="ts">
/**
 * The map: its cover image with pins on top.
 *
 * Pins live in the entity's `data.pins` as percentages, so they land in the
 * same spot on a phone, the DM's laptop and the table's TV. Placement is
 * click-to-drop; each pin either points at an entity or carries a free label.
 */
const props = defineProps<{
  entity: EntityDetail
  canEdit: boolean
}>()

const toast = useToast()
const entities = useEntities()
const cast = useCast()
const mediaUrl = useMediaUrl()

const pins = ref<MapPin[]>(
  Array.isArray(props.entity.data.pins) ? [...(props.entity.data.pins as MapPin[])] : []
)

const placing = ref(false)
const saving = ref(false)

/* --- Pin form (opens after a click on the map) ----------------------------- */

const form = reactive({
  open: false,
  x: 0,
  y: 0,
  label: '',
  query: '',
  results: [] as SearchHit[],
  picked: null as SearchHit | null
})

let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(() => form.query, (q) => {
  clearTimeout(searchTimer)
  form.picked = null
  if (!q.trim()) {
    form.results = []
    return
  }
  searchTimer = setTimeout(async () => {
    form.results = await entities.search(q.trim(), 6)
  }, 250)
})

function onMapClick(event: MouseEvent) {
  if (!placing.value || !props.canEdit) {
    return
  }
  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  form.x = Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10
  form.y = Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10
  form.label = ''
  form.query = ''
  form.results = []
  form.picked = null
  form.open = true
}

async function persist() {
  saving.value = true
  try {
    await entities.update(props.entity.id, {
      data: { ...props.entity.data, pins: JSON.parse(JSON.stringify(pins.value)) }
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error, 'Save failed'), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function addPin() {
  if (!form.picked && !form.label.trim()) {
    return
  }
  pins.value.push({
    id: Math.random().toString(36).slice(2, 10),
    x: form.x,
    y: form.y,
    entity_id: form.picked?.id ?? null,
    label: form.picked ? form.picked.name : form.label.trim()
  })
  form.open = false
  placing.value = false
  await persist()
}

async function removePin(id: string) {
  pins.value = pins.value.filter(pin => pin.id !== id)
  await persist()
}

/* --- Casting --------------------------------------------------------------- */

const castingMap = ref(false)

async function castMap() {
  if (!props.entity.image_url) {
    return
  }
  castingMap.value = true

  try {
    // The table sees a pin only if its entity is something players may know
    // about. Label-only pins are deliberate DM annotations — they go through.
    const visiblePins: { x: number, y: number, label: string }[] = []

    for (const pin of pins.value) {
      if (pin.entity_id) {
        try {
          const linked = await entities.read(pin.entity_id)
          if (linked.visibility === 'dm_only') {
            continue
          }
          visiblePins.push({ x: pin.x, y: pin.y, label: pin.label || linked.name })
        } catch {
          continue // deleted or hidden — either way, not for the table
        }
      } else if (pin.label) {
        visiblePins.push({ x: pin.x, y: pin.y, label: pin.label })
      }
    }

    const result = await cast.set({
      mode: 'map',
      payload: {
        image_url: props.entity.image_url,
        caption: props.entity.name,
        pins: visiblePins
      }
    })

    toast.add({
      title: `Map on the table (${visiblePins.length}/${pins.value.length} pins shown)`,
      icon: 'i-lucide-map',
      color: result.displays_connected ? 'success' : 'warning',
      description: result.displays_connected ? undefined : 'No display connected'
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    castingMap.value = false
  }
}
</script>

<template>
  <ContentCard
    title="Map"
    icon="i-lucide-map"
    :description="canEdit ? 'Click “Place pin”, then click the map. Pins point at entities or carry a label.' : undefined"
    flush
  >
    <template #actions>
      <template v-if="canEdit">
        <UButton
          :label="placing ? 'Click the map…' : 'Place pin'"
          :icon="placing ? 'i-lucide-crosshair' : 'i-lucide-map-pin-plus'"
          :color="placing ? 'primary' : 'neutral'"
          :variant="placing ? 'solid' : 'outline'"
          size="sm"
          @click="placing = !placing"
        />
        <UButton
          label="Cast map"
          icon="i-lucide-cast"
          size="sm"
          :loading="castingMap"
          :disabled="!entity.image_url"
          @click="castMap"
        />
      </template>
    </template>

    <p
      v-if="!entity.image_url"
      class="p-6 text-sm text-muted"
    >
      Upload the map image to the gallery below and set it as cover — pins go on top of it.
    </p>

    <div
      v-else
      class="relative select-none"
      :class="placing && 'cursor-crosshair'"
      @click="onMapClick"
    >
      <img
        :src="mediaUrl(entity.image_url)"
        :alt="entity.name"
        class="w-full"
        draggable="false"
      >

      <UPopover
        v-for="pin in pins"
        :key="pin.id"
        :content="{ side: 'top', sideOffset: 6 }"
      >
        <button
          type="button"
          class="group absolute -translate-x-1/2 -translate-y-full"
          :style="{ left: `${pin.x}%`, top: `${pin.y}%` }"
          :aria-label="pin.label || 'Pin'"
          @click.stop
        >
          <UIcon
            name="i-lucide-map-pin"
            class="size-7 text-primary drop-shadow-[0_2px_3px_rgb(0_0_0/60%)] transition-transform group-hover:scale-125"
          />
        </button>

        <template #content>
          <div class="flex items-center gap-2 p-2">
            <NuxtLink
              v-if="pin.entity_id"
              :to="`/entities/${pin.entity_id}`"
              class="text-sm font-medium text-primary"
            >
              {{ pin.label }}
            </NuxtLink>
            <span
              v-else
              class="text-sm font-medium text-highlighted"
            >{{ pin.label }}</span>

            <UButton
              v-if="canEdit"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              aria-label="Remove pin"
              @click="removePin(pin.id)"
            />
          </div>
        </template>
      </UPopover>
    </div>

    <!-- New pin dialog -->
    <UModal
      v-model:open="form.open"
      title="New pin"
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <div class="space-y-3">
          <UFormField
            label="Link an entity"
            help="Search anything in the campaign."
          >
            <UInput
              v-model="form.query"
              icon="i-lucide-search"
              placeholder="Castle Ravenloft…"
              class="w-full"
            />
          </UFormField>

          <div
            v-if="form.results.length"
            class="space-y-1"
          >
            <button
              v-for="hit in form.results"
              :key="hit.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-elevated"
              :class="form.picked?.id === hit.id && 'bg-primary/10 text-primary'"
              @click="form.picked = hit"
            >
              <UIcon
                :name="entityTypeMeta(hit.type).icon"
                class="size-4 shrink-0"
              />
              <span class="truncate">{{ hit.name }}</span>
              <UIcon
                v-if="form.picked?.id === hit.id"
                name="i-lucide-check"
                class="ml-auto size-4"
              />
            </button>
          </div>

          <USeparator label="or" />

          <UFormField label="Just a label">
            <UInput
              v-model="form.label"
              placeholder="Ambush here"
              class="w-full"
              :disabled="!!form.picked"
            />
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="outline"
              @click="form.open = false"
            />
            <UButton
              label="Drop pin"
              icon="i-lucide-map-pin"
              :loading="saving"
              :disabled="!form.picked && !form.label.trim()"
              @click="addPin"
            />
          </div>
        </div>
      </template>
    </UModal>
  </ContentCard>
</template>
