<script setup lang="ts">
// Explicit: Nuxt's auto-import scanner registers everything else in useGrid
// but not this one, and a name that silently resolves to nothing is worse
// than an import line.
import { readGrid } from '~/composables/useGrid'

/**
 * The fight, on a map.
 *
 * Tokens are the combatants already in the initiative order — there is no
 * second list to keep in step, because a token that isn't in initiative is a
 * creature nobody will remember to give a turn. Positions are percentages, so
 * a token lands in the same place on the DM's laptop and the table's TV.
 *
 * Fog is the map's own, painted where maps are painted. Casting sends both,
 * so what the party sees is the map as they know it with the fight on top.
 */
const props = defineProps<{
  combatants: Combatant[]
  mapId: string | null | undefined
  /**
   * Prepping rather than running.
   *
   * The same board, minus the button that puts it on the wall — casting an
   * ambush while you are still deciding where the goblins hide is the one
   * mistake this screen could make on the DM's behalf.
   */
  prep?: boolean
}>()

const emit = defineEmits<{
  moved: [id: string, point: { x: number, y: number }]
  chose: [mapId: string | null]
}>()

const toast = useToast()
const entities = useEntities()
const cast = useCast()
const mediaUrl = useMediaUrl()

const map = ref<EntityDetail | null>(null)

/** The board picture: the location's map attribute (legacy map entities too) */
const mapSrc = computed(() => (map.value ? mapImageOf(map.value) : null))

const loading = ref(false)

async function load() {
  if (!props.mapId) {
    map.value = null
    return
  }

  loading.value = true
  try {
    map.value = await entities.read(props.mapId)
  } catch {
    // Deleted mid-session. The fight carries on; the map just isn't there.
    map.value = null
  } finally {
    loading.value = false
  }
}

watch(() => props.mapId, load, { immediate: true })

/* --- The grid and what "how far" means on it -------------------------------- */

const grid = computed(() => (map.value ? readGrid(map.value.data) : null))

/**
 * The image's own proportions, needed to make a cell square on screen rather
 * than square in percentages. Read off the loaded image, so it costs nothing.
 */
const aspect = ref(1)

function onImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  if (img.naturalWidth && img.naturalHeight) {
    aspect.value = img.naturalWidth / img.naturalHeight
  }
}

/** Where a dragged token started, so the DM can see how far it has come */
const dragOrigin = ref<{ x: number, y: number } | null>(null)
const dragNow = ref<{ x: number, y: number } | null>(null)

/** A measurement the DM took deliberately, from empty map to empty map */
const measure = ref<{ from: { x: number, y: number }, to: { x: number, y: number } } | null>(null)
const measuring = ref(false)

const shownLine = computed(() => {
  if (dragOrigin.value && dragNow.value) {
    return { from: dragOrigin.value, to: dragNow.value }
  }
  return measure.value
})

const shownDistance = computed(() => {
  const line = shownLine.value
  if (!line || !grid.value) {
    return null
  }
  return distanceInFeet(line.from, line.to, grid.value, aspect.value)
})

const fog = computed(() => (map.value ? readFog(map.value.data) : null))
const cells = computed(() => (fog.value ? decodeCells(fog.value) : new Uint8Array()))

/**
 * A face on the token, where the combatant points at something with a picture.
 *
 * Two letters told you which goblin was which and nothing about who it was.
 * The cache is the app-wide one, so the roster rail and the token draw the
 * same fetch — a fight redraws constantly and this must not become a request
 * per frame.
 */
const portraits = usePortraits()

watch(
  () => props.combatants.map(c => c.entity_id).join(','),
  () => portraits.ensure(props.combatants.map(c => c.entity_id)),
  { immediate: true }
)

const portraitFor = (token: Combatant) => portraits.urlFor(token.entity_id)

/* --- Picking a map --------------------------------------------------------- */

const picker = reactive({ open: false, query: '', results: [] as EntitySummary[] })

let searchTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Any place with a map can host the fight — the map is the location's
 * attribute now. Legacy map entities still turn up so old campaigns keep
 * their boards.
 */
async function searchMaps(q: string) {
  const [places, legacy] = await Promise.all([
    entities.list({ type: 'location', q: q.trim() || undefined, page_size: 50 }),
    entities.list({ type: 'map', q: q.trim() || undefined, page_size: 10 })
  ])
  picker.results = [...places.items, ...legacy.items]
    .filter(item => mapImageOf(item))
    .slice(0, 12)
}

