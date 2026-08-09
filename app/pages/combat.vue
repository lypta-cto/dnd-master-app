<script setup lang="ts">
/**
 * The fight, from the DM's side of the screen.
 *
 * Two screens that share one state. Prepare is a playground: the board in the
 * middle, the two sides of the fight beside it, everything added through one
 * picker with faces on it. Run is the fight: the order on the left with whose
 * turn it is, the board on the right, and nothing about assembling in sight.
 *
 * Every change saves the whole state (one PUT — matches the table's pace) and,
 * when something initiative-shaped is on the wall, keeps it live. Monster HP
 * never leaves this screen.
 */
const { current, isDm } = useCampaigns()
const entities = useEntities()
const combat = useCombat()
const cast = useCast()
const portraits = usePortraits()
const mediaUrl = useMediaUrl()
const toast = useToast()

const state = ref<CombatState>({ active: false, round: 1, turn_index: 0, combatants: [] })
const loading = ref(true)

/**
 * Read from what's actually on the table, not from a local flag.
 *
 * A local one said "off" every time the DM came back to this page, so the
 * switch claimed nothing was being shown while the party watched initiative.
 */
const stripUp = computed(() => !!cast.current.value?.initiative?.entries?.length)
const fullOrderUp = computed(() => cast.current.value?.mode === 'initiative')

/**
 * Which half of the screen you're on, chosen rather than inferred.
 *
 * Independent of `active` on purpose — flipping back to Prepare mid-fight is
 * how reinforcements arrive, and must not end the fight to do it.
 */
const view = ref<'build' | 'play'>('build')
const building = computed(() => view.value === 'build')

const VIEWS = [
  { label: 'Prepare', value: 'build', icon: 'i-lucide-hammer' },
  { label: 'Run the fight', value: 'play', icon: 'i-lucide-swords' }
]

// A fight already running belongs on the run half the moment the page opens
watch(() => state.value.active, (active) => {
  if (active) {
    view.value = 'play'
  }
})

const QUICK_CONDITIONS = ['prone', 'poisoned', 'stunned', 'restrained', 'frightened', 'concentrating']

const characters = ref<EntitySummary[]>([])

async function load() {
  if (!current.value || !isDm.value) {
    loading.value = false
    return
  }

  loading.value = true
  try {
    const [fight, chars] = await Promise.all([
      combat.get(),
      entities.list({ type: 'character', page_size: 100 })
    ])
    state.value = fight
    characters.value = chars.items
    portraits.remember(chars.items)
  } finally {
    loading.value = false
  }
}

watch(() => current.value?.id, load, { immediate: true })

// Faces for whoever is in the fight, wherever they came from
watch(
  () => state.value.combatants.map(c => c.entity_id).join(','),
  () => portraits.ensure(state.value.combatants.map(c => c.entity_id)),
  { immediate: true }
)

const ordered = computed(() =>
  [...state.value.combatants].sort((a, b) => b.initiative - a.initiative)
)

/** turn_index counts through the *sorted* order */
const activeId = computed(() => ordered.value[state.value.turn_index]?.id ?? null)

let saveTimer: ReturnType<typeof setTimeout> | undefined

async function persist() {
  try {
    await combat.set(state.value)
    await syncCasts()
  } catch (error) {
    toast.add({ title: apiErrorMessage(error, 'Save failed'), icon: 'i-lucide-circle-alert', color: 'error' })
  }
}

/** Whatever initiative-shaped thing is on the wall follows the fight live */
async function syncCasts() {
  if (stripUp.value) {
    await castStrip()
  }
  if (fullOrderUp.value) {
    await castFullOrder()
  }
}

function queueSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persist, 400)
}

onUnmounted(() => clearTimeout(saveTimer))

/* --- The battle map -------------------------------------------------------- */

function chooseMap(mapId: string | null) {
  state.value.map_id = mapId

  // Taking the map away leaves every token's position pointing at nothing,
  // and a stale coordinate would reappear the moment another map was chosen
  if (!mapId) {
    for (const combatant of state.value.combatants) {
      combatant.x = null
      combatant.y = null
    }
  }

  queueSave()
}

function moveToken(id: string, point: { x: number, y: number }) {
  const token = state.value.combatants.find(c => c.id === id)
  if (!token) {
    return
  }
  token.x = point.x
  token.y = point.y
  // No undo snapshot: dragging a token is a dozen updates a second, and
  // filling the history with them would bury the moves worth undoing.
  queueSave()
}

