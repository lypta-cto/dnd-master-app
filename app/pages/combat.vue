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
const casting = ref(false)

const characters = ref<EntitySummary[]>([])
const monsters = ref<EntitySummary[]>([])
const customName = ref('')

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

function queueSave() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(persist, 400)
}

onUnmounted(() => clearTimeout(saveTimer))

/** What the table is allowed to know: order, turn, who's down. Never monster HP. */
async function castInitiative() {
  await cast.set({
    mode: 'initiative',
    payload: {
      round: state.value.round,
      active_id: activeId.value,
      combatants: ordered.value.map(c => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        down: c.current_hp === 0
      }))
    }
  })
}

async function toggleCasting(value: boolean) {
  casting.value = value
  try {
    if (value) {
      await castInitiative()
      toast.add({ title: 'Initiative on the table display', icon: 'i-lucide-cast', color: 'success' })
    } else {
      await cast.clear()
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
  state.value.combatants.push({
    id: nextId(), name, kind: 'custom', initiative: 0,
    max_hp: null, current_hp: null, conditions: []
  })
  customName.value = ''
  queueSave()
}

function removeCombatant(id: string) {
  const index = ordered.value.findIndex(c => c.id === id)
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
  state.value.active = true
  state.value.round = 1
  state.value.turn_index = 0
  persist()
}

async function end() {
  state.value.active = false
  clearTimeout(saveTimer)
  await combat.set(state.value)

  if (casting.value) {
    casting.value = false
    await cast.clear()
  }
  toast.add({ title: `Combat ended after round ${state.value.round}`, icon: 'i-lucide-flag', color: 'success' })
}

function nextTurn() {
  if (!ordered.value.length) {
    return
  }
  if (state.value.turn_index >= ordered.value.length - 1) {
    state.value.turn_index = 0
    state.value.round += 1
  } else {
    state.value.turn_index += 1
  }
  persist()
}

function previousTurn() {
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
  combatant.current_hp = Math.max(0, Math.min(combatant.max_hp, current + delta))
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

function toggleCondition(combatant: Combatant, name: string) {
  combatant.conditions = combatant.conditions.includes(name)
    ? combatant.conditions.filter(c => c !== name)
    : [...combatant.conditions, name]
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
    description="Initiative, HP and conditions — the table sees only what you cast."
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: 'Combat' }
    ]"
  >
    <template #actions>
      <template v-if="isDm && current">
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
      class="grid gap-4 lg:grid-cols-3"
    >
      <!-- Initiative order -->
      <ContentCard
        class="lg:col-span-2"
        :title="state.active ? `Round ${state.round}` : 'Initiative order'"
        icon="i-lucide-list-ordered"
        :description="state.active ? undefined : 'Add combatants, enter initiative rolls, then start.'"
        flush
      >
        <template
          v-if="state.active"
          #actions
        >
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
              <!-- Initiative -->
              <UInputNumber
                :model-value="combatant.initiative"
                :min="-10"
                :max="50"
                size="sm"
                class="w-20"
                :aria-label="`Initiative for ${combatant.name}`"
                @update:model-value="value => { combatant.initiative = value ?? 0; queueSave() }"
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
                  <span class="w-16 text-center text-sm tabular-nums text-toned">
                    {{ combatant.current_hp ?? combatant.max_hp }}/{{ combatant.max_hp }}
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

      <!-- Roster -->
      <div class="space-y-4">
        <ContentCard
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
          title="Monsters"
          icon="i-lucide-skull"
          description="Click again for another copy — they number themselves."
        >
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="monster in monsters"
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
  </AppPage>
</template>
