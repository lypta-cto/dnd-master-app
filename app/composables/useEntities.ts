export type EntityType = 'npc' | 'character' | 'location' | 'item' | 'faction' | 'note' | 'session' | 'quest' | 'monster'
export type Visibility = 'dm_only' | 'shared' | 'public'
export type LinkRelation = 'mentions' | 'member_of' | 'located_in' | 'owns' | 'related_to'

export interface EntitySummary {
  id: string
  type: EntityType
  owner_id: string | null
  name: string
  slug: string
  summary: string | null
  image_url: string | null
  visibility: Visibility
  tags: string[]
  data: Record<string, unknown>
}

export interface LinkedEntity extends EntitySummary {
  relation: LinkRelation
}

export interface EntityDetail extends EntitySummary {
  campaign_id: string
  rewritten_references?: number
  body: string | null
  created_at: string
  updated_at: string
  links: LinkedEntity[]
  backlinks: LinkedEntity[]
  unresolved_links: string[]
}

export interface EntityPage {
  items: EntitySummary[]
  total: number
  page: number
  page_size: number
}

export interface SearchHit extends EntitySummary {
  rank: number
}

export interface EntityImage {
  id: string
  entity_id: string
  url: string
  caption: string | null
  position: number
}

export interface CampaignImage extends EntityImage {
  entity_name: string
  entity_type: EntityType
}

export interface EntityWrite {
  name?: string
  owner_id?: string | null
  summary?: string | null
  body?: string | null
  tags?: string[]
  visibility?: Visibility
  data?: Record<string, unknown>
  image_url?: string | null
}

/** Display metadata per type — one place to grow when new types arrive */
export const ENTITY_TYPES: {
  value: EntityType
  label: string
  plural: string
  icon: string
}[] = [
  { value: 'npc', label: 'NPC', plural: 'NPCs', icon: 'i-lucide-venetian-mask' },
  { value: 'character', label: 'Character', plural: 'Characters', icon: 'i-lucide-user-round' },
  { value: 'location', label: 'Location', plural: 'Locations', icon: 'i-lucide-castle' },
  { value: 'item', label: 'Item', plural: 'Items', icon: 'i-lucide-gem' },
  { value: 'faction', label: 'Faction', plural: 'Factions', icon: 'i-lucide-flag' },
  { value: 'note', label: 'Note', plural: 'Notes', icon: 'i-lucide-scroll-text' },
  { value: 'monster', label: 'Monster', plural: 'Monsters', icon: 'i-lucide-skull' },
  { value: 'quest', label: 'Quest', plural: 'Quests', icon: 'i-lucide-target' },
  { value: 'session', label: 'Session', plural: 'Sessions', icon: 'i-lucide-calendar-days' }
]

export function entityTypeMeta(type: EntityType) {
  return ENTITY_TYPES.find(t => t.value === type) ?? ENTITY_TYPES[ENTITY_TYPES.length - 1]!
}

export interface TypeField {
  key: string
  label: string
  placeholder?: string
  /** When present, renders a select instead of a free input */
  options?: string[]
}

/**
 * Structured fields per type, stored in the entity's `data` JSONB — adding or
 * changing one here needs no migration and no API change. Keep keys stable:
 * they are the JSON keys on the wire.
 */
