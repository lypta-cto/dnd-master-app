<script setup lang="ts">
/**
 * The fight, from the DM's side of the screen.
 *
 * Every change saves the whole state (one PUT — matches the table's pace) and,
 * when "show on display" is on, casts a sanitised initiative list: names and
 * turn order only. Monster HP never leaves this screen.
 */
const { current, isDm } = useCampaigns()
const entities = useEntities()
const combat = useCombat()
const cast = useCast()
const toast = useToast()

const state = ref<CombatState>({ active: false, round: 1, turn_index: 0, combatants: [] })
const loading = ref(true)
/**
 * Read from what's actually on the table, not from a local flag.
 *
 * A local one said "off" every time the DM came back to this page, so the
 * switch claimed nothing was being shown while the party watched initiative.
 */
const casting = computed(() => !!cast.current.value?.initiative?.entries?.length)

const characters = ref<EntitySummary[]>([])
const monsters = ref<EntitySummary[]>([])
const customName = ref('')

/**
 * Filtered here rather than re-fetched: the whole bestiary is already loaded
 * for this screen, and a request per keystroke mid-fight is latency the table
 * would feel. Folded, so "kovac" finds "Kovač" like everywhere else.
 */
const monsterQuery = ref('')

/**
 * Two screens in one, told apart by whether the fight has started.
 *
 * Building: who is in it, on what map, standing where. Playing: the order,
 * damage, conditions, whose turn. They were shown together, which meant a wall
 * of "add a bandit" buttons sat beside the initiative order all through the
 * fight, and the thing you actually needed mid-combat was the smaller half of
 * the screen.
 */
/**
 * Which half of the screen you're on, chosen rather than inferred.
 *
 * This was inferred from whether the fight had started, which meant the split
 * was invisible: the page quietly rearranged itself and looked like the same
 * one screen it had always been. It's a switch you press now, and it says
 * which half you're in.
 *
 * Independent of `active` on purpose — flipping back to Build mid-fight is how
 * reinforcements arrive, and must not end the fight to do it.
 */
const view = ref<'build' | 'play'>('build')

const building = computed(() => view.value === 'build')

const VIEWS = [
  { label: 'Build the fight', value: 'build', icon: 'i-lucide-users-round' },
  { label: 'Play it out', value: 'play', icon: 'i-lucide-swords' }
]

// A fight already running belongs on the play half the moment the page opens
watch(() => state.value.active, (active) => {
  if (active) {
    view.value = 'play'
  }
})

const showAdders = computed(() => building.value)

const shownMonsters = computed(() => {
  const needle = fold(monsterQuery.value.trim())
  if (!needle) {
    return monsters.value
  }
  return monsters.value.filter(monster => fold(monster.name).includes(needle))
})

const QUICK_CONDITIONS = ['prone', 'poisoned', 'stunned', 'restrained', 'frightened', 'concentrating']

async function load() {
  if (!current.value || !isDm.value) {
    loading.value = false
    return
  }

  loading.value = true
  try {
    const [fight, chars, mons] = await Promise.all([
      combat.get(),
      entities.list({ type: 'character', page_size: 100 }),
      entities.list({ type: 'monster', page_size: 200 })
    ])
    state.value = fight
    characters.value = chars.items
    monsters.value = mons.items
  } finally {
    loading.value = false
  }
}

watch(() => current.value?.id, load, { immediate: true })

const ordered = computed(() =>
  [...state.value.combatants].sort((a, b) => b.initiative - a.initiative)
)

/** turn_index counts through the *sorted* order */
const activeId = computed(() => ordered.value[state.value.turn_index]?.id ?? null)

let saveTimer: ReturnType<typeof setTimeout> | undefined

async function persist() {
  try {
    await combat.set(state.value)
    if (casting.value) {
      await castInitiative()
    }
  } catch (error) {
    toast.add({ title: apiErrorMessage(error, 'Save failed'), icon: 'i-lucide-circle-alert', color: 'error' })
  }
}

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

function queueSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persist, 400)
}

onUnmounted(() => clearTimeout(saveTimer))

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

