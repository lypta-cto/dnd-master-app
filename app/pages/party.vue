<script setup lang="ts">
/**
 * The whole party on one screen — what the DM glances at mid-fight.
 * HP is adjustable right here (DM anywhere, players on their own character);
 * everything else links through to the full sheet.
 */
const { current, isDm } = useCampaigns()
const { user } = useAuth()
const entities = useEntities()
const toast = useToast()
const mediaUrl = useMediaUrl()

const characters = ref<EntitySummary[]>([])
const loading = ref(true)
const savingId = ref<string | null>(null)

async function load() {
  if (!current.value) {
    loading.value = false
    return
  }

  loading.value = true
  try {
    characters.value = (await entities.list({ type: 'character', page_size: 100 })).items
  } finally {
    loading.value = false
  }
}

watch(() => current.value?.id, load, { immediate: true })

function canTouch(character: EntitySummary) {
  return isDm.value || character.owner_id === user.value?.id
}

function hp(character: EntitySummary) {
  const max = Number(character.data.max_hp) || 0
  const current_ = character.data.current_hp === undefined
    ? max
    : Number(character.data.current_hp)
  return { current: current_, max, temp: Number(character.data.temp_hp) || 0 }
}

function hpPercent(character: EntitySummary) {
  const { current: c, max } = hp(character)
  return max > 0 ? Math.max(0, Math.min(100, (c / max) * 100)) : 0
}

function hpColor(character: EntitySummary) {
  const pct = hpPercent(character)
  if (pct > 50) return 'bg-emerald-500'
  if (pct > 25) return 'bg-amber-500'
  if (pct > 0) return 'bg-red-500'
  return 'bg-red-800'
}

async function bumpHp(character: EntitySummary, delta: number) {
  const state = hp(character)

  // Damage eats temp HP first, matching the sheet
  let temp = state.temp
  if (delta < 0 && temp > 0) {
    const absorbed = Math.min(temp, -delta)
    temp -= absorbed
    delta += absorbed
  }

  const next = Math.max(0, Math.min(state.max, state.current + delta))
  const data = { ...character.data, current_hp: next, temp_hp: temp }

  // Optimistic — the table doesn't wait for round-trips
  character.data = data
  savingId.value = character.id

  try {
    await entities.update(character.id, { data })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error, 'Save failed'), icon: 'i-lucide-circle-alert', color: 'error' })
    await load()
  } finally {
    savingId.value = null
  }
}

function conditions(character: EntitySummary): string[] {
  return Array.isArray(character.data.conditions) ? character.data.conditions as string[] : []
}

function slotSummary(character: EntitySummary): string | null {
  const slots = character.data.slots as Record<string, { total: number, used: number }> | undefined
  if (!slots) return null
  const parts = Object.entries(slots)
    .filter(([, row]) => row.total > 0)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([level, row]) => `L${level} ${row.total - row.used}/${row.total}`)
  return parts.length ? parts.join(' · ') : null
}

function deathSaves(character: EntitySummary) {
  const raw = character.data.death_saves as { s?: number, f?: number } | undefined
  return { s: raw?.s ?? 0, f: raw?.f ?? 0 }
}

function subtitle(character: EntitySummary) {
  const parts = [character.data.class, character.data.ancestry].filter(Boolean)
  const level = character.data.level ? `Lv ${character.data.level}` : null
  return [level, ...parts].filter(Boolean).join(' · ')
}
</script>

