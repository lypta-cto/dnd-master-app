<template>
  <AppPage
    title="Help &amp; support"
    description="Documentation, guides and contact options."
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: 'Help &amp; support' }
    ]"
  >
    <EmptyState
      icon="i-lucide-circle-help"
      title="Nothing here yet"
      description="Add your docs links or a support form."
    />
  </AppPage>
</template>
