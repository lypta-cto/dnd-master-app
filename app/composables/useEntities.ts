export type EntityType = 'npc' | 'character' | 'location' | 'item' | 'faction' | 'note' | 'session' | 'quest' | 'monster' | 'map' | 'scene' | 'encounter' | 'clue'
export type Visibility = 'dm_only' | 'shared' | 'public'
export type LinkRelation = 'mentions' | 'member_of' | 'located_in' | 'owns' | 'related_to' | 'leads_to'

export interface EntitySummary {
  id: string
  type: EntityType
  owner_id: string | null
  /** Characters only: whose seat at the table this sheet belongs to */
  player_id: string | null
  name: string
  slug: string
  summary: string | null
  image_url: string | null
  visibility: Visibility
  tags: string[]
  data: Record<string, unknown>
  /**
   * Where it sits, when the listing endpoint was the one that fetched it.
   *
   * Null everywhere else — search results and link panels don't pay for the
   * lookup, so don't read this outside a list.
   */
  parent?: { id: string, name: string, type: EntityType } | null
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
  /** Where this sits in the world, outermost first: region, town, building */
  ancestors: EntitySummary[]
  unresolved_links: string[]
}

export type EntitySort = 'name' | 'updated' | 'created'

export const ENTITY_SORTS: { value: EntitySort, label: string, icon: string }[] = [
  { value: 'name', label: 'Name', icon: 'i-lucide-arrow-down-a-z' },
  { value: 'updated', label: 'Recently edited', icon: 'i-lucide-pencil' },
  { value: 'created', label: 'Recently added', icon: 'i-lucide-sparkle' }
]

export interface EntityPage {
  items: EntitySummary[]
  total: number
  page: number
  page_size: number
}

export interface SearchHit extends EntitySummary {
  rank: number
}

export interface MapPin {
  id: string
  /** Percentages of the image, so pins survive any screen size */
  x: number
  y: number
  entity_id?: string | null
  label?: string
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
  /** Characters only, DM only: hand the sheet to a seat at the table */
  player_id?: string | null
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
  { value: 'npc', label: 'NPC', plural: 'NPCs', icon: 'i-lucide-speech' },
  { value: 'character', label: 'Character', plural: 'Characters', icon: 'i-lucide-user-round' },
  { value: 'location', label: 'Location', plural: 'Locations', icon: 'i-lucide-castle' },
  { value: 'item', label: 'Item', plural: 'Items', icon: 'i-lucide-gem' },
  { value: 'faction', label: 'Faction', plural: 'Factions', icon: 'i-lucide-flag' },
  { value: 'note', label: 'Note', plural: 'Notes', icon: 'i-lucide-scroll-text' },
  { value: 'monster', label: 'Monster', plural: 'Monsters', icon: 'i-lucide-skull' },
  { value: 'map', label: 'Map', plural: 'Maps', icon: 'i-lucide-map' },
  { value: 'quest', label: 'Quest', plural: 'Quests', icon: 'i-lucide-target' },
  { value: 'scene', label: 'Scene', plural: 'Scenes', icon: 'i-lucide-clapperboard' },
  { value: 'encounter', label: 'Encounter', plural: 'Encounters', icon: 'i-lucide-swords' },
  { value: 'clue', label: 'Clue', plural: 'Clues', icon: 'i-lucide-search' },
  { value: 'session', label: 'Session', plural: 'Sessions', icon: 'i-lucide-calendar-days' }
]

export type BadgeColor = 'primary' | 'success' | 'error' | 'warning' | 'neutral'

const QUEST_COLORS: Record<string, BadgeColor> = {
  active: 'primary', completed: 'success', failed: 'error', paused: 'neutral'
}

/**
 * The one fact worth showing per type, straight from `data`.
 *
 * Lives here rather than in the card because the compact list shows the same
 * badge, and two copies would drift the first time a type gains a field.
 */
