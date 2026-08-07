export type Experience = 'new' | 'some' | 'veteran'
export type Preference = 'combat' | 'roleplay' | 'puzzles' | 'exploration'

export interface PlayerCharacter {
  id: string
  name: string
  data: Record<string, unknown>
}

export interface Player {
  id: string
  campaign_id: string
  name: string
  contact: string | null
  experience: Experience | null
  preferences: Preference[]
  notes: string | null
  /** Set once they accept an invitation — most seats never have one */
  account: {
    id: string
    email: string
    full_name: string | null
    avatar_url: string | null
  } | null
  invited_email: string | null
  characters: PlayerCharacter[]
}

export const EXPERIENCE_OPTIONS: { value: Experience, label: string }[] = [
  { value: 'new', label: 'First time' },
  { value: 'some', label: 'Played some' },
  { value: 'veteran', label: 'Veteran' }
]

export const PREFERENCE_OPTIONS: { value: Preference, label: string, icon: string }[] = [
  { value: 'combat', label: 'Combat', icon: 'i-lucide-swords' },
  { value: 'roleplay', label: 'Roleplay', icon: 'i-lucide-drama' },
  { value: 'puzzles', label: 'Puzzles', icon: 'i-lucide-puzzle' },
  { value: 'exploration', label: 'Exploration', icon: 'i-lucide-compass' }
]

/**
 * The people at the table.
 *
 * A player is a person, not an account — the DM writes them down and that's
 * enough. Accounts arrive later through `invite`, if they ever do.
 */
export function usePlayers() {
  const api = useApi()
  const { currentId } = useCampaigns()

  function base() {
    if (!currentId.value) {
      throw new Error('No campaign selected')
    }
    return `/campaigns/${currentId.value}/players`
  }

  const list = () => api.get<Player[]>(base())

  const create = (payload: Partial<Player> & { name: string }) =>
    api.post<Player>(base(), payload)

  const update = (id: string, payload: Partial<Player>) =>
    api.patch<Player>(`${base()}/${id}`, payload)

  const remove = (id: string) => api.del<{ message: string }>(`${base()}/${id}`)

  const invite = (id: string, email: string) =>
    api.post<Player>(`${base()}/${id}/invite`, { email })

  return { list, create, update, remove, invite }
}
