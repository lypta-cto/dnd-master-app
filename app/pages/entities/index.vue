<script setup lang="ts">
const route = useRoute()
const { current, isDm } = useCampaigns()
const entities = useEntities()

const type = computed(() => {
  const raw = route.query.type
  return ENTITY_TYPES.some(t => t.value === raw) ? (raw as EntityType) : undefined
})

const meta = computed(() => (type.value ? entityTypeMeta(type.value) : null))

const page = ref(1)
const pageData = ref<EntityPage | null>(null)
const loading = ref(true)

/* --- Finding one thing in two hundred ---------------------------------------
 * Past about a screenful you stop browsing a list and start hunting a name, so
 * search and sort run on the server over the whole list — filtering the page
 * you can already see would find nothing and look broken — and the layout
 * switches to compact rows when cards stop paying for their height.
 */
const router = useRouter()

const search = ref(String(route.query.q ?? ''))
/** What's actually been sent: `search` runs ahead of it while you type */
const applied = ref(search.value.trim())

const sort = ref<EntitySort>(
  ENTITY_SORTS.some(s => s.value === route.query.sort)
    ? (route.query.sort as EntitySort)
    : 'name'
)

// Remembered across types and sessions: it's a preference about eyesight and
// screen size, not about the list you happen to be looking at
const layout = useCookie<'grid' | 'list'>('entity-layout', {
  default: () => 'grid',
  sameSite: 'lax',
  maxAge: 60 * 60 * 24 * 365
})

const sortMeta = computed(() => ENTITY_SORTS.find(s => s.value === sort.value)!)
const sortMenu = computed(() =>
  ENTITY_SORTS.map(option => ({
    label: option.label,
    icon: option.icon,
    onSelect: () => {
      sort.value = option.value
    }
  }))
)

let debounce: ReturnType<typeof setTimeout> | undefined

watch(search, (value) => {
  clearTimeout(debounce)
  debounce = setTimeout(() => {
    applied.value = value.trim()
  }, 250)
})

onBeforeUnmount(() => clearTimeout(debounce))

/**
 * The filter belongs in the URL so that opening an NPC and coming back doesn't
 * drop you at the top of two hundred unfiltered names.
 */
function rememberInUrl() {
  router.replace({
    query: {
      ...(type.value ? { type: type.value } : {}),
      ...(applied.value ? { q: applied.value } : {}),
      ...(sort.value === 'name' ? {} : { sort: sort.value })
    }
  })
}

// Search-as-you-type means several requests can be in flight; only the newest
// one is allowed to write, or a slow early response overwrites a later list.
let latest = 0

async function load() {
  if (!current.value) {
    loading.value = false
    return
  }

  const request = ++latest
  loading.value = true

  try {
    const result = await entities.list({
      type: type.value,
      q: applied.value || undefined,
      sort: sort.value,
      page: page.value,
      // Rows are a third the height of cards, so a page of them is worth more
      page_size: layout.value === 'list' ? 50 : 24
    })

    if (request === latest) {
      pageData.value = result
    }
  } finally {
    if (request === latest) {
      loading.value = false
    }
  }
}

// A search typed for NPCs means nothing among Locations
watch([type, () => current.value?.id], () => {
  search.value = ''
  applied.value = ''
})

// Anything that changes what the list contains sends you back to its first page
watch([type, () => current.value?.id, applied, sort], () => {
  page.value = 1
  rememberInUrl()
})

watch([type, () => current.value?.id, applied, sort, page, layout], load, { immediate: true })

const title = computed(() => meta.value?.plural ?? 'All entities')

/* --- Grouped by where it happens --------------------------------------------
 * A flat list of scenes is a list of titles with no idea what they belong to.
 * Grouping them under their place turns the same page into the shape of the
 * world — which is the whole reason places contain things.
 *
 * Only for types that sit inside somewhere, and only when the DM isn't already
 * narrowing the list: a search result should be the matches, in one list, not
 * matches scattered across headings.
 */
const GROUPABLE: EntityType[] = ['scene', 'encounter', 'location']