/**
 * The order of turns, as a strip above whatever else is on the wall.
 *
 * It used to be a cast mode of its own, which meant the table could see the
 * order *or* the battle map and never both — and casting the map silently
 * took the order away mid-fight. It has its own lifetime now: up while the
 * fight runs, underneath everything cast in between.
 *
 * What the table is allowed to know: order, whose turn, who is down. Never a
 * monster's remaining hit points.
 */
async function castInitiative() {
  await cast.setInitiative(
    ordered.value.map(c => ({
      name: c.name,
      kind: c.kind,
      down: c.current_hp === 0,
      active: c.id === activeId.value
    })),
    state.value.round
  )
}

/** Empty takes the strip down — the fight is over, so the header goes too */
const clearInitiative = () => cast.setInitiative([])

async function toggleCasting(value: boolean) {
  try {
    if (value) {
      await castInitiative()
      toast.add({
        title: 'Initiative above whatever else is on the table',
        icon: 'i-lucide-cast',
        color: 'success'
      })
    } else {
      await clearInitiative()
    }
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  }
}

/* --- Roster ---------------------------------------------------------------- */

function nextId() {
  return Math.random().toString(36).slice(2, 10)
}

function addCharacter(character: EntitySummary) {
  if (state.value.combatants.some(c => c.entity_id === character.id)) {
    return
  }
  snapshot(`added ${character.name}`)
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

function addCustom() {
  const name = customName.value.trim()
  if (!name) {
    return
  }
  snapshot(`added ${name}`)
  state.value.combatants.push({
    id: nextId(), name, kind: 'custom', initiative: 0,
    max_hp: null, current_hp: null, conditions: []
  })
  customName.value = ''
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

function start() {
  snapshot('start of combat')
  state.value.active = true
  state.value.round = 1
  state.value.turn_index = 0
  persist()
}

async function end() {
  state.value.active = false
  clearTimeout(saveTimer)
  await combat.set(state.value)

  // The strip comes down with the fight; whatever else is on the wall stays
  if (casting.value) {
    await clearInitiative()
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
</script>

<template>
  <AppPage
    title="Combat"
    :description="building
      ? 'Build the fight: who is in it, on what map, standing where.'
      : 'Initiative, HP and conditions — the table sees only what you cast.'"
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
        <USwitch
          :model-value="casting"
          label="Show on display"
          @update:model-value="toggleCasting"
        />
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
      <div class="flex w-full max-w-md rounded-xl border border-default p-1">
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

      <div class="grid gap-4 lg:grid-cols-3">
        <!-- Initiative order -->
        <ContentCard
          class="lg:col-span-2"
          :title="building ? 'Who\'s in the fight' : `Round ${state.round}`"
          icon="i-lucide-list-ordered"
          :description="state.active ? undefined : 'Add combatants, enter initiative rolls, then start.'"
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

          <p
            v-if="!ordered.length"
            class="p-6 text-sm text-muted"
          >
            Nobody in the fight yet — add the party and monsters from the right.
          </p>

          <ul v-else>
            <li
              v-for="combatant in ordered"
              :key="combatant.id"
              class="border-b border-default px-4 py-3 last:border-0 sm:px-5"
              :class="state.active && combatant.id === activeId && 'bg-primary/5 ring-1 ring-inset ring-primary/30'"
            >
              <div class="flex flex-wrap items-center gap-3">
                <!-- Only once the fight is running. Before that this screen is
                   for assembling who's in it, and a column of zeroes to tab
                   through is noise you have to look past. -->
                <UInputNumber
                  v-if="state.active"
                  :model-value="combatant.initiative"
                  :min="-10"
                  :max="50"
                  size="sm"
                  class="w-20"
                  :aria-label="`Initiative for ${combatant.name}`"
                  @update:model-value="value => {
                    snapshot(`initiative for ${combatant.name}`, `init:${combatant.id}`)
                    combatant.initiative = value ?? 0
                    queueSave()
                  }"
                />

                <UIcon
                  :name="combatant.kind === 'character' ? 'i-lucide-user-round'
                    : combatant.kind === 'monster' ? 'i-lucide-skull' : 'i-lucide-shapes'"
                  class="size-4 shrink-0"
                  :class="combatant.kind === 'monster' ? 'text-error' : 'text-primary'"
                />

                <span
                  class="min-w-0 flex-1 truncate font-medium"
                  :class="combatant.current_hp === 0 ? 'text-dimmed line-through' : 'text-highlighted'"
                >
                  {{ combatant.name }}
                </span>

                <!-- HP (if tracked) -->
                <template v-if="combatant.max_hp != null">
                  <div class="flex items-center gap-1.5">
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
                        class="w-18"
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
                  </div>
                </template>

                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :aria-label="`Remove ${combatant.name}`"
                  @click="removeCombatant(combatant.id)"
                />
              </div>

              <!-- HP bar + conditions -->
              <div
                v-if="combatant.max_hp != null || combatant.conditions.length"
                class="mt-2 flex flex-wrap items-center gap-2 pl-24"
              >
                <div
                  v-if="hpPercent(combatant) !== null"
                  class="h-1.5 w-28 overflow-hidden rounded-full bg-elevated"
                >
                  <div
                    class="h-full rounded-full transition-all"
                    :class="hpPercent(combatant)! > 50 ? 'bg-emerald-500' : hpPercent(combatant)! > 25 ? 'bg-amber-500' : 'bg-red-500'"
                    :style="{ width: `${hpPercent(combatant)}%` }"
                  />
                </div>

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
            </li>
          </ul>
        </ContentCard>

        <BattleMap
          class="lg:col-span-2"
          :combatants="state.combatants"
          :map-id="state.map_id"
          @chose="chooseMap"
          @moved="moveToken"
        />

        <!-- Assembling the fight -->
        <div class="space-y-4">
          <ContentCard
            v-if="showAdders"
            title="The party"
            icon="i-lucide-users-round"
          >
            <div class="flex flex-wrap gap-1.5">
              <UButton
                v-for="character in characters"
                :key="character.id"
                :label="character.name"
                icon="i-lucide-plus"
                size="sm"
                color="neutral"
                variant="outline"
                :disabled="state.combatants.some(c => c.entity_id === character.id)"
                @click="addCharacter(character)"
              />
            </div>
            <p
              v-if="!characters.length"
              class="text-sm text-muted"
            >
              No characters in the campaign yet.
            </p>
          </ContentCard>

          <ContentCard
            v-if="showAdders"
            title="Monsters"
            icon="i-lucide-skull"
            description="Click again for another copy — they number themselves."
          >
            <div class="space-y-2">
              <!-- A campaign accumulates a bestiary; a wall of buttons stops
                 being findable somewhere around thirty of them -->
              <UInput
                v-model="monsterQuery"
                icon="i-lucide-search"
                placeholder="Goblin, wolf, cultist…"
                size="sm"
                class="w-full"
              />
              <div class="flex flex-wrap gap-1.5">
                <UButton
                  v-for="monster in shownMonsters"
                  :key="monster.id"
                  :label="monster.name"
                  icon="i-lucide-plus"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  @click="addMonster(monster)"
                />
              </div>
              <p
                v-if="monsterQuery.trim() && !shownMonsters.length"
                class="text-sm text-muted"
              >
                Nothing matches “{{ monsterQuery }}”.
              </p>
            </div>
            <p
              v-if="!monsters.length"
              class="text-sm text-muted"
            >
              No statblocks yet —
              <NuxtLink
                to="/entities/new?type=monster"
                class="font-medium text-primary"
              >create one</NuxtLink>.
            </p>
          </ContentCard>

          <ContentCard
            title="Dice"
            icon="i-lucide-dices"
          >
            <DiceRoller />
          </ContentCard>

          <ContentCard
            v-if="showAdders"
            title="Anything else"
            icon="i-lucide-shapes"
            description="A trap, lair action, a summoned wolf — no statblock needed."
          >
            <form
              class="flex gap-2"
              @submit.prevent="addCustom"
            >
              <UInput
                v-model="customName"
                placeholder="Swinging blade trap"
                class="flex-1"
              />
              <UButton
                type="submit"
                icon="i-lucide-plus"
                :disabled="!customName.trim()"
                aria-label="Add"
              />
            </form>
          </ContentCard>
        </div>
      </div>
    </div>
  </AppPage>
</template>
