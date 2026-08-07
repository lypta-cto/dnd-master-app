<script setup lang="ts">
const { current, isDm, campaigns } = useCampaigns()
const { user } = useAuth()
const entities = useEntities()

const creating = ref(false)
const loading = ref(true)

const sessions = ref<EntitySummary[]>([])
const quests = ref<EntitySummary[]>([])
const characters = ref<EntitySummary[]>([])
const counts = ref<Partial<Record<EntityType, number>>>({})
const latestRecap = ref<EntityDetail | null>(null)

/** Newest played session and the next planned one — the story's "now" */
const lastPlayed = computed(() =>
  sortSessions(sessions.value.filter(s => s.data.status !== 'planned'))[0] ?? null
)
const nextPlanned = computed(() =>
  sortSessions(sessions.value.filter(s => s.data.status === 'planned')).at(-1) ?? null
)

const activeQuests = computed(() =>
  quests.value.filter(q => (q.data.status ?? 'active') === 'active')
)

async function loadOverview() {
  if (!current.value) {
    loading.value = false
    return
  }

  loading.value = true

  try {
    const [sessionPage, questPage, characterPage, ...perType] = await Promise.all([
      entities.list({ type: 'session', page_size: 100 }),
      entities.list({ type: 'quest', page_size: 100 }),
      entities.list({ type: 'character', page_size: 20 }),
      ...ENTITY_TYPES.map(t => entities.list({ type: t.value, page_size: 1 }))
    ])

    sessions.value = sessionPage.items
    quests.value = questPage.items
    // Your own character reads first — for a player it's the point of the page
    characters.value = [...characterPage.items].sort((a, b) =>
      Number(b.owner_id === user.value?.id) - Number(a.owner_id === user.value?.id)
    )
    counts.value = Object.fromEntries(
      ENTITY_TYPES.map((t, index) => [t.value, perType[index]!.total])
    )

    // The recap body isn't in the summary — one extra read for the headline card
    latestRecap.value = lastPlayed.value ? await entities.read(lastPlayed.value.id) : null
  } finally {
    loading.value = false
  }
}

watch(() => current.value?.id, loadOverview, { immediate: true })

const QUEST_STATUS_COLORS = {
  active: 'primary',
  completed: 'success',
  failed: 'error',
  paused: 'neutral'
} as const

const QUEST_STATUSES = ['active', 'completed', 'failed', 'paused'] as const

/** Close a thread without leaving the dashboard */
async function setQuestStatus(quest: EntitySummary, status: string) {
  await entities.update(quest.id, { data: { ...quest.data, status } })
  quest.data = { ...quest.data, status }
  quests.value = [...quests.value]
}

function questStatusItems(quest: EntitySummary) {
  return QUEST_STATUSES.map(status => ({
    label: status,
    type: 'checkbox' as const,
    checked: (quest.data.status ?? 'active') === status,
    onSelect: () => setQuestStatus(quest, status)
  }))
}

/** The session happened — flip it and the recap card follows */
async function markPlayed(session: EntitySummary) {
  await entities.update(session.id, { data: { ...session.data, status: 'played' } })
  session.data = { ...session.data, status: 'played' }
  sessions.value = [...sessions.value]
  latestRecap.value = await entities.read(session.id)
}

function sessionLabel(session: EntitySummary) {
  const number = session.data.number ? `Session ${session.data.number}` : session.name
  const date = session.data.date ? ` · ${session.data.date}` : ''
  return `${number}${date}`
}
</script>

