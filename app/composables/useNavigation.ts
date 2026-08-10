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
// No 'map' here: a map is an attribute of a location now, not a category —
// the dungeon's floor plan lives on the dungeon's page
const WORLD_TYPES: EntityType[] = ['location', 'npc', 'faction', 'monster', 'item']

export function useNavigation() {
  const route = useRoute()
  const { isDm } = useCampaigns()

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

  /** Open the section you're already looking inside, so nothing hides itself */
  function section(label: string, icon: string, types: EntityType[]): NavigationMenuItem {
    const visible = types.filter(type => isDm.value || type !== 'monster')
    return {
      label,
      icon,
      defaultOpen: visible.some(isOpen),
      children: visible.map(link)
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
      // One home for the characters: every character IS the party — a second
      // "Characters" list of the same sheets was a duplicate with less on it
      { label: 'Party', icon: 'i-lucide-users-round', to: '/party' }
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
