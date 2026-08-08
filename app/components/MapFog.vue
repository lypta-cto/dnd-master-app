<script setup lang="ts">
/**
 * Draws the unrevealed part of a map over it.
 *
 * The same component serves the DM and the table, differing only in `opaque`:
 * the DM sees through the fog at a glance — they need to know what the party
 * can't see, not be blinded alongside them — while the table's copy hides.
 *
 * Nothing here is a security boundary. The map image reaches the browser
 * whole and this covers part of it, so it hides things from players, not from
 * someone who opens devtools.
 */
const props = defineProps<{
  cells: Uint8Array
  w: number
  h: number
  /** The table's copy hides; the DM's is see-through */
  opaque?: boolean
  /**
   * Bumped by the painter after each stroke.
   *
   * The cells are a typed array mutated in place, which Vue can't see; deep
   * watching ten thousand of them on every brush move would be worse than the
   * painting. A counter is the cheap honest signal that something changed.
   */
  version?: number
}>()

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')

/** Enough to blur against; past this the softening stops improving */
const SCALE = 8

function draw() {
  const target = canvas.value
  if (!target || !props.w || !props.h) {
    return
  }

  // The grid is drawn one cell larger on every side, all of it hidden, and
  // then shifted back out of view. Without that ring the blur below fades the
  // fog out against the edge of the canvas, leaving a bright rim around a map
  // that is supposed to be solidly covered.
  const gw = props.w + 2
  const gh = props.h + 2

  const grid = document.createElement('canvas')
  grid.width = gw
  grid.height = gh

  const gridContext = grid.getContext('2d')
  if (!gridContext) {
    return
  }

  gridContext.fillStyle = '#0b0d12'
  gridContext.fillRect(0, 0, gw, gh)

  // Punch out what the party has seen
  for (let y = 0; y < props.h; y++) {
    for (let x = 0; x < props.w; x++) {
      if (props.cells[y * props.w + x]) {
        gridContext.clearRect(x + 1, y + 1, 1, 1)
      }
    }
  }

  target.width = props.w * SCALE
  target.height = props.h * SCALE

  const context = target.getContext('2d')
  if (!context) {
    return
  }

  context.clearRect(0, 0, target.width, target.height)
  context.filter = `blur(${SCALE * 0.6}px)`
  context.imageSmoothingEnabled = true
  context.drawImage(grid, -SCALE, -SCALE, gw * SCALE, gh * SCALE)
}

onMounted(draw)
watch(() => [props.version, props.w, props.h, props.cells], draw)
</script>

<template>
  <canvas
    ref="canvas"
    class="pointer-events-none absolute inset-0 size-full"
    :class="opaque ? 'opacity-100' : 'opacity-55'"
  />
</template>
