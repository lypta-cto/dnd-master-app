<script setup lang="ts">
/**
 * The screen you actually run the evening from.
 *
 * Everything else in the app is prep. This is the one page where the question
 * is "what happens now?", so it answers only that: the scene you're in and the
 * ways out of it, which clues the party genuinely has, who hasn't had a moment
 * yet, and what the clock is about to do without them.
 *
 * Nothing here is a second source of truth — scenes and clues are entities, the
 * fight is the combat tracker. The run state only records what's true tonight.
 */
const { current, isDm } = useCampaigns()
const entities = useEntities()
const players = usePlayers()
const combat = useCombat()
const run = useRun()
const toast = useToast()
const { confirm } = useConfirm()

const state = ref<RunState>({
  active: false,
  session_id: null,
  scene_id: null,
  revealed: [],
  spotlight: {},
  clock: [],
  notes: null
})

const scenes = ref<EntitySummary[]>([])
const clues = ref<EntitySummary[]>([])
const sessions = ref<EntitySummary[]>([])
const roster = ref<Player[]>([])
const fight = ref<CombatState | null>(null)
const scene = ref<EntityDetail | null>(null)

const loading = ref(true)

async function load() {
  if (!current.value || !isDm.value) {
    loading.value = false
    return
  }

  loading.value = true

  try {
    const [runState, scenePage, cluePage, sessionPage, seats, fightState] = await Promise.all([
      run.get(),
      entities.list({ type: 'scene', page_size: 200 }),
      entities.list({ type: 'clue', page_size: 200 }),
      entities.list({ type: 'session', page_size: 50 }),
      players.list(),
      combat.get()
    ])

    state.value = runState
    scenes.value = scenePage.items
    clues.value = cluePage.items
    sessions.value = sortSessions(sessionPage.items)
    roster.value = seats
    fight.value = fightState

    await loadScene()
  } finally {
    loading.value = false
  }
}

watch(() => current.value?.id, load, { immediate: true })

/** The current scene's exits live on its links, so it needs the full read */
async function loadScene() {
  scene.value = state.value.scene_id
    ? await entities.read(state.value.scene_id).catch(() => null)
    : null
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

async function persist() {
  try {
    state.value = await run.set(state.value)
  } catch (error) {
    toast.add({ title: apiErrorMessage(error, 'Save failed'), icon: 'i-lucide-circle-alert', color: 'error' })
  }
}

function queueSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persist, 400)
}

onUnmounted(() => clearTimeout(saveTimer))

/* --- The scene ------------------------------------------------------------- */

const exits = computed(() =>
  (scene.value?.links ?? []).filter(link => link.relation === 'leads_to')
)

async function goTo(sceneId: string | null) {
  state.value.scene_id = sceneId
  await persist()
  await loadScene()
}

const unplayedScenes = computed(() =>
  scenes.value.filter(s => s.id !== state.value.scene_id)
)

/* --- Clues ----------------------------------------------------------------- */

function hasClue(id: string) {
  return state.value.revealed.includes(id)
}

function toggleClue(id: string) {
  state.value.revealed = hasClue(id)
    ? state.value.revealed.filter(c => c !== id)
    : [...state.value.revealed, id]
  queueSave()
}

/** Essential conclusions the party still can't reach */
const missingConclusions = computed(() => {
  const byConclusion = new Map<string, { conclusion: string, found: number, essential: boolean }>()

  for (const clue of clues.value) {
    const conclusion = String(clue.data.points_to ?? '').trim()
    if (!conclusion) {
      continue
    }
    const row = byConclusion.get(conclusion.toLowerCase())
      ?? { conclusion, found: 0, essential: false }
    if (hasClue(clue.id)) {
      row.found += 1
    }
    if (clue.data.weight === 'essential') {
      row.essential = true
    }
    byConclusion.set(conclusion.toLowerCase(), row)
  }

  return [...byConclusion.values()].filter(row => row.essential && row.found === 0)
})

/* --- Spotlight -------------------------------------------------------------- */

function spotlightCount(playerId: string) {
  return state.value.spotlight[playerId] ?? 0
}

