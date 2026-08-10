<script setup lang="ts">
/**
 * Where this sits in the world, and what sits inside it.
 *
 * The world is built downward — a region, then the town in it, then the room
 * the scene happens in — so containment is a single link pointing up rather
 * than a list pointing down. One parent, always: a town in two regions isn't
 * a richer model, it's a question nobody can answer at the table.
 *
 * The chain comes from the API already assembled, so this draws a breadcrumb
 * without walking it a request at a time.
 */
const props = defineProps<{
  entity: EntityDetail
  canEdit: boolean
}>()

const emit = defineEmits<{ changed: [] }>()

const toast = useToast()
const entities = useEntities()

const meta = computed(() => entityTypeMeta(props.entity.type))

/** The direct parent, if any — the last link of the chain the API sent */
const parent = computed(
  () => props.entity.links.find(link => link.relation === 'located_in') ?? null
)

/** What sits inside this, split so places and scenes don't share a list */
const contents = computed(() => {
  // A location's contents live in the page's own "In this place" card, with
  // maps and grouping this footnote never had — listing them here too would
  // say it twice. Scenes and encounters keep the inline version.
  if (props.entity.type === 'location') {
    return { places: [], happenings: [] }
  }

  const inside = props.entity.backlinks.filter(link => link.relation === 'located_in')
  return {
    places: inside.filter(item => item.type === 'location'),
    happenings: inside.filter(item => item.type !== 'location')
  }
})

const busy = ref(false)

/* --- Picking a parent ------------------------------------------------------ */

const picker = reactive({
  open: false,
  query: '',
  results: [] as EntitySummary[]
})

let searchTimer: ReturnType<typeof setTimeout> | undefined

/**
 * The list filter, not the campaign search.
 *
 * Search is ranked full text over whole bodies — it answers "where is this
 * mentioned", and it won't match "Barov" against "Barovija" at all, because
 * it matches words rather than prefixes. Here the DM is naming a place they
 * already made, so a contains-match over the names of locations is both the
 * right question and the one that folds diacritics.
 */
watch(() => picker.query, (q) => {
  clearTimeout(searchTimer)

  if (!q.trim()) {
    picker.results = []
    return
  }

  searchTimer = setTimeout(async () => {
    const page = await entities.list({ type: 'location', q: q.trim(), page_size: 12 })
    // Nothing may contain itself
    picker.results = page.items.filter(item => item.id !== props.entity.id)
  }, 250)
})

onBeforeUnmount(() => clearTimeout(searchTimer))

async function place(target: EntitySummary) {
  busy.value = true

  try {
    // Replace rather than add: the old parent has to go first, or the entity
    // ends up in two places and the breadcrumb picks one at random.
    if (parent.value) {
      await entities.unlink(props.entity.id, parent.value.id)
    }
    await entities.link(props.entity.id, target.id, 'located_in')

    picker.open = false
    picker.query = ''
    emit('changed')
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = false
  }
}

async function detach() {
  if (!parent.value) {
    return
  }
  busy.value = true

  try {
    await entities.unlink(props.entity.id, parent.value.id)
    emit('changed')
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ContentCard
    title="In the world"
    icon="i-lucide-map-pinned"
    :description="entity.ancestors.length || contents.places.length || contents.happenings.length
      ? undefined
      : 'Put this somewhere, and everything you write under it inherits the place.'"
  >
    <template
      v-if="canEdit"
      #actions
    >
      <UButton
        :label="parent ? 'Move' : 'Place it'"
        icon="i-lucide-map-pinned"
        color="neutral"
        variant="outline"
        size="sm"
        @click="picker.open = true"
      />
    </template>

    <div class="space-y-4">
      <!-- The chain upward, outermost first -->
      <div
        v-if="entity.ancestors.length"
        class="flex flex-wrap items-center gap-1.5 text-sm"
      >
        <template
          v-for="(step, index) in entity.ancestors"
          :key="step.id"
        >
          <UIcon
            v-if="index"
            name="i-lucide-chevron-right"
            class="size-3.5 shrink-0 text-dimmed"
          />
          <NuxtLink
            :to="`/entities/${step.id}`"
            class="flex items-center gap-1.5 text-muted hover:text-primary"
          >
            <UIcon
              :name="entityTypeMeta(step.type).icon"
              class="size-3.5"
            />
            {{ step.name }}
          </NuxtLink>
        </template>

        <UIcon
          name="i-lucide-chevron-right"
          class="size-3.5 shrink-0 text-dimmed"
        />
        <span class="flex items-center gap-1.5 font-medium text-highlighted">
          <UIcon
            :name="meta.icon"
            class="size-3.5"
          />
          {{ entity.name }}
        </span>

        <UButton
          v-if="canEdit"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          :loading="busy"
          aria-label="Take it out of there"
          @click="detach"
        />
      </div>

      <p
        v-else-if="canEdit"
        class="text-sm text-muted"
      >
        Not placed anywhere yet.
      </p>

      <!-- Standing somewhere with a map means this can stand ON the map.
         The component hides itself when the parent has no mapped map. -->
      <PinOnParentMap
        v-if="canEdit && parent"
        :entity="entity"
        :parent-id="parent.id"
        :parent-name="parent.name"
      />

      <!-- What's inside -->
      <div
        v-if="contents.places.length"
        class="space-y-1.5"
      >
        <p class="text-xs font-medium uppercase tracking-wide text-dimmed">
          Places inside
        </p>
        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-for="inner in contents.places"
            :key="inner.id"
            :label="inner.name"
            :icon="entityTypeMeta(inner.type).icon"
            color="neutral"
            variant="soft"
            size="xs"
            :to="`/entities/${inner.id}`"
          />
        </div>
      </div>

      <div
        v-if="contents.happenings.length"
        class="space-y-1.5"
      >
        <p class="text-xs font-medium uppercase tracking-wide text-dimmed">
          Happens here
        </p>
        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-for="item in contents.happenings"
            :key="item.id"
            :label="item.name"
            :icon="entityTypeMeta(item.type).icon"
            color="neutral"
            variant="soft"
            size="xs"
            :to="`/entities/${item.id}`"
          />
        </div>
      </div>
    </div>

    <UModal
      v-model:open="picker.open"
      title="Where is it?"
      description="Search the places you've already made."
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <div class="space-y-3">
          <UInput
            v-model="picker.query"
            icon="i-lucide-search"
            placeholder="Barovia, Vallaki…"
            autofocus
            class="w-full"
          />

          <div
            v-if="picker.results.length"
            class="space-y-1"
          >
            <button
              v-for="hit in picker.results"
              :key="hit.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-elevated"
              :disabled="busy"
              @click="place(hit)"
            >
              <UIcon
                :name="entityTypeMeta(hit.type).icon"
                class="size-4 shrink-0"
              />
              <span class="truncate">{{ hit.name }}</span>
              <span
                v-if="hit.data.kind"
                class="ml-auto shrink-0 text-xs capitalize text-dimmed"
              >{{ hit.data.kind }}</span>
            </button>
          </div>

          <p
            v-else-if="picker.query.trim()"
            class="text-sm text-muted"
          >
            No places match. Make the region or town first, then come back.
          </p>
        </div>
      </template>
    </UModal>
  </ContentCard>
</template>