/* --- Undo ------------------------------------------------------------------
 * Mid-fight mistakes are constant: damage on the wrong goblin, a turn skipped.
 * Every mutation snapshots the whole state first — it's small, and the tracker
 * already thinks in whole states. Bursts of the same action (± on one creature)
 * collapse into one step, so undo goes back a decision rather than a click.
 */
interface HistoryEntry {
  label: string
  state: CombatState
}

const HISTORY_LIMIT = 30
const history = ref<HistoryEntry[]>([])

let lastKey = ''
let lastStamp = 0

function snapshot(label: string, key: string = label) {
  const now = Date.now()
  const isBurst = key === lastKey && now - lastStamp < 1500
  lastKey = key
  lastStamp = now

  if (isBurst) {
    return
  }

  history.value.push({ label, state: JSON.parse(JSON.stringify(state.value)) })
  if (history.value.length > HISTORY_LIMIT) {
    history.value.shift()
  }
}

async function undo() {
  const previous = history.value.pop()
  if (!previous) {
    return
  }

  state.value = previous.state
  lastKey = ''
  clearTimeout(saveTimer)
  await persist()
  await syncCharacterSheets()

  toast.add({ title: `Undone — ${previous.label}`, icon: 'i-lucide-undo-2', color: 'neutral' })
}

/**
 * Rewinding the fight has to rewind the sheets with it.
 *
 * HP and conditions flow to character entities as they change, so an undo that
 * only restored the tracker would leave the party page (and the player's own
 * view) showing damage the fight no longer remembers.
 */
async function syncCharacterSheets() {
  const writes = state.value.combatants
    .filter(combatant => combatant.kind === 'character' && combatant.entity_id)
    .map(async (combatant) => {
      const sheet = characters.value.find(c => c.id === combatant.entity_id)
      if (!sheet) {
        return
      }

      const data = {
        ...sheet.data,
        current_hp: combatant.current_hp,
        conditions: [...combatant.conditions]
      }

      if (
        sheet.data.current_hp === data.current_hp
        && JSON.stringify(sheet.data.conditions ?? []) === JSON.stringify(data.conditions)
      ) {
        return
      }

      sheet.data = data
      await entities.update(combatant.entity_id!, { data })
    })

  await Promise.all(writes)
}

defineShortcuts({ meta_z: undo })

/* --- What the table sees ----------------------------------------------------
 * Two shapes, each with its own lifetime. The strip rides above whatever else
 * is cast — map, portrait, dice — for glancing at mid-fight. The full order
 * takes the whole screen, faces and all, for the "roll initiative" moment.
 * Both carry only what the table may know: order, whose turn, who is down,
 * and the picture the party can already see on the board. Never HP.
 */

function tableEntry(combatant: Combatant) {
  return {
    name: combatant.name,
    kind: combatant.kind,
    down: combatant.current_hp === 0,
    active: combatant.id === activeId.value,
    image_url: combatant.entity_id ? portraits.urlFor(combatant.entity_id) : null
  }
}

async function castStrip() {
  await cast.setInitiative(ordered.value.map(tableEntry), state.value.round)
}

/** Empty takes the strip down — the fight is over, so the header goes too */
const clearStrip = () => cast.setInitiative([])

async function toggleStrip(value: boolean) {
  try {
    if (value) {
      await castStrip()
      toast.add({
        title: 'Order above whatever else is on the table',
        icon: 'i-lucide-cast',
        color: 'success'
      })
    } else {
      await clearStrip()
    }
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  }
}

async function castFullOrder(announce = false) {
  try {
    const result = await cast.set({
      mode: 'initiative',
      payload: {
        round: state.value.round,
        active_id: activeId.value,
        combatants: ordered.value.map((combatant, index) => ({
          id: combatant.id,
          ...tableEntry(combatant),
          order: index + 1
        }))
      }
    })
    if (announce) {
      toast.add({
        title: 'The order fills the screen',
        icon: 'i-lucide-cast',
        color: result.displays_connected ? 'success' : 'warning',
        description: result.displays_connected ? undefined : 'No display connected'
      })
    }
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  }
}

/* --- Assembling ------------------------------------------------------------- */

const pickerOpen = ref(false)

