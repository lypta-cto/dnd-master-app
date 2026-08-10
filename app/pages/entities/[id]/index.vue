<script setup lang="ts">
const route = useRoute()
const toast = useToast()
const { confirm } = useConfirm()
const { isDm } = useCampaigns()
const { user } = useAuth()
const entities = useEntities()
const cast = useCast()
const mediaUrl = useMediaUrl()

const entity = ref<EntityDetail | null>(null)
const loading = ref(true)
const missing = ref(false)

async function load() {
  loading.value = true
  missing.value = false

  try {
    entity.value = await entities.read(String(route.params.id))
  } catch {
    missing.value = true
  } finally {
    loading.value = false
  }
}

watch(() => route.params.id, load, { immediate: true })

const meta = computed(() => (entity.value ? entityTypeMeta(entity.value.type) : null))

/** DM, or the player who owns this character */
const canWrite = computed(
  () => isDm.value
    || (entity.value?.type === 'character' && entity.value.owner_id === user.value?.id)
)

const coverFocusStyle = computed(() => {
  const f = entity.value?.data.cover_focus as { x: number, y: number } | undefined
  return f && typeof f.x === 'number' ? { objectPosition: `${f.x}% ${f.y}%` } : undefined
})

const headerLightbox = ref(false)

const dmNotes = computed(() => (entity.value?.data.dm_notes as string | undefined) ?? '')
const playersThink = computed(() => (entity.value?.data.dm_players_think as string | undefined) ?? '')
const playerPreview = ref(false)

/**
 * What stands inside this place — the way down the world.
 *
 * The breadcrumb above walks up (cave → city → kingdom); this walks down.
 * Children arrive as backlinks with the located_in relation, so no extra
 * request is needed. Maps come first with their pictures — a place's map is
 * the thing you reach for mid-session. Places group by kind in ladder order,
 * so a kingdom with too many regions reads as "Regions (14)" with a scrolling
 * shelf rather than an avalanche; everything else groups by type.
 */
const placeContents = computed(() => {
  if (!entity.value || entity.value.type !== 'location') {
    return null
  }

  const inside = entity.value.backlinks.filter(link => link.relation === 'located_in')
  const maps = inside.filter(link => link.type === 'map')
  const places = inside.filter(link => link.type === 'location')
  const rest = inside.filter(link => link.type !== 'map' && link.type !== 'location')

  const rung = (link: LinkedEntity) => {
    const index = LOCATION_KINDS.indexOf(String(link.data.kind ?? ''))
    return index === -1 ? LOCATION_KINDS.length : index
  }

  const byKind = new Map<string, LinkedEntity[]>()
  for (const place of [...places].sort((a, b) => rung(a) - rung(b) || a.name.localeCompare(b.name))) {
    const kind = String(place.data.kind ?? 'places')
    byKind.set(kind, [...(byKind.get(kind) ?? []), place])
  }

  const byType = new Map<EntityType, LinkedEntity[]>()
  for (const link of [...rest].sort((a, b) => a.name.localeCompare(b.name))) {
    byType.set(link.type, [...(byType.get(link.type) ?? []), link])
  }

  return {
    total: inside.length,
    maps,
    placeGroups: [...byKind.entries()].map(([kind, links]) => ({ kind, links })),
    restGroups: [...byType.entries()]
      .map(([type, links]) => ({ type, meta: entityTypeMeta(type), links }))
      .sort((a, b) => b.links.length - a.links.length)
  }
})

/** The "Add a map" dialog for this place */
const addMapOpen = ref(false)

/**
 * Links and mentions fold away on location pages — the map and the world
 * below are what the page is for; the wiring is there when asked.
 */
const connectionsOpen = ref(false)
const mentionCount = computed(() =>
  backlinkGroups.value.reduce((sum, group) => sum + group.links.length, 0)
)
const hasConnections = computed(() =>
  !!entity.value && (entity.value.links.length > 0 || mentionCount.value > 0)
)

