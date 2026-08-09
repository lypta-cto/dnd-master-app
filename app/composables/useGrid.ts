/**
 * A grid over a battle map, and what "how far" means on it.
 *
 * Belongs to the map rather than to the fight: the same cave is the same
 * cave next session, so calibrating it once is the point. Stored on the map
 * entity's `data.grid`.
 *
 * Squares only. Hexes would need their own distance rule, and a hex grid that
 * drew correctly while measuring like a square one would be worse than no hex
 * grid at all — it would be confidently wrong at the moment someone asks
 * whether they can reach.
 */
export interface MapGrid {
  /** How many cells across the image is — the one number that calibrates it */
  cols: number
  /** Feet per cell. Five in every D&D book ever printed, but not everyone's. */
  feet: number
  /**
   * Where the grid starts, as a fraction of one cell (0–1).
   *
   * Printed battle maps rarely begin their grid exactly at the image edge, and
   * a grid one third of a square out is more distracting than none.
   */
  offsetX: number
  offsetY: number
}

export const DEFAULT_GRID: MapGrid = { cols: 20, feet: 5, offsetX: 0, offsetY: 0 }

export function readGrid(data: Record<string, unknown>): MapGrid | null {
  const grid = data.grid as Partial<MapGrid> | undefined

  if (!grid || !grid.cols || grid.cols < 2) {
    return null
  }

  return {
    cols: Math.min(200, Math.max(2, Math.round(grid.cols))),
    feet: Math.min(1000, Math.max(1, grid.feet ?? 5)),
    offsetX: grid.offsetX ?? 0,
    offsetY: grid.offsetY ?? 0
  }
}

/**
 * Cell size as percentages of the image.
 *
 * Width and height differ because token positions are percentages of each
 * axis: on a 2:1 image a cell that is square on screen covers twice as much
 * of the height as of the width.
 */
export function cellSize(grid: MapGrid, aspect: number) {
  const width = 100 / grid.cols
  return { width, height: width * aspect }
}

/**
 * Distance between two points, in feet.
 *
 * Chebyshev — a diagonal costs the same as a straight step, which is what the
 * 5e rules do by default. Groups playing the optional 5-10-5 variant will read
 * long diagonals as shorter than they count them; that's a known simplification
 * rather than an oversight.
 */
export function distanceInFeet(
  from: { x: number, y: number },
  to: { x: number, y: number },
  grid: MapGrid,
  aspect: number
) {
  const cell = cellSize(grid, aspect)
  const acrossCells = Math.abs(to.x - from.x) / cell.width
  const downCells = Math.abs(to.y - from.y) / cell.height

  return Math.round(Math.max(acrossCells, downCells)) * grid.feet
}
