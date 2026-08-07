<script setup lang="ts">
/**
 * Where a scene can go next.
 *
 * This is the campaign's flowchart, and it's a real `leads_to` link rather than
 * a list of names in a field — so the destination knows what leads into it, and
 * renaming a scene carries the arrow along. A scene with no way out is the
 * thing that stalls a table, so an empty list says so plainly.
 */
const props = defineProps<{
  entity: EntityDetail
  canEdit: boolean
}>()

const emit = defineEmits<{
  changed: []
}>()

const toast = useToast()
const entities = useEntities()

const options = ref<EntitySummary[]>([])
const picking = ref(false)
const busy = ref(false)

const next = computed(() => props.entity.links.filter(link => link.relation === 'leads_to'))
const from = computed(() => props.entity.backlinks.filter(link => link.relation === 'leads_to'))

/** Every other scene, minus the ones already wired up */
const available = computed(() => {
  const taken = new Set([props.entity.id, ...next.value.map(link => link.id)])
  return options.value.filter(scene => !taken.has(scene.id))
})

async function startPicking() {
  picking.value = true
  if (!options.value.length) {
    options.value = (await entities.list({ type: 'scene', page_size: 100 })).items
  }
}

async function addNext(scene: EntitySummary) {
  busy.value = true
  try {
    await entities.link(props.entity.id, scene.id, 'leads_to')
    picking.value = false
    emit('changed')
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = false
  }
}

async function removeNext(scene: LinkedEntity) {
  busy.value = true
  try {
    await entities.unlink(props.entity.id, scene.id)
    emit('changed')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ContentCard
    title="Where it goes"
    icon="i-lucide-git-branch"
    description="The ways out of this scene. Players pick one; you prepped all of them."
  >
    <template #actions>
      <UButton
        v-if="canEdit"
        label="Add a way out"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        size="sm"
        :loading="busy"
        @click="startPicking"
      />
    </template>

    <div class="space-y-4">
      <div v-if="from.length">
        <p class="mb-1 text-xs font-medium uppercase tracking-wide text-dimmed">
          Reached from
        </p>
        <div class="flex flex-wrap gap-1.5">
          <NuxtLink
            v-for="scene in from"
            :key="scene.id"
            :to="`/entities/${scene.id}`"
          >
            <UBadge
              :label="scene.name"
              color="neutral"
              variant="subtle"
              size="lg"
            />
          </NuxtLink>
        </div>
      </div>

      <div>
        <p class="mb-1 text-xs font-medium uppercase tracking-wide text-dimmed">
          Leads to
        </p>

        <div
          v-if="next.length"
          class="flex flex-wrap gap-1.5"
        >
          <span
            v-for="scene in next"
            :key="scene.id"
            class="flex items-center gap-1 rounded-lg border border-default py-0.5 pl-2 pr-0.5"
          >
            <NuxtLink
              :to="`/entities/${scene.id}`"
              class="text-sm text-toned hover:text-primary"
            >
              {{ scene.name }}
            </NuxtLink>
            <UButton
              v-if="canEdit"
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              :aria-label="`Remove ${scene.name}`"
              @click="removeNext(scene)"
            />
          </span>
        </div>

        <p
          v-else
          class="text-sm text-muted"
        >
          Nowhere yet — a scene without an exit is where an evening stalls.
        </p>
      </div>
    </div>

    <UModal
      v-model:open="picking"
      title="Where can this go?"
      description="Pick the scene the party might reach from here."
    >
      <template #body>
        <p
          v-if="!available.length"
          class="text-sm text-muted"
        >
          No other scenes yet. Create one first.
        </p>

        <div
          v-else
          class="space-y-1"
        >
          <button
            v-for="scene in available"
            :key="scene.id"
            type="button"
            class="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-elevated"
            @click="addNext(scene)"
          >
            <UIcon
              name="i-lucide-clapperboard"
              class="mt-0.5 size-4 shrink-0 text-muted"
            />
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium text-highlighted">{{ scene.name }}</span>
              <span
                v-if="scene.summary"
                class="block truncate text-xs text-muted"
              >{{ scene.summary }}</span>
            </span>
          </button>
        </div>
      </template>
    </UModal>
  </ContentCard>
</template>