/** Backlinks grouped by type — a wall of names hides who is talking about whom */
const backlinkGroups = computed(() => {
  const groups = new Map<EntityType, LinkedEntity[]>()

  for (const link of entity.value?.backlinks ?? []) {
    // Children of a place live in its own card; repeating them here would
    // say the same thing twice in a worse place
    if (placeContents.value && link.relation === 'located_in') {
      continue
    }
    groups.set(link.type, [...(groups.get(link.type) ?? []), link])
  }

  return [...groups.entries()]
    .map(([type, links]) => ({ type, meta: entityTypeMeta(type), links }))
    .sort((a, b) => b.links.length - a.links.length)
})

/** Structured `data` fields for this type that actually hold a value */
const filledFields = computed(() => {
  if (!entity.value) {
    return []
  }
  return (TYPE_FIELDS[entity.value.type] ?? [])
    .map(field => ({ ...field, value: entity.value!.data[field.key] }))
    .filter(field => field.value !== undefined && field.value !== null && field.value !== '')
})

async function destroy() {
  if (!entity.value) {
    return
  }

  const ok = await confirm({
    title: `Delete “${entity.value.name}”?`,
    description: 'Links pointing here will become unresolved. This cannot be undone.',
    confirmLabel: 'Delete',
    color: 'error'
  })

  if (!ok) {
    return
  }

  await entities.remove(entity.value.id)
  toast.add({ title: 'Deleted', icon: 'i-lucide-trash-2', color: 'error' })
  await navigateTo(`/entities?type=${entity.value.type}`)
}

/**
 * A copy to rework, opened straight in the editor.
 *
 * This is how a Giant Rat becomes the campaign's own Beer Giant Snail: same
 * statblock, new name, whatever else the DM rewrites. The image stays behind —
 * a variant that looks exactly like the original defeats the point.
 */
const duplicating = ref(false)

async function makeVariant() {
  if (!entity.value) {
    return
  }
  duplicating.value = true

  try {
    const data = JSON.parse(JSON.stringify(entity.value.data))
    // A variant is by definition the DM's own working creature — it goes
    // straight into the favourites the pickers surface first
    if (entity.value.type === 'monster') {
      data.favorite = true
    }

    const created = await entities.create({
      type: entity.value.type,
      name: `${entity.value.name} (variant)`,
      summary: entity.value.summary,
      body: entity.value.body,
      tags: [...entity.value.tags],
      visibility: entity.value.visibility,
      data
    })
    await navigateTo(`/entities/${created.id}/edit`)
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    duplicating.value = false
  }
}

/* --- Favourites --------------------------------------------------------------
 * An imported bestiary is hundreds of rows; the dozen the campaign actually
 * uses get a star, and search puts them first everywhere monsters are picked.
 */
const isFavourite = computed(() => entity.value?.data.favorite === true)
const starring = ref(false)

async function toggleFavourite() {
  if (!entity.value) {
    return
  }
  starring.value = true

  try {
    const data: Record<string, unknown> = { ...entity.value.data }
    if (isFavourite.value) {
      delete data.favorite
    } else {
      data.favorite = true
    }
    entity.value = { ...entity.value, ...(await entities.update(entity.value.id, { data })) }
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    starring.value = false
  }
}

