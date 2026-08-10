<script setup lang="ts">
const route = useRoute()
const { current, isDm } = useCampaigns()
const entities = useEntities()
const mediaUrl = useMediaUrl()

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

const layout = useEntityLayout(type)

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
      // Rows are a third the height of cards, so a page of them is worth
      // more. Locations get the whole set at once: they render as a tree,
      // and a tree with its middle page missing is just wrong lines.
      page_size: type.value === 'location' ? 200 : layout.value === 'list' ? 50 : 24
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

/* --- The world explorer ------------------------------------------------------
 * Locations don't render as a list at all: you walk them. Open Locations and
 * the biggest tier is the whole screen — the kingdoms. Step into one and its
 * regions are the screen; step into a region and there are its cities. One
 * tier at a time, the way the world was built, with the path back at the top.
 * `?in=` carries where you stand, so the browser's back button walks back up
 * and a bookmarked region opens where you left it. Searching flattens to
 * plain results — a search that answers inside one kingdom reads as broken.
 */
const KIND_ICONS: Record<string, string> = {
  plane: 'i-lucide-sparkles',
  kingdom: 'i-lucide-crown',
  region: 'i-lucide-map',
  wilderness: 'i-lucide-trees',
  forest: 'i-lucide-trees',
  mountains: 'i-lucide-mountain',
  swamp: 'i-lucide-waves',
  island: 'i-lucide-waves',
  city: 'i-lucide-building-2',
  town: 'i-lucide-building',
  village: 'i-lucide-home',
  district: 'i-lucide-blocks',
  castle: 'i-lucide-castle',
  dungeon: 'i-lucide-skull',
  temple: 'i-lucide-church',
  tavern: 'i-lucide-beer',
  shop: 'i-lucide-store',
  building: 'i-lucide-warehouse'
}

const kindIcon = (place: EntitySummary) =>
  KIND_ICONS[String(place.data.kind ?? '')] ?? 'i-lucide-map-pin'

/** Where the DM is standing, carried in the URL so "back" walks back up */
const standingIn = computed(() => {
  const id = route.query.in
  return typeof id === 'string' && id ? id : null
})

function stepInto(id: string | null) {
  router.push({ query: { ...route.query, in: id || undefined } })
}

const explorer = computed(() => {
  if (type.value !== 'location' || applied.value || !pageData.value) {
    return null
  }

  const items = pageData.value.items
  const byId = new Map(items.map(item => [item.id, item]))
  const children = new Map<string | null, EntitySummary[]>()

  for (const item of items) {
    // A parent outside this set (another type, or deleted) makes it a root
    const parentId = item.parent && byId.has(item.parent.id) ? item.parent.id : null
    children.set(parentId, [...(children.get(parentId) ?? []), item])
  }

  const rung = (entity: EntitySummary) => {
    const index = LOCATION_KINDS.indexOf(String(entity.data.kind ?? ''))
    return index === -1 ? LOCATION_KINDS.length : index
  }

  // Everything under a place, however deep — "a kingdom of 23" says more
  // than the number of its immediate regions
  const descendants = (id: string): number => {
    const direct = children.get(id) ?? []
    return direct.length + direct.reduce((sum, child) => sum + descendants(child.id), 0)
  }

  const here = standingIn.value ? byId.get(standingIn.value) ?? null : null
  const shown = children.get(here?.id ?? null) ?? []

  // One tier, grouped by kind in ladder order: Kingdoms, then Regions…
  const groups = new Map<string, EntitySummary[]>()
  for (const place of [...shown].sort(
    (a, b) => rung(a) - rung(b) || a.name.localeCompare(b.name)
  )) {
    const kind = String(place.data.kind ?? 'unsorted')
    groups.set(kind, [...(groups.get(kind) ?? []), place])
  }

  // The way back up, clickable rung by rung
  const path: EntitySummary[] = []
  let cursor = here
  while (cursor) {
    path.unshift(cursor)
    cursor = cursor.parent && byId.has(cursor.parent.id) ? byId.get(cursor.parent.id)! : null
  }

  return {
    here,
    path,
    groups: [...groups.entries()].map(([kind, places]) => ({
      kind,
      places: places.map(place => ({
        place,
        inside: descendants(place.id)
      }))
    })),
    empty: shown.length === 0
  }
})

