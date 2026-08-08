/**
 * Fog of war, as a coarse grid of revealed cells.
 *
 * A grid rather than shapes because the DM paints freehand, and a grid is the
 * one representation that costs the same whether they clear a corridor or half
 * a continent. Roughly a hundred cells across is fine: the canvas that draws it
 * is scaled up and blurred, so the edges read as fog rather than as pixels.
 *
 * Packed one bit per cell and base64'd because this rides inside the entity's
 * `data` on every save — a 96×72 grid is 864 bytes, where the same thing as a
 * JSON array of booleans would be forty times that.
 *
 * A map with no `fog` key has no fog at all. That's deliberate: fog is opt-in
 * per map, so turning the feature on doesn't retroactively black out every map
 * already in the campaign.
 */
export interface FogMask {
  w: number
  h: number
  /** base64, one bit per cell, 1 = revealed */
  mask: string
}

/** Cells across. Height follows the image's shape so cells stay square. */
export const FOG_WIDTH = 96

export function fogHeightFor(aspect: number) {
  // aspect = height / width. Clamped so a panorama or a tall dungeon map still
  // gets a usable grid instead of one or two rows.
  return Math.min(256, Math.max(24, Math.round(FOG_WIDTH * aspect)))
}

export function blankFog(w: number, h: number): FogMask {
  return { w, h, mask: encodeCells(new Uint8Array(w * h)) }
}

export function encodeCells(cells: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(cells.length / 8))

  for (let i = 0; i < cells.length; i++) {
    if (cells[i]) {
      bytes[i >> 3]! |= 1 << (i & 7)
    }
  }

  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

export function decodeCells(fog: FogMask): Uint8Array {
  const cells = new Uint8Array(fog.w * fog.h)

  let binary: string
  try {
    binary = atob(fog.mask)
  } catch {
    // A corrupt mask should mean "nothing revealed yet", never a broken page
    return cells
  }

  for (let i = 0; i < cells.length; i++) {
    const byte = binary.charCodeAt(i >> 3)
    cells[i] = byte && byte & (1 << (i & 7)) ? 1 : 0
  }

  return cells
}

/** Reads whatever is on an entity, tolerating anything that isn't a mask */
export function readFog(data: Record<string, unknown>): FogMask | null {
  const fog = data.fog as Partial<FogMask> | undefined

  if (!fog || typeof fog.mask !== 'string' || !fog.w || !fog.h) {
    return null
  }
  return { w: fog.w, h: fog.h, mask: fog.mask }
}

/** How much of the map the party has uncovered, for the DM's own sense of it */
export function revealedFraction(cells: Uint8Array) {
  let seen = 0
  for (const cell of cells) {
    seen += cell
  }
  return cells.length ? seen / cells.length : 0
}
