import type { NavigationMenuItem } from '@nuxt/ui'

/** Sidebar navigation. Entity types share one page, filtered by query. */
export function useNavigation() {
  const route = useRoute()
  const { isDm } = useCampaigns()

  const mainNav = computed<NavigationMenuItem[][]>(() => [
    [
      { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' },
      { label: 'Party', icon: 'i-lucide-users-round', to: '/party' }
    ],
    // The bestiary is prep, not table-facing — players never need the link
    ENTITY_TYPES.filter(type => isDm.value || type.value !== 'monster').map(type => ({
      label: type.plural,
      icon: type.icon,
      to: `/entities?type=${type.value}`,
      active: route.path === '/entities' && route.query.type === type.value
    })),
    [
      { label: 'Campaign', icon: 'i-lucide-swords', to: '/campaign' },
      ...(isDm.value
        ? [
            { label: 'Combat', icon: 'i-lucide-swords', to: '/combat' },
            { label: 'Cast screen', icon: 'i-lucide-cast', to: '/cast' }
          ]
        : [])
    ]
  ])

  const footerNav = computed<NavigationMenuItem[]>(() => [
    { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
    { label: 'Help & support', icon: 'i-lucide-circle-help', to: '/help' }
  ])

  return { mainNav, footerNav }
}