/** Push this entity's image (or name) to the table's screen. */
async function castThis() {
  if (!entity.value) {
    return
  }

  try {
    const state = entity.value.image_url
      ? {
          mode: 'image' as const,
          payload: {
            image_url: entity.value.image_url,
            caption: entity.value.name
          }
        }
      : {
          mode: 'text' as const,
          payload: { text: entity.value.name, subtext: entity.value.summary ?? '' }
        }

    const result = await cast.set(state)
    toast.add({
      title: `Cast to the table`,
      description: result.displays_connected
        ? `${result.displays_connected} display(s) watching`
        : 'No display connected — open the cast screen link on your TV',
      icon: 'i-lucide-cast',
      color: result.displays_connected ? 'success' : 'warning'
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  }
}

/** planned → played and back, straight from the session page */
const togglingStatus = ref(false)

async function toggleSessionStatus() {
  if (!entity.value) {
    return
  }

  const next = entity.value.data.status === 'played' ? 'planned' : 'played'
  togglingStatus.value = true

  try {
    const saved = await entities.update(entity.value.id, {
      data: { ...entity.value.data, status: next }
    })
    entity.value = saved
    toast.add({
      title: next === 'played' ? 'Session marked as played' : 'Session reopened as planned',
      description: next === 'played' && saved.visibility === 'dm_only'
        ? 'Recap is still DM-only — share it from Edit when it\'s ready.'
        : undefined,
      icon: next === 'played' ? 'i-lucide-check-check' : 'i-lucide-calendar-clock',
      color: 'success'
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    togglingStatus.value = false
  }
}

/** Flip the nth - [ ] / - [x] marker in the body and save. */
async function toggleTask(index: number) {
  if (!entity.value?.body || !canWrite.value) {
    return
  }

  let seen = -1
  const next = entity.value.body.replace(/(-\s\[)([ xX])(\])/g, (whole, open, mark, close) => {
    seen += 1
    if (seen !== index) {
      return whole
    }
    return `${open}${mark === ' ' ? 'x' : ' '}${close}`
  })

  if (next !== entity.value.body) {
    entity.value = await entities.update(entity.value.id, { body: next })
  }
}

const RELATION_LABELS: Record<LinkRelation, string> = {
  mentions: 'Mentions',
  member_of: 'Member of',
  located_in: 'Located in',
  owns: 'Owns',
  related_to: 'Related to',
  leads_to: 'Leads to'
}
</script>

<template>
  <AppPage
    :title="entity?.name ?? 'Entity'"
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: meta?.plural ?? 'Entities', to: meta ? `/entities?type=${entity!.type}` : '/entities' },
      { label: entity?.name ?? '…' }
    ]"
  >
    <template #actions>
      <template v-if="entity">
        <UButton
          v-if="isDm && entity.type === 'session'"
          :label="entity.data.status === 'played' ? 'Reopen' : 'Mark as played'"
          :icon="entity.data.status === 'played' ? 'i-lucide-calendar-clock' : 'i-lucide-check-check'"
          :color="entity.data.status === 'played' ? 'neutral' : 'success'"
          variant="outline"
          class="rounded-xl"
          :loading="togglingStatus"
          @click="toggleSessionStatus"
        />
        <UButton
          v-if="isDm"
          label="Player view"
          icon="i-lucide-eye"
          color="neutral"
          variant="outline"
          class="rounded-xl"
          @click="playerPreview = true"
        />
        <UButton
          v-if="isDm"
          label="Cast"
          icon="i-lucide-cast"
          color="neutral"
          variant="outline"
          class="rounded-xl"
          @click="castThis"
        />
        <UTooltip
          v-if="canWrite && entity.type === 'monster'"
          :text="isFavourite ? 'Out of the favourites' : 'A favourite — first in every monster search'"
        >
          <UButton
            :icon="isFavourite ? 'i-lucide-star' : 'i-lucide-star-off'"
            :color="isFavourite ? 'warning' : 'neutral'"
            :variant="isFavourite ? 'soft' : 'outline'"
            class="rounded-xl"
            :aria-label="isFavourite ? 'Remove from favourites' : 'Add to favourites'"
            :loading="starring"
            @click="toggleFavourite"
          />
        </UTooltip>
        <UButton
          v-if="canWrite"
          label="Variant"
          icon="i-lucide-copy-plus"
          color="neutral"
          variant="outline"
          class="rounded-xl"
          :loading="duplicating"
          @click="makeVariant"
        />
        <UButton
          v-if="canWrite"
          label="Edit"
          icon="i-lucide-pencil"
          class="rounded-xl"
          :to="`/entities/${entity.id}/edit`"
        />
      </template>
    </template>

    <div
      v-if="loading"
      class="space-y-4"
    >
      <USkeleton class="h-40 rounded-2xl" />
      <USkeleton class="h-64 rounded-2xl" />
    </div>

    <EmptyState
      v-else-if="missing || !entity"
      icon="i-lucide-ghost"
      title="Not found"
      description="It may have been deleted, or it isn't shared with you."
    >
      <UButton
        label="Back to entities"
        color="neutral"
        variant="outline"
        class="rounded-xl"
        to="/entities"
      />
    </EmptyState>

    <!-- Locations run one full-width column: the map is the centrepiece and
       a sidebar would squeeze it. Everything else keeps the two columns. -->
    <div
      v-else
      :class="entity.type === 'location' ? 'space-y-4' : 'grid gap-4 lg:grid-cols-3'"
    >
      <!-- Main column -->
      <div
        class="space-y-4"
        :class="entity.type !== 'location' && 'lg:col-span-2'"
      >
        <ContentCard>
          <div class="flex flex-wrap items-start gap-4">
            <button
              v-if="entity.image_url"
              type="button"
              class="shrink-0 cursor-zoom-in"
              aria-label="View cover full size"
              @click="headerLightbox = true"
            >
              <img
                :src="mediaUrl(entity.image_url)"
                :alt="entity.name"
                class="size-24 rounded-2xl object-cover"
                :style="coverFocusStyle"
              >
            </button>
            <span
              v-else
              class="flex size-24 items-center justify-center rounded-2xl bg-primary/10 text-primary"
            >
              <UIcon
                :name="meta!.icon"
                class="size-10"
              />
            </span>

            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  :label="meta!.label"
                  :icon="meta!.icon"
                  color="neutral"
                  variant="subtle"
                />
                <VisibilityBadge
                  v-if="isDm"
                  :visibility="entity.visibility"
                />
              </div>

              <h2 class="mt-2 text-xl font-semibold text-highlighted">
                {{ entity.name }}
              </h2>
              <p
                v-if="entity.summary"
                class="mt-1 text-muted"
              >
                {{ entity.summary }}
              </p>

              <div
                v-if="entity.tags.length"
                class="mt-2 flex flex-wrap gap-1"
              >
                <UBadge
                  v-for="tag in entity.tags"
                  :key="tag"
                  :label="tag"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                />
              </div>

              <!-- Structured fields for this type, only the ones that are filled -->
              <dl
                v-if="filledFields.length"
                class="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2"
              >
                <div
                  v-for="field in filledFields"
                  :key="field.key"
                  class="flex items-baseline gap-2 text-sm"
                >
                  <dt class="shrink-0 text-muted">
                    {{ field.label }}
                  </dt>
                  <!-- Capitalise the fixed vocabularies ("alive", "rare"),
                       never the free text — it mangles a sentence -->
                  <dd
                    class="min-w-0 truncate font-medium text-highlighted"
                    :class="field.options && 'capitalize'"
                  >
                    {{ field.value }}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </ContentCard>

        <!-- Only for the things a world is actually built out of. A magic
             sword has an owner, not a location it belongs inside. -->
        <!-- Maps place too: the cave's floor plan belongs inside the cave,
           where the place page can offer it back with a thumbnail -->
        <EntityPlacement
          v-if="['location', 'scene', 'encounter', 'map'].includes(entity.type)"
          :entity="entity"
          :can-edit="isDm"
          :slim="entity.type === 'location'"
          @changed="load"
        />

        <!-- The way down: what stands inside this place, maps first -->
        <ContentCard
          v-if="placeContents"
          title="In this place"
          icon="i-lucide-map-pinned"
          :description="placeContents.total
            ? 'Click through to walk down the world — kingdom to region to the cave you need.'
            : 'Nothing here yet. Open a place or a map and “Place it” inside this one.'"
        >
          <template #actions>
            <UButton
              v-if="canWrite"
              :label="mapImageOf(entity) ? 'Change the map' : 'Add a map'"
              icon="i-lucide-map"
              color="neutral"
              variant="outline"
              size="sm"
              @click="addMapOpen = true"
            />
          </template>
          <div
            v-if="placeContents.maps.length"
            class="mb-3 flex flex-wrap gap-2"
          >
            <NuxtLink
              v-for="map in placeContents.maps"
              :key="map.id"
              :to="`/entities/${map.id}`"
              class="group w-36"
            >
              <img
                v-if="map.image_url"
                :src="mediaUrl(map.image_url)!"
                :alt="map.name"
                class="h-20 w-36 rounded-lg border border-default object-cover transition-colors group-hover:border-primary/60"
              >
              <div
                v-else
                class="flex h-20 w-36 items-center justify-center rounded-lg border border-default"
              >
                <UIcon
                  name="i-lucide-map"
                  class="size-6 text-dimmed"
                />
              </div>
              <p class="mt-1 truncate text-xs font-medium text-highlighted group-hover:text-primary">
                {{ map.name }}
              </p>
            </NuxtLink>
          </div>

          <div
            v-for="group in placeContents.placeGroups"
            :key="group.kind"
            class="mb-2 last:mb-0"
          >
            <p class="mb-1 text-xs font-medium tracking-wide text-dimmed uppercase">
              {{ group.kind }}
              <span class="tabular-nums">{{ group.links.length > 1 ? group.links.length : '' }}</span>
            </p>
            <div class="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              <UButton
                v-for="place in group.links"
                :key="place.id"
                :label="place.name"
                icon="i-lucide-map-pin"
                size="xs"
                color="neutral"
                variant="outline"
                :to="`/entities/${place.id}`"
              />
            </div>
          </div>

          <div
            v-for="group in placeContents.restGroups"
            :key="group.type"
            class="mb-2 last:mb-0"
          >
            <p class="mb-1 flex items-center gap-1.5 text-xs font-medium tracking-wide text-dimmed uppercase">
              <UIcon
                :name="group.meta.icon"
                class="size-3.5"
              />
              {{ group.links.length > 1 ? group.meta.plural : group.meta.label }}
              <span class="tabular-nums">{{ group.links.length > 1 ? group.links.length : '' }}</span>
            </p>
            <div class="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              <UButton
                v-for="link in group.links"
                :key="link.id"
                :label="link.name"
                :icon="group.meta.icon"
                size="xs"
                color="neutral"
                variant="outline"
                :to="`/entities/${link.id}`"
              />
            </div>
          </div>
        </ContentCard>

        <EncounterPrep
          v-if="entity.type === 'encounter'"
          :key="`prep-${entity.id}`"
          :entity="entity"
          :can-edit="isDm"
        />

        <!-- Any place with a map picture gets the full board: pins, fog,
           casting. Map-type entities are the legacy spelling of the same. -->
        <MapViewer
          v-if="entity.type === 'map' || mapImageOf(entity)"
          :key="`map-${entity.id}`"
          :entity="entity"
          :can-edit="isDm"
        />

        <CharacterSheet
          v-if="entity.type === 'character'"
          :key="entity.id"
          :entity="entity"
          :can-edit="canWrite"
        />

        <ContentCard v-if="entity.body">
          <MarkdownBody
            :body="entity.body"
            :linked="entity.links"
            :editable="canWrite"
            @toggle-task="toggleTask"
          />
        </ContentCard>

        <!-- The DM's half. It arrives only on a DM's request, but the guard
             keeps the intent obvious to whoever reads this next. -->
        <ContentCard
          v-if="isDm && (dmNotes || playersThink)"
          title="Behind the curtain"
          icon="i-lucide-eye-off"
          description="Players never see this."
        >
          <div class="space-y-4">
            <div
              v-if="playersThink"
              class="rounded-xl border border-default p-3"
            >
              <p class="text-xs font-medium uppercase tracking-wide text-dimmed">
                The party believes
              </p>
              <p class="mt-1 text-sm text-toned">
                {{ playersThink }}
              </p>
            </div>

            <MarkdownBody
              v-if="dmNotes"
              :body="dmNotes"
              :linked="entity.links"
            />
          </div>
        </ContentCard>

        <SceneFlow
          v-if="entity.type === 'scene'"
          :entity="entity"
          :can-edit="canWrite"
          @changed="load"
        />

        <EntityGallery
          v-if="canWrite"
          :entity="entity"
          @cover-changed="url => (entity!.image_url = url)"
          @focus-changed="point => (entity!.data = { ...entity!.data, cover_focus: point })"
        />

        <PlayerPreview
          v-if="isDm"
          v-model:open="playerPreview"
          :entity="entity"
        />

        <AddMapToPlace
          v-if="entity.type === 'location'"
          v-model:open="addMapOpen"
          :entity="entity"
          @changed="load"
        />

        <ImageLightbox
          v-if="entity.image_url"
          v-model:open="headerLightbox"
          :src="mediaUrl(entity.image_url)!"
          :caption="entity.name"
        />
      </div>

      <!-- Connections column. On location pages it isn't a column at all:
         links and mentions fold behind one quiet toggle, shown only when
         they have something to say. -->
      <div class="space-y-4">
        <button
          v-if="entity.type === 'location' && hasConnections"
          type="button"
          class="flex items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-highlighted"
          @click="connectionsOpen = !connectionsOpen"
        >
          <UIcon
            :name="connectionsOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            class="size-4"
          />
          Links & mentions
          <span class="tabular-nums text-dimmed">{{ entity.links.length + mentionCount }}</span>
        </button>

        <div
          v-if="entity.type !== 'location' || (hasConnections && connectionsOpen)"
          class="space-y-4"
          :class="entity.type === 'location' && 'lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0'"
        >
          <ContentCard
            title="Links"
            icon="i-lucide-link"
            :description="entity.links.length ? undefined : 'Write [[Name]] in the body to link.'"
          >
            <ul
              v-if="entity.links.length"
              class="space-y-1"
            >
              <li
                v-for="link in entity.links"
                :key="`${link.id}-${link.relation}`"
              >
                <NuxtLink
                  :to="`/entities/${link.id}`"
                  class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-elevated"
                >
                  <UIcon
                    :name="entityTypeMeta(link.type).icon"
                    class="size-4 shrink-0 text-muted"
                  />
                  <span class="truncate text-sm font-medium text-highlighted">{{ link.name }}</span>
                  <span class="ml-auto shrink-0 text-xs text-dimmed">
                    {{ RELATION_LABELS[link.relation] }}
                  </span>
                </NuxtLink>
              </li>
            </ul>
          </ContentCard>

          <ContentCard
            title="Mentioned in"
            icon="i-lucide-corner-down-left"
            :description="entity.backlinks.length
              ? `${entity.backlinks.length} ${entity.backlinks.length === 1 ? 'entry mentions' : 'entries mention'} this.`
              : 'Nothing links here yet.'"
          >
            <div
              v-if="backlinkGroups.length"
              class="space-y-3"
            >
              <div
                v-for="group in backlinkGroups"
                :key="group.type"
              >
                <p class="mb-1 flex items-center gap-1.5 px-2 text-xs font-medium uppercase tracking-wide text-dimmed">
                  <UIcon
                    :name="group.meta.icon"
                    class="size-3.5"
                  />
                  {{ group.links.length > 1 ? group.meta.plural : group.meta.label }}
                  <span class="tabular-nums">{{ group.links.length }}</span>
                </p>
                <ul class="space-y-0.5">
                  <li
                    v-for="link in group.links"
                    :key="`${link.id}-${link.relation}`"
                  >
                    <NuxtLink
                      :to="`/entities/${link.id}`"
                      class="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-elevated"
                    >
                      <span class="truncate text-sm font-medium text-highlighted">{{ link.name }}</span>
                      <VisibilityBadge
                        v-if="isDm && link.visibility === 'dm_only'"
                        :visibility="link.visibility"
                        class="ml-auto shrink-0"
                      />
                    </NuxtLink>
                  </li>
                </ul>
              </div>
            </div>
          </ContentCard>
        </div>

        <ContentCard
          v-if="isDm && entity.unresolved_links.length"
          title="Unresolved"
          icon="i-lucide-unlink"
          description="Mentioned in the body, but no entity exists yet."
        >
          <ul class="space-y-1">
            <li
              v-for="name in entity.unresolved_links"
              :key="name"
              class="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5"
            >
              <span class="truncate text-sm text-toned">{{ name }}</span>
              <UButton
                label="Create"
                size="xs"
                color="neutral"
                variant="outline"
                :to="`/entities/new?name=${encodeURIComponent(name)}`"
              />
            </li>
          </ul>
        </ContentCard>

        <ContentCard v-if="isDm">
          <UButton
            label="Delete"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            block
            @click="destroy"
          />
        </ContentCard>
      </div>
    </div>
  </AppPage>
</template>
