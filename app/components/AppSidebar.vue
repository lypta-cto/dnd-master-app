<script setup lang="ts">
const { mainNav, footerNav } = useNavigation()
const { logout } = useAuth()

// Tracked here so the footer can be centred in the collapsed rail
const collapsed = ref(false)
</script>

<template>
  <UDashboardSidebar
    v-model:collapsed="collapsed"
    collapsible
    resizable
    mode="slideover"
    :default-size="14"
    :min-size="12"
    :max-size="20"
    :collapsed-size="4.5"
    class="app-canvas border-default transition-[width] duration-200 ease-out data-[dragging=true]:transition-none"
    :ui="{
      header: 'h-16 px-3',
      body: 'px-3 gap-4',
      footer: collapsed ? 'px-3 pb-3 justify-center' : 'px-3 pb-3'
    }"
  >
    <template #header="{ collapsed: isCollapsed, collapse }">
      <!--
        px-2.5 matches the nav links' own padding, so the mark sits on the same
        left edge as the icons below — and lands dead centre when collapsed.
      -->
      <AppLogo
        :collapsed="isCollapsed"
        class="w-full px-2.5"
      />

      <!-- Sits on the sidebar's right edge so it reads as "pull the panel in/out" -->
      <UButton
        class="app-edge-btn absolute -end-3 top-5 z-20 hidden lg:flex"
        color="neutral"
        variant="ghost"
        icon="i-lucide-chevron-left"
        :ui="{ leadingIcon: ['size-3.5 transition-transform duration-200 ease-out', isCollapsed && 'rotate-180'] }"
        :aria-label="isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
        @click="collapse(!isCollapsed)"
      />
    </template>

    <template #default="{ collapsed: isCollapsed }">
      <CampaignSwitcher :collapsed="isCollapsed" />

      <UNavigationMenu
        :items="mainNav"
        :collapsed="isCollapsed"
        orientation="vertical"
        tooltip
        popover
        :ui="{ link: isCollapsed ? 'py-2 justify-center' : 'py-2' }"
      />

      <div class="flex-1" />

      <UNavigationMenu
        :items="footerNav"
        :collapsed="isCollapsed"
        orientation="vertical"
        tooltip
        :ui="{ link: isCollapsed ? 'py-2 justify-center' : 'py-2' }"
      />
    </template>

    <template #footer="{ collapsed: isCollapsed }">
      <UTooltip
        :text="isCollapsed ? 'Sign out' : undefined"
        :disabled="!isCollapsed"
        :content="{ side: 'right' }"
      >
        <!-- Collapsed: same 48px box as a nav link, so the icon lands on the rail's centre line -->
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-log-out"
          :label="isCollapsed ? undefined : 'Sign out'"
          :block="!isCollapsed"
          class="py-2"
          :ui="{ base: isCollapsed ? 'w-12 px-2.5 justify-center' : 'justify-start' }"
          @click="logout()"
        />
      </UTooltip>
    </template>
  </UDashboardSidebar>
</template>
