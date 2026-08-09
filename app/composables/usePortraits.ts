/**
 * One cache of faces for the whole app.
 *
 * Combat shows the same entity in four places at once — the roster rail, the
 * token on the board, the initiative order, the cast payload — and each used
 * to fetch its own copy or show none at all. The cache is app-wide state, so
 * a portrait fetched for the rail is already there when the token needs it.
 *
 * An empty string means "asked, hasn't got one", which stops an entity with
 * no picture being fetched again on every redraw.
 */
export function usePortraits() {
  const entities = useEntities()
  const cache = useState<Record<string, string>>('portrait-cache', () => ({}))

  /** Lists already carry image_url — bank them instead of re-fetching */
  function remember(summaries: Array<{ id: string, image_url?: string | null }>) {
    const next = { ...cache.value }
    for (const summary of summaries) {
      next[summary.id] = summary.image_url ?? ''
    }
    cache.value = next
  }

  /** Fetch whatever isn't known yet; safe to call on every roster change */
  async function ensure(ids: Array<string | null | undefined>) {
    const missing = [...new Set(ids.filter((id): id is string => !!id))]
      .filter(id => !(id in cache.value))

    await Promise.all(missing.map(async (id) => {
      try {
        const entity = await entities.read(id)
        cache.value = { ...cache.value, [id]: entity.image_url ?? '' }
      } catch {
        cache.value = { ...cache.value, [id]: '' }
      }
    }))
  }

  const urlFor = (id?: string | null) => (id ? cache.value[id] || null : null)

  return { remember, ensure, urlFor }
}
