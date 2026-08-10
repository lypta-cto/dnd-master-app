<script setup lang="ts">
import { readGrid } from '~/composables/useGrid'

/**
 * The table's screen. Public by token, chromeless, dark.
 *
 * Runs on a TV for hours: no sidebar, no auth, nothing interactive. It renders
 * whatever the DM last cast and updates live over SSE.
 */
definePageMeta({ layout: false })

const route = useRoute()
const mediaUrl = useMediaUrl()

const campaignId = String(route.params.id)
const token = typeof route.query.t === 'string' ? route.query.t : ''

const { state, connected, failed } = useCastDisplay(campaignId, token)

/**
 * The battle grid, when the map cast carries one.
 *
 * The aspect ratio is read off the image as it loads: cells have to be square
 * on the wall, and the payload only knows how many there are across.
 */
const castGrid = computed(() => readGrid(state.value.payload as Record<string, unknown>))
const castAspect = ref(1)

/**
 * The DM's chosen slice of the map, when one was drawn.
 *
 * The whole image still travels (fog needs it, and the crop can change
 * mid-fight), but the screen frames only this rectangle: the inner box takes
 * the slice's aspect, and a full-size "plane" holding the image and every
 * overlay is shifted so the slice fills it. Overlays keep their original
 * percentages — the plane is the coordinate system they always had.
 */
const castCrop = computed(() => {
  const raw = state.value.payload.crop as { x: number, y: number, w: number, h: number } | null | undefined
  if (!raw || typeof raw.w !== 'number' || raw.w <= 1 || raw.h <= 1) {
    return null
  }
  return raw
})

const shownAspect = computed(() =>
  castCrop.value
    ? castAspect.value * (castCrop.value.w / castCrop.value.h)
    : castAspect.value
)

const planeStyle = computed(() => {
  if (!castCrop.value) {
    return { position: 'absolute' as const, inset: '0' }
  }
  const { x, y, w, h } = castCrop.value
  return {
    position: 'absolute' as const,
    width: `${10000 / w}%`,
    height: `${10000 / h}%`,
    left: `${-x * 100 / w}%`,
    top: `${-y * 100 / h}%`
  }
})

function onMapLoad(event: Event) {
  const img = event.target as HTMLImageElement
  if (img.naturalWidth && img.naturalHeight) {
    castAspect.value = img.naturalWidth / img.naturalHeight
  }
}

/** The order of turns, when a fight is running. Its own layer above the rest. */
const strip = computed(() => state.value.initiative?.entries ?? [])

/**
 * Fog travels with the cast payload rather than being read from the entity.
 *
 * This screen has a display token, not an account — it can't fetch the map it
 * is showing. And the fog has to arrive with the picture anyway: a TV that
 * showed the whole map for the half second before a second request landed
 * would give away exactly what the fog exists to keep.
 */
const castFog = computed(() => {
  const fog = readFog(state.value.payload as Record<string, unknown>)
  return fog ? { ...fog, cells: decodeCells(fog) } : null
})

/*
 * Slideshow rotation happens here, on the display, not on the server: the DM
 * casts the set once and every connected screen paces itself. A new cast (any
 * mode) resets the rotation from the first slide.
 */
interface Slide {
  image_url: string
  caption?: string
}

const slideIndex = ref(0)
let slideTimer: ReturnType<typeof setInterval> | undefined

const slides = computed<Slide[]>(() =>
  state.value.mode === 'slideshow' && Array.isArray(state.value.payload.images)
    ? (state.value.payload.images as Slide[])
    : []
)

const currentSlide = computed<Slide | null>(
  () => slides.value[slideIndex.value % Math.max(slides.value.length, 1)] ?? null
)

watch(state, () => {
  clearInterval(slideTimer)
  slideIndex.value = 0

  if (state.value.mode === 'slideshow' && slides.value.length > 1) {
    const seconds = Number(state.value.payload.interval_seconds) || 8
    slideTimer = setInterval(() => {
      slideIndex.value = (slideIndex.value + 1) % slides.value.length
    }, Math.max(3, seconds) * 1000)
  }
}, { deep: true })