export const TYPE_FIELDS: Record<EntityType, TypeField[]> = {
  character: [
    { key: 'class', label: 'Class & subclass', placeholder: 'Paladin (Devotion)' },
    { key: 'ancestry', label: 'Ancestry', placeholder: 'Human, dwarf, tiefling…' }
  ],
  npc: [
    { key: 'race', label: 'Race', placeholder: 'Human, elf, vampire…' },
    { key: 'occupation', label: 'Occupation', placeholder: 'Innkeeper, count, spy…' },
    { key: 'status', label: 'Status', options: ['alive', 'dead', 'missing', 'unknown'] },
    { key: 'voice', label: 'Voice & manner', placeholder: 'How to play them: accent, tics, mood' }
  ],
  location: [
    { key: 'kind', label: 'Kind', options: ['city', 'town', 'village', 'dungeon', 'wilderness', 'building', 'plane'] },
    { key: 'region', label: 'Region', placeholder: 'Barovia, Sword Coast…' }
  ],
  item: [
    { key: 'rarity', label: 'Rarity', options: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] },
    { key: 'attunement', label: 'Attunement', options: ['none', 'required'] }
  ],
  faction: [
    { key: 'goal', label: 'Goal', placeholder: 'What they want' },
    { key: 'leader', label: 'Leader', placeholder: 'Who runs it — [[link]] them in the body too' }
  ],
  note: [],
  session: [
    { key: 'number', label: 'Session #', placeholder: '12' },
    { key: 'date', label: 'Date', placeholder: '2026-08-06' },
    { key: 'status', label: 'Status', options: ['planned', 'played'] }
  ],
  monster: [
    { key: 'kind', label: 'Kind', options: ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead'] },
    { key: 'cr', label: 'CR', placeholder: '1/4, 5, 13…' },
    { key: 'ac', label: 'AC', placeholder: '15' },
    { key: 'hp', label: 'HP', placeholder: '45' },
    { key: 'speed', label: 'Speed', placeholder: '30 ft., fly 60 ft.' },
    { key: 'abilities', label: 'STR/DEX/CON/INT/WIS/CHA', placeholder: '16/12/14/8/10/6' }
  ],
  quest: [
    { key: 'status', label: 'Status', options: ['active', 'completed', 'failed', 'paused'] },
    { key: 'giver', label: 'Quest giver', placeholder: 'Who asked — [[link]] them in the body too' },
    { key: 'reward', label: 'Reward', placeholder: 'What is promised' }
  ]
}

/** Sessions sorted newest-first by number, then date, then creation */
export function sortSessions<T extends { data: Record<string, unknown> }>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => {
    const num = Number(b.data.number ?? 0) - Number(a.data.number ?? 0)
    if (num) return num
    return String(b.data.date ?? '').localeCompare(String(a.data.date ?? ''))
  })
}

export const VISIBILITIES: { value: Visibility, label: string, icon: string, hint: string }[] = [
  { value: 'dm_only', label: 'DM only', icon: 'i-lucide-eye-off', hint: 'Players never see this' },
  { value: 'shared', label: 'Shared', icon: 'i-lucide-users', hint: 'Visible to campaign members' },
  { value: 'public', label: 'Public', icon: 'i-lucide-globe', hint: 'Visible to any member' }
]

/** API calls scoped to the currently selected campaign. */
export function useEntities() {
  const api = useApi()
  const { currentId } = useCampaigns()

  function base() {
    if (!currentId.value) {
      throw new Error('No campaign selected')
    }
    return `/campaigns/${currentId.value}`
  }

  const list = (params: { type?: EntityType, tag?: string, page?: number, page_size?: number } = {}) =>
    api.get<EntityPage>(`${base()}/entities`, { query: { ...params } })

  const read = (id: string) => api.get<EntityDetail>(`${base()}/entities/${id}`)

  const create = (payload: EntityWrite & { type: EntityType }) =>
    api.post<EntityDetail>(`${base()}/entities`, payload)

  const update = (id: string, payload: EntityWrite) =>
    api.patch<EntityDetail>(`${base()}/entities/${id}`, payload)

  const remove = (id: string) => api.del(`${base()}/entities/${id}`)

  const search = (q: string, limit = 20) =>
    api.get<SearchHit[]>(`${base()}/search`, { query: { q, limit } })

  /* --- Gallery ----------------------------------------------------------- */

  const campaignImages = () => api.get<CampaignImage[]>(`${base()}/images`)

  const images = (entityId: string) =>
    api.get<EntityImage[]>(`${base()}/entities/${entityId}/images`)

  function addImage(entityId: string, file: File, caption?: string) {
    const body = new FormData()
    body.append('file', file)
    if (caption) {
      body.append('caption', caption)
    }
    return api.post<EntityImage>(`${base()}/entities/${entityId}/images`, body)
  }

  const updateImage = (entityId: string, imageId: string, payload: { caption?: string | null, position?: number }) =>
    api.patch<EntityImage>(`${base()}/entities/${entityId}/images/${imageId}`, payload)

  const setCover = (entityId: string, imageId: string) =>
    api.post<EntityDetail>(`${base()}/entities/${entityId}/images/${imageId}/cover`)

  const removeImage = (entityId: string, imageId: string) =>
    api.del(`${base()}/entities/${entityId}/images/${imageId}`)

  return {
    list,
    read,
    create,
    update,
    remove,
    search,
    campaignImages,
    images,
    addImage,
    updateImage,
    setCover,
    removeImage
  }
}