const takenEntityIds = computed(() =>
  state.value.combatants
    .filter(c => c.kind === 'character' && c.entity_id)
    .map(c => c.entity_id!)
)

function nextId() {
  return Math.random().toString(36).slice(2, 10)
}

function addCharacter(character: EntitySummary) {
  if (state.value.combatants.some(c => c.entity_id === character.id)) {
    return
  }
  snapshot(`added ${character.name}`)
  portraits.remember([character])
  state.value.combatants.push({
    id: nextId(),
    name: character.name,
    kind: 'character',
    entity_id: character.id,
    initiative: 0,
    max_hp: Number(character.data.max_hp) || null,
    current_hp: character.data.current_hp === undefined
      ? Number(character.data.max_hp) || null
      : Number(character.data.current_hp),
    conditions: []
  })
  queueSave()
}

function addMonster(monster: EntitySummary) {
  // Same monster many times is normal — number the copies
  const copies = state.value.combatants.filter(c => c.entity_id === monster.id).length
  const hp = Number(monster.data.hp) || null
  snapshot(`added ${monster.name}`)
  portraits.remember([monster])
  state.value.combatants.push({
    id: nextId(),
    name: copies ? `${monster.name} ${copies + 1}` : monster.name,
    kind: 'monster',
    entity_id: monster.id,
    initiative: 0,
    max_hp: hp,
    current_hp: hp,
    conditions: []
  })
  queueSave()
}

function addCustom(name: string) {
  snapshot(`added ${name}`)
  state.value.combatants.push({
    id: nextId(), name, kind: 'custom', initiative: 0,
    max_hp: null, current_hp: null, conditions: []
  })
  queueSave()
}

function removeCombatant(id: string) {
  const index = ordered.value.findIndex(c => c.id === id)
  snapshot(`removed ${state.value.combatants.find(c => c.id === id)?.name ?? 'a combatant'}`)
  state.value.combatants = state.value.combatants.filter(c => c.id !== id)

  // Keep the turn pointing at the same creature where possible
  if (index !== -1 && index < state.value.turn_index) {
    state.value.turn_index -= 1
  }
  state.value.turn_index = Math.min(
    state.value.turn_index,
    Math.max(0, state.value.combatants.length - 1)
  )
  queueSave()
}

/**
 * The two sides of the fight, as the Prepare rail shows them.
 *
 * The state stores one combatant per creature ("Goblin", "Goblin 2", …), which
 * is what a fight needs — but while assembling, "Goblin ×5" with a stepper is
 * the shape the DM is thinking in. Copies of the same statblock fold into one
 * line; customs stay one line each, since nothing links them.
 */
const party = computed(() => state.value.combatants.filter(c => c.kind === 'character'))

interface EnemyLine {
  key: string
  name: string
  entity_id: string | null
  count: number
  hp: number | null
  /** ids of the copies, last one first, so the stepper can take one away */
  memberIds: string[]
}

const enemies = computed<EnemyLine[]>(() => {
  const lines = new Map<string, EnemyLine>()

  for (const combatant of state.value.combatants) {
    if (combatant.kind === 'character') {
      continue
    }
    const key = combatant.entity_id ?? `custom:${combatant.id}`
    const line = lines.get(key)

    if (line) {
      line.count += 1
      line.memberIds.unshift(combatant.id)
    } else {
      lines.set(key, {
        key,
        // The first copy carries the unnumbered name
        name: combatant.name,
        entity_id: combatant.entity_id ?? null,
        count: 1,
        hp: combatant.max_hp ?? null,
        memberIds: [combatant.id]
      })
    }
  }

  return [...lines.values()]
})

function addCopy(line: EnemyLine) {
  snapshot(`added ${line.name}`)
  state.value.combatants.push({
    id: nextId(),
    name: `${line.name} ${line.count + 1}`,
    kind: line.entity_id ? 'monster' : 'custom',
    entity_id: line.entity_id,
    initiative: 0,
    max_hp: line.hp,
    current_hp: line.hp,
    conditions: []
  })
  queueSave()
}

function removeCopy(line: EnemyLine) {
  const id = line.memberIds[0]
  if (id) {
    removeCombatant(id)
  }
}

function removeLine(line: EnemyLine) {
  snapshot(`removed ${line.name}`)
  const members = new Set(line.memberIds)
  state.value.combatants = state.value.combatants.filter(c => !members.has(c.id))
  state.value.turn_index = Math.min(
    state.value.turn_index,
    Math.max(0, state.value.combatants.length - 1)
  )
  queueSave()
}