watch(() => picker.query, (q) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => searchMaps(q), 250)
})

function openPicker() {
  picker.open = true
  picker.query = ''
  // Show what's available before anything is typed — most campaigns have few
  searchMaps('')
}

onBeforeUnmount(() => clearTimeout(searchTimer))

/* --- Moving tokens --------------------------------------------------------- */

const surface = useTemplateRef<HTMLElement>('surface')
const dragging = ref<string | null>(null)

/** Placed tokens draw on the map; the rest wait in the tray below it */
const placed = computed(() => props.combatants.filter(c => c.x != null && c.y != null))

/**
 * Creatures standing in the same place, fanned apart so you can see them all.
 *
 * Four things in one square is normal — a swarm, a pile-up in a doorway — and
 * stacked tokens hid each other and put four labels on top of one another.
 * The nudge is in pixels and purely visual: the stored position stays exactly
 * where the DM put it, so distances and the cast payload are unaffected.
 */
const SPREAD_THRESHOLD = 3
const SPREAD_RADIUS = 15

const laidOut = computed(() => {
  const buckets = new Map<string, Combatant[]>()

  for (const token of placed.value) {
    // Rounded to the threshold, so "near enough to overlap" lands together
    const key = `${Math.round(token.x! / SPREAD_THRESHOLD)}:${Math.round(token.y! / SPREAD_THRESHOLD)}`
    buckets.set(key, [...(buckets.get(key) ?? []), token])
  }

  return [...buckets.values()].flatMap(group =>
    group.map((token, index) => {
      if (group.length === 1) {
        return { token, dx: 0, dy: 0 }
      }

      // Evenly around a small circle, starting at the top so a pair reads as
      // one above the other rather than at some arbitrary tilt
      const angle = (index / group.length) * Math.PI * 2 - Math.PI / 2
      return {
        token,
        dx: Math.cos(angle) * SPREAD_RADIUS,
        dy: Math.sin(angle) * SPREAD_RADIUS
      }
    })
  )
})
const unplaced = computed(() => props.combatants.filter(c => c.x == null || c.y == null))

function pointAt(event: PointerEvent) {
  const rect = surface.value!.getBoundingClientRect()
  return {
    x: Math.min(100, Math.max(0, Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10)),
    y: Math.min(100, Math.max(0, Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10))
  }
}

function startDrag(event: PointerEvent, id: string) {
  event.preventDefault()
  event.stopPropagation()
  surface.value?.setPointerCapture(event.pointerId)
  dragging.value = id

  const token = props.combatants.find(c => c.id === id)
  // Remembered so the line can be drawn from where the move began, which is
  // the question actually being asked: can I get there from here?
  dragOrigin.value = token?.x != null && token?.y != null ? { x: token.x, y: token.y } : null
  dragNow.value = dragOrigin.value
}

function onPointerMove(event: PointerEvent) {
  if (dragging.value) {
    const point = pointAt(event)
    dragNow.value = point
    emit('moved', dragging.value, point)
    return
  }

  if (measuring.value && measure.value) {
    measure.value = { ...measure.value, to: pointAt(event) }
  }
}

function onPointerUp() {
  dragging.value = null
  dragOrigin.value = null
  dragNow.value = null
  measuring.value = false
}

/** Dropping one from the tray: click the tray token, then click the map */
const placing = ref<string | null>(null)

function onMapClick(event: PointerEvent) {
  if (placing.value) {
    emit('moved', placing.value, pointAt(event))
    placing.value = null
    return
  }

  // Empty map, grid on: drag out a measurement. Released, it stays on screen
  // until the next one, because the answer is usually needed a second longer
  // than the finger is down.
  if (grid.value) {
    const point = pointAt(event)
    measure.value = { from: point, to: point }
    measuring.value = true
  }
}

/* --- Calibrating it -------------------------------------------------------- */

const tuning = ref(false)
const draft = reactive({ ...DEFAULT_GRID })

function openTuner() {
  const existing = grid.value
  Object.assign(draft, existing ?? DEFAULT_GRID)
  tuning.value = true

  // Draw it straight away. Opening the panel to a map with no grid on it and
  // no lines either reads as broken until you happen to nudge something.
  if (!existing) {
    saveGrid({ ...draft })
  }
}

let gridTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Written to the map, not the fight: the same cave is the same cave next
 * session, so it is calibrated once and never again.
 *
 * Debounced, because aligning a grid is a slider being dragged — and it reads
 * the entity first, since `data` is replaced whole and the copy this component
 * holds is whatever the page loaded with.
 */
