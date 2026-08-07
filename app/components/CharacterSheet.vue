<script setup lang="ts">
/**
 * The sheet as a tracker, not a builder — paper stays the source of truth.
 * Tracks the things nobody wants to remember mid-session: HP, slots,
 * conditions, death saves. No rules engine anywhere.
 *
 * Edits autosave (debounced) into the entity's `data` JSONB.
 */
const props = defineProps<{
  entity: EntityDetail
  /** Owner or DM — the backend enforces it; this only shows/hides controls */
  canEdit: boolean
}>()

const toast = useToast()
const entities = useEntities()
const { confirm } = useConfirm()

interface SlotRow {
  total: number
  used: number
}

interface SheetData {
  level: number
  ac: number
  max_hp: number
  current_hp: number
  temp_hp: number
  slots: Record<string, SlotRow>
  conditions: string[]
  inspiration: boolean
  death_saves: { s: number, f: number }
}

const CONDITIONS = [
  'blinded', 'charmed', 'deafened', 'frightened', 'grappled', 'incapacitated',
  'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained',
  'stunned', 'unconscious', 'exhaustion', 'concentrating'
]

function fromData(data: Record<string, unknown>): SheetData {
  const d = data as Partial<SheetData>
  return {
    level: Number(d.level) || 1,
    ac: Number(d.ac) || 10,
    max_hp: Number(d.max_hp) || 10,
    current_hp: d.current_hp === undefined ? Number(d.max_hp) || 10 : Number(d.current_hp),
    temp_hp: Number(d.temp_hp) || 0,
    slots: { ...(d.slots ?? {}) },
    conditions: [...(d.conditions ?? [])],
    inspiration: !!d.inspiration,
    death_saves: { s: d.death_saves?.s ?? 0, f: d.death_saves?.f ?? 0 }
  }
}

const sheet = reactive(fromData(props.entity.data))
const saving = ref(false)

let timer: ReturnType<typeof setTimeout> | undefined

watch(sheet, () => {
  if (!props.canEdit) {
    return
  }

  clearTimeout(timer)
  timer = setTimeout(async () => {
    saving.value = true
    try {
      // Merge, so type fields (class, ancestry) survive untouched
      await entities.update(props.entity.id, {
        data: { ...props.entity.data, ...JSON.parse(JSON.stringify(sheet)) }
      })
    } catch (error) {
      toast.add({ title: apiErrorMessage(error, 'Save failed'), icon: 'i-lucide-circle-alert', color: 'error' })
    } finally {
      saving.value = false
    }
  }, 600)
}, { deep: true })

onUnmounted(() => clearTimeout(timer))

const hpPercent = computed(() =>
  sheet.max_hp > 0 ? Math.max(0, Math.min(100, (sheet.current_hp / sheet.max_hp) * 100)) : 0
)

const hpColor = computed(() => {
  if (hpPercent.value > 50) return 'bg-emerald-500'
  if (hpPercent.value > 25) return 'bg-amber-500'
  return 'bg-red-500'
})

function bumpHp(delta: number) {
  // Damage eats temp HP first, like the book says
  if (delta < 0 && sheet.temp_hp > 0) {
    const absorbed = Math.min(sheet.temp_hp, -delta)
    sheet.temp_hp -= absorbed
    delta += absorbed
  }
  const wasDown = sheet.current_hp === 0
  sheet.current_hp = Math.max(0, Math.min(sheet.max_hp, sheet.current_hp + delta))
  // Any healing from 0 ends the dying state
  if (wasDown && sheet.current_hp > 0) {
    sheet.death_saves = { s: 0, f: 0 }
  }
}

function setHp(value: number | null) {
  const wasDown = sheet.current_hp === 0
  sheet.current_hp = Math.max(0, Math.min(sheet.max_hp, Math.round(value ?? 0)))
  if (wasDown && sheet.current_hp > 0) {
    sheet.death_saves = { s: 0, f: 0 }
  }
}

/* Odd amounts — "takes 13 damage" — without clicking ± repeatedly */
const customAmount = ref<number | null>(null)

function applyCustom(sign: 1 | -1) {
  if (!customAmount.value || customAmount.value < 1) {
    return
  }
  bumpHp(sign * Math.round(customAmount.value))
  customAmount.value = null
}

