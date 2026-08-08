<script setup lang="ts">
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

const fog = computed(() => (map.value ? readFog(map.value.data) : null))
const cells = computed(() => (fog.value ? decodeCells(fog.value) : new Uint8Array()))

/* --- Picking a map --------------------------------------------------------- */

const picker = reactive({ open: false, query: '', results: [] as EntitySummary[] })

let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(() => picker.query, (q) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    const page = await entities.list({ type: 'map', q: q.trim() || undefined, page_size: 10 })
    picker.results = page.items.filter(item => item.image_url)
  }, 250)
})

function openPicker() {
  picker.open = true
  picker.query = ''
  // Show what's available before anything is typed — most campaigns have few
  entities.list({ type: 'map', page_size: 10 }).then((page) => {
    picker.results = page.items.filter(item => item.image_url)
  })
}

onBeforeUnmount(() => clearTimeout(searchTimer))

/* --- Moving tokens --------------------------------------------------------- */

const surface = useTemplateRef<HTMLElement>('surface')
const dragging = ref<string | null>(null)

/** Placed tokens draw on the map; the rest wait in the tray below it */
const placed = computed(() => props.combatants.filter(c => c.x != null && c.y != null))
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
}

function onPointerMove(event: PointerEvent) {
  if (dragging.value) {
    emit('moved', dragging.value, pointAt(event))
  }
}

function onPointerUp() {
  dragging.value = null
}

/** Dropping one from the tray: click the tray token, then click the map */
const placing = ref<string | null>(null)

function onMapClick(event: PointerEvent) {
  if (!placing.value) {
    return
  }
  emit('moved', placing.value, pointAt(event))
  placing.value = null
}

/* --- Casting --------------------------------------------------------------- */

const casting = ref(false)

async function castBattle() {
  if (!map.value?.image_url) {
    return
  }
  casting.value = true

  try {
    const result = await cast.set({
      mode: 'map',
      payload: {
        entity_id: map.value.id,
        image_url: map.value.image_url,
        caption: map.value.name,
        pins: [],
        fog: fog.value,
        // Only what's on the board, and only what the party may know: a
        // monster's remaining HP is the DM's business, so tokens carry a name
        // and a side and nothing else.
        tokens: placed.value.map(c => ({
          x: c.x,
          y: c.y,
          label: c.name,
          kind: c.kind,
          down: c.current_hp === 0
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
        ref="surface"
        class="relative touch-none select-none"
        :class="placing && 'cursor-crosshair'"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @pointerdown="onMapClick"
      >
        <img
          :src="mediaUrl(map.image_url!)"
          :alt="map.name"
          class="w-full"
          draggable="false"
        >

        <MapFog
          v-if="fog"
          :cells="cells"
          :w="fog.w"
          :h="fog.h"
        />

        <button
          v-for="token in placed"
          :key="token.id"
          type="button"
          class="absolute flex size-8 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-2 text-[10px] font-bold shadow-lg active:cursor-grabbing"
          :class="[
            token.kind === 'character'
              ? 'border-white/80 bg-primary text-inverted'
              : 'border-white/80 bg-error text-white',
            token.current_hp === 0 && 'opacity-40 grayscale',
            dragging === token.id && 'scale-110 ring-2 ring-white'
          ]"
          :style="{ left: `${token.x}%`, top: `${token.y}%` }"
          :title="token.name"
          @pointerdown="startDrag($event, token.id)"
        >
          {{ token.name.slice(0, 2).toUpperCase() }}
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
                :src="mediaUrl(hit.image_url!)"
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
            No maps with a picture yet. Make one under World → Maps.
          </p>
        </div>
      </template>
    </UModal>
  </ContentCard>
</template>