export function entityBadge(entity: EntitySummary): { label: string, color: BadgeColor } | null {
  const d = entity.data

  switch (entity.type) {
    case 'quest': {
      const status = String(d.status ?? 'active')
      return { label: status, color: QUEST_COLORS[status] ?? 'primary' }
    }
    case 'session': {
      const played = d.status === 'played'
      const when = d.date ? ` · ${d.date}` : ''
      return { label: `${played ? 'played' : 'planned'}${when}`, color: played ? 'success' : 'warning' }
    }
    case 'monster':
      return d.cr ? { label: `CR ${d.cr}`, color: 'error' } : null
    case 'npc': {
      const status = String(d.status ?? '')
      if (!status || status === 'alive') {
        return null
      }
      return { label: status, color: status === 'dead' ? 'error' : 'warning' }
    }
    case 'scene': {
      const status = String(d.status ?? 'planned')
      const bits = [d.kind, status].filter(Boolean).join(' · ')
      return { label: bits, color: status === 'played' ? 'success' : status === 'skipped' ? 'neutral' : 'warning' }
    }
    case 'encounter': {
      const difficulty = String(d.difficulty ?? '')
      const bits = [d.kind, difficulty].filter(Boolean).join(' · ')
      return bits
        ? { label: bits, color: difficulty === 'deadly' || difficulty === 'hard' ? 'error' : 'neutral' }
        : null
    }
    case 'clue': {
      const weight = String(d.weight ?? '')
      return weight ? { label: weight, color: weight === 'essential' ? 'primary' : 'neutral' } : null
    }
    case 'character': {
      const bits = [d.level ? `Lv ${d.level}` : null, d.class].filter(Boolean)
      return bits.length ? { label: bits.join(' · '), color: 'neutral' } : null
    }
    default:
      return null
  }
}

/** Where the crop centres — set by the DM from the gallery's Crop focus */
export function coverFocusStyle(entity: EntitySummary) {
  const f = entity.data.cover_focus as { x: number, y: number } | undefined
  return f && typeof f.x === 'number' ? { objectPosition: `${f.x}% ${f.y}%` } : undefined
}

export function entityTypeMeta(type: EntityType) {
  return ENTITY_TYPES.find(t => t.value === type) ?? ENTITY_TYPES[ENTITY_TYPES.length - 1]!
}

export interface TypeField {
  key: string
  label: string
  placeholder?: string
  /** A closed set — renders a select, and nothing else is allowed */
  options?: string[]
  /**
   * An open set — renders a searchable box that offers these and still takes
   * anything typed. Most of these fields have a familiar answer and an
   * occasional made-up one, and a plain text box made you spell "tiefling"
   * from memory every time.
   */
  suggestions?: string[]
  /** A number or a word — give it a narrow box, not half the screen */
  short?: boolean
  /** A sentence — give it a textarea */
  long?: boolean
}

/**
 * What kind of thing this is to the person filling the form in.
 *
 * The types were always one spine with different fields; the form treated
 * that as one shape too, and it fitted none of them. A monster is read for
 * its numbers, a map *is* its picture, and a scene is its purpose — so the
 * families differ in what gets the top of the page and how big the art is.
 */
export type EntityFamily = 'being' | 'place' | 'beat' | 'thing'

export const ENTITY_FAMILY: Record<EntityType, EntityFamily> = {
  npc: 'being',
  character: 'being',
  monster: 'being',
  location: 'place',
  map: 'place',
  scene: 'beat',
  encounter: 'beat',
  clue: 'beat',
  quest: 'beat',
  session: 'beat',
  item: 'thing',
  faction: 'thing',
  note: 'thing'
}

/**
 * How much room the picture gets.
 *
 * A map with no image is nothing at all, so it leads. A face is worth a
 * thumbnail. A scene almost never has art and shouldn't be asked for it
 * before the DM has written what the scene is for.
 */
export const FAMILY_ART: Record<EntityFamily, 'hero' | 'portrait' | 'quiet'> = {
  place: 'hero',
  being: 'portrait',
  thing: 'portrait',
  beat: 'quiet'
}

/**
 * Structured fields per type, stored in the entity's `data` JSONB — adding or
 * changing one here needs no migration and no API change. Keep keys stable:
 * they are the JSON keys on the wire.
 */