function giveSpotlight(playerId: string, delta: number) {
  const next = Math.max(0, spotlightCount(playerId) + delta)
  state.value.spotlight = { ...state.value.spotlight, [playerId]: next }
  queueSave()
}

/** Who the evening has passed by so far */
const quietest = computed(() => {
  if (!roster.value.length) {
    return []
  }
  const lowest = Math.min(...roster.value.map(p => spotlightCount(p.id)))
  return roster.value.filter(p => spotlightCount(p.id) === lowest)
})

/** "Ana hasn't" / "Bojan and Vera haven't" — it's read at a glance mid-scene */
const quietestLine = computed(() => {
  const names = quietest.value.map(player => player.name)

  if (!names.length || names.length === roster.value.length) {
    return null
  }

  const listed = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

  return `${listed} ${names.length === 1 ? 'hasn\'t' : 'haven\'t'} had a moment yet.`
})

/* --- The clock -------------------------------------------------------------- */

const clockDraft = reactive({ label: '', text: '' })

function addClockEvent() {
  if (!clockDraft.label.trim() || !clockDraft.text.trim()) {
    return
  }
  state.value.clock = [
    ...state.value.clock,
    { label: clockDraft.label.trim(), text: clockDraft.text.trim(), done: false }
  ]
  clockDraft.label = ''
  clockDraft.text = ''
  queueSave()
}

function toggleClockEvent(index: number) {
  state.value.clock = state.value.clock.map((event, i) =>
    i === index ? { ...event, done: !event.done } : event
  )
  queueSave()
}

function removeClockEvent(index: number) {
  state.value.clock = state.value.clock.filter((_, i) => i !== index)
  queueSave()
}

const nextEvent = computed(() => state.value.clock.find(event => !event.done) ?? null)

/* --- Starting and ending ---------------------------------------------------- */

async function start() {
  state.value.active = true
  if (!state.value.session_id) {
    state.value.session_id = sessions.value.find(s => s.data.status === 'planned')?.id ?? null
  }
  await persist()
}

async function end() {
  const ok = await confirm({
    title: 'End the session?',
    description: 'Spotlight counts and tonight\'s notes are cleared. Revealed clues stay — the party still has them.',
    confirmLabel: 'End session'
  })

  if (!ok) {
    return
  }

  state.value = {
    ...state.value,
    active: false,
    scene_id: null,
    spotlight: {},
    notes: null
  }
  await persist()
  scene.value = null

  toast.add({ title: 'Session ended', icon: 'i-lucide-flag', color: 'success' })
}

const activeCombatant = computed(() => {
  if (!fight.value?.active) {
    return null
  }
  const ordered = [...fight.value.combatants].sort((a, b) => b.initiative - a.initiative)
  return ordered[fight.value.turn_index] ?? null
})
</script>