onUnmounted(() => clearInterval(slideTimer))

/*
 * Dice drama: on every cast (nonce changes even for identical rolls) the big
 * number shuffles for a moment before settling. Pure theatre, zero rules.
 */
const shownTotal = ref<number | null>(null)
const settling = ref(false)
let diceTimer: ReturnType<typeof setInterval> | undefined
let diceStop: ReturnType<typeof setTimeout> | undefined

watch(
  () => [state.value.mode, state.value.payload.nonce],
  () => {
    clearInterval(diceTimer)
    clearTimeout(diceStop)

    if (state.value.mode !== 'dice') {
      shownTotal.value = null
      return
    }

    const total = Number(state.value.payload.total ?? 0)
    const sides = Number(state.value.payload.sides ?? 20)
    settling.value = false

    diceTimer = setInterval(() => {
      shownTotal.value = 1 + Math.floor(Math.random() * Math.max(sides, total, 2))
    }, 60)

    diceStop = setTimeout(() => {
      clearInterval(diceTimer)
      shownTotal.value = total
      settling.value = true
    }, 1100)
  },
  { immediate: true }
)

onUnmounted(() => {
  clearInterval(diceTimer)
  clearTimeout(diceStop)
})

useHead({ title: 'Display' })
</script>

<template>
  <div
    class="display-root"
    :class="strip.length > 0 && 'display-root--with-strip'"
  >
    <!-- The order of turns, above whatever else is showing. Its own layer, so
         casting a map or a portrait mid-fight doesn't take it away. Hidden
         only when the full-screen order is up: the same list twice is noise. -->
    <div
      v-if="strip.length && state.mode !== 'initiative'"
      class="display-strip"
    >
      <span class="display-strip-round">Round {{ state.initiative?.round ?? 1 }}</span>
      <span
        v-for="(turn, index) in strip"
        :key="`${turn.name}-${index}`"
        class="display-strip-name"
        :class="[
          turn.active && 'display-strip-name--active',
          turn.down && 'display-strip-name--down'
        ]"
      >
        <img
          v-if="turn.image_url"
          :src="mediaUrl(turn.image_url)"
          alt=""
          class="display-strip-face"
        >
        {{ turn.name }}
      </span>
    </div>

    <!-- Bad or rotated token -->
    <div
      v-if="failed || !token"
      class="display-center"
    >
      <UIcon
        name="i-lucide-unlink"
        class="size-16 opacity-30"
      />
      <p class="mt-4 text-xl opacity-60">
        This display link is no longer valid.
      </p>
      <p class="mt-1 text-sm opacity-40">
        Ask the DM for a fresh one.
      </p>
    </div>

    <!-- Image cast -->
    <div
      v-else-if="state.mode === 'image'"
      class="display-image"
    >
      <img
        :src="mediaUrl(String(state.payload.image_url))"
        alt=""
        class="display-img"
      >
      <p
        v-if="state.payload.caption"
        class="display-caption"
      >
        {{ state.payload.caption }}
      </p>
    </div>

    <!-- Slideshow cast -->
    <div
      v-else-if="state.mode === 'slideshow' && currentSlide"
      class="display-image"
    >
      <!-- Keyed on the URL so each slide re-runs the fade-in -->
      <img
        :key="currentSlide.image_url"
        :src="mediaUrl(currentSlide.image_url)"
        alt=""
        class="display-img"
      >
      <p
        v-if="currentSlide.caption"
        class="display-caption"
      >
        {{ currentSlide.caption }}
      </p>

      <div
        v-if="slides.length > 1"
        class="display-dots"
      >
        <span
          v-for="(slide, index) in slides"
          :key="slide.image_url + index"
          class="display-dot-item"
          :class="index === slideIndex % slides.length && 'display-dot-item--active'"
        />
      </div>
    </div>

    <!-- Dice cast -->
    <div
      v-else-if="state.mode === 'dice'"
      class="display-center"
    >
      <p
        v-if="state.payload.label"
        class="display-dice-label"
      >
        {{ state.payload.label }}
      </p>
      <p
        class="display-dice-total"
        :class="settling && 'display-dice-total--settled'"
      >
        {{ shownTotal ?? state.payload.total }}
      </p>
      <p
        v-if="settling"
        class="display-dice-breakdown"
      >
        {{ state.payload.formula }}
        <template v-if="(state.payload.rolls as number[] ?? []).length > 1">
          · {{ (state.payload.rolls as number[]).join(' + ') }}<template v-if="state.payload.modifier">
            {{ Number(state.payload.modifier) > 0 ? ' + ' : ' − ' }}{{ Math.abs(Number(state.payload.modifier)) }}
          </template>
        </template>
      </p>
    </div>

    <!-- Map cast -->
    <div
      v-else-if="state.mode === 'map'"
      class="display-image"
    >
      <div class="display-map-wrap">
        <!-- Pins are percentages of the image, so they must anchor to a box
             that hugs the image exactly — not the letterboxed screen -->
        <div
          class="display-map-inner"
          :style="{ aspectRatio: String(shownAspect) }"
        >
          <div :style="planeStyle">
            <img
              :src="mediaUrl(String(state.payload.image_url))"
              alt=""
              class="display-map-img"
              @load="onMapLoad"
            >

            <MapGrid
              v-if="castGrid"
              :grid="castGrid"
              :aspect="castAspect"
              bold
            />

            <!-- Opaque here: this is the screen the party is looking at -->
            <MapFog
              v-if="castFog"
              :cells="castFog.cells"
              :w="castFog.w"
              :h="castFog.h"
              opaque
            />

            <!-- Tokens carry a name and a side and nothing else: a monster's
               remaining HP is the DM's business, not the table's -->
            <span
              v-for="(piece, index) in (state.payload.tokens as any[] ?? [])"
              :key="`token-${index}`"
              class="display-token"
              :class="[
                piece.kind === 'character' ? 'display-token-party' : 'display-token-foe',
                piece.down && 'display-token-down'
              ]"
              :style="{
                left: `${piece.x}%`,
                top: `${piece.y}%`,
                transform: `translate(-50%, -50%) translate(${piece.dx ?? 0}px, ${piece.dy ?? 0}px)`
              }"
            >
              <img
                v-if="piece.image_url"
                :src="mediaUrl(piece.image_url)"
                alt=""
                class="display-token-face"
              >
              <span class="display-token-label">{{ piece.label }}</span>
            </span>

            <span
              v-for="(pin, index) in (state.payload.pins as any[] ?? [])"
              :key="index"
              class="display-map-pin"
              :style="{ left: `${pin.x}%`, top: `${pin.y}%` }"
            >
              <span class="display-map-pin-dot" />
              <span class="display-map-pin-label">{{ pin.label }}</span>
            </span>
          </div>
        </div>
      </div>
      <p
        v-if="state.payload.caption"
        class="display-caption"
      >
        {{ state.payload.caption }}
      </p>
    </div>

    <!-- Initiative cast -->
    <div
      v-else-if="state.mode === 'initiative'"
      class="display-center"
    >
      <p class="display-round">
        Round {{ state.payload.round ?? 1 }}
      </p>
      <ol class="display-initiative">
        <li
          v-for="combatant in (state.payload.combatants as any[] ?? [])"
          :key="combatant.id"
          class="display-initiative-row"
          :class="{
            'display-initiative-row--active': combatant.id === state.payload.active_id,
            'display-initiative-row--down': combatant.down
          }"
        >
          <span class="display-initiative-marker">
            {{ combatant.id === state.payload.active_id ? '▸' : '' }}
          </span>
          <span
            class="display-initiative-face"
            :class="combatant.kind === 'character'
              ? 'display-initiative-face--party'
              : 'display-initiative-face--foe'"
          >
            <img
              v-if="combatant.image_url"
              :src="mediaUrl(combatant.image_url)"
              alt=""
            >
            <template v-else>{{ String(combatant.name ?? '').slice(0, 2).toUpperCase() }}</template>
          </span>
          <span class="display-initiative-name">{{ combatant.name }}</span>
          <span
            v-if="combatant.down"
            class="display-initiative-down"
          >down</span>
        </li>
      </ol>
    </div>

    <!-- Text cast -->
    <div
      v-else-if="state.mode === 'text'"
      class="display-center"
    >
      <p class="display-headline">
        {{ state.payload.text }}
      </p>
      <p
        v-if="state.payload.subtext"
        class="mt-4 text-2xl opacity-60"
      >
        {{ state.payload.subtext }}
      </p>
    </div>

    <!-- Idle -->
    <div
      v-else
      class="display-center"
    >
      <AppLogoMark class="size-20 text-white/20" />
      <p class="mt-6 text-lg tracking-[0.3em] uppercase opacity-30">
        The table is set
      </p>
    </div>

    <!-- Connection dot, tucked in a corner -->
    <span
      class="display-dot"
      :class="connected ? 'bg-emerald-400/70' : 'bg-red-400/70'"
      :title="connected ? 'Live' : 'Reconnecting…'"
    />
  </div>
