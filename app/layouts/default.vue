<script setup lang="ts">
const { mainNav, footerNav } = useNavigation()
const { groups: appGroups } = useCommandPalette()
const { load: loadCampaigns, currentId } = useCampaigns()
const entities = useEntities()

// Client only: the API's session cookie never reaches the Nuxt server, so an
// SSR fetch of /campaigns would 401 and take the whole page down with it.
// app.vue already holds rendering behind auth `ready` on the client.
const { load: loadWorkspace } = useWorkspace()
if (import.meta.client) {
  await Promise.all([loadWorkspace(), loadCampaigns()])
}

/*
 * ⌘K searches the campaign itself, not just pages: the palette's search term
 * is forwarded to the API and hits come back ranked across every entity type.
 */
const searchTerm = ref('')
const hits = ref<SearchHit[]>([])

let debounce: ReturnType<typeof setTimeout> | undefined

watch(searchTerm, (term) => {
  clearTimeout(debounce)

  if (!term || term.length < 2 || !currentId.value) {
    hits.value = []
    return
  }

  debounce = setTimeout(async () => {
    try {
      hits.value = await entities.search(term, 10)
    } catch {
      hits.value = []
    }
  }, 200)
})

const searchGroups = computed(() => [
  ...(hits.value.length
    ? [{
        id: 'campaign',
        label: 'In this campaign',
        // The palette fuzzy-matches item labels against what's typed, which
        // throws away results the server already decided were matches — "kovac"
        // does not literally occur in "Miloš Kovač", so every hit vanished and
        // the box said there was nothing. The API did the matching; trust it.
        ignoreFilter: true,
        items: hits.value.map(hit => ({
          label: hit.name,
          suffix: hit.summary ?? undefined,
          icon: entityTypeMeta(hit.type).icon,
          to: `/entities/${hit.id}`
        }))
      }]
    : []),
  {
    id: 'navigation',
    label: 'Navigation',
    // `flat()` alone stops at the section headings. Since the sidebar grew
    // collapsible Story and World groups, the entity types live one level
    // further down — so ⌘K quietly lost "Scenes", "NPCs" and everything else
    // that had moved inside them, and offered two unclickable headings instead.
    items: [...mainNav.value.flat(), ...footerNav.value]
      .flatMap(item => (item.children?.length ? item.children : [item]))
      .filter(item => !!item.to)
      .map(({ label, icon, to }) => ({ label, icon, to }))
  },
  ...appGroups.value
])
</script>

<template>
  <UDashboardGroup
    unit="rem"
    class="app-canvas"
  >
    <AppSidebar />

    <slot />

    <UDashboardSearch
      v-model:search-term="searchTerm"
      :groups="searchGroups"
      placeholder="Search the campaign…"
    />

    <ConfirmDialog />

    <QuickNote />
  </UDashboardGroup>
</template>