const grouped = computed(() => {
  if (!type.value || !GROUPABLE.includes(type.value) || applied.value || !pageData.value) {
    return null
  }

  const byPlace = new Map<string, { place: { id: string, name: string } | null, items: EntitySummary[] }>()

  for (const item of pageData.value.items) {
    // One bucket for everything unplaced, and it sorts last — it's a to-do
    // list, not a place.
    const key = item.parent?.id ?? ''
    const bucket = byPlace.get(key) ?? { place: item.parent ?? null, items: [] }
    bucket.items.push(item)
    byPlace.set(key, bucket)
  }

  // Nothing to show off if everything is in one bucket
  if (byPlace.size < 2 && !byPlace.has('')) {
    return null
  }

  return [...byPlace.values()].sort((a, b) => {
    if (!a.place) {
      return 1
    }
    if (!b.place) {
      return -1
    }
    return a.place.name.localeCompare(b.place.name)
  })
})

/* --- Bulk visibility -------------------------------------------------------
 * Sharing a batch of NPCs after a session used to mean opening each one. Here
 * the DM picks several cards and flips them together.
 */
const toast = useToast()

const selecting = ref(false)
const selected = ref<string[]>([])
const applying = ref(false)

const VISIBILITY_ACTIONS = [
  { value: 'dm_only' as const, label: 'DM only', icon: 'i-lucide-eye-off' },
  { value: 'shared' as const, label: 'Shared', icon: 'i-lucide-users' },
  { value: 'public' as const, label: 'Public', icon: 'i-lucide-globe' }
]

function toggleSelecting() {
  selecting.value = !selecting.value
  selected.value = []
}

function toggle(id: string) {
  selected.value = selected.value.includes(id)
    ? selected.value.filter(s => s !== id)
    : [...selected.value, id]
}

function selectAllOnPage() {
  selected.value = (pageData.value?.items ?? []).map(item => item.id)
}

