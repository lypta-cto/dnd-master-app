<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  breadcrumb?: BreadcrumbItem[]
  /** Show a back arrow before the breadcrumb */
  back?: boolean
  /**
   * What counts as "a different page" for the entrance animation.
   *
   * Defaults to the path. It used to be the full path, which meant any query
   * change replayed the animation — and since the body is rebuilt to do that,
   * a filter typed into a page-level search box lost its own focus every time
   * it applied. Pass this when one path really is several pages.
   */
  pageKey?: string
}>(), {
  back: false
})

const route = useRoute()
const animationKey = computed(() => props.pageKey ?? route.path)

defineSlots<{
  /** Buttons rendered next to the page title */
  actions?: () => unknown
  /** Page body */
  default?: () => unknown
}>()

useHead({ title: props.title })
</script>

<template>
  <!-- `min-h-0` lets the body shrink inside the fixed shell so it scrolls
       instead of pushing the panel past the viewport -->
  <UDashboardPanel
    :ui="{
      root: 'min-h-0',
      body: 'app-canvas min-h-0 p-4 sm:p-6 gap-6 scroll-smooth'
    }"
  >
    <template #header>
      <UDashboardNavbar
        class="app-canvas border-default"
        :ui="{ root: 'h-16 px-4 sm:px-6', left: 'min-w-0 gap-2', right: 'gap-1.5 sm:gap-2' }"
      >
        <template #title>
          <div class="flex items-center gap-2 min-w-0">
            <UButton
              v-if="back"
              class="app-icon-btn"
              color="neutral"
              variant="ghost"
              icon="i-lucide-arrow-left"
              aria-label="Go back"
              @click="$router.back()"
            />

            <UBreadcrumb
              v-if="breadcrumb?.length"
              :items="breadcrumb"
              class="min-w-0 hidden sm:flex"
              :ui="{ link: 'text-sm' }"
            />
            <span
              v-else
              class="font-semibold text-highlighted truncate"
            >
              {{ title }}
            </span>
          </div>
        </template>

        <template #right>
          <CastIndicator />
          <CoinPurse />

          <UDashboardSearchButton
            class="app-icon-btn"
            collapsed
            color="neutral"
            variant="ghost"
          />

          <NotificationsMenu />

          <ThemeToggle />

          <UserMenu />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div
        :key="animationKey"
        class="app-page-in flex flex-col gap-6"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h1 class="text-xl sm:text-2xl font-semibold text-highlighted truncate">
              {{ title }}
            </h1>
            <p
              v-if="description"
              class="mt-1 text-sm text-muted"
            >
              {{ description }}
            </p>
          </div>

          <div
            v-if="$slots.actions"
            class="flex items-center gap-2"
          >
            <slot name="actions" />
          </div>
        </div>

        <slot />
      </div>
    </template>
  </UDashboardPanel>
</template>
