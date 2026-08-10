<script setup lang="ts">
const route = useRoute()
const toast = useToast()
const { isDm } = useCampaigns()

/** Did whoever sent us here already decide what this is? */
const typeFromUrl = ENTITY_TYPES.some(t => t.value === route.query.type)

const type = ref<EntityType>(typeFromUrl ? (route.query.type as EntityType) : 'npc')

// A player only ever creates their own character
if (!isDm.value) {
  type.value = 'character'
}

const meta = computed(() => entityTypeMeta(type.value))

// 'map' is not offered: a map is an attribute of a location ("Add a map" on
// the place's page), not a thing you create on its own
const typeItems = ENTITY_TYPES.filter(option => option.value !== 'map').map(option => ({
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
    <!-- Only when nobody has said what this is. Arriving from "New NPC" the
         type is settled, and a picker repeating it in the corner is a control
         that answers a question you didn't ask. -->
    <template
      v-if="isDm && !typeFromUrl"
      #actions
    >
      <USelectMenu
        v-model="type"
        :items="typeItems"
        value-key="value"
        :icon="meta.icon"
        class="w-44"
      />
    </template>

    <ContentCard class="max-w-5xl">
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
