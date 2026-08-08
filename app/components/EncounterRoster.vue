<script setup lang="ts">
/**
 * Who is in this fight, decided before the session rather than during it.
 *
 * "Five goblins and a goblin king" is a thing the DM knows while prepping and
 * then reassembles from memory at the table. Written down here, "Run this"
 * builds the initiative order from it in one click.
 *
 * Lines keep their own `name` rather than only pointing at a monster: deleting
 * the bestiary entry later should leave the encounter readable, not blank.
 */
const props = defineProps<{
  entity: EntityDetail
  canEdit: boolean
}>()

const toast = useToast()
const { confirm } = useConfirm()
const entities = useEntities()
const combat = useCombat()

interface RosterLine {
  id: string
  entity_id: string | null
  name: string
  count: number
  /** Copied when the line is added, so starting a fight needs no lookup */
  hp: number | null
}

const roster = ref<RosterLine[]>(
  Array.isArray(props.entity.data.roster) ? [...(props.entity.data.roster as RosterLine[])] : []
)

const saving = ref(false)
const running = ref(false)

const total = computed(() => roster.value.reduce((sum, line) => sum + line.count, 0))

let saveTimer: ReturnType<typeof setTimeout> | undefined

/**
 * Debounced, and it tells nobody.
 *
 * Holding the stepper is four clicks in a second, and this used to send a
 * request and ask the page to reload the entity on each one — which replaced
 * the very button being clicked, so every press after the first landed on a
 * detached node. Nothing outside this card renders the roster, so nothing
 * outside it needs to hear about a change.
 */
function persist() {
  clearTimeout(saveTimer)
  saving.value = true

  saveTimer = setTimeout(async () => {
    try {
      // Read first: `data` is replaced whole and the copy in props is whatever
      // the page loaded with — the same trap the map viewer and the thumbnail
      // picker both hit.
      const fresh = await entities.read(props.entity.id)
      await entities.update(props.entity.id, {
        data: { ...fresh.data, roster: JSON.parse(JSON.stringify(roster.value)) }
      })
    } catch (error) {
      toast.add({
        title: apiErrorMessage(error, 'Save failed'),
        icon: 'i-lucide-circle-alert',
        color: 'error'
      })
    } finally {
      saving.value = false
    }
  }, 400)
}

onBeforeUnmount(() => clearTimeout(saveTimer))

/* --- Adding ---------------------------------------------------------------- */

const picker = reactive({ open: false, query: '', results: [] as EntitySummary[] })
const customName = ref('')

let searchTimer: ReturnType<typeof setTimeout> | undefined

watch(() => picker.query, (q) => {
  clearTimeout(searchTimer)

  if (!q.trim()) {
    picker.results = []
    return
  }

  searchTimer = setTimeout(async () => {
    const page = await entities.list({ type: 'monster', q: q.trim(), page_size: 10 })
    picker.results = page.items
  }, 250)
})

onBeforeUnmount(() => clearTimeout(searchTimer))

const lineId = () => Math.random().toString(36).slice(2, 10)

async function addMonster(monster: EntitySummary) {
  const existing = roster.value.find(line => line.entity_id === monster.id)

  // Adding the same monster twice means "one more of them", not a second line
  if (existing) {
    existing.count += 1
  } else {
    roster.value.push({
      id: lineId(),
      entity_id: monster.id,
      name: monster.name,
      count: 1,
      hp: Number(monster.data.hp) || null
    })
  }

  picker.open = false
  picker.query = ''
  persist()
}

async function addCustom() {
  const name = customName.value.trim()
  if (!name) {
    return
  }
  roster.value.push({ id: lineId(), entity_id: null, name, count: 1, hp: null })
  customName.value = ''
  picker.open = false
  persist()
}

function setCount(line: RosterLine, count: number) {
  line.count = Math.max(1, Math.min(50, count))
  persist()
}

function remove(id: string) {
  roster.value = roster.value.filter(line => line.id !== id)
  persist()
}

/* --- Running it ------------------------------------------------------------ */

