import type { NavigationMenuItem } from '@nuxt/ui'

/**
 * Single source of truth for the sidebar navigation.
 *
 * Deliberately minimal — sections get added as the MVP takes shape. Each entry
 * needs a matching page under app/pages.
 */
export function useNavigation() {
  const mainNav = computed<NavigationMenuItem[][]>(() => [
    [
      { label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/' }
    ]
  ])

  const footerNav = computed<NavigationMenuItem[]>(() => [
    { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' },
    { label: 'Help & support', icon: 'i-lucide-circle-help', to: '/help' }
  ])

  return { mainNav, footerNav }
}
