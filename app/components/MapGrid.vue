<script setup lang="ts">
/**
 * The grid, drawn over a map.
 *
 * SVG rather than canvas: these are hairlines that have to stay hairlines at
 * any size, on the DM's laptop and on a television, and an SVG scales without
 * being redrawn or going soft.
 *
 * `vector-effect` keeps the strokes one pixel wide however far the viewBox is
 * stretched — without it a grid on a 4K screen draws as fat grey bars.
 */
const props = defineProps<{
  grid: MapGrid
  /** Image width ÷ height, so cells are square on screen rather than in percent */
  aspect: number
  /** Brighter on the table's screen, where nobody is staring at it up close */
  bold?: boolean
}>()

const cell = computed(() => cellSize(props.grid, props.aspect))

/** Every line's offset, in percent, starting at the calibrated origin */
const verticals = computed(() => {
  const step = cell.value.width
  const start = ((props.grid.offsetX % 1) + 1) % 1 * step
  const lines: number[] = []

  for (let x = start; x <= 100.001; x += step) {
    lines.push(x)
  }
  return lines
})

const horizontals = computed(() => {
  const step = cell.value.height
  const start = ((props.grid.offsetY % 1) + 1) % 1 * step
  const lines: number[] = []

  for (let y = start; y <= 100.001; y += step) {
    lines.push(y)
  }
  return lines
})
</script>

<template>
  <svg
    class="pointer-events-none absolute inset-0 size-full"
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <g
      :stroke="bold ? 'rgb(255 255 255 / 45%)' : 'rgb(255 255 255 / 28%)'"
      stroke-width="1"
      vector-effect="non-scaling-stroke"
    >
      <line
        v-for="x in verticals"
        :key="`v-${x}`"
        :x1="x"
        y1="0"
        :x2="x"
        y2="100"
      />
      <line
        v-for="y in horizontals"
        :key="`h-${y}`"
        x1="0"
        :y1="y"
        x2="100"
        :y2="y"
      />
    </g>
  </svg>
</template>