/* --- Running the fight ------------------------------------------------------ */

function start() {
  snapshot('start of combat')
  state.value.active = true
  state.value.round = 1
  state.value.turn_index = 0
  view.value = 'play'
  persist()
}

async function end() {
  state.value.active = false
  clearTimeout(saveTimer)
  await combat.set(state.value)

  // Both orders come down with the fight; whatever else was cast stays
  if (stripUp.value) {
    await clearStrip()
  }
  if (fullOrderUp.value) {
    await cast.clear()
  }
  toast.add({ title: `Combat ended after round ${state.value.round}`, icon: 'i-lucide-flag', color: 'success' })
}

function nextTurn() {
  if (!ordered.value.length) {
    return
  }
  snapshot('next turn', 'turn')
  if (state.value.turn_index >= ordered.value.length - 1) {
    state.value.turn_index = 0
    state.value.round += 1
  } else {
    state.value.turn_index += 1
  }
  persist()
}

function previousTurn() {
  snapshot('previous turn', 'turn')
  if (state.value.turn_index === 0) {
    if (state.value.round > 1) {
      state.value.round -= 1
      state.value.turn_index = Math.max(0, ordered.value.length - 1)
    }
  } else {
    state.value.turn_index -= 1
  }
  persist()
}

async function bumpHp(combatant: Combatant, delta: number) {
  if (combatant.max_hp == null) {
    return
  }
  const current = combatant.current_hp ?? combatant.max_hp
  await writeHp(combatant, current + delta)
}

/** Direct entry — a fireball hits for 28, you type 28's aftermath once. */
async function setHp(combatant: Combatant, value: number | null) {
  if (combatant.max_hp == null || value == null) {
    return
  }
  await writeHp(combatant, Math.round(value))
}

async function writeHp(combatant: Combatant, next: number) {
  snapshot(`HP change on ${combatant.name}`, `hp:${combatant.id}`)
  combatant.current_hp = Math.max(0, Math.min(combatant.max_hp!, next))
  queueSave()

  // Character damage flows back to the sheet, so the party view agrees
  if (combatant.kind === 'character' && combatant.entity_id) {
    const sheet = characters.value.find(c => c.id === combatant.entity_id)
    if (sheet) {
      sheet.data = { ...sheet.data, current_hp: combatant.current_hp }
      await entities.update(combatant.entity_id, { data: sheet.data })
    }
  }
}

async function toggleCondition(combatant: Combatant, name: string) {
  snapshot(`${name} on ${combatant.name}`, `cond:${combatant.id}:${name}`)
  combatant.conditions = combatant.conditions.includes(name)
    ? combatant.conditions.filter(c => c !== name)
    : [...combatant.conditions, name]
  queueSave()

  // Conditions on characters mirror to the sheet, like HP does — the party
  // page and the player's own view should agree with the fight
  if (combatant.kind === 'character' && combatant.entity_id) {
    const sheet = characters.value.find(c => c.id === combatant.entity_id)
    if (sheet) {
      sheet.data = { ...sheet.data, conditions: [...combatant.conditions] }
      await entities.update(combatant.entity_id, { data: sheet.data })
    }
  }
}

/** d20 for everyone still sitting on 0 — the DM rolls monsters in one click. */
function rollMissingInitiative() {
  snapshot('initiative rolls')
  for (const combatant of state.value.combatants) {
    if (combatant.initiative === 0) {
      combatant.initiative = 1 + Math.floor(Math.random() * 20)
    }
  }
  queueSave()
}

function hpPercent(combatant: Combatant) {
  if (!combatant.max_hp) {
    return null
  }
  const current = combatant.current_hp ?? combatant.max_hp
  return Math.max(0, Math.min(100, (current / combatant.max_hp) * 100))
}

const portraitSrc = (combatant: Combatant) => {
  const url = combatant.entity_id ? portraits.urlFor(combatant.entity_id) : null
  return url ? mediaUrl(url) : undefined
}
</script>

