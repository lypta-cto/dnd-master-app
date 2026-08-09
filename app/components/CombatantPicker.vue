<script setup lang="ts">
/**
 * The one way into a fight.
 *
 * Adding used to be three different walls of buttons in a sidebar; this is a
 * single modal with faces on everything, reached from one Add button wherever
 * a fight is being assembled. The party is a click each (they're already
 * known), monsters are searched (a bestiary outgrows any list), and anything
 * without a statblock is a name typed in.
 */
const props = defineProps<{
  /** Who's already in, so the party rows can say so instead of duplicating */
  takenEntityIds: string[]
}>()

const emit = defineEmits<{
  character: [entity: EntitySummary]
  monster: [entity: EntitySummary]
  custom: [name: string]
}>()

const open = defineModel<boolean>('open', { required: true })

const entities = useEntities()
const mediaUrl = useMediaUrl()

const characters = ref<EntitySummary[]>([])
const query = ref('')
const results = ref<EntitySummary[]>([])
const customName = ref('')

let searchTimer: ReturnType<typeof setTimeout> | undefined

async function search() {
  const page = await entities.list({
    type: 'monster',
    q: query.value.trim() || undefined,
    page_size: 8
  })
  results.value = page.items
}

watch(query, () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(search, 250)
})

// Fresh each open: the party list and the bestiary both change mid-session
watch(open, (isOpen) => {
  if (!isOpen) {
    return
  }
  query.value = ''
  customName.value = ''
  search()
  entities.list({ type: 'character', page_size: 50 }).then((page) => {
    characters.value = page.items
  })
})

onBeforeUnmount(() => clearTimeout(searchTimer))

const taken = (id: string) => props.takenEntityIds.includes(id)

const freeCharacters = computed(() => characters.value.filter(c => !taken(c.id)))

function addAllCharacters() {
  for (const character of freeCharacters.value) {
    emit('character', character)
  }
}

function addCustom() {
  const name = customName.value.trim()
  if (!name) {
    return
  }
  emit('custom', name)
  customName.value = ''
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Add to the fight"
    description="The party joins with a click; monsters are searched. Same monster again means one more of them."
    :ui="{ content: 'max-w-lg' }"
  >
    <template #body>
      <div class="space-y-4">
        <!-- The party -->
        <div v-if="characters.length">
          <div class="mb-1.5 flex items-center justify-between">
            <p class="text-xs font-medium tracking-wide text-dimmed uppercase">
              The party
            </p>
            <UButton
              v-if="freeCharacters.length > 1"
              label="Add everyone"
              icon="i-lucide-users-round"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="addAllCharacters"
            />
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              v-for="character in characters"
              :key="character.id"
              type="button"
              class="flex items-center gap-2 rounded-lg border border-default p-1.5 text-left text-sm transition-colors"
              :class="taken(character.id)
                ? 'cursor-default opacity-40'
                : 'hover:border-primary/50 hover:bg-elevated'"
              :disabled="taken(character.id)"
              @click="emit('character', character)"
            >
              <UAvatar
                :src="character.image_url ? mediaUrl(character.image_url) : undefined"
                :alt="character.name"
                icon="i-lucide-user-round"
                size="sm"
              />
              <span class="min-w-0 flex-1 truncate">{{ character.name }}</span>
              <UIcon
                :name="taken(character.id) ? 'i-lucide-check' : 'i-lucide-plus'"
                class="size-3.5 shrink-0 text-dimmed"
              />
            </button>
          </div>
        </div>

        <!-- The opposition -->
        <div>
          <p class="mb-1.5 text-xs font-medium tracking-wide text-dimmed uppercase">
            Monsters
          </p>
          <UInput
            v-model="query"
            icon="i-lucide-search"
            placeholder="Goblin, wolf, cultist…"
            autofocus
            class="w-full"
          />

          <div
            v-if="results.length"
            class="mt-1.5 space-y-1"
          >
            <button
              v-for="hit in results"
              :key="hit.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-lg p-1.5 text-left text-sm hover:bg-elevated"
              @click="emit('monster', hit)"
            >
              <UAvatar
                :src="hit.image_url ? mediaUrl(hit.image_url) : undefined"
                :alt="hit.name"
                icon="i-lucide-skull"
                size="sm"
              />
              <span class="min-w-0 flex-1 truncate">{{ hit.name }}</span>
              <span
                v-if="hit.data.cr"
                class="shrink-0 text-xs text-dimmed"
              >CR {{ hit.data.cr }}</span>
              <span
                v-if="hit.data.hp"
                class="shrink-0 text-xs tabular-nums text-dimmed"
              >{{ hit.data.hp }} HP</span>
              <UIcon
                name="i-lucide-plus"
                class="size-3.5 shrink-0 text-dimmed"
              />
            </button>
          </div>
          <p
            v-else-if="query.trim()"
            class="mt-2 text-sm text-muted"
          >
            Nothing matches “{{ query }}”.
          </p>
        </div>

        <USeparator label="or" />

        <!-- No statblock needed -->
        <form
          class="flex gap-2"
          @submit.prevent="addCustom"
        >
          <UInput
            v-model="customName"
            placeholder="Swinging blade trap, summoned wolf…"
            class="flex-1"
          />
          <UButton
            type="submit"
            label="Add"
            color="neutral"
            variant="outline"
            :disabled="!customName.trim()"
          />
        </form>
      </div>
    </template>
  </UModal>
</template>