const grouped = computed(() => {
  if (!type.value || !GROUPABLE.includes(type.value) || applied.value || !pageData.value) {
    return null
  }
  if (explorer.value) {
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

/** The SRD import dialog — monsters only, refreshes the list per import */
const srdOpen = ref(false)
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
        v-if="current && isDm && type === 'monster'"
        label="Add from SRD"
        icon="i-lucide-book-open"
        color="neutral"
        variant="outline"
        class="rounded-xl"
        @click="srdOpen = true"
      />
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
      <!-- Shown whenever there's anything at all. It used to appear only past
           a handful of entries, which was fine when cards-or-rows was one
           global setting — now that each type remembers its own, hiding the
           row would leave a short list stuck in whatever it defaulted to. -->
      <div
        v-if="pageData?.items.length || applied"
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

        <!-- Walking the world has one order — the ladder. Sorting is for lists. -->
        <UDropdownMenu
          v-if="!explorer"
          :items="sortMenu"
        >
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
          <!-- The row now shows while a search is running, which can be
               before the first page has landed — so the count has to tolerate
               not having one yet -->
          <p
            v-if="applied && pageData"
            class="text-sm tabular-nums text-muted"
          >
            {{ pageData.total }} {{ pageData.total === 1 ? 'match' : 'matches' }}
          </p>
          <UButton
            v-if="!explorer"
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

        <!-- The world, walked one tier at a time -->
        <div
          v-if="explorer"
          class="space-y-4"
        >
          <!-- The path back up, rung by rung -->
          <div class="flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium transition-colors"
              :class="explorer.here ? 'text-muted hover:bg-elevated hover:text-highlighted' : 'text-highlighted'"
              @click="stepInto(null)"
            >
              <UIcon
                name="i-lucide-globe"
                class="size-4"
              />
              The world
            </button>
            <template
              v-for="(step, index) in explorer.path"
              :key="step.id"
            >
              <UIcon
                name="i-lucide-chevron-right"
                class="size-3.5 text-dimmed"
              />
              <button
                type="button"
                class="flex items-center gap-1.5 rounded-lg px-2 py-1 font-medium transition-colors"
                :class="index === explorer.path.length - 1
                  ? 'text-highlighted'
                  : 'text-muted hover:bg-elevated hover:text-highlighted'"
                @click="stepInto(step.id)"
              >
                <UIcon
                  :name="kindIcon(step)"
                  class="size-4"
                />
                {{ step.name }}
              </button>
            </template>
          </div>

          <!-- Where you're standing: the place itself, and the door to its page -->
          <div
            v-if="explorer.here"
            class="app-card flex flex-wrap items-center gap-4 p-4"
          >
            <img
              v-if="explorer.here.image_url"
              :src="mediaUrl(explorer.here.image_url)!"
              :alt="explorer.here.name"
              class="size-14 shrink-0 rounded-xl object-cover"
            >
            <div
              v-else
              class="flex size-14 shrink-0 items-center justify-center rounded-xl bg-elevated"
            >
              <UIcon
                :name="kindIcon(explorer.here)"
                class="size-7 text-dimmed"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h2 class="truncate text-lg font-semibold text-highlighted">
                  {{ explorer.here.name }}
                </h2>
                <UBadge
                  v-if="explorer.here.data.kind"
                  color="neutral"
                  variant="subtle"
                  class="rounded-full capitalize"
                >
                  {{ explorer.here.data.kind }}
                </UBadge>
              </div>
              <p
                v-if="explorer.here.summary"
                class="truncate text-sm text-muted"
              >
                {{ explorer.here.summary }}
              </p>
            </div>
            <UButton
              label="Open this place"
              icon="i-lucide-arrow-up-right"
              color="neutral"
              variant="outline"
              class="rounded-xl"
              :to="`/entities/${explorer.here.id}`"
            />
          </div>

          <!-- This tier's places, biggest kinds first -->
          <section
            v-for="group in explorer.groups"
            :key="group.kind"
            class="space-y-2"
          >
            <p class="text-xs font-medium tracking-wide text-dimmed uppercase">
              {{ group.kind }}
              <span class="tabular-nums">{{ group.places.length > 1 ? group.places.length : '' }}</span>
            </p>
            <div class="app-card overflow-hidden p-0">
              <div
                v-for="{ place, inside } in group.places"
                :key="place.id"
                class="flex items-center border-b border-default transition-colors last:border-0 hover:bg-elevated/60"
              >
                <button
                  type="button"
                  class="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
                  @click="stepInto(place.id)"
                >
                  <img
                    v-if="place.image_url"
                    :src="mediaUrl(place.image_url)!"
                    :alt="place.name"
                    class="size-10 shrink-0 rounded-lg object-cover"
                  >
                  <div
                    v-else
                    class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-elevated"
                  >
                    <UIcon
                      :name="kindIcon(place)"
                      class="size-5 text-dimmed"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-semibold text-highlighted">
                      {{ place.name }}
                    </p>
                    <p
                      v-if="place.summary"
                      class="truncate text-xs text-muted"
                    >
                      {{ place.summary }}
                    </p>
                  </div>
                  <span
                    v-if="inside"
                    class="shrink-0 text-xs tabular-nums text-dimmed"
                  >
                    {{ inside }} {{ inside === 1 ? 'place' : 'places' }} inside
                  </span>
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-4 shrink-0 text-dimmed"
                  />
                </button>
                <NuxtLink
                  :to="`/entities/${place.id}`"
                  class="shrink-0 p-3 text-dimmed transition-colors hover:text-primary"
                  :aria-label="`Open ${place.name}`"
                >
                  <UIcon
                    name="i-lucide-arrow-up-right"
                    class="size-4"
                  />
                </NuxtLink>
              </div>
            </div>
          </section>

          <!-- An empty tier still says where you are and what to do about it -->
          <EmptyState
            v-if="explorer.empty"
            icon="i-lucide-map-pin-plus"
            :title="explorer.here ? `Nothing inside ${explorer.here.name} yet` : 'The world is unwritten'"
            :description="explorer.here
              ? 'Make a place and use “Place it” to put it here — or open this place and build from its page.'
              : 'Start from the top: the kingdom first, then the regions in it, then their cities.'"
          >
            <UButton
              label="New Location"
              icon="i-lucide-plus"
              to="/entities/new?type=location"
            />
          </EmptyState>
        </div>

        <!-- Grouped by place: the same cards, under the world they belong to -->
        <div
          v-else-if="grouped"
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

    <SrdMonsterImport
      v-model:open="srdOpen"
      @imported="load"
    />
  </AppPage>
</template>