<template>
  <AppPage
    title="Run"
    description="Tonight, one screen. Prep lives everywhere else."
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: 'Run' }
    ]"
  >
    <template #actions>
      <template v-if="isDm && current">
        <UButton
          v-if="!state.active"
          label="Start session"
          icon="i-lucide-play"
          class="rounded-xl"
          @click="start"
        />
        <UButton
          v-else
          label="End session"
          icon="i-lucide-flag"
          color="neutral"
          variant="outline"
          class="rounded-xl"
          @click="end"
        />
      </template>
    </template>

    <EmptyState
      v-if="!current || !isDm"
      icon="i-lucide-play"
      title="DM only"
      description="Running the evening belongs to the DM of the selected campaign."
    />

    <div
      v-else-if="loading"
      class="grid gap-4 lg:grid-cols-3"
    >
      <USkeleton class="h-72 rounded-2xl lg:col-span-2" />
      <USkeleton class="h-72 rounded-2xl" />
    </div>

    <div
      v-else
      class="grid gap-4 lg:grid-cols-3"
    >
      <div class="space-y-4 lg:col-span-2">
        <!-- The scene on the table -->
        <ContentCard
          :title="scene ? scene.name : 'No scene yet'"
          icon="i-lucide-clapperboard"
          :description="scene
            ? String(scene.data.purpose ?? '') || undefined
            : 'Pick where the evening starts.'"
        >
          <template
            v-if="scene"
            #actions
          >
            <UButton
              label="Open"
              icon="i-lucide-arrow-right"
              color="neutral"
              variant="ghost"
              size="sm"
              :to="`/entities/${scene.id}`"
            />
          </template>

          <div
            v-if="scene"
            class="space-y-4"
          >
            <div
              v-if="scene.data.learn"
              class="rounded-xl border border-default p-3"
            >
              <p class="text-xs font-medium uppercase tracking-wide text-dimmed">
                They should leave knowing
              </p>
              <p class="mt-1 text-sm text-toned">
                {{ scene.data.learn }}
              </p>
            </div>

            <MarkdownBody
              v-if="scene.body"
              :body="scene.body"
              :linked="scene.links"
            />

            <div>
              <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-dimmed">
                Ways out
              </p>
              <div
                v-if="exits.length"
                class="flex flex-wrap gap-1.5"
              >
                <UButton
                  v-for="exit in exits"
                  :key="exit.id"
                  :label="exit.name"
                  icon="i-lucide-corner-down-right"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  @click="goTo(exit.id)"
                />
              </div>
              <p
                v-else
                class="text-sm text-muted"
              >
                None wired up — jump to any scene below.
              </p>
            </div>
          </div>

          <div
            v-else-if="scenes.length"
            class="flex flex-wrap gap-1.5"
          >
            <UButton
              v-for="option in scenes"
              :key="option.id"
              :label="option.name"
              color="neutral"
              variant="outline"
              size="sm"
              @click="goTo(option.id)"
            />
          </div>

          <p
            v-else
            class="text-sm text-muted"
          >
            No scenes prepped. Write one and it shows up here.
          </p>
        </ContentCard>

        <!-- Clues: what they actually have, not what you wrote down -->
        <ContentCard
          title="Clues"
          icon="i-lucide-search"
          description="Tick one off the moment the party genuinely has it."
        >
          <p
            v-if="!clues.length"
            class="py-2 text-sm text-muted"
          >
            No clues prepped.
          </p>

          <div
            v-else
            class="space-y-1"
          >
            <button
              v-for="clue in clues"
              :key="clue.id"
              type="button"
              class="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-elevated"
              @click="toggleClue(clue.id)"
            >
              <span
                class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors"
                :class="hasClue(clue.id) ? 'border-primary bg-primary text-inverted' : 'border-accented'"
              >
                <UIcon
                  v-if="hasClue(clue.id)"
                  name="i-lucide-check"
                  class="size-3"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span
                  class="block truncate text-sm"
                  :class="hasClue(clue.id) ? 'text-dimmed line-through' : 'text-highlighted'"
                >
                  {{ clue.name }}
                </span>
                <span
                  v-if="clue.data.points_to"
                  class="block truncate text-xs text-muted"
                >
                  → {{ clue.data.points_to }}
                </span>
              </span>
              <UBadge
                v-if="clue.data.weight === 'essential'"
                label="essential"
                color="primary"
                variant="subtle"
                size="sm"
                class="mt-0.5 shrink-0"
              />
            </button>
          </div>

          <div
            v-if="missingConclusions.length"
            class="mt-3 flex items-start gap-2 rounded-xl bg-elevated p-3 text-sm"
          >
            <UIcon
              name="i-lucide-triangle-alert"
              class="mt-0.5 size-4 shrink-0 text-warning"
            />
            <p class="text-muted">
              They still have no way to reach:
              <span class="text-toned">{{ missingConclusions.map(row => row.conclusion).join(', ') }}</span>.
            </p>
          </div>
        </ContentCard>
      </div>

      <div class="space-y-4">
        <!-- Spotlight: the thing that goes wrong at a table of eight -->
        <ContentCard
          title="Spotlight"
          icon="i-lucide-drama"
          :description="quietestLine ?? 'Tap when someone gets a scene of their own.'"
        >
          <p
            v-if="!roster.length"
            class="py-2 text-sm text-muted"
          >
            Nobody on the roster yet.
          </p>

          <ul
            v-else
            class="space-y-1"
          >
            <li
              v-for="player in roster"
              :key="player.id"
              class="flex items-center gap-2"
            >
              <span class="min-w-0 flex-1 truncate text-sm text-toned">{{ player.name }}</span>
              <span class="flex shrink-0 gap-0.5">
                <span
                  v-for="index in Math.max(3, spotlightCount(player.id))"
                  :key="index"
                  class="size-1.5 rounded-full"
                  :class="index <= spotlightCount(player.id) ? 'bg-primary' : 'bg-elevated'"
                />
              </span>
              <UButton
                icon="i-lucide-minus"
                size="xs"
                color="neutral"
                variant="ghost"
                :disabled="!spotlightCount(player.id)"
                :aria-label="`One fewer for ${player.name}`"
                @click="giveSpotlight(player.id, -1)"
              />
              <UButton
                icon="i-lucide-plus"
                size="xs"
                color="neutral"
                variant="outline"
                :aria-label="`Spotlight ${player.name}`"
                @click="giveSpotlight(player.id, 1)"
              />
            </li>
          </ul>
        </ContentCard>

        <!-- The world's clock -->
        <ContentCard
          title="The clock"
          icon="i-lucide-clock"
          :description="nextEvent
            ? `Next: ${nextEvent.label} — ${nextEvent.text}`
            : 'Things that happen whether or not the party is there.'"
        >
          <ul
            v-if="state.clock.length"
            class="mb-3 space-y-1"
          >
            <li
              v-for="(event, index) in state.clock"
              :key="`${event.label}-${index}`"
              class="flex items-start gap-2"
            >
              <button
                type="button"
                class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors"
                :class="event.done ? 'border-primary bg-primary text-inverted' : 'border-accented'"
                :aria-label="`Mark ${event.label} done`"
                @click="toggleClockEvent(index)"
              >
                <UIcon
                  v-if="event.done"
                  name="i-lucide-check"
                  class="size-3"
                />
              </button>
              <span class="min-w-0 flex-1">
                <span class="text-xs font-medium tabular-nums text-muted">{{ event.label }}</span>
                <span
                  class="block text-sm"
                  :class="event.done ? 'text-dimmed line-through' : 'text-toned'"
                >{{ event.text }}</span>
              </span>
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Remove"
                @click="removeClockEvent(index)"
              />
            </li>
          </ul>

          <form
            class="flex items-end gap-2"
            @submit.prevent="addClockEvent"
          >
            <UFormField
              label="Time"
              class="w-20"
            >
              <UInput
                v-model="clockDraft.label"
                placeholder="22:00"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="What happens"
              class="flex-1"
            >
              <UInput
                v-model="clockDraft.text"
                placeholder="Another villager disappears."
                class="w-full"
              />
            </UFormField>
            <UButton
              type="submit"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              :disabled="!clockDraft.label.trim() || !clockDraft.text.trim()"
              aria-label="Add"
            />
          </form>
        </ContentCard>

        <!-- The fight, if there is one -->
        <ContentCard
          title="Combat"
          icon="i-lucide-swords"
          :description="fight?.active
            ? `Round ${fight.round}`
            : 'No fight running.'"
        >
          <template #actions>
            <UButton
              label="Open"
              icon="i-lucide-arrow-right"
              color="neutral"
              variant="ghost"
              size="sm"
              to="/combat"
            />
          </template>

          <p
            v-if="activeCombatant"
            class="text-sm text-toned"
          >
            Now: <span class="font-medium text-highlighted">{{ activeCombatant.name }}</span>
          </p>
        </ContentCard>

        <!-- Scratch notes for tonight -->
        <ContentCard
          title="Tonight"
          icon="i-lucide-pencil-line"
          description="Cleared when the session ends."
        >
          <UTextarea
            :model-value="state.notes ?? ''"
            :rows="5"
            placeholder="Ana asked about the church — pay that off before the finale."
            class="w-full"
            @update:model-value="value => { state.notes = value; queueSave() }"
          />
        </ContentCard>

        <ContentCard
          v-if="!scene && unplayedScenes.length"
          title="Jump to a scene"
          icon="i-lucide-list"
        >
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="option in unplayedScenes"
              :key="option.id"
              :label="option.name"
              color="neutral"
              variant="outline"
              size="sm"
              @click="goTo(option.id)"
            />
          </div>
        </ContentCard>
      </div>
    </div>
  </AppPage>
</template>