<template>
  <AppPage
    title="Combat"
    :description="building
      ? 'The playground: pick the map, gather both sides, set where everyone starts.'
      : 'The order, HP and conditions — the table sees only what you cast.'"
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: 'Combat' }
    ]"
  >
    <template #actions>
      <template v-if="isDm && current">
        <UTooltip
          :text="history.length ? `Undo ${history[history.length - 1]!.label}` : 'Nothing to undo'"
          :kbds="['meta', 'Z']"
        >
          <UButton
            icon="i-lucide-undo-2"
            color="neutral"
            variant="ghost"
            class="rounded-xl"
            aria-label="Undo"
            :disabled="!history.length"
            @click="undo"
          />
        </UTooltip>
        <UButton
          v-if="!state.active"
          label="Start combat"
          icon="i-lucide-swords"
          class="rounded-xl"
          :disabled="!state.combatants.length"
          @click="start"
        />
        <UButton
          v-else
          label="End combat"
          icon="i-lucide-flag"
          color="error"
          variant="outline"
          class="rounded-xl"
          @click="end"
        />
      </template>
    </template>

    <EmptyState
      v-if="!current || !isDm"
      icon="i-lucide-swords"
      title="DM only"
      description="The combat tracker belongs to the DM of the selected campaign."
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
      class="space-y-4"
    >
      <!-- Two halves, and which one you're on says so -->
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex w-full max-w-sm rounded-xl border border-default p-1">
          <button
            v-for="option in VIEWS"
            :key="option.value"
            type="button"
            class="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
            :class="view === option.value
              ? 'bg-primary text-inverted'
              : 'text-muted hover:text-highlighted'"
            @click="view = option.value as 'build' | 'play'"
          >
            <UIcon
              :name="option.icon"
              class="size-4"
            />
            {{ option.label }}
          </button>
        </div>

        <UBadge
          v-if="state.active"
          color="warning"
          variant="subtle"
          class="rounded-full"
        >
          Round {{ state.round }} in progress
        </UBadge>
      </div>

      <!-- ================= PREPARE ================= -->
      <div
        v-if="building"
        class="grid gap-4 lg:grid-cols-3"
      >
        <BattleMap
          class="lg:col-span-2"
          :combatants="state.combatants"
          :map-id="state.map_id"
          :prep="!state.active"
          @chose="chooseMap"
          @moved="moveToken"
        />

        <div class="space-y-4">
          <ContentCard
            title="Who's in it"
            icon="i-lucide-users-round"
            :description="state.combatants.length
              ? undefined
              : 'Both sides of the fight, before the table is watching.'"
            flush
          >
            <template #actions>
              <UButton
                label="Add"
                icon="i-lucide-plus"
                size="sm"
                @click="pickerOpen = true"
              />
            </template>

            <!-- The party -->
            <div
              v-if="party.length"
              class="border-b border-default"
            >
              <p class="px-4 pt-3 pb-1 text-xs font-medium tracking-wide text-dimmed uppercase">
                The party
              </p>
              <div
                v-for="combatant in party"
                :key="combatant.id"
                class="flex items-center gap-2.5 px-4 py-1.5 last:pb-3"
              >
                <UAvatar
                  :src="portraitSrc(combatant)"
                  :alt="combatant.name"
                  icon="i-lucide-user-round"
                  size="sm"
                />
                <span class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">
                  {{ combatant.name }}
                </span>
                <span
                  v-if="combatant.max_hp != null"
                  class="shrink-0 text-xs tabular-nums text-dimmed"
                >
                  {{ combatant.current_hp ?? combatant.max_hp }}/{{ combatant.max_hp }} HP
                </span>
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="`Remove ${combatant.name}`"
                  @click="removeCombatant(combatant.id)"
                />
              </div>
            </div>

            <!-- The opposition -->
            <div v-if="enemies.length">
              <p class="px-4 pt-3 pb-1 text-xs font-medium tracking-wide text-dimmed uppercase">
                Against them
              </p>
              <div
                v-for="line in enemies"
                :key="line.key"
                class="flex items-center gap-2.5 px-4 py-1.5 last:pb-3"
              >
                <UAvatar
                  :src="line.entity_id && portraits.urlFor(line.entity_id)
                    ? mediaUrl(portraits.urlFor(line.entity_id)!) : undefined"
                  :alt="line.name"
                  :icon="line.entity_id ? 'i-lucide-skull' : 'i-lucide-shapes'"
                  size="sm"
                />
                <span class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">
                  {{ line.name }}
                </span>
                <span
                  v-if="line.hp"
                  class="shrink-0 text-xs tabular-nums text-dimmed"
                >{{ line.hp }} HP</span>

                <div class="flex shrink-0 items-center gap-1">
                  <UButton
                    icon="i-lucide-minus"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :aria-label="`One less ${line.name}`"
                    @click="line.count > 1 ? removeCopy(line) : removeLine(line)"
                  />
                  <span class="w-6 text-center text-sm tabular-nums text-toned">{{ line.count }}</span>
                  <UButton
                    icon="i-lucide-plus"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :aria-label="`One more ${line.name}`"
                    @click="addCopy(line)"
                  />
                </div>
              </div>
            </div>

            <div
              v-if="!state.combatants.length"
              class="px-4 py-6 text-center"
            >
              <UButton
                label="Add the fighters"
                icon="i-lucide-plus"
                variant="soft"
                @click="pickerOpen = true"
              />
            </div>
          </ContentCard>

          <ContentCard
            title="Dice"
            icon="i-lucide-dices"
          >
            <DiceRoller />
          </ContentCard>
        </div>
      </div>

      <!-- ================= RUN ================= -->
      <div
        v-else
        class="grid gap-4 lg:grid-cols-5"
      >
        <ContentCard
          class="lg:col-span-2"
          :title="state.active ? `Round ${state.round}` : 'The order'"
          icon="i-lucide-list-ordered"
          :description="state.active ? undefined : 'Roll initiative, then start the fight.'"
          flush
        >
          <template #actions>
            <UButton
              v-if="state.combatants.some(c => c.initiative === 0)"
              label="Roll the rest"
              icon="i-lucide-dices"
              color="neutral"
              variant="outline"
              size="sm"
              @click="rollMissingInitiative"
            />
            <template v-if="state.active">
              <UButton
                icon="i-lucide-skip-back"
                color="neutral"
                variant="outline"
                size="sm"
                aria-label="Previous turn"
                @click="previousTurn"
              />
              <UButton
                label="Next turn"
                trailing-icon="i-lucide-skip-forward"
                size="sm"
                @click="nextTurn"
              />
            </template>
          </template>

          <div
            v-if="!ordered.length"
            class="px-4 py-6 text-center"
          >
            <p class="mb-3 text-sm text-muted">
              Nobody in the fight yet.
            </p>
            <UButton
              label="Prepare it first"
              icon="i-lucide-hammer"
              variant="soft"
              @click="view = 'build'"
            />
          </div>

          <ul v-else>
            <li
              v-for="combatant in ordered"
              :key="combatant.id"
              class="border-b border-default px-3 py-2.5 last:border-0"
              :class="state.active && combatant.id === activeId && 'bg-primary/5 ring-1 ring-inset ring-primary/30'"
            >
              <div class="flex items-center gap-2.5">
                <UInputNumber
                  :model-value="combatant.initiative"
                  :min="-10"
                  :max="50"
                  size="sm"
                  class="w-20 shrink-0"
                  :aria-label="`Initiative for ${combatant.name}`"
                  @update:model-value="value => {
                    snapshot(`initiative for ${combatant.name}`, `init:${combatant.id}`)
                    combatant.initiative = value ?? 0
                    queueSave()
                  }"
                />

                <UAvatar
                  :src="portraitSrc(combatant)"
                  :alt="combatant.name"
                  :icon="combatant.kind === 'character' ? 'i-lucide-user-round'
                    : combatant.kind === 'monster' ? 'i-lucide-skull' : 'i-lucide-shapes'"
                  size="sm"
                  class="shrink-0"
                  :class="[
                    state.active && combatant.id === activeId && 'ring-2 ring-primary',
                    combatant.current_hp === 0 && 'opacity-40 grayscale'
                  ]"
                />

                <span
                  class="min-w-0 flex-1 truncate text-sm font-medium"
                  :class="combatant.current_hp === 0 ? 'text-dimmed line-through' : 'text-highlighted'"
                >
                  {{ combatant.name }}
                </span>

                <!-- Conditions live behind one small button, not six on every row -->
                <UPopover>
                  <UButton
                    icon="i-lucide-sparkles"
                    size="xs"
                    :color="combatant.conditions.length ? 'warning' : 'neutral'"
                    :variant="combatant.conditions.length ? 'soft' : 'ghost'"
                    :aria-label="`Conditions on ${combatant.name}`"
                  />
                  <template #content>
                    <div class="flex max-w-56 flex-wrap gap-1 p-2">
                      <UButton
                        v-for="name in QUICK_CONDITIONS"
                        :key="name"
                        :label="name"
                        size="xs"
                        class="capitalize"
                        :color="combatant.conditions.includes(name) ? 'warning' : 'neutral'"
                        :variant="combatant.conditions.includes(name) ? 'solid' : 'ghost'"
                        @click="toggleCondition(combatant, name)"
                      />
                    </div>
                  </template>
                </UPopover>

                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="`Remove ${combatant.name}`"
                  @click="removeCombatant(combatant.id)"
                />
              </div>

              <!-- HP on its own line: the row above stays scannable -->
              <div
                v-if="combatant.max_hp != null || combatant.conditions.length"
                class="mt-1.5 flex flex-wrap items-center gap-2 pl-[4.7rem]"
              >
                <template v-if="combatant.max_hp != null">
                  <UButton
                    v-for="delta in [-5, -1]"
                    :key="delta"
                    :label="String(delta)"
                    size="xs"
                    color="error"
                    variant="soft"
                    @click="bumpHp(combatant, delta)"
                  />
                  <span class="flex items-center gap-1 text-sm tabular-nums text-toned">
                    <UInputNumber
                      :model-value="combatant.current_hp ?? combatant.max_hp"
                      :min="0"
                      :max="combatant.max_hp"
                      size="xs"
                      class="w-16"
                      :aria-label="`${combatant.name} current HP`"
                      @update:model-value="value => setHp(combatant, value)"
                    />
                    <span class="text-muted">/{{ combatant.max_hp }}</span>
                  </span>
                  <UButton
                    v-for="delta in [1, 5]"
                    :key="delta"
                    :label="`+${delta}`"
                    size="xs"
                    color="success"
                    variant="soft"
                    @click="bumpHp(combatant, delta)"
                  />
                  <div
                    v-if="hpPercent(combatant) !== null"
                    class="h-1.5 w-20 overflow-hidden rounded-full bg-elevated"
                  >
                    <div
                      class="h-full rounded-full transition-all"
                      :class="hpPercent(combatant)! > 50 ? 'bg-emerald-500' : hpPercent(combatant)! > 25 ? 'bg-amber-500' : 'bg-red-500'"
                      :style="{ width: `${hpPercent(combatant)}%` }"
                    />
                  </div>
                </template>

                <span
                  v-for="name in combatant.conditions"
                  :key="name"
                  class="rounded-full bg-warning/15 px-2 py-0.5 text-xs capitalize text-warning"
                >
                  {{ name }}
                </span>
              </div>
            </li>
          </ul>

          <!-- Reinforcements arrive without leaving the fight -->
          <div
            v-if="ordered.length"
            class="border-t border-default p-2"
          >
            <UButton
              label="Reinforcements"
              icon="i-lucide-plus"
              color="neutral"
              variant="ghost"
              size="sm"
              block
              @click="pickerOpen = true"
            />
          </div>
        </ContentCard>

        <div class="space-y-4 lg:col-span-3">
          <!-- What the table sees, in one place -->
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-default px-4 py-2.5">
            <span class="flex items-center gap-1.5 text-sm font-medium text-highlighted">
              <UIcon
                name="i-lucide-cast"
                class="size-4 text-primary"
              />
              On the wall
            </span>
            <USwitch
              :model-value="stripUp"
              label="Order above everything"
              :disabled="!ordered.length"
              @update:model-value="toggleStrip"
            />
            <UButton
              :label="fullOrderUp ? 'Order is full screen' : 'Order full screen'"
              icon="i-lucide-monitor"
              size="sm"
              :color="fullOrderUp ? 'primary' : 'neutral'"
              :variant="fullOrderUp ? 'solid' : 'outline'"
              :disabled="!ordered.length"
              @click="castFullOrder(true)"
            />
          </div>

          <BattleMap
            :combatants="state.combatants"
            :map-id="state.map_id"
            @chose="chooseMap"
            @moved="moveToken"
          />

          <ContentCard
            title="Dice"
            icon="i-lucide-dices"
          >
            <DiceRoller />
          </ContentCard>
        </div>
      </div>
    </div>

    <CombatantPicker
      v-model:open="pickerOpen"
      :taken-entity-ids="takenEntityIds"
      @character="addCharacter"
      @monster="addMonster"
      @custom="addCustom"
    />
  </AppPage>
</template>