/* Common answers, offered but never enforced — a campaign invents its own. */

const ANCESTRIES = [
  'Human', 'Elf', 'Half-elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-orc', 'Dragonborn',
  'Tiefling', 'Aasimar', 'Goliath', 'Orc', 'Firbolg', 'Tabaxi', 'Genasi', 'Goblin',
  'Kobold', 'Lizardfolk', 'Changeling', 'Warforged'
]

const CLASSES = [
  'Artificer', 'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk', 'Paladin',
  'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard'
]

const OCCUPATIONS = [
  'Innkeeper', 'Blacksmith', 'Merchant', 'Guard', 'Priest', 'Farmer', 'Hunter',
  'Sailor', 'Soldier', 'Noble', 'Scholar', 'Healer', 'Miller', 'Bandit', 'Spy',
  'Beggar', 'Gravedigger', 'Herbalist', 'Bartender', 'Mayor'
]

export const TYPE_FIELDS: Record<EntityType, TypeField[]> = {
  character: [
    { key: 'class', label: 'Class', placeholder: 'Paladin', suggestions: CLASSES },
    { key: 'ancestry', label: 'Ancestry', placeholder: 'Human, dwarf, tiefling…', suggestions: ANCESTRIES },
    { key: 'ac', label: 'AC', placeholder: '16', short: true },
    { key: 'passive_perception', label: 'Passive perception', placeholder: '13', short: true }
  ],
  npc: [
    { key: 'race', label: 'Race', placeholder: 'Human, elf, vampire…', suggestions: ANCESTRIES },
    { key: 'occupation', label: 'Occupation', placeholder: 'Innkeeper, count, spy…', suggestions: OCCUPATIONS },
    { key: 'status', label: 'Status', options: ['alive', 'dead', 'missing', 'unknown'], short: true },
    { key: 'voice', label: 'Voice & manner', placeholder: 'How to play them: accent, tics, mood', long: true }
  ],
  location: [
    // Region first, because it's the outermost thing you pick when building a
    // world downward — and the one a town needs to point at.
    //
    // There used to be a free-text "Region" field here too. Containment says
    // the same thing now, and better: it links, it nests, and it draws a
    // breadcrumb. Two ways to record where something is would have drifted
    // apart the first time someone used one and not the other.
    { key: 'kind', label: 'Kind', options: ['region', 'city', 'town', 'village', 'dungeon', 'wilderness', 'building', 'plane'], short: true }
  ],
  item: [
    { key: 'rarity', label: 'Rarity', options: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'], short: true },
    { key: 'attunement', label: 'Attunement', options: ['none', 'required'], short: true }
  ],
  faction: [
    { key: 'goal', label: 'Goal', placeholder: 'What they want', long: true },
    { key: 'leader', label: 'Leader', placeholder: 'Who runs it — [[link]] them in the body too' }
  ],
  note: [],
  session: [
    { key: 'number', label: 'Session #', placeholder: '12', short: true },
    { key: 'date', label: 'Date', placeholder: '2026-08-06', short: true },
    { key: 'status', label: 'Status', options: ['planned', 'played'], short: true }
  ],
  map: [],
  monster: [
    { key: 'kind', label: 'Kind', options: ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead'] },
    { key: 'cr', label: 'CR', placeholder: '1/4, 5, 13…', short: true },
    { key: 'ac', label: 'AC', placeholder: '15', short: true },
    { key: 'hp', label: 'HP', placeholder: '45', short: true },
    { key: 'speed', label: 'Speed', placeholder: '30 ft., fly 60 ft.' },
    { key: 'abilities', label: 'STR/DEX/CON/INT/WIS/CHA', placeholder: '16/12/14/8/10/6' },
    // What the tracker shows on this monster's turn — write the to-hit and
    // the damage dice and the fight never stops for a rulebook
    { key: 'attacks', label: 'Attacks & damage', placeholder: 'Scimitar +4 to hit, 1d6+2 slashing. Shortbow +4, 1d6+2 piercing.', long: true }
  ],
  quest: [
    { key: 'status', label: 'Status', options: ['active', 'completed', 'failed', 'paused'], short: true },
    { key: 'giver', label: 'Quest giver', placeholder: 'Who asked — [[link]] them in the body too' },
    { key: 'reward', label: 'Reward', placeholder: 'What is promised' }
  ],
  scene: [
    { key: 'kind', label: 'Kind', options: ['roleplay', 'investigation', 'combat', 'travel', 'downtime'], short: true },
    { key: 'status', label: 'Status', options: ['planned', 'played', 'skipped'], short: true },
    { key: 'purpose', label: 'Purpose', placeholder: 'Why this scene exists — what it moves', long: true },
    { key: 'learn', label: 'Players learn', placeholder: 'The one thing they should leave knowing', long: true }
  ],
  encounter: [
    { key: 'kind', label: 'Kind', options: ['combat', 'social', 'puzzle', 'chase', 'skill challenge'], short: true },
    { key: 'difficulty', label: 'Difficulty', options: ['trivial', 'easy', 'medium', 'hard', 'deadly'], short: true },
    { key: 'objective', label: 'Objective', placeholder: 'Survive five rounds — better than "kill them all"', long: true },
    { key: 'trigger', label: 'Trigger', placeholder: 'What sets it off' },
    { key: 'reward', label: 'Reward', placeholder: 'What it pays out' }
  ],
  clue: [
    { key: 'points_to', label: 'Points toward', placeholder: 'The conclusion it supports — same wording across clues', long: true },
    { key: 'found_at', label: 'Found at', placeholder: 'Where, and how they get it' },
    { key: 'weight', label: 'Weight', options: ['essential', 'supporting', 'flavour'], short: true },
    { key: 'difficulty', label: 'Difficulty', placeholder: 'DC 13 Investigation, or "ask anyone in the inn"', short: true }
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

  /**
   * One page of a filtered list.
   *
   * `q` and `sort` are the server's job, not the client's: a campaign runs to
   * hundreds of entries, and filtering the twenty-four you can already see
   * would find nothing and look broken.
   */
  const list = (params: {
    type?: EntityType
    tag?: string
    q?: string
    /** Only the starred working set — the dozen out of the imported hundreds */
    favorite?: boolean
    sort?: EntitySort
    page?: number
    page_size?: number
  } = {}) => api.get<EntityPage>(`${base()}/entities`, { query: { ...params } })

  const read = (id: string) => api.get<EntityDetail>(`${base()}/entities/${id}`)

  const create = (payload: EntityWrite & { type: EntityType }) =>
    api.post<EntityDetail>(`${base()}/entities`, payload)

  /**
   * A whole bestiary in one request. Same names already in the campaign are
   * skipped server-side, so importing the same file twice adds nothing.
   */
  const bulkCreate = (items: Array<EntityWrite & { type: EntityType }>) =>
    api.post<{ created: number, skipped: number }>(`${base()}/entities/bulk`, {
      entities: items
    })

  const update = (id: string, payload: EntityWrite) =>
    api.patch<EntityDetail>(`${base()}/entities/${id}`, payload)

  const remove = (id: string) => api.del(`${base()}/entities/${id}`)

  /**
   * Uncovering a map is its own write.
   *
   * Not folded into `update`, because a brush stroke sends the whole mask and
   * the entity PATCH would carry name, body and every type field along with
   * it — overwriting whatever someone else had just typed on another screen.
   */
  const setFog = (id: string, fog: FogMask | null) =>
    api.put<EntityDetail>(`${base()}/entities/${id}/fog`, { fog })

  const link = (id: string, to_id: string, relation: LinkRelation) =>
    api.post<EntityDetail>(`${base()}/entities/${id}/links`, { to_id, relation })

  const unlink = (id: string, to_id: string) =>
    api.del(`${base()}/entities/${id}/links/${to_id}`)

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
    bulkCreate,
    update,
    remove,
    setFog,
    link,
    unlink,
    search,
    campaignImages,
    images,
    addImage,
    updateImage,
    setCover,
    removeImage
  }
}
