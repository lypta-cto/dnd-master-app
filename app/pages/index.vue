<template>
  <AppPage
    title="Dashboard"
    description="Your campaigns at a glance."
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: 'Dashboard' }
    ]"
  >
    <EmptyState
      icon="i-lucide-swords"
      title="No campaigns yet"
      description="This is where your table lives. Nothing has been built yet — the MVP scope comes next."
    />
  </AppPage>
</template>
