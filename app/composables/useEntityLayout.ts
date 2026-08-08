export type EntityLayout = 'grid' | 'list'

/**
 * Cards or rows, remembered per type.
 *
 * One setting for all thirteen was wrong in both directions: the reference
 * types are scanned by name and want rows, while a handful of scenes read
 * better as cards. Switching one used to switch them all, so whichever page
 * you set last was the one that felt right.
 *
 * The World types default to rows because they are the ones that grow — a
 * campaign accumulates hundreds of NPCs and locations, and cards turn that
 * into scrolling. Everything else keeps cards until told otherwise.
 */
const DEFAULT_LIST: EntityType[] = ['location', 'npc', 'faction', 'monster', 'item', 'map']

export function useEntityLayout(type: Ref<EntityType | undefined>) {
  // One cookie holding a small map rather than thirteen cookies, which is both
  // tidier and well under any size a browser cares about
  const stored = useCookie<Record<string, EntityLayout>>('entity-layouts', {
    default: () => ({}),
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365
  })

  const fallback = computed<EntityLayout>(() =>
    type.value && DEFAULT_LIST.includes(type.value) ? 'list' : 'grid'
  )

  return computed<EntityLayout>({
    get: () => (type.value ? stored.value?.[type.value] : undefined) ?? fallback.value,
    set: (value) => {
      if (!type.value) {
        return
      }
      // Replaced rather than mutated: `useCookie` writes on assignment, and
      // changing a key inside the object it already holds isn't one.
      stored.value = { ...stored.value, [type.value]: value }
    }
  })
}