function saveGrid(next: MapGrid | null) {
  clearTimeout(gridTimer)

  gridTimer = setTimeout(async () => {
    if (!map.value) {
      return
    }

    try {
      const fresh = await entities.read(map.value.id)
      const data = { ...fresh.data }

      if (next) {
        data.grid = { ...next }
      } else {
        delete data.grid
      }

      map.value = await entities.update(map.value.id, { data })
    } catch (error) {
      toast.add({
        title: apiErrorMessage(error, 'Grid didn\'t save'),
        icon: 'i-lucide-circle-alert',
        color: 'error'
      })
    }
  }, 400)
}

watch(draft, () => {
  if (tuning.value) {
    saveGrid({ ...draft })
  }
}, { deep: true })

function removeGrid() {
  tuning.value = false
  measure.value = null
  saveGrid(null)
}

onBeforeUnmount(() => clearTimeout(gridTimer))

/* --- Casting --------------------------------------------------------------- */

const casting = ref(false)

async function castBattle() {
  if (!map.value || !mapSrc.value) {
    return
  }
  casting.value = true

  try {
    const result = await cast.set({
      mode: 'map',
      payload: {
        entity_id: map.value.id,
        image_url: mapSrc.value,
        caption: map.value.name,
        pins: [],
        fog: fog.value,
        grid: grid.value,
        // Only what's on the board, and only what the party may know: a
        // monster's remaining HP is the DM's business, so tokens carry a name
        // and a side and nothing else.
        tokens: laidOut.value.map(({ token: c, dx, dy }) => ({
          x: c.x,
          y: c.y,
          // The visual nudge travels with them, or the same pile-up that was
          // untangled here would be stacked again on the wall
          dx,
          dy,
          label: c.name,
          kind: c.kind,
          down: c.current_hp === 0,
          image_url: portraitFor(c)
        }))
      }
    })

    toast.add({
      title: `Battle map on the table (${placed.value.length} tokens)`,
      icon: 'i-lucide-cast',
      color: result.displays_connected ? 'success' : 'warning',
      description: result.displays_connected ? undefined : 'No display connected'
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    casting.value = false
  }
}

defineExpose({ castBattle })
</script>

<template>
  <ContentCard
    title="Battle map"
    icon="i-lucide-map"
    :description="map
      ? 'Drag tokens. Click one below, then the map, to put it on the board.'
      : prep
        ? 'Pick a map now and set where everyone starts.'
        : 'Pick a map and the fight can happen on it.'"
    flush
  >
    <template #actions>
      <UButton
        :label="map ? 'Change map' : 'Pick a map'"
        icon="i-lucide-map"
        color="neutral"
        variant="outline"
        size="sm"
        @click="openPicker"
      />
      <UButton
        v-if="map"
        :label="grid ? `Grid · ${grid.feet} ft` : 'Add a grid'"
        icon="i-lucide-grid-3x3"
        :color="tuning ? 'primary' : 'neutral'"
        :variant="tuning ? 'solid' : 'outline'"
        size="sm"
        @click="tuning ? (tuning = false) : openTuner()"
      />
      <UButton
        v-if="map && !prep"
        label="Cast"
        icon="i-lucide-cast"
        size="sm"
        :loading="casting"
        @click="castBattle"
      />
      <UButton
        v-if="map"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Fight without a map"
        @click="emit('chose', null)"
      />
    </template>

    <div
      v-if="!map"
      class="p-6 text-sm text-muted"
    >
      No map yet. Any map in the campaign will do — the fog you've painted on it
      comes along.
    </div>

    <template v-else>
      <div
        v-if="tuning"
        class="flex flex-wrap items-center gap-4 border-b border-default p-3"
      >
        <label class="flex items-center gap-2 text-xs text-muted">
          Squares across
          <UInputNumber
            v-model="draft.cols"
            :min="2"
            :max="200"
            size="xs"
            class="w-24"
          />
        </label>

        <label class="flex items-center gap-2 text-xs text-muted">
          Feet per square
          <UInputNumber
            v-model="draft.feet"
            :min="1"
            :max="1000"
            size="xs"
            class="w-24"
          />
        </label>

        <!-- Printed maps rarely start their grid at the image edge -->
        <label class="flex items-center gap-2 text-xs text-muted">
          Nudge
          <USlider
            v-model="draft.offsetX"
            :min="0"
            :max="1"
            :step="0.02"
            class="w-20"
          />
          <USlider
            v-model="draft.offsetY"
            :min="0"
            :max="1"
            :step="0.02"
            class="w-20"
          />
        </label>

        <p class="text-xs text-dimmed">
          Count the squares along the top of the map. Diagonals cost the same
          as straight steps, as in the rules.
        </p>

        <UButton
          label="Remove grid"
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="xs"
          class="ml-auto"
          @click="removeGrid"
        />
      </div>

      <div
        ref="surface"
        class="relative touch-none select-none"
        :class="placing && 'cursor-crosshair'"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerdown="onMapClick"
      >
        <img
          :src="mediaUrl(mapSrc!)"
          :alt="map.name"
          class="w-full"
          draggable="false"
          @load="onImageLoad"
        >

        <MapGrid
          v-if="grid"
          :grid="grid"
          :aspect="aspect"
        />

        <!-- The measuring line, and what it comes to in feet -->
        <svg
          v-if="shownLine"
          class="pointer-events-none absolute inset-0 size-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            :x1="shownLine.from.x"
            :y1="shownLine.from.y"
            :x2="shownLine.to.x"
            :y2="shownLine.to.y"
            stroke="rgb(255 160 80)"
            stroke-width="2"
            stroke-dasharray="4 3"
            vector-effect="non-scaling-stroke"
          />
        </svg>

        <span
          v-if="shownLine && shownDistance !== null"
          class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/80 px-2 py-0.5 text-xs font-semibold text-white"
          :style="{
            left: `${(shownLine.from.x + shownLine.to.x) / 2}%`,
            top: `${(shownLine.from.y + shownLine.to.y) / 2}%`
          }"
        >
          {{ shownDistance }} ft
        </span>

        <MapFog
          v-if="fog"
          :cells="cells"
          :w="fog.w"
          :h="fog.h"
        />

        <button
          v-for="{ token, dx, dy } in laidOut"
          :key="token.id"
          type="button"
          class="absolute flex size-8 cursor-grab items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-lg active:cursor-grabbing"
          :class="[
            token.kind === 'character'
              ? 'border-white/80 bg-primary text-inverted'
              : 'border-white/80 bg-error text-white',
            token.current_hp === 0 && 'opacity-40 grayscale',
            dragging === token.id && 'scale-110 ring-2 ring-white'
          ]"
          :style="{
            left: `${token.x}%`,
            top: `${token.y}%`,
            transform: `translate(-50%, -50%) translate(${dx}px, ${dy}px)`
          }"
          :title="token.name"
          @pointerdown="startDrag($event, token.id)"
        >
          <img
            v-if="portraitFor(token)"
            :src="mediaUrl(portraitFor(token)!)"
            :alt="token.name"
            class="size-full rounded-full object-cover"
            draggable="false"
          >
          <template v-else>
            {{ token.name.slice(0, 2).toUpperCase() }}
          </template>
        </button>
      </div>

      <!-- Waiting to go on the board -->
      <div
        v-if="unplaced.length"
        class="flex flex-wrap items-center gap-1.5 border-t border-default p-3"
      >
        <span class="text-xs text-dimmed">Not on the map:</span>
        <UButton
          v-for="token in unplaced"
          :key="token.id"
          :label="token.name"
          size="xs"
          :color="placing === token.id ? 'primary' : 'neutral'"
          :variant="placing === token.id ? 'solid' : 'outline'"
          @click="placing = placing === token.id ? null : token.id"
        />
      </div>
    </template>

    <UModal
      v-model:open="picker.open"
      title="Which map?"
      description="Only maps with a picture — a battle map without one is a blank page."
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <div class="space-y-3">
          <UInput
            v-model="picker.query"
            icon="i-lucide-search"
            placeholder="Cave, tavern, crossroads…"
            class="w-full"
          />

          <div
            v-if="picker.results.length"
            class="space-y-1"
          >
            <button
              v-for="hit in picker.results"
              :key="hit.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-lg p-1.5 text-left text-sm hover:bg-elevated"
              @click="emit('chose', hit.id); picker.open = false"
            >
              <img
                :src="mediaUrl(mapImageOf(hit)!)"
                :alt="hit.name"
                class="size-10 shrink-0 rounded-lg object-cover"
              >
              <span class="truncate">{{ hit.name }}</span>
            </button>
          </div>

          <p
            v-else
            class="text-sm text-muted"
          >
            No place has a map yet. Open a location and “Add a map”.
          </p>
        </div>
      </template>
    </UModal>
  </ContentCard>
</template>
