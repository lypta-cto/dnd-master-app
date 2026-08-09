<script setup lang="ts">
/**
 * Preparing a fight, as opposed to running one.
 *
 * The encounter is where a fight is decided — who is in it, what map it
 * happens on, where everyone starts, and what gets read out when it begins.
 * `/combat` is where it is played. Keeping them as two screens rather than one
 * is the point: prep is unhurried and the table isn't watching, and nothing
 * here can put anything on the wall by accident.
 *
 * Everything lives on the encounter's own `data`, so none of it needed a
 * migration — the single-table spine is exactly for this.
 *
 * Lines keep their own `name` rather than only pointing at a monster: deleting
 * the bestiary entry later should leave the encounter readable, not blank.
 */
import type { RosterLine } from '~/composables/useRunEncounter'

const props = defineProps<{
  entity: EntityDetail
  canEdit: boolean
}>()

const toast = useToast()
const { confirm } = useConfirm()
const entities = useEntities()
const combat = useCombat()
const cast = useCast()
const portraits = usePortraits()
const mediaUrl = useMediaUrl()
const runEncounter = useRunEncounter()

const roster = ref<RosterLine[]>(
  Array.isArray(props.entity.data.roster) ? [...(props.entity.data.roster as RosterLine[])] : []
)

/** Which map the fight is prepped on */
const mapId = ref<string | null>((props.entity.data.map_id as string | null) ?? null)

// Faces for the roster rows, from the same cache the board draws on
watch(
  () => roster.value.map(line => line.entity_id).join(','),
  () => portraits.ensure(roster.value.map(line => line.entity_id)),
  { immediate: true }
)

/**
 * Where each copy starts, keyed by line and copy number.
 *
 * Per copy rather than per line, because five goblins stand in five places.
 * The key survives a count change: dropping from five goblins to three leaves
 * two orphaned entries, which are simply never looked up again.
 */
const placements = ref<Record<string, { x: number, y: number }>>(
  (props.entity.data.placements as Record<string, { x: number, y: number }>) ?? {}
)

/** Read out when the fight begins, so the opening isn't improvised twice */
const intro = ref<string>((props.entity.data.intro as string) ?? '')

/**
 * The party is always in the fight — that's what running an encounter means —
 * but not always all of it: someone is captured, scouting, or sitting this
 * one out. The encounter remembers who stays behind, not who joins, so a
 * character created next week is included without touching old encounters.
 */
const party = ref<EntitySummary[]>([])
const excluded = ref<string[]>(
  Array.isArray(props.entity.data.excluded_party)
    ? [...(props.entity.data.excluded_party as string[])]
    : []
)

onMounted(async () => {
  const page = await entities.list({ type: 'character', page_size: 50 })
  party.value = page.items
  portraits.remember(page.items)
})

const isExcluded = (id: string) => excluded.value.includes(id)

function togglePartyMember(id: string) {
  excluded.value = isExcluded(id)
    ? excluded.value.filter(memberId => memberId !== id)
    : [...excluded.value, id]
  persist()
}

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
        data: {
          ...fresh.data,
          roster: JSON.parse(JSON.stringify(roster.value)),
          map_id: mapId.value,
          placements: JSON.parse(JSON.stringify(placements.value)),
          intro: intro.value.trim() || undefined,
          excluded_party: excluded.value.length ? [...excluded.value] : undefined
        }
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

/* --- Adding ----------------------------------------------------------------
 * The same picker the combat screen uses, minus the party — they join on
 * their own the moment the encounter runs. It stays open after an add, since
 * assembling an ambush is five adds in a row, not one.
 */

const pickerOpen = ref(false)

const lineId = () => Math.random().toString(36).slice(2, 10)

function addMonster(monster: EntitySummary) {
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

  persist()
}

