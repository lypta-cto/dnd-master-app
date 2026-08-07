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
</script>

<template>
  <AppPage
    :title="title"
    :description="current ? `Everything in ${current.name}.` : 'Select a campaign first.'"
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: title }
    ]"
  >
    <template #actions>
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
        :title="`No ${title.toLowerCase()} yet`"
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
          />
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
