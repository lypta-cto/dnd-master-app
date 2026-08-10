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
const { confirm } = useConfirm()
const entities = useEntities()
const cast = useCast()
const mediaUrl = useMediaUrl()

const pins = ref<MapPin[]>(
  Array.isArray(props.entity.data.pins) ? [...(props.entity.data.pins as MapPin[])] : []
)

/**
 * The map picture: the location's own `map_image_url` attribute, or — for
 * legacy map entities from when maps were their own type — the cover image.
 */
const mapSrc = computed(() => mapImageOf(props.entity))

const placing = ref(false)
const saving = ref(false)

/* --- Fog of war ------------------------------------------------------------
 * The DM paints what the party has walked into. Freehand rather than
 * pre-drawn rooms, because a brush costs the same to clear a corridor or half
 * a continent, and needs nothing prepared in advance.
 *
 * It's opt-in per map: a map with no mask has no fog, so switching this on
 * doesn't black out every map already in the campaign.
 */
const surface = useTemplateRef<HTMLElement>('surface')

const fog = ref<FogMask | null>(readFog(props.entity.data))
const cells = ref<Uint8Array>(fog.value ? decodeCells(fog.value) : new Uint8Array())
const fogVersion = ref(0)

/** Painting and pin placement fight over the same clicks, so only one is live */
const tool = ref<'pins' | 'fog'>('pins')
const brushMode = ref<'reveal' | 'hide'>('reveal')
const brush = ref(6)

const fogOn = computed(() => !!fog.value)
const uncovered = computed(() => {
  void fogVersion.value
  return fog.value ? Math.round(revealedFraction(cells.value) * 100) : 0
})

function enableFog() {
  const image = surface.value?.querySelector('img')
  const aspect = image?.naturalWidth ? image.naturalHeight / image.naturalWidth : 1

  const w = FOG_WIDTH
  const h = fogHeightFor(aspect)

  cells.value = new Uint8Array(w * h)
  fog.value = { w, h, mask: encodeCells(cells.value) }
  fogVersion.value++
  tool.value = 'fog'
  persistFog()
}

async function clearFog() {
  if (!(await confirm({
    title: 'Remove the fog?',
    description: 'The whole map becomes visible to the party again.',
    confirmLabel: 'Remove fog'
  }))) {
    return
  }

  fog.value = null
  cells.value = new Uint8Array()
  fogVersion.value++
  tool.value = 'pins'
  await entities.setFog(props.entity.id, null)
}

function paintAt(event: PointerEvent) {
  const target = surface.value
  const current = fog.value
  if (!target || !current) {
    return
  }

  const rect = target.getBoundingClientRect()
  const cx = ((event.clientX - rect.left) / rect.width) * current.w
  const cy = ((event.clientY - rect.top) / rect.height) * current.h

  const value = brushMode.value === 'reveal' ? 1 : 0
  const r = brush.value

  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= current.w || y >= current.h) {
        continue
      }
      // Round brush: the DM is clearing where the party walked, and a square
      // edge reads as a wall that isn't there.
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) {
        cells.value[y * current.w + x] = value
      }
    }
  }

  fogVersion.value++
}

/** True when there's no fog at all — an uncovered map hides nothing */
function isRevealed(xPercent: number, yPercent: number) {
  const current = fog.value
  if (!current) {
    return true
  }

  const x = Math.min(current.w - 1, Math.max(0, Math.floor((xPercent / 100) * current.w)))
  const y = Math.min(current.h - 1, Math.max(0, Math.floor((yPercent / 100) * current.h)))

  return !!cells.value[y * current.w + x]
}

let fogTimer: ReturnType<typeof setTimeout> | undefined

/** Saved after the brush stops, not during — a stroke is dozens of moves */
function persistFog() {
  clearTimeout(fogTimer)
  fogTimer = setTimeout(async () => {
    if (!fog.value) {
      return
    }
    const next = { ...fog.value, mask: encodeCells(cells.value) }
    try {
      await entities.setFog(props.entity.id, next)
      fog.value = next
      await pushIfLive()
    } catch (error) {
      toast.add({
        title: apiErrorMessage(error, 'Fog not saved'),
        icon: 'i-lucide-circle-alert',
        color: 'error'
      })
    }
  }, 500)
}

onBeforeUnmount(() => clearTimeout(fogTimer))

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

/** Where a pointer landed, as percentages of the map */
function pointAt(event: { clientX: number, clientY: number }) {
  const rect = surface.value!.getBoundingClientRect()
  return {
    x: Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10,
    y: Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10
  }
}

/* --- Pointer: painting fog, dragging pins ---------------------------------- */

const painting = ref(false)
const draggingId = ref<string | null>(null)

