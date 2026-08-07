export type CastMode = 'idle' | 'image' | 'slideshow' | 'text' | 'initiative' | 'map' | 'dice'

export interface CastState {
  mode: CastMode
  payload: Record<string, unknown>
}

export interface CastStatus extends CastState {
  displays_connected: number
}

/** DM-side controls for the table's screen. */
export function useCast() {
  const api = useApi()
  const { currentId } = useCampaigns()

  function base() {
    if (!currentId.value) {
      throw new Error('No campaign selected')
    }
    return `/campaigns/${currentId.value}/cast`
  }

  const status = () => api.get<CastStatus>(base())
  const set = (state: CastState) => api.put<CastStatus>(base(), state)
  const clear = () => api.put<CastStatus>(base(), { mode: 'idle', payload: {} })

  return { status, set, clear }
}

/**
 * Display-side: subscribe to the cast stream with the display token.
 *
 * SSE via native EventSource — it reconnects on its own, which is exactly what
 * a TV on flaky wifi needs. On every nudge we re-fetch the authoritative state
 * rather than trusting the event body, so the display can never drift.
 */
export function useCastDisplay(campaignId: string, token: string) {
  const { apiBase } = useRuntimeConfig().public

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

    source = new EventSource(`${apiBase}/cast/${campaignId}/stream?t=${encodeURIComponent(token)}`)
    source.addEventListener('open', () => (connected.value = true))
    source.addEventListener('error', () => (connected.value = false))
    source.addEventListener('cast', () => refresh())
  })

  onUnmounted(() => source?.close())

  return { state, connected, failed }
}
