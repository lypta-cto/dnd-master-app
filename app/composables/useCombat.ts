export interface Combatant {
  id: string
  name: string
  kind: 'character' | 'monster' | 'custom'
  entity_id?: string | null
  initiative: number
  max_hp?: number | null
  current_hp?: number | null
  conditions: string[]
}

export interface CombatState {
  active: boolean
  round: number
  turn_index: number
  combatants: Combatant[]
}

/** The running fight — DM-only; the table only ever sees the cast payload. */
export function useCombat() {
  const api = useApi()
  const { currentId } = useCampaigns()

  const base = () => `/campaigns/${currentId.value}/combat`

  const get = () => api.get<CombatState>(base())
  const set = (state: CombatState) => api.put<CombatState>(base(), state)

  return { get, set }
}