function addCustom(name: string) {
  roster.value.push({ id: lineId(), entity_id: null, name, count: 1, hp: null })
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

/* --- The board ------------------------------------------------------------- */

/** Stable per copy, so a position survives everything except being removed */
const placementKey = (line: RosterLine, copy: number) => `${line.id}#${copy}`

const displayName = (line: RosterLine, copy: number) =>
  line.count > 1 ? `${line.name} ${copy}` : line.name

/**
 * The roster expanded into one token per copy, shaped like combatants so the
 * same battle map serves prep and play. There is no second component and no
 * second set of rules about what a token is.
 */
const preview = computed<Combatant[]>(() =>
  roster.value.flatMap(line =>
    Array.from({ length: line.count }, (_, index) => {
      const copy = index + 1
      const key = placementKey(line, copy)
      const at = placements.value[key]

      return {
        id: key,
        name: displayName(line, copy),
        kind: (line.entity_id ? 'monster' : 'custom') as Combatant['kind'],
        entity_id: line.entity_id,
        initiative: 0,
        max_hp: line.hp,
        current_hp: line.hp,
        conditions: [],
        x: at?.x ?? null,
        y: at?.y ?? null
      }
    })
  )
)

function place(key: string, point: { x: number, y: number }) {
  placements.value = { ...placements.value, [key]: point }
  persist()
}

function chooseMap(next: string | null) {
  mapId.value = next
  // Positions mean nothing on a different map, and a stale one would put a
  // goblin in a wall the moment another map was picked
  if (!next) {
    placements.value = {}
  }
  persist()
}

/* --- Reading it out -------------------------------------------------------- */

const reading = ref(false)

/** The DM's call, never automatic — the opening lands when they say it does */
async function readIntro() {
  if (!intro.value.trim()) {
    return
  }
  reading.value = true

  try {
    const result = await cast.set({ mode: 'text', payload: { text: intro.value.trim() } })
    toast.add({
      title: 'On the table',
      icon: 'i-lucide-cast',
      color: result.displays_connected ? 'success' : 'warning',
      description: result.displays_connected ? undefined : 'No display connected'
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    reading.value = false
  }
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
    // The same door the combat screen's chooser uses — the party joins on its
    // own, copies keep their numbers and their prepped positions.
    const started = await runEncounter.run({
      name: props.entity.name,
      data: {
        ...props.entity.data,
        roster: JSON.parse(JSON.stringify(roster.value)),
        map_id: mapId.value,
        placements: JSON.parse(JSON.stringify(placements.value)),
        excluded_party: [...excluded.value]
      }
    })

    toast.add({
      title: `“${props.entity.name}” is on`,
      description: `${started.combatants.length} in the order. Roll initiative.`,
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
  <div class="space-y-4">
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
          @click="pickerOpen = true"
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

      <!-- The party rides along by default; a click benches someone -->
      <div
        v-if="party.length"
        class="mb-3"
      >
        <p class="mb-1 text-xs font-medium tracking-wide text-dimmed uppercase">
          The party joins
        </p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="member in party"
            :key="member.id"
            type="button"
            class="flex items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-0.5 text-xs font-medium transition-colors"
            :class="isExcluded(member.id)
              ? 'border-default text-dimmed opacity-50'
              : 'border-primary/40 bg-primary/10 text-highlighted'"
            :disabled="!canEdit"
            :title="isExcluded(member.id) ? 'Sitting this one out — click to include' : 'In the fight — click to exclude'"
            @click="togglePartyMember(member.id)"
          >
            <UAvatar
              :src="member.image_url ? mediaUrl(member.image_url) : undefined"
              :alt="member.name"
              icon="i-lucide-user-round"
              size="3xs"
            />
            {{ member.name }}
            <UIcon
              :name="isExcluded(member.id) ? 'i-lucide-x' : 'i-lucide-check'"
              class="size-3"
            />
          </button>
        </div>
      </div>

      <div
        v-if="roster.length"
        class="divide-y divide-default"
      >
        <div
          v-for="line in roster"
          :key="line.id"
          class="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
        >
          <UAvatar
            :src="line.entity_id && portraits.urlFor(line.entity_id)
              ? mediaUrl(portraits.urlFor(line.entity_id)!) : undefined"
            :alt="line.name"
            :icon="line.entity_id ? 'i-lucide-skull' : 'i-lucide-shapes'"
            size="sm"
            class="shrink-0"
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

      <CombatantPicker
        v-model:open="pickerOpen"
        :taken-entity-ids="[]"
        hide-party
        @monster="addMonster"
        @custom="addCustom"
      />
    </ContentCard>

    <!-- Same board as the fight, minus the button that puts it on the wall -->
    <BattleMap
      v-if="canEdit && roster.length"
      :combatants="preview"
      :map-id="mapId"
      prep
      @chose="chooseMap"
      @moved="place"
    />

    <ContentCard
      v-if="canEdit"
      title="How it opens"
      icon="i-lucide-megaphone"
      description="What you read out when it starts. Written now, so the opening isn't improvised while everyone waits."
    >
      <template #actions>
        <UButton
          label="Read to the table"
          icon="i-lucide-cast"
          color="neutral"
          variant="outline"
          size="sm"
          :loading="reading"
          :disabled="!intro.trim()"
          @click="readIntro"
        />
      </template>

      <UTextarea
        v-model="intro"
        :rows="4"
        placeholder="The rocks above you shift, and the first arrow is already in the air."
        class="w-full"
        @blur="persist"
      />
    </ContentCard>
  </div>
</template>