async function longRest() {
  const ok = await confirm({
    title: 'Long rest?',
    description: 'HP back to max, temp HP gone, all spell slots restored, death saves cleared.',
    confirmLabel: 'Rest'
  })
  if (!ok) {
    return
  }
  sheet.current_hp = sheet.max_hp
  sheet.temp_hp = 0
  sheet.death_saves = { s: 0, f: 0 }
  for (const row of Object.values(sheet.slots)) {
    row.used = 0
  }
  toast.add({ title: 'Long rest taken', icon: 'i-lucide-moon', color: 'success' })
}

/** Slot levels that exist, plus one empty level the owner can start using */
const slotLevels = computed(() => {
  const existing = Object.keys(sheet.slots).map(Number).sort((a, b) => a - b)
  const highest = existing.at(-1) ?? 0
  return props.canEdit && highest < 9 ? [...existing, highest + 1] : existing
})

function setSlotTotal(level: number, total: number) {
  if (total <= 0) {
    const { [String(level)]: _, ...rest } = sheet.slots
    sheet.slots = rest
    return
  }
  const row = sheet.slots[String(level)] ?? { total: 0, used: 0 }
  sheet.slots = {
    ...sheet.slots,
    [String(level)]: { total, used: Math.min(row.used, total) }
  }
}

function toggleSlot(level: number, index: number) {
  const row = sheet.slots[String(level)]
  if (!row || !props.canEdit) {
    return
  }
  row.used = index < row.used ? index : index + 1
}

function toggleCondition(name: string) {
  sheet.conditions = sheet.conditions.includes(name)
    ? sheet.conditions.filter(c => c !== name)
    : [...sheet.conditions, name]
}

function setDeathSave(kind: 's' | 'f', index: number) {
  sheet.death_saves[kind] = sheet.death_saves[kind] === index + 1 ? index : index + 1
}
</script>

