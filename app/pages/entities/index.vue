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

async function load() {
  if (!current.value) {
    loading.value = false
    return
  }

  loading.value = true

  try {
    pageData.value = await entities.list({
      type: type.value,
      page: page.value,
      page_size: 24
    })
  } finally {
    loading.value = false
  }
}

// Type switch resets pagination; campaign switch reloads everything
watch([type, () => current.value?.id], () => {
  page.value = 1
  load()
}, { immediate: true })

watch(page, load)

const title = computed(() => meta.value?.plural ?? 'All entities')

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

// Leaving the page or switching type shouldn't strand a half-made selection
watch([type, () => current.value?.id], () => {
  selecting.value = false
  selected.value = []
})
</script>

<template>
  <AppPage
    :title="title"
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
        <div class="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
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