<template>
  <AppPage
    title="Party"
    description="Everyone at the table, at a glance."
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: 'Party' }
    ]"
  >
    <div
      v-if="loading"
      class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      <USkeleton
        v-for="i in 3"
        :key="i"
        class="h-52 rounded-2xl"
      />
    </div>

    <EmptyState
      v-else-if="!characters.length"
      icon="i-lucide-users-round"
      title="No characters yet"
      description="Players create their own from the Characters section — each sheet shows up here."
    />

    <div
      v-else
      class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    >
      <ContentCard
        v-for="character in characters"
        :key="character.id"
      >
        <template #header>
          <NuxtLink
            :to="`/entities/${character.id}`"
            class="group flex min-w-0 items-center gap-3"
          >
            <UAvatar
              :src="mediaUrl(character.image_url)"
              :alt="character.name"
              :text="character.name.slice(0, 2).toUpperCase()"
              size="lg"
            />
            <span class="min-w-0">
              <span class="block truncate font-semibold text-highlighted group-hover:text-primary">
                {{ character.name }}
              </span>
              <span class="block truncate text-xs text-muted">
                {{ subtitle(character) || 'No class set' }}
              </span>
            </span>
          </NuxtLink>
        </template>

        <template #actions>
          <UBadge
            :label="`AC ${character.data.ac ?? '–'}`"
            color="neutral"
            variant="subtle"
            size="sm"
          />
          <UBadge
            v-if="character.data.passive_perception"
            :label="`PP ${character.data.passive_perception}`"
            color="neutral"
            variant="subtle"
            size="sm"
          />
        </template>

        <div class="space-y-3">
          <!-- HP -->
          <div>
            <div class="mb-1 flex items-baseline justify-between text-sm">
              <span class="text-muted">HP</span>
              <span class="tabular-nums text-toned">
                {{ hp(character).current }} / {{ hp(character).max }}
                <span
                  v-if="hp(character).temp"
                  class="text-info"
                >+{{ hp(character).temp }}</span>
              </span>
            </div>
            <div class="h-2.5 overflow-hidden rounded-full bg-elevated">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="hpColor(character)"
                :style="{ width: `${hpPercent(character)}%` }"
              />
            </div>

            <div
              v-if="canTouch(character)"
              class="mt-2 flex items-center gap-1.5"
            >
              <UButton
                v-for="delta in [-5, -1]"
                :key="delta"
                :label="String(delta)"
                size="xs"
                color="error"
                variant="soft"
                :disabled="savingId === character.id"
                @click="bumpHp(character, delta)"
              />
              <UButton
                v-for="delta in [1, 5]"
                :key="delta"
                :label="`+${delta}`"
                size="xs"
                color="success"
                variant="soft"
                :disabled="savingId === character.id"
                @click="bumpHp(character, delta)"
              />
              <UIcon
                v-if="savingId === character.id"
                name="i-lucide-loader-circle"
                class="ml-auto size-3.5 animate-spin text-muted"
              />
            </div>
          </div>

          <!-- Spell slots left -->
          <p
            v-if="slotSummary(character)"
            class="text-xs tabular-nums text-muted"
          >
            Slots: {{ slotSummary(character) }}
          </p>

          <!-- Death saves, only when it matters -->
          <div
            v-if="hp(character).current === 0"
            class="flex items-center gap-3 text-xs"
          >
            <span class="flex items-center gap-1">
              <span class="text-muted">Saves</span>
              <span
                v-for="i in 3"
                :key="`s${i}`"
                class="size-2.5 rounded-full border"
                :class="i <= deathSaves(character).s ? 'border-emerald-500 bg-emerald-500' : 'border-accented'"
              />
            </span>
            <span class="flex items-center gap-1">
              <span class="text-muted">Fails</span>
              <span
                v-for="i in 3"
                :key="`f${i}`"
                class="size-2.5 rounded-full border"
                :class="i <= deathSaves(character).f ? 'border-red-500 bg-red-500' : 'border-accented'"
              />
            </span>
          </div>

          <!-- Conditions -->
          <div
            v-if="conditions(character).length || hp(character).current === 0"
            class="flex flex-wrap gap-1"
          >
            <UBadge
              v-if="hp(character).current === 0"
              label="down"
              color="error"
              variant="solid"
              size="sm"
            />
            <UBadge
              v-for="name in conditions(character)"
              :key="name"
              :label="name"
              color="warning"
              variant="subtle"
              size="sm"
              class="capitalize"
            />
          </div>
        </div>
      </ContentCard>
    </div>
  </AppPage>
</template>