function onPointerDown(event: PointerEvent) {
  if (!props.canEdit || tool.value !== 'fog' || !fogOn.value) {
    return
  }
  event.preventDefault()
  // Capture, so a brush stroke that leaves the image keeps painting until the
  // button comes up rather than stopping at the edge
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  painting.value = true
  paintAt(event)
}

function onPointerMove(event: PointerEvent) {
  if (draggingId.value) {
    const pin = pins.value.find(p => p.id === draggingId.value)
    if (pin) {
      const point = pointAt(event)
      pin.x = Math.min(100, Math.max(0, point.x))
      pin.y = Math.min(100, Math.max(0, point.y))
    }
    return
  }

  if (painting.value) {
    paintAt(event)
  }
}

function onPointerUp() {
  if (draggingId.value) {
    draggingId.value = null
    persist()
  }
  if (painting.value) {
    painting.value = false
    persistFog()
  }
}

/** A pin is dragged, not clicked twice — that's what people expect of a map */
function startDrag(event: PointerEvent, id: string) {
  if (!props.canEdit || tool.value === 'fog') {
    return
  }
  event.preventDefault()
  event.stopPropagation()
  ;(surface.value as HTMLElement).setPointerCapture(event.pointerId)
  draggingId.value = id
}

function onMapClick(event: MouseEvent) {
  if (!placing.value || !props.canEdit) {
    return
  }

  const { x, y } = pointAt(event)

  form.x = x
  form.y = y
  form.label = ''
  form.query = ''
  form.results = []
  form.picked = null
  form.open = true
}

