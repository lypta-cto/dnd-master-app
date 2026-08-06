import type { CommandPaletteGroup, CommandPaletteItem } from '@nuxt/ui'

export type AppCommandGroup = CommandPaletteGroup<CommandPaletteItem> & { id: string }

/**
 * Registry behind the ⌘K palette.
 *
 * The layout always contributes a Navigation group. Anything else is added by
 * the app: call `register()` from a page or plugin and the group appears while
 * it stays registered.
 *
 *   const { register, unregister } = useCommandPalette()
 *   onMounted(() => register({
 *     id: 'campaigns',
 *     label: 'Campaigns',
 *     items: campaigns.value.map(c => ({ label: c.name, to: `/campaigns/${c.id}` }))
 *   }))
 *   onUnmounted(() => unregister('campaigns'))
 */
export function useCommandPalette() {
  const groups = useState<AppCommandGroup[]>('command-palette-groups', () => [])

  /** Adds the group, or replaces the existing one with the same id */
  function register(group: AppCommandGroup) {
    const index = groups.value.findIndex(existing => existing.id === group.id)

    if (index === -1) {
      groups.value = [...groups.value, group]
    } else {
      groups.value = groups.value.map((existing, i) => (i === index ? group : existing))
    }
  }

  function unregister(id: string) {
    groups.value = groups.value.filter(group => group.id !== id)
  }

  return { groups, register, unregister }
}
