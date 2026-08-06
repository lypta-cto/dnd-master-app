<script setup lang="ts">
const { mainNav, footerNav } = useNavigation()
const { groups: appGroups } = useCommandPalette()

// Only reachable once signed in, which is exactly when the workspace is fetchable
const { load: loadWorkspace } = useWorkspace()
await loadWorkspace()

const searchGroups = computed(() => [
  {
    id: 'navigation',
    label: 'Navigation',
    items: [...mainNav.value.flat(), ...footerNav.value].map(({ label, icon, to }) => ({
      label,
      icon,
      to
    }))
  },
  // Anything the app registered via useCommandPalette()
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
      :groups="searchGroups"
      placeholder="Search pages and commands…"
    />

    <ConfirmDialog />
  </UDashboardGroup>
</template>
