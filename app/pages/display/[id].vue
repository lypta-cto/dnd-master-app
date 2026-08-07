<script setup lang="ts">
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

useHead({ title: 'Display' })
</script>

<template>
  <div class="display-root">
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

    <!-- Map cast -->
    <div
      v-else-if="state.mode === 'map'"
      class="display-image"
    >
      <div class="display-map-wrap">
        <!-- Pins are percentages of the image, so they must anchor to a box
             that hugs the image exactly — not the letterboxed screen -->
        <div class="display-map-inner">
          <img
            :src="mediaUrl(String(state.payload.image_url))"
            alt=""
            class="display-map-img"
          >
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
  bottom: 2.5rem;
  left: 50%;
  transform: translateX(-50%);
  font-size: clamp(1.25rem, 3vw, 2.25rem);
  font-weight: 600;
  padding: 0.5em 1.2em;
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

.display-map-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.display-map-inner {
  position: relative;
  max-width: 100%;
  max-height: 100%;
}

.display-map-img {
  max-width: 100vw;
  max-height: 100vh;
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
