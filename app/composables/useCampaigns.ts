export type CampaignRole = 'dm' | 'player'

export type CampaignType = 'one_shot' | 'mini' | 'campaign'

/**
 * The campaign's setup, stored in one JSONB field.
 *
 * `dm_` keys never reach a player — the API strips them — so the truth can sit
 * next to the premise the party gets told.
 */
export interface CampaignData {
  campaign_type?: CampaignType
  system?: string
  player_count?: number
  starting_level?: number
  duration?: string
  genre?: string
  tone?: string
  /** What the players think this is about */
  premise?: string
  /** Read this out at the table to start */
  player_intro?: string
  /** What is actually going on */
  dm_truth?: string
  /** Who or what drives it */
  dm_villain?: string
  /** The reveal that recolours everything before it */
  dm_twist?: string
}

export interface Campaign {
  id: string
  name: string
  slug: string
  summary: string | null
  owner_id: string
  created_at: string
  data: CampaignData
  my_role: CampaignRole | null
}

export const CAMPAIGN_TYPES: { value: CampaignType, label: string, hint: string }[] = [
  { value: 'one_shot', label: 'One-shot', hint: 'One evening, start to finish' },
  { value: 'mini', label: 'Mini campaign', hint: 'A handful of sessions' },
  { value: 'campaign', label: 'Campaign', hint: 'Open-ended' }
]

export const TONES = ['heroic', 'grim', 'dark', 'comedic', 'mysterious', 'epic']
export const GENRES = ['fantasy', 'horror', 'mystery', 'adventure', 'intrigue', 'exploration']

export interface CampaignDetail extends Campaign {
  display_token: string | null
  entity_count: number
}

export interface CampaignMember {
  id: string
  role: CampaignRole
  user: {
    id: string
    email: string
    full_name: string | null
    avatar_url: string | null
  }
}

/**
 * Which campaign you're looking at, and the list you can switch between.
 *
 * The selection lives in a cookie rather than the URL so it survives a reload
 * and so every entity route doesn't have to carry a campaign id.
 */
export function useCampaigns() {
  const api = useApi()

  const campaigns = useState<Campaign[]>('campaigns', () => [])
  const loaded = useState<boolean>('campaigns-loaded', () => false)

  /**
   * The selected campaign: shared state, persisted to a cookie.
   *
   * The cookie alone isn't enough — `useCookie` hands every caller its own ref,
   * so switching campaigns in the sidebar left the dashboard watching a ref
   * that never changed, still showing the campaign you just left. `useState` is
   * shared app-wide; the cookie is only how the choice survives a reload.
   */
  const cookie = useCookie<string | null>('campaign-id', {
    default: () => null,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365
  })

  const storedId = useState<string | null>('campaign-id', () => cookie.value)

  const currentId = computed({
    get: () => storedId.value,
    set: (id: string | null) => {
      storedId.value = id
      cookie.value = id
    }
  })

  const current = computed(() => campaigns.value.find(c => c.id === currentId.value) ?? null)
  const isDm = computed(() => current.value?.my_role === 'dm')

  async function load(force = false) {
    if (loaded.value && !force) {
      return campaigns.value
    }

    campaigns.value = await api.get<Campaign[]>('/campaigns')
    loaded.value = true

    // A stale cookie (deleted campaign, different account) shouldn't strand you
    if (!campaigns.value.some(c => c.id === currentId.value)) {
      currentId.value = campaigns.value[0]?.id ?? null
    }

    return campaigns.value
  }

  function select(id: string | null) {
    currentId.value = id
  }

  /**
   * Drop everything cached about campaigns.
   *
   * Called when the session changes: the list carries `my_role`, so without
   * this the next person to sign in on the same tab inherits the previous
   * user's role until a hard reload — a DM's buttons on a player's screen.
   */
  function reset() {
    campaigns.value = []
    loaded.value = false
  }

  async function create(payload: { name: string, summary?: string | null, data?: CampaignData }) {
    const campaign = await api.post<CampaignDetail>('/campaigns', payload)
    campaigns.value = [campaign, ...campaigns.value]
    currentId.value = campaign.id
    return campaign
  }

  async function update(
    id: string,
    payload: { name?: string, summary?: string | null, data?: CampaignData }
  ) {
    const campaign = await api.patch<CampaignDetail>(`/campaigns/${id}`, payload)
    campaigns.value = campaigns.value.map(c => (c.id === id ? { ...c, ...campaign } : c))
    return campaign
  }

  /** Stock an empty campaign with something to throw and somewhere to throw it */
  const installStarterPack = () =>
    api.post<{ message: string }>(`/campaigns/${currentId.value}/starter-pack`, {})

  async function remove(id: string) {
    await api.del(`/campaigns/${id}`)
    campaigns.value = campaigns.value.filter(c => c.id !== id)
    if (currentId.value === id) {
      currentId.value = campaigns.value[0]?.id ?? null
    }
  }

  const detail = (id: string) => api.get<CampaignDetail>(`/campaigns/${id}`)
  const rotateDisplayToken = (id: string) =>
    api.post<CampaignDetail>(`/campaigns/${id}/display-token`)

  const members = (id: string) => api.get<CampaignMember[]>(`/campaigns/${id}/members`)
  const invite = (id: string, payload: { email: string, role: CampaignRole }) =>
    api.post<CampaignMember>(`/campaigns/${id}/members`, payload)
  const removeMember = (id: string, memberId: string) =>
    api.del(`/campaigns/${id}/members/${memberId}`)

  return {
    campaigns,
    current,
    currentId,
    isDm,
    loaded,
    load,
    select,
    reset,
    create,
    update,
    remove,
    installStarterPack,
    detail,
    rotateDisplayToken,
    members,
    invite,
    removeMember
  }
}
