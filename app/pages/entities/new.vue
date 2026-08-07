<script setup lang="ts">
const route = useRoute()
const toast = useToast()
const { isDm } = useCampaigns()

const type = ref<EntityType>(
  ENTITY_TYPES.some(t => t.value === route.query.type)
    ? (route.query.type as EntityType)
    : 'npc'
)

// A player only ever creates their own character
if (!isDm.value) {
  type.value = 'character'
}

const meta = computed(() => entityTypeMeta(type.value))

async function onSaved(entity: EntityDetail) {
  toast.add({ title: `“${entity.name}” created`, icon: meta.value.icon, color: 'success' })
  await navigateTo(`/entities/${entity.id}`)
}
</script>

<template>
  <AppPage
    :title="`New ${meta.label}`"
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: meta.plural, to: `/entities?type=${type}` },
      { label: 'New' }
    ]"
  >
    <ContentCard>
      <div class="mb-5 flex flex-wrap gap-1.5">
        <UButton
          v-for="option in (isDm ? ENTITY_TYPES : ENTITY_TYPES.filter(t => t.value === 'character'))"
          :key="option.value"
          :label="option.label"
          :icon="option.icon"
          size="sm"
          class="rounded-lg"
          :color="type === option.value ? 'primary' : 'neutral'"
          :variant="type === option.value ? 'solid' : 'outline'"
          @click="type = option.value"
        />
      </div>

      <!-- Re-key on type so switching resets defaults cleanly -->
      <EntityForm
        :key="type"
        :type="type"
        :initial-name="typeof route.query.name === 'string' ? route.query.name : undefined"
        @saved="onSaved"
      />
    </ContentCard>
  </AppPage>
</template>