<template>
  <ContentCard
    title="Sheet"
    icon="i-lucide-clipboard-list"
    :description="canEdit ? 'Autosaves as you tap.' : 'Read-only — this sheet belongs to its player.'"
  >
    <template #actions>
      <UBadge
        v-if="saving"
        label="Saving…"
        color="neutral"
        variant="subtle"
        size="sm"
      />
      <UButton
        v-if="canEdit"
        label="Long rest"
        icon="i-lucide-moon"
        color="neutral"
        variant="outline"
        size="sm"
        @click="longRest"
      />
    </template>

    <div class="space-y-5">
      <!-- Vitals row -->
      <div class="grid grid-cols-3 gap-3">
        <UFormField label="Level">
          <UInputNumber
            v-model="sheet.level"
            :min="1"
            :max="20"
            :disabled="!canEdit"
            class="w-full"
          />
        </UFormField>
        <UFormField label="AC">
          <UInputNumber
            v-model="sheet.ac"
            :min="1"
            :max="30"
            :disabled="!canEdit"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Max HP">
          <UInputNumber
            v-model="sheet.max_hp"
            :min="1"
            :max="999"
            :disabled="!canEdit"
            class="w-full"
          />
        </UFormField>
      </div>

      <!-- HP bar with quick +/- -->
      <div>
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <span class="text-sm font-medium text-highlighted">Hit points</span>
          <span class="flex items-center gap-1.5 text-sm tabular-nums text-toned">
            <UInputNumber
              v-if="canEdit"
              :model-value="sheet.current_hp"
              :min="0"
              :max="sheet.max_hp"
              size="xs"
              class="w-20"
              aria-label="Current HP"
              @update:model-value="setHp"
            />
            <template v-else>
              {{ sheet.current_hp }}
            </template>
            / {{ sheet.max_hp }}
            <span
              v-if="sheet.temp_hp"
              class="text-info"
            >+{{ sheet.temp_hp }} temp</span>
          </span>
        </div>

        <div class="h-3 overflow-hidden rounded-full bg-elevated">
          <div
            class="h-full rounded-full transition-all duration-300"
            :class="hpColor"
            :style="{ width: `${hpPercent}%` }"
          />
        </div>

        <div
          v-if="canEdit"
          class="mt-2 flex flex-wrap items-center gap-1.5"
        >
          <UButton
            v-for="delta in [-10, -5, -1]"
            :key="delta"
            :label="String(delta)"
            size="xs"
            color="error"
            variant="soft"
            @click="bumpHp(delta)"
          />
          <UButton
            v-for="delta in [1, 5, 10]"
            :key="delta"
            :label="`+${delta}`"
            size="xs"
            color="success"
            variant="soft"
            @click="bumpHp(delta)"
          />

          <!-- Arbitrary amount: type 13, hit Dmg or Heal -->
          <span class="mx-1 flex items-center gap-1">
            <UInput
              v-model.number="customAmount"
              type="number"
              min="1"
              max="999"
              placeholder="13"
              size="xs"
              class="w-14"
              aria-label="Custom amount"
              @keydown.enter="applyCustom(-1)"
            />
            <UButton
              label="Dmg"
              size="xs"
              color="error"
              variant="outline"
              :disabled="!customAmount"
              @click="applyCustom(-1)"
            />
            <UButton
              label="Heal"
              size="xs"
              color="success"
              variant="outline"
              :disabled="!customAmount"
              @click="applyCustom(1)"
            />
          </span>

          <UFormField class="ml-auto">
            <UInputNumber
              v-model="sheet.temp_hp"
              :min="0"
              :max="99"
              :disabled="!canEdit"
              size="xs"
              class="w-24"
              aria-label="Temporary HP"
            />
          </UFormField>
          <span class="text-xs text-muted">temp</span>
        </div>
      </div>

      <!-- Spell slots -->
      <div v-if="slotLevels.length">
        <p class="mb-1.5 text-sm font-medium text-highlighted">
          Spell slots
        </p>
        <div class="space-y-1.5">
          <div
            v-for="level in slotLevels"
            :key="level"
            class="flex items-center gap-2"
          >
            <span class="w-10 shrink-0 text-xs text-muted">Lv {{ level }}</span>

            <div class="flex flex-wrap gap-1">
              <button
                v-for="index in sheet.slots[String(level)]?.total ?? 0"
                :key="index"
                type="button"
                class="size-5 rounded-md border transition-colors"
                :class="index <= (sheet.slots[String(level)]?.used ?? 0)
                  ? 'border-primary bg-primary'
                  : 'border-accented bg-transparent hover:border-primary'"
                :disabled="!canEdit"
                :aria-label="`Level ${level} slot ${index}`"
                @click="toggleSlot(level, index - 1)"
              />
            </div>

            <UInputNumber
              v-if="canEdit"
              :model-value="sheet.slots[String(level)]?.total ?? 0"
              :min="0"
              :max="12"
              size="xs"
              class="ml-auto w-20"
              :aria-label="`Total level ${level} slots`"
              @update:model-value="value => setSlotTotal(level, value ?? 0)"
            />
          </div>
        </div>
        <p
          v-if="canEdit"
          class="mt-1 text-xs text-dimmed"
        >
          Filled squares are used. Set a level's total to 0 to remove it.
        </p>
      </div>

      <!-- Conditions -->
      <div>
        <p class="mb-1.5 text-sm font-medium text-highlighted">
          Conditions
        </p>
        <div class="flex flex-wrap gap-1.5">
          <UButton
            v-for="name in CONDITIONS"
            :key="name"
            :label="name"
            size="xs"
            class="capitalize"
            :color="sheet.conditions.includes(name) ? 'warning' : 'neutral'"
            :variant="sheet.conditions.includes(name) ? 'solid' : 'outline'"
            :disabled="!canEdit"
            @click="toggleCondition(name)"
          />
        </div>
      </div>

      <!-- Inspiration + death saves -->
      <div class="flex flex-wrap items-center justify-between gap-4">
        <USwitch
          v-model="sheet.inspiration"
          label="Inspiration"
          :disabled="!canEdit"
        />

        <div class="flex items-center gap-4">
          <div class="flex items-center gap-1.5">
            <span class="text-xs text-muted">Saves</span>
            <button
              v-for="index in 3"
              :key="`s${index}`"
              type="button"
              class="size-4 rounded-full border transition-colors"
              :class="index <= sheet.death_saves.s
                ? 'border-emerald-500 bg-emerald-500'
                : 'border-accented'"
              :disabled="!canEdit"
              :aria-label="`Death save success ${index}`"
              @click="setDeathSave('s', index - 1)"
            />
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-xs text-muted">Fails</span>
            <button
              v-for="index in 3"
              :key="`f${index}`"
              type="button"
              class="size-4 rounded-full border transition-colors"
              :class="index <= sheet.death_saves.f
                ? 'border-red-500 bg-red-500'
                : 'border-accented'"
              :disabled="!canEdit"
              :aria-label="`Death save failure ${index}`"
              @click="setDeathSave('f', index - 1)"
            />
          </div>
        </div>
      </div>
    </div>
  </ContentCard>
</template>
