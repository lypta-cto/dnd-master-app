<script setup lang="ts">
const route = useRoute()
const toast = useToast()
const entities = useEntities()

const entity = ref<EntityDetail | null>(null)
const loading = ref(true)

onMounted(async () => {
  try {
    entity.value = await entities.read(String(route.params.id))
  } finally {
    loading.value = false
  }
})

const meta = computed(() => (entity.value ? entityTypeMeta(entity.value.type) : null))

async function onSaved(saved: EntityDetail) {
  toast.add({ title: 'Saved', icon: 'i-lucide-circle-check', color: 'success' })
  await navigateTo(`/entities/${saved.id}`)
}
</script>

<template>
  <AppPage
    :title="entity ? `Edit ${entity.name}` : 'Edit'"
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: meta?.plural ?? 'Entities', to: entity ? `/entities?type=${entity.type}` : '/entities' },
      { label: entity?.name ?? '…', to: entity ? `/entities/${entity.id}` : undefined },
      { label: 'Edit' }
    ]"
  >
    <USkeleton
      v-if="loading"
      class="h-96 rounded-2xl"
    />

    <EmptyState
      v-else-if="!entity"
      icon="i-lucide-ghost"
      title="Not found"
    />

    <ContentCard v-else>
      <EntityForm
        :entity="entity"
        :type="entity.type"
        @saved="onSaved"
      >
        <template #secondary>
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :to="`/entities/${entity.id}`"
          />
        </template>
      </EntityForm>
    </ContentCard>
  </AppPage>
</template>
