<script setup lang="ts">
/**
 * Pulling monsters from the SRD into the campaign's own bestiary.
 *
 * Import copies the statblock as a monster entity — from then on it's yours:
 * rename it, rewrite the attacks, hang a portrait on it. "Import & customise"
 * is the same thing dropped straight into the editor, for the DM whose Giant
 * Rat is about to become a Beer Giant Snail.
 */
const emit = defineEmits<{
  imported: [id: string]
}>()

const open = defineModel<boolean>('open', { required: true })

const entities = useEntities()
const srd = useSrdMonsters()
const toast = useToast()

const query = ref('')
const results = ref<SrdMonster[]>([])
const searching = ref(false)
const busy = ref<string | null>(null)

let searchTimer: ReturnType<typeof setTimeout> | undefined

async function search() {
  searching.value = true
  try {
    results.value = await srd.search(query.value)
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
  clearTimeout(searchTimer)
  searchTimer = setTimeout(search, 300)
})

watch(open, (isOpen) => {
  if (isOpen && !results.value.length) {
    search()
  }
})

onBeforeUnmount(() => clearTimeout(searchTimer))

async function importMonster(monster: SrdMonster, customise = false) {
  busy.value = monster.slug + (customise ? ':edit' : '')
  try {
    const created = await entities.create({
      type: 'monster',
      name: monster.name,
      summary: `${monster.size} ${monster.kind}, CR ${monster.cr} — from the SRD.`,
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
    title="Add from the SRD"
    description="The openly licensed 5e bestiary, searched live. Imported monsters are yours to rework."
    :ui="{ content: 'max-w-lg' }"
  >
    <template #body>
      <div class="space-y-3">
        <UInput
          v-model="query"
          icon="i-lucide-search"
          placeholder="Goblin, owlbear, troll…"
          autofocus
          class="w-full"
          :loading="searching"
        />

        <div
          v-if="results.length"
          class="space-y-1"
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
              <p class="text-xs text-dimmed">
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
          Nothing in the SRD matches “{{ query }}”.
        </p>
      </div>
    </template>
  </UModal>
</template>