</template>

<style scoped>
.display-root {
  position: fixed;
  inset: 0;
  background: #0a0908;
  color: #f5f3ef;
  overflow: hidden;
}

.display-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 4rem;
}

.display-headline {
  font-size: clamp(2.5rem, 8vw, 7rem);
  font-weight: 700;
  line-height: 1.1;
  text-wrap: balance;
}

.display-image {
  position: absolute;
  inset: 0;
}

.display-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  animation: display-fade 600ms ease;
}

.display-caption {
  position: absolute;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  font-size: clamp(0.95rem, 1.4vw, 1.35rem);
  font-weight: 600;
  padding: 0.35em 1em;
  border-radius: 999px;
  background: rgb(0 0 0 / 55%);
  backdrop-filter: blur(8px);
  white-space: nowrap;
}

.display-dot {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 999px;
}

.display-dice-label {
  font-size: 1.6rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  opacity: 0.6;
  margin-bottom: 1rem;
}

.display-dice-total {
  font-size: clamp(8rem, 30vw, 20rem);
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  opacity: 0.6;
  transform: scale(0.96);
  transition: opacity 200ms ease, transform 200ms ease, color 200ms ease;
}

.display-dice-total--settled {
  opacity: 1;
  transform: scale(1);
  color: rgb(255 200 120);
  text-shadow: 0 0 80px rgb(255 140 60 / 35%);
}