async function persist() {
  saving.value = true
  try {
    // `data` is replaced whole, and the copy in props is whatever the page
    // loaded with — so sending it back after painting would restore the fog
    // the DM just cleared. The live mask goes with it, not the stale one.
    const data: Record<string, unknown> = {
      ...props.entity.data,
      pins: JSON.parse(JSON.stringify(pins.value))
    }

    if (fog.value) {
      data.fog = { ...fog.value, mask: encodeCells(cells.value) }
    } else {
      delete data.fog
    }

    await entities.update(props.entity.id, { data })
    await pushIfLive()
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

/**
 * Whether a pin's entity may be seen by players, remembered.
 *
 * The map re-casts on every stroke of fog now, and asking the API about the
 * same six pins each time would turn a brush into a flood of requests.
 */
const pinVisibility = new Map<string, string | null>()

/** The name to show the table, or null when the party shouldn't see it at all */
async function pinNameForTable(entityId: string): Promise<string | null> {
  const remembered = pinVisibility.get(entityId)
  if (remembered !== undefined) {
    return remembered
  }

  try {
    const linked = await entities.read(entityId)
    pinVisibility.set(entityId, linked.visibility === 'dm_only' ? null : linked.name)
  } catch {
    pinVisibility.set(entityId, null) // deleted or hidden — not for the table
  }

  return pinVisibility.get(entityId)!
}

/** What the table should be looking at, as the party knows it */
async function buildCastState(): Promise<{ state: CastState, shown: number }> {
  // The table sees a pin only if its entity is something players may know
  // about. Label-only pins are deliberate DM annotations — they go through.
  const visiblePins: { x: number, y: number, label: string }[] = []

  for (const pin of pins.value) {
    // A pin standing in fog names the thing the fog is hiding. "Dragon lair"
    // floating over an unexplored corner gives the game away more cheaply
    // than the map ever would.
    if (!isRevealed(pin.x, pin.y)) {
      continue
    }

    if (pin.entity_id) {
      // The pin's own label wins; the entity's name is the fallback for a pin
      // dropped straight onto something without renaming it
      const name = await pinNameForTable(pin.entity_id)
      if (name) {
        visiblePins.push({ x: pin.x, y: pin.y, label: pin.label || name })
      }
    } else if (pin.label) {
      visiblePins.push({ x: pin.x, y: pin.y, label: pin.label })
    }
  }

  return {
    shown: visiblePins.length,
    state: {
      mode: 'map',
      payload: {
        // So the top bar can name this and link back to it
        entity_id: props.entity.id,
        image_url: mapSrc.value,
        caption: props.entity.name,
        pins: visiblePins,
        // The table sees the map as the party knows it, not as the DM does
        fog: fog.value ? { ...fog.value, mask: encodeCells(cells.value) } : null
      }
    }
  }
}

async function castMap() {
  if (!mapSrc.value) {
    return
  }
  castingMap.value = true
  // Casting deliberately is also the DM's way of saying "look again" — a pin
  // whose entity they just shared should appear without a reload
  pinVisibility.clear()

  try {
    const { state, shown } = await buildCastState()
    const result = await cast.set(state)

    toast.add({
      title: `Map on the table (${shown}/${pins.value.length} pins shown)`,
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

/**
 * Follow-up for a map that's already up.
 *
 * Casting was a snapshot: clear some fog after casting and the table kept
 * showing the old map until you noticed and cast again. Now every change the
 * party is entitled to see reaches them as it happens — and only if this map
 * is the one they're looking at, so moving a pin never puts a map on screen
 * that nobody meant to show.
 */
async function pushIfLive() {
  if (!cast.isShowing(props.entity.id)) {
    return
  }
  try {
    const { state } = await buildCastState()
    await cast.recast(props.entity.id, state)
  } catch {
    // The table lagging by one stroke isn't worth interrupting the DM over;
    // the next change pushes the current state anyway.
  }
}
</script>

<template>
  <ContentCard
    title="Map"
    icon="i-lucide-map"
    :description="canEdit ? 'Drop pins and drag them where they belong. Paint fog over what the party hasn’t found.' : undefined"
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
          :disabled="tool === 'fog'"
          @click="placing = !placing"
        />
        <UButton
          v-if="!fogOn"
          label="Add fog"
          icon="i-lucide-cloud-fog"
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="!mapSrc"
          @click="enableFog"
        />
        <UButton
          v-else
          :label="tool === 'fog' ? `Painting — ${uncovered}% clear` : 'Paint fog'"
          icon="i-lucide-cloud-fog"
          :color="tool === 'fog' ? 'primary' : 'neutral'"
          :variant="tool === 'fog' ? 'solid' : 'outline'"
          size="sm"
          @click="tool = tool === 'fog' ? 'pins' : 'fog'; placing = false"
        />
        <UButton
          label="Cast map"
          icon="i-lucide-cast"
          size="sm"
          :loading="castingMap"
          :disabled="!mapSrc"
          @click="castMap"
        />
      </template>
    </template>

    <p
      v-if="!mapSrc"
      class="p-6 text-sm text-muted"
    >
      No map picture yet — add one with “Add a map” above, and pins go on top of it.
    </p>

    <template v-else>
      <!-- Brush controls, only while painting -->
      <div
        v-if="canEdit && tool === 'fog'"
        class="flex flex-wrap items-center gap-3 border-b border-default px-4 py-2.5"
      >
        <UButtonGroup size="xs">
          <UButton
            label="Reveal"
            icon="i-lucide-eraser"
            :color="brushMode === 'reveal' ? 'primary' : 'neutral'"
            :variant="brushMode === 'reveal' ? 'solid' : 'outline'"
            @click="brushMode = 'reveal'"
          />
          <UButton
            label="Hide"
            icon="i-lucide-cloud"
            :color="brushMode === 'hide' ? 'primary' : 'neutral'"
            :variant="brushMode === 'hide' ? 'solid' : 'outline'"
            @click="brushMode = 'hide'"
          />
        </UButtonGroup>

        <label class="flex items-center gap-2 text-xs text-muted">
          Brush
          <USlider
            v-model="brush"
            :min="2"
            :max="18"
            class="w-32"
          />
        </label>

        <p class="text-xs text-dimmed">
          Drag across the map. The party sees only what you clear.
        </p>

        <UButton
          label="Remove fog"
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          class="ml-auto"
          @click="clearFog"
        />
      </div>

      <div
        v-else-if="!canEdit && fogOn"
        class="border-b border-default px-4 py-2 text-xs text-muted"
      >
        Parts of this map are still uncharted.
      </div>

      <div
        ref="surface"
        class="relative touch-none select-none"
        :class="placing ? 'cursor-crosshair' : tool === 'fog' && canEdit ? 'cursor-cell' : undefined"
        @click="onMapClick"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
      >
        <img
          :src="mediaUrl(mapSrc)"
          :alt="entity.name"
          class="w-full"
          draggable="false"
        >

        <!-- The DM sees through it; a player doesn't -->
        <MapFog
          v-if="fog"
          :cells="cells"
          :w="fog.w"
          :h="fog.h"
          :version="fogVersion"
          :opaque="!canEdit"
        />

        <UPopover
          v-for="pin in pins"
          :key="pin.id"
          :content="{ side: 'top', sideOffset: 6 }"
        >
          <button
            type="button"
            class="group absolute -translate-x-1/2 -translate-y-full"
            :class="canEdit && tool === 'pins' && 'cursor-grab active:cursor-grabbing'"
            :style="{ left: `${pin.x}%`, top: `${pin.y}%` }"
            :aria-label="pin.label || 'Pin'"
            @click.stop
            @pointerdown="startDrag($event, pin.id)"
          >
            <UIcon
              name="i-lucide-map-pin"
              class="size-7 text-primary drop-shadow-[0_2px_3px_rgb(0_0_0/60%)] transition-transform group-hover:scale-125"
              :class="draggingId === pin.id && 'scale-125'"
            />
            <span class="absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap rounded-full bg-black/65 px-2 py-0.5 text-xs font-medium text-white">
              {{ pin.label }}
            </span>
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
    </template>

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
