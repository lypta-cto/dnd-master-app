export interface ClockEvent {
  label: string
  text: string
  done: boolean
}

export interface RunState {
  active: boolean
  session_id: string | null
  scene_id: string | null
  /** Clue ids the party actually has */
  revealed: string[]
  /** player id → times they've had the spotlight */
  spotlight: Record<string, number>
  clock: ClockEvent[]
  notes: string | null
}

/**
 * The evening in progress.
 *
 * Whole-state PUTs like combat: at the table you change one thing and want it
 * saved, not batched.
 */
export function useRun() {
  const api = useApi()
  const { currentId } = useCampaigns()

  function base() {
    if (!currentId.value) {
      throw new Error('No campaign selected')
    }
    return `/campaigns/${currentId.value}/run`
  }

  const get = () => api.get<RunState>(base())
  const set = (state: RunState) => api.put<RunState>(base(), state)

  return { get, set }
}