async function run() {
  if (!roster.value.length) {
    return
  }

  const current = await combat.get()

  if (
    current.active
    && !(await confirm({
      title: 'A fight is already running',
      description: 'Starting this one replaces whatever is on the initiative screen.',
      confirmLabel: 'Replace it'
    }))
  ) {
    return
  }

  running.value = true

  try {
    // The party comes along: an initiative order without them is half a fight,
    // and the DM would only add them by hand a moment later.
    const party = await entities.list({ type: 'character', page_size: 50 })

    const combatants: Combatant[] = party.items.map(character => ({
      id: lineId(),
      name: character.name,
      kind: 'character' as const,
      entity_id: character.id,
      initiative: 0,
      max_hp: Number(character.data.max_hp) || null,
      current_hp: character.data.current_hp === undefined
        ? Number(character.data.max_hp) || null
        : Number(character.data.current_hp),
      conditions: []
    }))

    for (const line of roster.value) {
      for (let copy = 1; copy <= line.count; copy++) {
        combatants.push({
          id: lineId(),
          // Numbered only when there is more than one, so a lone king stays
          // "Goblin King" rather than "Goblin King 1"
          name: line.count > 1 ? `${line.name} ${copy}` : line.name,
          kind: line.entity_id ? 'monster' : 'custom',
          entity_id: line.entity_id,
          initiative: 0,
          max_hp: line.hp,
          current_hp: line.hp,
          conditions: []
        })
      }
    }

    await combat.set({ active: true, round: 1, turn_index: 0, combatants })

    toast.add({
      title: `“${props.entity.name}” is on`,
      description: `${combatants.length} in the order. Roll initiative.`,
      icon: 'i-lucide-swords',
      color: 'success'
    })

    await navigateTo('/combat')
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    running.value = false
  }
}
</script>

<template>
  <ContentCard
    title="Who's in it"
    icon="i-lucide-swords"
    :description="roster.length
      ? `${total} against the party. “Run this” puts them in the initiative order together.`
      : 'Decide the opposition now, so the table doesn’t wait while you remember it.'"
  >
    <template #actions>
      <UButton
        v-if="canEdit"
        label="Add"
        icon="i-lucide-plus"
        color="neutral"
        variant="outline"
        size="sm"
        @click="picker.open = true"
      />
      <UButton
        v-if="roster.length && canEdit"
        label="Run this"
        icon="i-lucide-swords"
        size="sm"
        :loading="running"
        @click="run"
      />
    </template>

    <div
      v-if="roster.length"
      class="divide-y divide-default"
    >
      <div
        v-for="line in roster"
        :key="line.id"
        class="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
      >
        <UIcon
          :name="line.entity_id ? 'i-lucide-skull' : 'i-lucide-user'"
          class="size-4 shrink-0 text-dimmed"
        />

        <NuxtLink
          v-if="line.entity_id"
          :to="`/entities/${line.entity_id}`"
          class="min-w-0 flex-1 truncate text-sm text-highlighted hover:text-primary"
        >
          {{ line.name }}
        </NuxtLink>
        <span
          v-else
          class="min-w-0 flex-1 truncate text-sm text-highlighted"
        >{{ line.name }}</span>

        <span
          v-if="line.hp"
          class="shrink-0 text-xs tabular-nums text-dimmed"
        >{{ line.hp }} HP</span>

        <UInputNumber
          v-if="canEdit"
          :model-value="line.count"
          :min="1"
          :max="50"
          size="xs"
          class="w-24 shrink-0"
          @update:model-value="value => setCount(line, Number(value))"
        />
        <span
          v-else
          class="shrink-0 text-sm tabular-nums text-muted"
        >×{{ line.count }}</span>

        <UButton
          v-if="canEdit"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          :disabled="saving"
          aria-label="Remove"
          @click="remove(line.id)"
        />
      </div>
    </div>

    <p
      v-else
      class="text-sm text-muted"
    >
      Nothing here yet.
    </p>

    <UModal
      v-model:open="picker.open"
      title="Add to the fight"
      description="Anything from the bestiary, or a name of your own."
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <div class="space-y-3">
          <UInput
            v-model="picker.query"
            icon="i-lucide-search"
            placeholder="Goblin, wolf, cultist…"
            autofocus
            class="w-full"
          />

          <div
            v-if="picker.results.length"
            class="space-y-1"
          >
            <button
              v-for="hit in picker.results"
              :key="hit.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-elevated"
              @click="addMonster(hit)"
            >
              <UIcon
                name="i-lucide-skull"
                class="size-4 shrink-0"
              />
              <span class="truncate">{{ hit.name }}</span>
              <span
                v-if="hit.data.cr"
                class="ml-auto shrink-0 text-xs text-dimmed"
              >CR {{ hit.data.cr }}</span>
            </button>
          </div>

          <USeparator label="or" />

          <div class="flex gap-2">
            <UInput
              v-model="customName"
              placeholder="Bandit captain"
              class="flex-1"
              @keydown.enter.prevent="addCustom"
            />
            <UButton
              label="Add"
              color="neutral"
              variant="outline"
              :disabled="!customName.trim()"
              @click="addCustom"
            />
          </div>
        </div>
      </template>
    </UModal>
  </ContentCard>
</template>
