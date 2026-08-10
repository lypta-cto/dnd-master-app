import type { NavigationMenuItem } from '@nuxt/ui'

/**
 * Sidebar navigation. Entity types share one page, filtered by query.
 *
 * Grouped by when you open it rather than by what it is. The things you touch
 * with players in the room stay flat and always visible at the top; the
 * reference material you build up during prep folds away into two sections, so
 * the list doesn't grow a row taller every time a type is added.
 */

/** Prep, in the order a DM actually works: the thread first, the world under it */
const STORY_TYPES: EntityType[] = ['session', 'scene', 'encounter', 'quest', 'clue']
const WORLD_TYPES: EntityType[] = ['location', 'npc', 'faction', 'monster', 'item', 'map']

/** The doorway icon per rung — a kingdom should not look like a pin */
const ROOT_ICONS: Record<string, string> = {
  plane: 'i-lucide-sparkles',
  kingdom: 'i-lucide-crown',
  region: 'i-lucide-map'
}

/**
 * The tops of the world's hierarchy, for the sidebar.
 *
 * The menu component nests one level, so the sidebar can't hold the whole
 * tree — and shouldn't: it shows the doorways (kingdoms, planes), and each
 * doorway's page walks down from there via "In this place". Cached per
 * campaign; the locations list refreshes it when it loads, so a new kingdom
 * appears the moment the DM next looks at the list.
 */
export function usePlacesNav() {
  const entities = useEntities()
  const { currentId } = useCampaigns()

  const places = useState<EntitySummary[]>('nav-places', () => [])
  const loadedFor = useState<string | null>('nav-places-for', () => null)

  async function ensure(force = false) {
    if (!currentId.value || (!force && loadedFor.value === currentId.value)) {
      return
    }
    loadedFor.value = currentId.value
    try {
      const page = await entities.list({ type: 'location', page_size: 200 })
      places.value = page.items
    } catch {
      // The sidebar shows fewer doorways; the lists still work
    }
  }

  /** The locations list already fetched this — no second request needed */
  function remember(items: EntitySummary[]) {
    places.value = items
    loadedFor.value = currentId.value
  }

  const roots = computed(() => {
    const rung = (entity: EntitySummary) => {
      const index = LOCATION_KINDS.indexOf(String(entity.data.kind ?? ''))
      return index === -1 ? LOCATION_KINDS.length : index
    }

    const all = places.value.filter(
      place => !place.parent || place.parent.type !== 'location'
    )

    // A doorway is a root that's actually big — kingdom, region, down to a
    // village — or one that holds something. A lone unplaced tavern is a
    // to-do item for the tree view, not a top-level entry in the sidebar.
    // Worlds that haven't sorted themselves yet fall back to showing all
    // roots, so the section is never mysteriously empty.
    const holdsSomething = new Set(
      places.value.map(place => place.parent?.id).filter(Boolean)
    )
    const villageRung = LOCATION_KINDS.indexOf('village')
    const doorways = all.filter(
      place => rung(place) <= villageRung || holdsSomething.has(place.id)
    )

    return (doorways.length ? doorways : all)
      .sort((a, b) => rung(a) - rung(b) || a.name.localeCompare(b.name))
      .slice(0, 8)
  })

  return { ensure, remember, roots }
}

export function useNavigation() {
  const route = useRoute()
  const { isDm, currentId } = useCampaigns()
  const placesNav = usePlacesNav()

  watch(() => currentId.value, () => placesNav.ensure(), { immediate: true })

  const isOpen = (type: EntityType) =>
    route.path === '/entities' && route.query.type === type

  function link(type: EntityType): NavigationMenuItem {
    const meta = ENTITY_TYPES.find(entry => entry.value === type)!
    return {
      label: meta.plural,
      icon: meta.icon,
      to: `/entities?type=${type}`,
      active: isOpen(type)
    }
  }

  /** Kingdoms and planes, one indent under Locations — the world's doorways */
  const placeLinks = computed<NavigationMenuItem[]>(() =>
    placesNav.roots.value.map(place => ({
      label: place.name,
      icon: ROOT_ICONS[String(place.data.kind ?? '')] ?? 'i-lucide-map-pin',
      to: `/entities/${place.id}`,
      active: route.path === `/entities/${place.id}`
    }))
  )

  /** Open the section you're already looking inside, so nothing hides itself */
  function section(label: string, icon: string, types: EntityType[]): NavigationMenuItem {
    const visible = types.filter(type => isDm.value || type !== 'monster')
    const children = visible.flatMap(type =>
      type === 'location' ? [link(type), ...placeLinks.value] : [link(type)]
    )
    return {
      label,
      icon,
      defaultOpen: visible.some(isOpen) || placeLinks.value.some(item => item.active),
      children
    }
  }

  /**
   * Which section the current page belongs to, if any.
   *
   * The sidebar is keyed on this: `defaultOpen` only applies on mount, so
   * arriving at a Scene from a search or a link — rather than from the sidebar
   * — would otherwise leave Story shut with the page you're on hidden inside
   * it. Changing this value remounts the menu, which reopens the right section;
   * moving around inside one section leaves whatever you expanded alone.
   */
  const activeSection = computed(() => {
    if (STORY_TYPES.some(isOpen)) {
      return 'story'
    }
    return WORLD_TYPES.some(isOpen) ? 'world' : 'none'
  })

  const mainNav = computed<NavigationMenuItem[][]>(() => [
    [
      { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' },
      { label: 'Party', icon: 'i-lucide-users-round', to: '/party' },
      link('character')
    ],
    // Only the DM runs anything — a player has no use for these three
    ...(isDm.value
      ? [[
          { label: 'Run', icon: 'i-lucide-play', to: '/run' },
          { label: 'Combat', icon: 'i-lucide-swords', to: '/combat' },
          { label: 'Cast screen', icon: 'i-lucide-cast', to: '/cast' }
        ]]
      : []),
    [
      section('Story', 'i-lucide-book-open', STORY_TYPES),
      section('World', 'i-lucide-globe', WORLD_TYPES)
    ],
    [
      link('note'),
      { label: 'Campaign', icon: 'i-lucide-swords', to: '/campaign' }
    ]
  ])

  const footerNav = computed<NavigationMenuItem[]>(() => [
    { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
    { label: 'Help & support', icon: 'i-lucide-circle-help', to: '/help' }
  ])

  return { mainNav, footerNav, activeSection }
}