async function applyVisibility(visibility: Visibility) {
  applying.value = true

  try {
    const targets = (pageData.value?.items ?? []).filter(
      item => selected.value.includes(item.id) && item.visibility !== visibility
    )

    await Promise.all(targets.map(item => entities.update(item.id, { visibility })))

    for (const item of targets) {
      item.visibility = visibility
    }

    toast.add({
      title: targets.length
        ? `${targets.length} set to ${visibility === 'dm_only' ? 'DM only' : visibility}`
        : 'Already set',
      icon: 'i-lucide-eye',
      color: 'success'
    })
    selected.value = []
    selecting.value = false
  } catch (error) {
    toast.add({ title: apiErrorMessage(error, 'Update failed'), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    applying.value = false
  }
}

/* --- Rule of three -----------------------------------------------------------
 * Players miss one clue, misread the second, and connect the third. So a
 * conclusion the adventure depends on wants three ways in. The DM shouldn't
 * have to count them by hand — this does, using the wording they typed into
 * "Points toward".
 */
const clueCoverage = computed(() => {
  if (type.value !== 'clue' || !pageData.value) {
    return []
  }

  const byConclusion = new Map<string, { conclusion: string, total: number, essential: number }>()

  for (const clue of pageData.value.items) {
    const conclusion = String(clue.data.points_to ?? '').trim()
    if (!conclusion) {
      continue
    }

    const key = conclusion.toLowerCase()
    const row = byConclusion.get(key) ?? { conclusion, total: 0, essential: 0 }
    row.total += 1
    if (clue.data.weight === 'essential') {
      row.essential += 1
    }
    byConclusion.set(key, row)
  }

  return [...byConclusion.values()].sort((a, b) => a.total - b.total)
})

/** Only the ones that carry weight and don't have three ways in yet */
const thinConclusions = computed(() =>
  clueCoverage.value.filter(row => row.essential > 0 && row.total < 3)
)

// Leaving the page or switching type shouldn't strand a half-made selection
watch([type, () => current.value?.id], () => {
  selecting.value = false
  selected.value = []
})
</script>

<template>
  <AppPage
    :title="title"
    :page-key="`entities-${type ?? 'all'}`"
    :description="!current
      ? 'Select a campaign first.'
      : isDm
        ? `Everything in ${current.name}.`
        : `Shared with you in ${current.name}.`"

    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: title }
    ]"
  >
    <template #actions>
      <UButton
        v-if="current && isDm && pageData?.items.length"
        :label="selecting ? 'Cancel' : 'Select'"
        :icon="selecting ? 'i-lucide-x' : 'i-lucide-square-check-big'"
        color="neutral"
        variant="outline"
        class="rounded-xl"
        @click="toggleSelecting"
      />
      <UButton
        v-if="current && (isDm || type === 'character')"
        :label="meta ? `New ${meta.label}` : 'New entity'"
        icon="i-lucide-plus"
        class="rounded-xl"
        :to="type ? `/entities/new?type=${type}` : '/entities/new'"
      />
    </template>

    <EmptyState
      v-if="!current"
      icon="i-lucide-swords"
      title="No campaign selected"
      description="Pick or create a campaign in the sidebar."
    />

    <template v-else>
      <!-- Only worth the row once there's enough to hunt through -->
      <div
        v-if="pageData && (pageData.total > 8 || applied)"
        class="flex flex-wrap items-center gap-2"
      >
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :placeholder="`Search ${meta?.plural ?? 'entities'}…`"
          class="w-full sm:w-72"
          :ui="{ base: 'rounded-xl' }"
        >
          <template
            v-if="search"
            #trailing
          >
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="link"
              size="xs"
              aria-label="Clear search"
              @click="search = ''"
            />
          </template>
        </UInput>

        <UDropdownMenu :items="sortMenu">
          <UButton
            :label="sortMeta.label"
            :icon="sortMeta.icon"
            trailing-icon="i-lucide-chevron-down"
            color="neutral"
            variant="outline"
            class="rounded-xl"
          />
        </UDropdownMenu>

        <div class="ml-auto flex items-center gap-2">
          <p
            v-if="applied"
            class="text-sm tabular-nums text-muted"
          >
            {{ pageData.total }} {{ pageData.total === 1 ? 'match' : 'matches' }}
          </p>
          <UButton
            :icon="layout === 'grid' ? 'i-lucide-list' : 'i-lucide-layout-grid'"
            :aria-label="layout === 'grid' ? 'Switch to list' : 'Switch to cards'"
            color="neutral"
            variant="outline"
            class="rounded-xl"
            @click="layout = layout === 'grid' ? 'list' : 'grid'"
          />
        </div>
      </div>

      <div
        v-if="loading"
        class="grid gap-3 lg:grid-cols-2 xl:grid-cols-3"
      >
        <USkeleton
          v-for="i in 6"
          :key="i"
          class="h-24 rounded-2xl"
        />
      </div>

      <EmptyState
        v-else-if="applied && !pageData?.items.length"
        icon="i-lucide-search-x"
        :title="`Nothing matches “${applied}”`"
        description="Search covers names and summaries across the whole list."
      >
        <UButton
          label="Clear search"
          icon="i-lucide-x"
          color="neutral"
          variant="outline"
          class="rounded-xl"
          @click="search = ''"
        />
      </EmptyState>

      <EmptyState
        v-else-if="!pageData?.items.length"
        :icon="meta?.icon ?? 'i-lucide-box'"
        :title="`No ${meta?.plural ?? 'entities'} yet`"
        :description="isDm
          ? 'Create the first one — anything you mention in [[brackets]] elsewhere will link to it.'
          : 'Nothing has been shared with you here yet.'"
      >
        <UButton
          v-if="isDm"
          :label="meta ? `Create a ${meta.label}` : 'Create one'"
          icon="i-lucide-plus"
          class="rounded-xl"
          :to="type ? `/entities/new?type=${type}` : '/entities/new'"
        />
      </EmptyState>

      <template v-else>
        <ContentCard
          v-if="type === 'clue' && clueCoverage.length"
          title="Ways in"
          icon="i-lucide-shapes"
          :description="thinConclusions.length
            ? 'Something essential rests on fewer than three clues.'
            : 'Every essential conclusion has three ways in.'"
        >
          <ul class="space-y-1.5">
            <li
              v-for="row in clueCoverage"
              :key="row.conclusion"
              class="flex items-center gap-3"
            >
              <span class="min-w-0 flex-1 truncate text-sm text-toned">{{ row.conclusion }}</span>
              <span class="flex shrink-0 gap-1">
                <span
                  v-for="index in 3"
                  :key="index"
                  class="size-2 rounded-full"
                  :class="index <= row.total ? 'bg-primary' : 'bg-elevated'"
                />
              </span>
              <span class="w-24 shrink-0 text-right text-xs tabular-nums text-dimmed">
                {{ row.total }} {{ row.total === 1 ? 'clue' : 'clues' }}
              </span>
            </li>
          </ul>
        </ContentCard>

        <!-- Grouped by place: the same cards, under the world they belong to -->
        <div
          v-if="grouped"
          class="space-y-6"
        >
          <section
            v-for="group in grouped"
            :key="group.place?.id ?? 'unplaced'"
            class="space-y-2"
          >
            <div class="flex items-center gap-2">
              <NuxtLink
                v-if="group.place"
                :to="`/entities/${group.place.id}`"
                class="flex items-center gap-1.5 text-sm font-medium text-highlighted hover:text-primary"
              >
                <UIcon
                  name="i-lucide-map-pinned"
                  class="size-4 text-dimmed"
                />
                {{ group.place.name }}
              </NuxtLink>
              <span
                v-else
                class="flex items-center gap-1.5 text-sm font-medium text-muted"
              >
                <UIcon
                  name="i-lucide-map-pin-off"
                  class="size-4 text-dimmed"
                />
                Not placed yet
              </span>
              <span class="text-xs tabular-nums text-dimmed">{{ group.items.length }}</span>
            </div>

            <div
              v-if="layout === 'grid'"
              class="grid gap-3 lg:grid-cols-2 xl:grid-cols-3"
            >
              <EntityCard
                v-for="entity in group.items"
                :key="entity.id"
                :entity="entity"
                :no-visibility="!isDm"
                :selectable="selecting"
                :selected="selected.includes(entity.id)"
                @toggle="toggle"
              />
            </div>
            <div
              v-else
              class="app-card overflow-hidden p-0"
            >
              <EntityRow
                v-for="entity in group.items"
                :key="entity.id"
                :entity="entity"
                :no-visibility="!isDm"
                :selectable="selecting"
                :selected="selected.includes(entity.id)"
                @toggle="toggle"
              />
            </div>
          </section>
        </div>

        <div
          v-else-if="layout === 'grid'"
          class="grid gap-3 lg:grid-cols-2 xl:grid-cols-3"
        >
          <EntityCard
            v-for="entity in pageData.items"
            :key="entity.id"
            :entity="entity"
            :no-visibility="!isDm"
            :selectable="selecting"
            :selected="selected.includes(entity.id)"
            @toggle="toggle"
          />
        </div>

        <div
          v-else
          class="app-card overflow-hidden p-0"
        >
          <EntityRow
            v-for="entity in pageData.items"
            :key="entity.id"
            :entity="entity"
            :no-visibility="!isDm"
            :selectable="selecting"
            :selected="selected.includes(entity.id)"
            @toggle="toggle"
          />
        </div>

        <!-- Bulk bar: only while picking -->
        <div
          v-if="selecting"
          class="sticky bottom-4 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-default bg-default/95 p-3 shadow-lg backdrop-blur"
        >
          <span class="text-sm font-medium text-highlighted">
            {{ selected.length }} selected
          </span>
          <UButton
            label="All on page"
            size="xs"
            color="neutral"
            variant="ghost"
            :disabled="selected.length === pageData.items.length"
            @click="selectAllOnPage"
          />

          <span class="ml-auto flex flex-wrap items-center gap-1.5">
            <span class="text-xs text-muted">Set visibility</span>
            <UButton
              v-for="action in VISIBILITY_ACTIONS"
              :key="action.value"
              :label="action.label"
              :icon="action.icon"
              size="xs"
              color="neutral"
              variant="outline"
              :disabled="!selected.length || applying"
              @click="applyVisibility(action.value)"
            />
          </span>
        </div>

        <div
          v-if="pageData.total > pageData.page_size"
          class="flex items-center justify-between"
        >
          <p class="text-sm tabular-nums text-muted">
            {{ (page - 1) * pageData.page_size + 1 }}–{{
              Math.min(page * pageData.page_size, pageData.total)
            }} of {{ pageData.total }}
          </p>
          <UPagination
            v-model:page="page"
            :total="pageData.total"
            :items-per-page="pageData.page_size"
          />
        </div>
      </template>
    </template>
  </AppPage>
</template>
