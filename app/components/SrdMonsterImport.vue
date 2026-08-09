<script setup lang="ts">
/**
 * Pulling monsters into the campaign's own bestiary, from either of two doors.
 *
 * The SRD door searches Open5e live and brings full statblocks, attacks
 * included. The CSV door reads a spreadsheet the DM already has — hundreds of
 * monsters from the printed books — parsed entirely in the browser, searched
 * locally, imported one by one. Either way an import copies the statblock as
 * a monster entity, and from then on it's yours: rename it, rewrite the
 * attacks, hang a portrait on it. "Customise" is the same thing dropped
 * straight into the editor, for the DM whose Giant Rat is about to become a
 * Beer Giant Snail.
 */
const emit = defineEmits<{
  imported: [id: string]
}>()

const open = defineModel<boolean>('open', { required: true })

const entities = useEntities()
const srd = useSrdMonsters()
const toast = useToast()

const source = ref<'srd' | 'csv'>('srd')

const SOURCES = [
  { value: 'srd', label: 'SRD, live', icon: 'i-lucide-book-open' },
  { value: 'csv', label: 'From a CSV', icon: 'i-lucide-file-spreadsheet' }
] as const

const query = ref('')
const srdResults = ref<SrdMonster[]>([])
const searching = ref(false)
const busy = ref<string | null>(null)

/* --- The SRD door ----------------------------------------------------------- */

let searchTimer: ReturnType<typeof setTimeout> | undefined

async function searchSrd() {
  searching.value = true
  try {
    srdResults.value = await srd.search(query.value)
  } catch {
    toast.add({
      title: 'The SRD is unreachable right now',
      icon: 'i-lucide-cloud-off',
      color: 'error'
    })
  } finally {
    searching.value = false
  }
}

watch(query, () => {
  if (source.value !== 'srd') {
    return
  }
  clearTimeout(searchTimer)
  searchTimer = setTimeout(searchSrd, 300)
})

watch(open, (isOpen) => {
  if (isOpen && source.value === 'srd' && !srdResults.value.length) {
    searchSrd()
  }
})

onBeforeUnmount(() => clearTimeout(searchTimer))

/* --- The CSV door ------------------------------------------------------------
 * Loaded once per file and searched in memory: 800 rows is nothing to hold
 * and everything to re-parse per keystroke.
 */

const csvMonsters = ref<SrdMonster[]>([])
const csvName = ref('')

async function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) {
    return
  }

  const parsed = parseMonsterCsv(await file.text())
  if (!parsed.length) {
    toast.add({
      title: 'No monsters found in that file',
      description: 'It needs a header row with at least a Name column.',
      icon: 'i-lucide-file-x',
      color: 'error'
    })
    return
  }

  csvMonsters.value = parsed
  csvName.value = file.name
  toast.add({
    title: `${parsed.length} monsters read from ${file.name}`,
    icon: 'i-lucide-file-spreadsheet',
    color: 'success'
  })
}

const csvResults = computed(() => {
  const needle = fold(query.value.trim())
  const hits = needle
    ? csvMonsters.value.filter(monster => fold(monster.name).includes(needle))
    : csvMonsters.value
  return hits.slice(0, 12)
})

/**
 * The whole file at once — the "campaign bestiary" move. The server skips
 * names already present, so pressing it twice doesn't double anything;
 * favourites are how the working set is picked out of the pile afterwards.
 */
const importingAll = ref(false)

