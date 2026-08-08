export type CastMode = 'idle' | 'image' | 'slideshow' | 'text' | 'initiative' | 'map' | 'dice'

export interface CastState {
  mode: CastMode
  payload: Record<string, unknown>
}

export interface CastStatus extends CastState {
  displays_connected: number
}

/** Human names for the chip in the top bar */
const MODE_LABELS: Record<CastMode, string> = {
  idle: 'Nothing',
  image: 'Image',
  slideshow: 'Slideshow',
  text: 'Text',
  initiative: 'Initiative',
  map: 'Map',
  dice: 'Dice'
}

/**
 * DM-side controls for the table's screen.
 *
 * The current state is shared app-wide rather than fetched per page, because
 * what's on the table outlives the page that put it there: the DM casts a map,
 * walks to the combat screen, and still needs to know the map is up — and the
 * map still needs to push its changes when they walk back and move a pin.
 */
export function useCast() {
  const api = useApi()
  const { currentId } = useCampaigns()

  const current = useState<CastStatus | null>('cast-current', () => null)
  const loadedFor = useState<string | null>('cast-loaded-for', () => null)

  function base() {
    if (!currentId.value) {
      throw new Error('No campaign selected')
    }
    return `/campaigns/${currentId.value}/cast`
  }

  /** What's on the table, or null while nothing is */
  const showing = computed(() =>
    current.value && current.value.mode !== 'idle' ? current.value : null
  )

  const showingLabel = computed(() =>
    showing.value ? MODE_LABELS[showing.value.mode] : null
  )

  /** The entity behind it, when there is one — so the chip can link somewhere */
  const showingEntityId = computed(() => {
    const id = showing.value?.payload?.entity_id
    return typeof id === 'string' ? id : null
  })

  async function status(force = false) {
    if (!currentId.value) {
      return null
    }
    if (!force && loadedFor.value === currentId.value) {
      return current.value
    }

    current.value = await api.get<CastStatus>(base())
    loadedFor.value = currentId.value
    return current.value
  }

  async function set(state: CastState) {
    const result = await api.put<CastStatus>(base(), state)
    current.value = result
    loadedFor.value = currentId.value
    return result
  }

  const clear = () => set({ mode: 'idle', payload: {} })

  /** Is this entity the thing the table is looking at right now? */
  const isShowing = (entityId: string) => showingEntityId.value === entityId

  /**
   * Push a change only when it's already on the table.
   *
   * This is what makes casting a live link rather than a snapshot: paint fog
   * or drag a pin on a map that's up, and the table follows. Cast nothing if
   * nothing is showing — moving a pin should never surprise the party with a
   * map they weren't being shown.
   */
  async function recast(entityId: string, state: CastState) {
    if (!isShowing(entityId)) {
      return null
    }
    return set(state)
  }

  return {
    current,
    showing,
    showingLabel,
    showingEntityId,
    status,
    set,
    clear,
    isShowing,
    recast
  }
}

/**
 * Display-side: subscribe to the cast stream with the display token.
 *
 * SSE via native EventSource — it reconnects on its own, which is exactly what
 * a TV on flaky wifi needs. On every nudge we re-fetch the authoritative state
 * rather than trusting the event body, so the display can never drift.
 */
export function useCastDisplay(campaignId: string, token: string) {
  const { apiBase, apiOrigin } = useRuntimeConfig().public

  /**
   * The stream goes straight to the API, never through the frontend's rewrite.
   * A proxy may buffer a response, and a buffered event stream is a display
   * that connects, says nothing, and never updates. It can afford to: the
   * token travels in the query string, so this connection needs no cookie.
   */
  const streamBase = apiBase.startsWith('http')
    ? apiBase
    : `${apiOrigin.replace(/\/$/, '')}${apiBase}`

  const state = ref<CastState>({ mode: 'idle', payload: {} })
  const connected = ref(false)
  const failed = ref(false)

  let source: EventSource | null = null

  async function refresh() {
    try {
      state.value = await $fetch<CastState>(`/cast/${campaignId}`, {
        baseURL: apiBase,
        query: { t: token }
      })
      failed.value = false
    } catch (error) {
      // A 404 means the token is wrong or rotated — stop, don't hammer
      if ((error as { response?: { status?: number } })?.response?.status === 404) {
        failed.value = true
        source?.close()
        connected.value = false
      }
    }
  }

  onMounted(() => {
    refresh()

    source = new EventSource(`${streamBase}/cast/${campaignId}/stream?t=${encodeURIComponent(token)}`)
    source.addEventListener('open', () => (connected.value = true))
    source.addEventListener('error', () => (connected.value = false))
    source.addEventListener('cast', () => refresh())
  })

  onUnmounted(() => source?.close())

  return { state, connected, failed }
}
