<script setup lang="ts">
/**
 * The fight, from the DM's side of the screen.
 *
 * Fights are prepared on encounter pages — several per session, each with its
 * roster, map and starting positions. This screen is where one of them is
 * played: no fight running, it's the chooser; fight running, it's the tracker.
 * Assembling mid-fight still works through the picker, but it's a side door
 * for reinforcements, not the way in.
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
const runEncounter = useRunEncounter()
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

const QUICK_CONDITIONS = ['prone', 'poisoned', 'stunned', 'restrained', 'frightened', 'concentrating']

const characters = ref<EntitySummary[]>([])

/** What's been prepped and could be played tonight */
const encounters = ref<EntitySummary[]>([])

async function load() {
  if (!current.value || !isDm.value) {
    loading.value = false
    return
  }

  loading.value = true
  try {
    const [fight, chars, preps] = await Promise.all([
      combat.get(),
      entities.list({ type: 'character', page_size: 100 }),
      entities.list({ type: 'encounter', page_size: 100 })
    ])
    state.value = fight
    characters.value = chars.items
    encounters.value = preps.items
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

/* --- Statblocks -------------------------------------------------------------
 * AC and attacks live on the entity, not in the fight state — the fight only
 * snapshots what changes during it (HP, conditions, position). Fetched once
 * per entity and kept, so a card never waits on its own shield number.
 */
const statblocks = ref<Record<string, EntityDetail>>({})

watch(
  () => state.value.combatants.map(c => c.entity_id).join(','),
  async () => {
    const ids = [...new Set(
      state.value.combatants.map(c => c.entity_id).filter((id): id is string => !!id)
    )].filter(id => !(id in statblocks.value))

    await Promise.all(ids.map(async (id) => {
      try {
        // Await first, spread after: spreading in the same expression copies
        // the cache *before* suspending, and parallel fetches would each
        // resurrect that stale copy — last one to land wins, rest vanish.
        const entity = await entities.read(id)
        statblocks.value = { ...statblocks.value, [id]: entity }
      } catch {
        // Deleted mid-session. The card just shows less.
      }
    }))
  },
  { immediate: true }
)

/** Often "15", sometimes "15 (natural armor)" — shown as written */
const acFor = (combatant: Combatant) => {
  const raw = combatant.entity_id ? statblocks.value[combatant.entity_id]?.data.ac : null
  return raw ? String(raw) : null
}

const attacksFor = (combatant: Combatant) => {
  if (combatant.kind !== 'monster' || !combatant.entity_id) {
    return null
  }
  const raw = statblocks.value[combatant.entity_id]?.data.attacks
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

/* --- Dice in the attack line ------------------------------------------------
 * "Scimitar +4 to hit, 1d6+2 slashing" — the formulas become buttons, because
 * the question the DM is about to ask is always the same one.
 */
const DICE_RE = /\d*d\d+(?:\s*[+-]\s*\d+)?/gi

const attackDice = (text: string) => [...new Set(text.match(DICE_RE) ?? [])]

function rollFormula(formula: string) {
  const match = formula.replace(/\s/g, '').match(/^(\d*)d(\d+)([+-]\d+)?$/i)
  if (!match) {
    return
  }
  const count = Math.min(Number(match[1] || 1), 40)
  const sides = Number(match[2])
  const modifier = Number(match[3] ?? 0)
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides))
  const total = rolls.reduce((sum, roll) => sum + roll, 0) + modifier

  toast.add({
    title: `${formula} → ${total}`,
    description: rolls.length > 1 || modifier
      ? rolls.join(' + ') + (modifier ? (modifier > 0 ? ` + ${modifier}` : ` − ${-modifier}`) : '')
      : undefined,
    icon: 'i-lucide-dices'
  })
}

/**
 * The order holds still while an initiative is being edited.
 *
 * Sorting live meant typing "18" re-sorted the list at "1" — the row jumped
 * away mid-keystroke and a higher number than the row above was untypeable.
 * While any initiative popover is open the visual order is pinned; closing it
 * lets the list fall into the new order, which is also when it saves.
 */
const initiativeOpen = reactive<Record<string, boolean>>({})
const pinnedOrder = ref<string[] | null>(null)

const ordered = computed(() => {
  if (pinnedOrder.value) {
    const position = new Map(pinnedOrder.value.map((id, index) => [id, index]))
    return [...state.value.combatants].sort(
      (a, b) => (position.get(a.id) ?? 999) - (position.get(b.id) ?? 999)
    )
  }
  return [...state.value.combatants].sort((a, b) => b.initiative - a.initiative)
})

function setInitiativeOpen(id: string, open: boolean) {
  if (open && !pinnedOrder.value) {
    pinnedOrder.value = ordered.value.map(c => c.id)
  }
  initiativeOpen[id] = open
  if (!open && !Object.values(initiativeOpen).some(Boolean)) {
    pinnedOrder.value = null
    queueSave()
  }
}

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

async function castFullOrder() {
  await cast.set({
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
}

/**
 * One order on the wall at a time, or none.
 *
 * Strip and full screen were separate controls that could both be on, which
 * put the same list on the wall twice. It's one three-way choice now: picking
 * either shape takes the other down with it.
 */
type WallMode = 'off' | 'strip' | 'full'

const wallMode = computed<WallMode>(() =>
  fullOrderUp.value ? 'full' : stripUp.value ? 'strip' : 'off'
)

const WALL_MODES: { value: WallMode, label: string, icon: string }[] = [
  { value: 'off', label: 'Off', icon: 'i-lucide-eye-off' },
  { value: 'strip', label: 'Strip on top', icon: 'i-lucide-panel-top' },
  { value: 'full', label: 'Full screen', icon: 'i-lucide-monitor' }
]

async function setWallMode(mode: WallMode) {
  try {
    if (mode === 'strip') {
      if (fullOrderUp.value) {
        await cast.clear()
      }
      await castStrip()
    } else if (mode === 'full') {
      if (stripUp.value) {
        await clearStrip()
      }
      await castFullOrder()
    } else {
      if (stripUp.value) {
        await clearStrip()
      }
      if (fullOrderUp.value) {
        await cast.clear()
      }
    }
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  }
}

/* --- The chooser ------------------------------------------------------------ */

const starting = ref<string | null>(null)

const rosterOf = (encounter: EntitySummary): RosterLine[] =>
  Array.isArray(encounter.data.roster) ? encounter.data.roster as RosterLine[] : []

const headcount = (encounter: EntitySummary) =>
  rosterOf(encounter).reduce((sum, line) => sum + line.count, 0)

const rosterNames = (encounter: EntitySummary) =>
  rosterOf(encounter)
    .map(line => (line.count > 1 ? `${line.name} ×${line.count}` : line.name))
    .join(', ')

async function startEncounter(encounter: EntitySummary) {
  starting.value = encounter.id
  try {
    state.value = await runEncounter.run(encounter)
    history.value = []
    toast.add({
      title: `“${encounter.name}” is on`,
      description: `${state.value.combatants.length} in the order. Roll initiative.`,
      icon: 'i-lucide-swords',
      color: 'success'
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    starting.value = null
  }
}

/**
 * Nothing prepped, or the plan just went sideways — an empty fight opens the
 * tracker and everything arrives through the picker.
 */
async function improvise() {
  state.value = { active: true, round: 1, turn_index: 0, map_id: null, combatants: [] }
  history.value = []
  await persist()
  pickerOpen.value = true
}

/** The last fight, exactly as it ended — for "wait, they come back" */
async function resume() {
  state.value.active = true
  await persist()
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

/* --- Running the fight ------------------------------------------------------ */

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

/**
 * The sword and the heart each open a small popover asking "how much?" —
 * type the number, press enter, done. The amount is kept per combatant,
 * because "the last hit on this goblin" repeats far more often than it
 * changes.
 */
const hitOpen = reactive<Record<string, 'dmg' | 'heal' | undefined>>({})
const amounts = reactive<Record<string, number>>({})

function applyHit(combatant: Combatant, direction: 1 | -1) {
  if (combatant.max_hp == null) {
    return
  }
  const amount = Math.abs(amounts[combatant.id] ?? 1) || 1
  writeHp(combatant, (combatant.current_hp ?? combatant.max_hp) + direction * amount)
  hitOpen[combatant.id] = undefined
}

/** Straight to the floor — save-or-die, a called shot, the DM's ruling */
function down(combatant: Combatant) {
  if (combatant.max_hp == null) {
    return
  }
  writeHp(combatant, 0)
}

/**
 * The one glance the DM needs: fine, bloodied (half or less, as the rules
 * call it), or on the floor — where a character is dying and a monster is
 * simply down.
 */
function healthOf(combatant: Combatant): 'bloodied' | 'dying' | 'down' | null {
  if (combatant.max_hp == null) {
    return null
  }
  const hp = combatant.current_hp ?? combatant.max_hp
  if (hp === 0) {
    return combatant.kind === 'character' ? 'dying' : 'down'
  }
  if (hp <= combatant.max_hp / 2) {
    return 'bloodied'
  }
  return null
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
    :description="state.active
      ? 'The order, HP and conditions — the table sees only what you cast.'
      : 'Pick a fight you prepared, or improvise one.'"
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: 'Combat' }
    ]"
  >
    <template #actions>
      <template v-if="isDm && current && state.active">
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
          label="End combat"
          icon="i-lucide-flag"
          color="error"
          variant="outline"
          class="rounded-xl"
          @click="end"
        />
      </template>
      <UButton
        v-else-if="isDm && current"
        label="New encounter"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        class="rounded-xl"
        to="/entities/new?type=encounter"
      />
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

    <!-- ================= THE CHOOSER ================= -->
    <div
      v-else-if="!state.active"
      class="space-y-4"
    >
      <!-- The last fight, if it can be picked back up -->
      <ContentCard
        v-if="state.combatants.length"
        title="The last fight"
        icon="i-lucide-history"
        :description="`Round ${state.round}, ${state.combatants.length} in the order — as you left it.`"
      >
        <template #actions>
          <UButton
            label="Pick it back up"
            icon="i-lucide-play"
            size="sm"
            color="neutral"
            variant="outline"
            @click="resume"
          />
        </template>
      </ContentCard>

      <div
        v-if="encounters.length"
        class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div
          v-for="encounter in encounters"
          :key="encounter.id"
          class="flex flex-col rounded-2xl border border-default p-4 transition-colors hover:border-accented"
        >
          <div class="flex items-start justify-between gap-2">
            <NuxtLink
              :to="`/entities/${encounter.id}`"
              class="min-w-0 text-base font-semibold text-highlighted hover:text-primary"
            >
              {{ encounter.name }}
            </NuxtLink>
            <UBadge
              v-if="encounter.data.difficulty"
              :color="['deadly', 'hard'].includes(String(encounter.data.difficulty)) ? 'error' : 'neutral'"
              variant="subtle"
              class="shrink-0 rounded-full capitalize"
            >
              {{ encounter.data.difficulty }}
            </UBadge>
          </div>

          <p class="mt-1 flex-1 text-sm text-muted">
            <template v-if="headcount(encounter)">
              {{ headcount(encounter) }} against the party —
              {{ rosterNames(encounter) }}
            </template>
            <template v-else>
              Nothing in it yet — open it to prep the roster.
            </template>
          </p>

          <div class="mt-3 flex items-center gap-2">
            <UButton
              label="Run this"
              icon="i-lucide-swords"
              size="sm"
              :loading="starting === encounter.id"
              :disabled="!headcount(encounter)"
              @click="startEncounter(encounter)"
            />
            <UIcon
              v-if="encounter.data.map_id"
              name="i-lucide-map"
              class="size-4 text-dimmed"
              title="Has a battle map"
            />
          </div>
        </div>
      </div>

      <EmptyState
        v-else
        icon="i-lucide-swords"
        title="Nothing prepped yet"
        description="Encounters are prepared ahead — roster, map, starting positions — and run from here when the moment comes."
      >
        <UButton
          label="Prep the first one"
          icon="i-lucide-plus"
          to="/entities/new?type=encounter"
        />
      </EmptyState>

      <p class="text-sm text-muted">
        Ambushed the other way around?
        <button
          type="button"
          class="font-medium text-primary hover:underline"
          @click="improvise"
        >
          Improvise a fight
        </button>
        — empty tracker, add as it happens.
      </p>
    </div>

    <!-- ================= THE TRACKER ================= -->
    <div
      v-else
      class="grid gap-4 lg:grid-cols-5"
    >
      <ContentCard
        class="lg:col-span-2"
        :title="`Round ${state.round}`"
        icon="i-lucide-list-ordered"
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

        <div
          v-if="!ordered.length"
          class="px-4 py-6 text-center"
        >
          <p class="mb-3 text-sm text-muted">
            Nobody in the fight yet.
          </p>
          <UButton
            label="Add the fighters"
            icon="i-lucide-plus"
            variant="soft"
            @click="pickerOpen = true"
          />
        </div>

        <ul v-else>
          <li
            v-for="combatant in ordered"
            :key="combatant.id"
            class="border-b border-default px-3 py-3 last:border-0"
            :class="combatant.id === activeId && 'bg-primary/5 ring-1 ring-inset ring-primary/30'"
          >
            <div class="flex items-center gap-3">
              <!-- Initiative wears a diamond, AC wears a shield — different
                 shapes so the two numbers never read as each other -->
              <UPopover
                :open="initiativeOpen[combatant.id] ?? false"
                @update:open="open => setInitiativeOpen(combatant.id, open)"
              >
                <button
                  type="button"
                  class="relative flex size-9 shrink-0 items-center justify-center"
                  :aria-label="`Initiative for ${combatant.name}`"
                >
                  <span class="absolute inset-1 rotate-45 rounded-[5px] border-2 border-primary/50 bg-primary/10 transition-colors hover:bg-primary/20" />
                  <span class="relative text-sm font-bold tabular-nums text-highlighted">
                    {{ combatant.initiative }}
                  </span>
                </button>
                <template #content>
                  <form
                    class="w-44 space-y-2 p-2.5"
                    @submit.prevent="setInitiativeOpen(combatant.id, false)"
                  >
                    <!-- A plain input on purpose: the fancy number field kept
                       its keystrokes to itself inside a popover, and a roll
                       you can't type in is no roll at all -->
                    <UInput
                      type="number"
                      :model-value="combatant.initiative"
                      size="sm"
                      class="w-full"
                      autofocus
                      :aria-label="`Initiative for ${combatant.name}`"
                      @focus="($event.target as HTMLInputElement).select()"
                      @keydown.enter.prevent="setInitiativeOpen(combatant.id, false)"
                      @update:model-value="value => {
                        snapshot(`initiative for ${combatant.name}`, `init:${combatant.id}`)
                        combatant.initiative = Math.max(-10, Math.min(50, Number(value) || 0))
                      }"
                    />
                    <div class="flex gap-1.5">
                      <UButton
                        label="d20"
                        icon="i-lucide-dices"
                        size="xs"
                        color="neutral"
                        variant="outline"
                        @click="() => {
                          snapshot(`initiative for ${combatant.name}`, `init:${combatant.id}`)
                          combatant.initiative = 1 + Math.floor(Math.random() * 20)
                        }"
                      />
                      <UButton
                        type="submit"
                        label="Done"
                        size="xs"
                        class="flex-1 justify-center"
                      />
                    </div>
                  </form>
                </template>
              </UPopover>

              <UAvatar
                :src="portraitSrc(combatant)"
                :alt="combatant.name"
                :icon="combatant.kind === 'character' ? 'i-lucide-user-round'
                  : combatant.kind === 'monster' ? 'i-lucide-skull' : 'i-lucide-shapes'"
                size="md"
                class="shrink-0"
                :class="[
                  combatant.id === activeId && 'ring-2 ring-primary',
                  healthOf(combatant) === 'down' || healthOf(combatant) === 'dying'
                    ? 'opacity-40 grayscale' : ''
                ]"
              />

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span
                    class="min-w-0 truncate text-sm font-semibold"
                    :class="healthOf(combatant) === 'down' ? 'text-dimmed line-through' : 'text-highlighted'"
                  >
                    {{ combatant.name }}
                  </span>
                  <!-- The state the DM needs at a glance, said out loud -->
                  <UBadge
                    v-if="healthOf(combatant) === 'dying'"
                    color="error"
                    variant="solid"
                    class="animate-pulse rounded-full"
                  >
                    Dying
                  </UBadge>
                  <UBadge
                    v-else-if="healthOf(combatant) === 'down'"
                    color="neutral"
                    variant="subtle"
                    class="rounded-full"
                  >
                    Down
                  </UBadge>
                  <UBadge
                    v-else-if="healthOf(combatant) === 'bloodied'"
                    color="warning"
                    variant="subtle"
                    class="rounded-full"
                  >
                    Bloodied
                  </UBadge>
                </div>

                <div
                  v-if="combatant.conditions.length"
                  class="mt-0.5 flex flex-wrap gap-1"
                >
                  <span
                    v-for="name in combatant.conditions"
                    :key="name"
                    class="rounded-full bg-warning/15 px-1.5 py-px text-[11px] capitalize text-warning"
                  >
                    {{ name }}
                  </span>
                </div>
              </div>

              <!-- AC, big enough to read mid-sentence -->
              <div
                v-if="acFor(combatant)"
                class="relative flex size-9 shrink-0 items-center justify-center"
                :title="`AC ${acFor(combatant)}`"
              >
                <UIcon
                  name="i-lucide-shield"
                  class="absolute inset-0 size-full text-dimmed/40"
                />
                <span class="relative text-sm font-bold text-highlighted">
                  {{ String(acFor(combatant)).match(/\d+/)?.[0] ?? acFor(combatant) }}
                </span>
              </div>

              <!-- Conditions live behind one small button, not six on every row -->
              <UPopover>
                <UButton
                  icon="i-lucide-activity"
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

            <!-- HP: the bar, the number, and the two directions damage goes -->
            <div
              v-if="combatant.max_hp != null"
              class="mt-2 flex items-center gap-2 pl-12"
            >
              <div class="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-elevated">
                <div
                  class="h-full rounded-full transition-all"
                  :class="hpPercent(combatant)! > 50 ? 'bg-emerald-500' : hpPercent(combatant)! > 25 ? 'bg-amber-500' : 'bg-red-500'"
                  :style="{ width: `${hpPercent(combatant)}%` }"
                />
              </div>
              <span class="shrink-0 text-sm font-medium tabular-nums text-toned">
                {{ combatant.current_hp ?? combatant.max_hp }}<span class="text-dimmed">/{{ combatant.max_hp }}</span>
              </span>

              <UPopover
                :open="hitOpen[combatant.id] === 'dmg'"
                @update:open="open => hitOpen[combatant.id] = open ? 'dmg' : undefined"
              >
                <UButton
                  icon="i-lucide-sword"
                  size="xs"
                  color="error"
                  variant="soft"
                  :aria-label="`Damage ${combatant.name}`"
                />
                <template #content>
                  <form
                    class="flex items-center gap-1.5 p-2"
                    @submit.prevent="applyHit(combatant, -1)"
                  >
                    <UInput
                      type="number"
                      :model-value="amounts[combatant.id] ?? 1"
                      size="sm"
                      class="w-24"
                      autofocus
                      :aria-label="`Damage amount for ${combatant.name}`"
                      @focus="($event.target as HTMLInputElement).select()"
                      @keydown.enter.prevent="applyHit(combatant, -1)"
                      @update:model-value="value => amounts[combatant.id] = Number(value) || 1"
                    />
                    <UButton
                      type="submit"
                      label="Hit"
                      icon="i-lucide-sword"
                      color="error"
                      size="sm"
                    />
                  </form>
                </template>
              </UPopover>
              <UPopover
                :open="hitOpen[combatant.id] === 'heal'"
                @update:open="open => hitOpen[combatant.id] = open ? 'heal' : undefined"
              >
                <UButton
                  icon="i-lucide-heart-plus"
                  size="xs"
                  color="success"
                  variant="soft"
                  :aria-label="`Heal ${combatant.name}`"
                />
                <template #content>
                  <form
                    class="flex items-center gap-1.5 p-2"
                    @submit.prevent="applyHit(combatant, 1)"
                  >
                    <UInput
                      type="number"
                      :model-value="amounts[combatant.id] ?? 1"
                      size="sm"
                      class="w-24"
                      autofocus
                      :aria-label="`Heal amount for ${combatant.name}`"
                      @focus="($event.target as HTMLInputElement).select()"
                      @keydown.enter.prevent="applyHit(combatant, 1)"
                      @update:model-value="value => amounts[combatant.id] = Number(value) || 1"
                    />
                    <UButton
                      type="submit"
                      label="Heal"
                      icon="i-lucide-heart-plus"
                      color="success"
                      size="sm"
                    />
                  </form>
                </template>
              </UPopover>
              <UButton
                v-if="combatant.kind !== 'character' && healthOf(combatant) !== 'down'"
                icon="i-lucide-skull"
                size="xs"
                color="neutral"
                variant="ghost"
                :aria-label="`${combatant.name} drops`"
                @click="down(combatant)"
              />
            </div>

            <!-- On a monster's turn: how it fights, dice ready to press -->
            <div
              v-if="combatant.id === activeId && attacksFor(combatant)"
              class="mt-2 ml-12 rounded-xl bg-elevated/60 p-2.5"
            >
              <p class="text-xs leading-relaxed whitespace-pre-line text-toned">
                {{ attacksFor(combatant) }}
              </p>
              <div
                v-if="attackDice(attacksFor(combatant)!).length"
                class="mt-1.5 flex flex-wrap gap-1"
              >
                <UButton
                  v-for="formula in attackDice(attacksFor(combatant)!)"
                  :key="formula"
                  :label="formula"
                  icon="i-lucide-dices"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  @click="rollFormula(formula)"
                />
              </div>
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
          <div class="flex rounded-lg border border-default p-0.5">
            <button
              v-for="option in WALL_MODES"
              :key="option.value"
              type="button"
              class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40"
              :class="wallMode === option.value
                ? 'bg-primary text-inverted'
                : 'text-muted hover:text-highlighted'"
              :disabled="!ordered.length && option.value !== 'off'"
              @click="setWallMode(option.value)"
            >
              <UIcon
                :name="option.icon"
                class="size-3.5"
              />
              {{ option.label }}
            </button>
          </div>
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

    <CombatantPicker
      v-model:open="pickerOpen"
      :taken-entity-ids="takenEntityIds"
      @character="addCharacter"
      @monster="addMonster"
      @custom="addCustom"
    />
  </AppPage>
</template>
