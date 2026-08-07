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
    items: [...mainNav.value.flat(), ...footerNav.value].map(({ label, icon, to }) => ({
      label,
      icon,
      to
    }))
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