<template>
  <AppPage
    :title="current?.name ?? 'Dashboard'"
    :description="current?.summary ?? 'Your campaigns at a glance.'"
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: current?.name ?? 'Dashboard' }
    ]"
  >
    <template #actions>
      <template v-if="isDm && current">
        <UButton
          label="New session"
          icon="i-lucide-calendar-plus"
          color="neutral"
          variant="outline"
          class="rounded-xl"
          to="/entities/new?type=session"
        />
        <UButton
          label="New entity"
          icon="i-lucide-plus"
          class="rounded-xl"
          to="/entities/new"
        />
      </template>
    </template>

    <!-- No campaign at all yet -->
    <EmptyState
      v-if="!current && !campaigns.length"
      icon="i-lucide-swords"
      title="No campaigns yet"
      description="A campaign holds everything — NPCs, locations, quests, sessions — searchable and linked."
    >
      <UButton
        label="Create your first campaign"
        icon="i-lucide-plus"
        class="rounded-xl"
        @click="creating = true"
      />
    </EmptyState>

    <template v-else>
      <div
        v-if="loading"
        class="grid gap-4 lg:grid-cols-3"
      >
        <USkeleton class="h-64 rounded-2xl lg:col-span-2" />
        <USkeleton class="h-64 rounded-2xl" />
      </div>

      <template v-else>
        <!-- ═══ The story, front and centre ═══ -->
        <div class="grid gap-4 lg:grid-cols-3">
          <!-- Latest recap -->
          <ContentCard
            class="lg:col-span-2"
            :title="lastPlayed ? sessionLabel(lastPlayed) : 'The story so far'"
            icon="i-lucide-book-open"
            :description="lastPlayed ? 'Last time at the table' : undefined"
          >
            <template
              v-if="lastPlayed"
              #actions
            >
              <UButton
                label="Open"
                color="neutral"
                variant="ghost"
                size="sm"
                trailing-icon="i-lucide-arrow-right"
                :to="`/entities/${lastPlayed.id}`"
              />
            </template>

            <MarkdownBody
              v-if="latestRecap?.body"
              :body="latestRecap.body"
              :linked="latestRecap.links"
              class="line-clamp-[12]"
            />
            <p
              v-else-if="lastPlayed"
              class="text-sm text-muted"
            >
              {{ lastPlayed.summary || 'No recap written yet — open the session and tell the tale.' }}
            </p>
            <div
              v-else
              class="py-6 text-center"
            >
              <p class="text-sm text-muted">
                No sessions recorded yet. The campaign's story starts with the first one.
              </p>
              <UButton
                v-if="isDm"
                label="Record the first session"
                icon="i-lucide-calendar-plus"
                variant="subtle"
                class="mt-3 rounded-xl"
                to="/entities/new?type=session"
              />
            </div>
          </ContentCard>

          <!-- Right column: next session + party -->
          <div class="space-y-4">
            <ContentCard
              title="Next session"
              icon="i-lucide-calendar-clock"
            >
              <div v-if="nextPlanned">
                <NuxtLink
                  :to="`/entities/${nextPlanned.id}`"
                  class="group block"
                >
                  <p class="font-medium text-highlighted group-hover:text-primary">
                    {{ sessionLabel(nextPlanned) }}
                  </p>
                  <p class="mt-1 line-clamp-3 text-sm text-muted">
                    {{ nextPlanned.summary || 'Prep lives inside — open it.' }}
                  </p>
                </NuxtLink>
                <UButton
                  v-if="isDm"
                  label="Mark played"
                  icon="i-lucide-check"
                  color="neutral"
                  variant="outline"
                  size="xs"
                  class="mt-2"
                  @click="markPlayed(nextPlanned)"
                />
              </div>
              <p
                v-else
                class="text-sm text-muted"
              >
                Nothing planned.
                <NuxtLink
                  v-if="isDm"
                  to="/entities/new?type=session"
                  class="font-medium text-primary"
                >Plan one</NuxtLink>
              </p>
            </ContentCard>

            <ContentCard
              title="The party"
              icon="i-lucide-users-round"
            >
              <ul
                v-if="characters.length"
                class="space-y-1"
              >
                <li
                  v-for="member in characters"
                  :key="member.id"
                >
                  <NuxtLink
                    :to="`/entities/${member.id}`"
                    class="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-elevated"
                  >
                    <span class="flex min-w-0 items-center gap-1.5">
                      <span class="truncate text-sm font-medium text-highlighted">
                        {{ member.name }}
                      </span>
                      <UBadge
                        v-if="member.owner_id === user?.id"
                        label="yours"
                        color="primary"
                        variant="subtle"
                        size="sm"
                      />
                    </span>
                    <span class="shrink-0 text-xs tabular-nums text-muted">
                      {{ member.data.current_hp ?? '–' }}/{{ member.data.max_hp ?? '–' }} HP
                    </span>
                  </NuxtLink>
                </li>
              </ul>
              <p
                v-else
                class="text-sm text-muted"
              >
                No characters yet — players create their own.
              </p>
            </ContentCard>
          </div>
        </div>

        <!-- Active quests -->
        <ContentCard
          title="Open threads"
          icon="i-lucide-target"
          :description="activeQuests.length ? undefined : 'No active quests. What is the party chasing?'"
        >
          <template #actions>
            <UButton
              v-if="isDm"
              label="New quest"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              size="sm"
              to="/entities/new?type=quest"
            />
          </template>

          <div
            v-if="activeQuests.length"
            class="grid gap-3 lg:grid-cols-2"
          >
            <NuxtLink
              v-for="quest in activeQuests"
              :key="quest.id"
              :to="`/entities/${quest.id}`"
              class="group flex items-start gap-3 rounded-xl border border-default p-3 transition-colors hover:border-accented"
            >
              <span class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UIcon
                  name="i-lucide-target"
                  class="size-4"
                />
              </span>
              <span class="min-w-0">
                <span class="block truncate font-medium text-highlighted group-hover:text-primary">
                  {{ quest.name }}
                </span>
                <span class="mt-0.5 line-clamp-2 block text-sm text-muted">
                  {{ quest.summary || String(quest.data.giver ?? '') || 'No summary.' }}
                </span>
              </span>
              <UDropdownMenu
                v-if="isDm"
                :items="questStatusItems(quest)"
                :content="{ align: 'end' }"
              >
                <UBadge
                  :label="String(quest.data.status ?? 'active')"
                  :color="QUEST_STATUS_COLORS[quest.data.status as keyof typeof QUEST_STATUS_COLORS] ?? 'primary'"
                  variant="subtle"
                  size="sm"
                  class="ml-auto shrink-0 cursor-pointer capitalize"
                  @click.prevent.stop
                />
              </UDropdownMenu>
              <UBadge
                v-else
                :label="String(quest.data.status ?? 'active')"
                :color="QUEST_STATUS_COLORS[quest.data.status as keyof typeof QUEST_STATUS_COLORS] ?? 'primary'"
                variant="subtle"
                size="sm"
                class="ml-auto shrink-0 capitalize"
              />
            </NuxtLink>
          </div>
        </ContentCard>

        <!-- Compact reference counts -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          <NuxtLink
            v-for="type in ENTITY_TYPES"
            :key="type.value"
            :to="`/entities?type=${type.value}`"
            class="app-card group flex items-center gap-2.5 p-3 transition-colors hover:border-accented"
          >
            <UIcon
              :name="type.icon"
              class="size-4 shrink-0 text-primary"
            />
            <span class="truncate text-sm text-muted group-hover:text-toned">
              {{ type.plural }}
            </span>
            <span class="ml-auto text-sm font-semibold tabular-nums text-highlighted">
              {{ counts[type.value] ?? '—' }}
            </span>
          </NuxtLink>
        </div>
      </template>
    </template>

    <CampaignFormModal v-model:open="creating" />
  </AppPage>
</template>