.display-dice-breakdown {
  margin-top: 1.5rem;
  font-size: 1.4rem;
  font-family: ui-monospace, monospace;
  opacity: 0.55;
  animation: display-fade 400ms ease;
}

.display-map-wrap {
  position: absolute;
  inset: 0;
  padding: 1rem 1rem 4.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

/*
 * Shaped like the image and grown to fit, rather than left at whatever size
 * the file happens to be. Battle maps are often only 800px wide, and the
 * screen was showing one at 800px in the middle of a 4K television.
 *
 * The box has to hug the image exactly, because every token is positioned as
 * a percentage of it — hence the aspect ratio rather than object-fit on a
 * larger box.
 */
.display-map-inner {
  position: relative;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  /* The crop plane hangs past the edges on purpose; the box is the window */
  overflow: hidden;
}

.display-map-img {
  display: block;
  width: 100%;
  height: 100%;
  display: block;
  animation: display-fade 600ms ease;
}

.display-map-pin {
  position: absolute;
  transform: translate(-50%, -100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
}

.display-map-pin-dot {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 999px;
  background: rgb(255 140 60);
  border: 3px solid rgb(255 255 255 / 85%);
  box-shadow: 0 2px 8px rgb(0 0 0 / 60%);
}

.display-map-pin-label {
  font-size: 1rem;
  font-weight: 600;
  padding: 0.15em 0.7em;
  border-radius: 999px;
  background: rgb(0 0 0 / 65%);
  white-space: nowrap;
}

/* Tokens: bigger than a pin and read from across a room, since the table is
   looking at these to work out where everyone is standing */
.display-strip {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 0.5rem 1.4rem;
  padding: 0.9rem 1.5rem;
  background: rgb(0 0 0 / 78%);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid rgb(255 255 255 / 10%);
}

.display-strip-round {
  font-size: 0.95rem;
  letter-spacing: 0.25em;
  text-transform: uppercase;
  opacity: 0.45;
}

.display-strip-name {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 1.35rem;
  opacity: 0.55;
}

.display-strip-face {
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 999px;
  object-fit: cover;
  border: 2px solid rgb(255 255 255 / 45%);
}

/* Whose turn it is, readable from the far end of the table */
.display-strip-name--active {
  opacity: 1;
  font-weight: 700;
  color: rgb(255 160 80);
}

.display-strip-name--down {
  opacity: 0.3;
  text-decoration: line-through;
}

/* Room for the strip, so a full-height map isn't hidden underneath it */
.display-root--with-strip .display-map-wrap {
  padding-top: 5.5rem;
}

.display-token {
  position: absolute;
  width: 2.4rem;
  height: 2.4rem;
  border-radius: 999px;
  border: 3px solid rgb(255 255 255 / 85%);
  box-shadow: 0 2px 10px rgb(0 0 0 / 65%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.display-token-face {
  width: 100%;
  height: 100%;
  border-radius: 999px;
  object-fit: cover;
}

.display-token-party {
  background: rgb(255 140 60);
}

.display-token-foe {
  background: rgb(200 50 50);
}

/* Down, not gone: the body is still on the board and still in the way */
.display-token-down {
  opacity: 0.45;
  filter: grayscale(1);
}

/*
 * Small and tight on purpose. Four creatures in one clearing put four labels
 * on top of each other, and the pile was less readable than no labels at all.
 */
.display-token-label {
  position: absolute;
  top: 100%;
  margin-top: 0.15rem;
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.2;
  padding: 0.05em 0.4em;
  border-radius: 999px;
  background: rgb(0 0 0 / 75%);
  white-space: nowrap;
  max-width: 7rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.display-round {
  font-size: 1.4rem;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  opacity: 0.5;
  margin-bottom: 2rem;
}

.display-initiative {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  min-width: min(34rem, 80vw);
}

.display-initiative-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 2rem;
  padding: 0.55rem 1.4rem;
  border-radius: 1rem;
  background: rgb(255 255 255 / 4%);
  transition: background 300ms ease, transform 300ms ease;
}

.display-initiative-row--active {
  background: rgb(255 255 255 / 14%);
  transform: scale(1.04);
  font-weight: 700;
}

.display-initiative-row--down {
  opacity: 0.35;
  text-decoration: line-through;
}

.display-initiative-marker {
  width: 1.5rem;
  color: rgb(255 200 120);
}

/* The face is the point of the full-screen order: the table sees who is up,
   not just a name they may have met once, three sessions ago */
.display-initiative-face {
  width: 3.4rem;
  height: 3.4rem;
  border-radius: 999px;
  border: 3px solid rgb(255 255 255 / 55%);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  font-weight: 700;
  overflow: hidden;
}

.display-initiative-face img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.display-initiative-face--party {
  background: rgb(255 140 60);
}

.display-initiative-face--foe {
  background: rgb(200 50 50);
}

.display-initiative-name {
  flex: 1;
  text-align: left;
}

.display-initiative-down {
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  opacity: 0.7;
}

.display-dots {
  position: absolute;
  bottom: 1.1rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 0.45rem;
}

.display-dot-item {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 999px;
  background: rgb(255 255 255 / 25%);
  transition: background 300ms ease;
}

.display-dot-item--active {
  background: rgb(255 255 255 / 85%);
}

@keyframes display-fade {
  from { opacity: 0; transform: scale(1.02); }
  to { opacity: 1; transform: none; }
}
</style>
