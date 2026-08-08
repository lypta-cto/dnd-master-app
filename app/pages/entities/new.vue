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

const typeItems = ENTITY_TYPES.map(option => ({
  value: option.value,
  label: option.label,
  icon: option.icon
}))

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
    <!-- The type is already in the title and the breadcrumb; thirteen buttons
         saying it again were the first thing the eye landed on and the last
         thing that mattered. A picker for the rare case of changing your mind. -->
    <template #actions>
      <USelectMenu
        v-if="isDm"
        v-model="type"
        :items="typeItems"
        value-key="value"
        :icon="meta.icon"
        class="w-44"
      />
    </template>

    <ContentCard>
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