async function importAll() {
  importingAll.value = true
  try {
    const result = await entities.bulkCreate(
      csvMonsters.value.map(monster => ({
        type: 'monster' as const,
        name: monster.name,
        summary: `${monster.size} ${monster.kind}, CR ${monster.cr}${monster.source ? ` — from ${monster.source}` : ''}.`.replace(/\s+/g, ' '),
        body: monster.body ?? null,
        data: monster.data
      }))
    )
    emit('imported', '')
    toast.add({
      title: `${result.created} monsters imported`,
      description: result.skipped
        ? `${result.skipped} already in the campaign, left alone.`
        : undefined,
      icon: 'i-lucide-library-big',
      color: 'success'
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    importingAll.value = false
  }
}

const results = computed(() => (source.value === 'srd' ? srdResults.value : csvResults.value))

/* --- Importing --------------------------------------------------------------- */

async function importMonster(monster: SrdMonster, customise = false) {
  busy.value = monster.slug + (customise ? ':edit' : '')
  try {
    const from = monster.source || 'the SRD'
    const created = await entities.create({
      type: 'monster',
      name: monster.name,
      summary: `${monster.size} ${monster.kind}, CR ${monster.cr} — from ${from}.`.replace(/\s+/g, ' '),
      body: monster.body ?? null,
      data: monster.data
    })
    emit('imported', created.id)

    if (customise) {
      open.value = false
      await navigateTo(`/entities/${created.id}/edit`)
      return
    }

    toast.add({
      title: `${monster.name} joins the bestiary`,
      icon: 'i-lucide-skull',
      color: 'success'
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Add monsters"
    description="From the openly licensed SRD, or a spreadsheet of your own. Imported monsters are yours to rework."
    :ui="{ content: 'max-w-lg' }"
  >
    <template #body>
      <div class="space-y-3">
        <div class="flex rounded-lg border border-default p-0.5">
          <button
            v-for="option in SOURCES"
            :key="option.value"
            type="button"
            class="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
            :class="source === option.value
              ? 'bg-primary text-inverted'
              : 'text-muted hover:text-highlighted'"
            @click="source = option.value"
          >
            <UIcon
              :name="option.icon"
              class="size-3.5"
            />
            {{ option.label }}
          </button>
        </div>

        <!-- The file, asked for once -->
        <div
          v-if="source === 'csv' && !csvMonsters.length"
          class="rounded-xl border border-dashed border-default p-4 text-center"
        >
          <p class="mb-2 text-sm text-muted">
            A spreadsheet export with a header row — Name, Type, AC, HP, CR and
            friends. Read here in the browser; nothing is uploaded.
          </p>
          <label class="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-default px-3 py-1.5 text-sm font-medium text-highlighted transition-colors hover:border-accented">
            <UIcon
              name="i-lucide-upload"
              class="size-4"
            />
            Choose a .csv file
            <input
              type="file"
              accept=".csv,text/csv"
              class="hidden"
              @change="onFile"
            >
          </label>
        </div>

        <template v-if="source === 'srd' || csvMonsters.length">
          <div class="flex items-center gap-2">
            <UInput
              v-model="query"
              icon="i-lucide-search"
              placeholder="Goblin, owlbear, troll…"
              autofocus
              class="w-full"
              :loading="searching"
            />
            <label
              v-if="source === 'csv'"
              class="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted hover:text-highlighted"
              :title="csvName"
            >
              <UIcon
                name="i-lucide-file-spreadsheet"
                class="size-3.5"
              />
              {{ csvMonsters.length }} loaded
              <input
                type="file"
                accept=".csv,text/csv"
                class="hidden"
                @change="onFile"
              >
            </label>
            <UButton
              v-if="source === 'csv'"
              :label="`Import all ${csvMonsters.length}`"
              icon="i-lucide-library-big"
              size="xs"
              color="neutral"
              variant="outline"
              class="shrink-0"
              :loading="importingAll"
              @click="importAll"
            />
          </div>

          <div
            v-if="results.length"
            class="max-h-80 space-y-1 overflow-y-auto"
          >
            <div
              v-for="monster in results"
              :key="monster.slug"
              class="flex items-center gap-2 rounded-lg p-1.5 hover:bg-elevated"
            >
              <UIcon
                name="i-lucide-skull"
                class="size-4 shrink-0 text-dimmed"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-highlighted">
                  {{ monster.name }}
                </p>
                <p class="truncate text-xs text-dimmed">
                  {{ monster.size }} {{ monster.kind }} · CR {{ monster.cr }} ·
                  AC {{ monster.ac }} · {{ monster.hp }} HP
                </p>
              </div>
              <UButton
                label="Import"
                size="xs"
                color="neutral"
                variant="outline"
                :loading="busy === monster.slug"
                @click="importMonster(monster)"
              />
              <UTooltip text="Import, then edit it into your own creature">
                <UButton
                  label="Customise"
                  icon="i-lucide-pencil"
                  size="xs"
                  variant="soft"
                  :loading="busy === `${monster.slug}:edit`"
                  @click="importMonster(monster, true)"
                />
              </UTooltip>
            </div>
          </div>

          <p
            v-else-if="!searching"
            class="text-sm text-muted"
          >
            Nothing matches “{{ query }}”.
          </p>
        </template>
      </div>
    </template>
  </UModal>
</template>
