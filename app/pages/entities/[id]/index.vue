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

const RELATION_LABELS: Record<LinkRelation, string> = {
  mentions: 'Mentions',
  member_of: 'Member of',
  located_in: 'Located in',
  owns: 'Owns',
  related_to: 'Related to'
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
          label="Cast"
          icon="i-lucide-cast"
          color="neutral"
          variant="outline"
          class="rounded-xl"
          @click="castThis"
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

    <div
      v-else
      class="grid gap-4 lg:grid-cols-3"
    >
      <!-- Main column -->
      <div class="space-y-4 lg:col-span-2">
        <ContentCard>
          <div class="flex flex-wrap items-start gap-4">
            <img
              v-if="entity.image_url"
              :src="mediaUrl(entity.image_url)"
              :alt="entity.name"
              class="size-24 rounded-2xl object-cover"
            >
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
                  <dd class="min-w-0 truncate font-medium capitalize text-highlighted">
                    {{ field.value }}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </ContentCard>

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
          />
        </ContentCard>

        <EntityGallery
          v-if="isDm"
          :entity="entity"
          @cover-changed="url => (entity!.image_url = url)"
        />
      </div>

      <!-- Connections column -->
      <div class="space-y-4">
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
          :description="entity.backlinks.length ? undefined : 'Nothing links here yet.'"
        >
          <ul
            v-if="entity.backlinks.length"
            class="space-y-1"
          >
            <li
              v-for="link in entity.backlinks"
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
              </NuxtLink>
            </li>
          </ul>
        </ContentCard>

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
