<script setup lang="ts">
const props = defineProps<{
  /** Existing entity when editing; omit when creating */
  entity?: EntityDetail
  type: EntityType
  /** Prefill for "create from unresolved link" */
  initialName?: string
}>()

const emit = defineEmits<{
  saved: [entity: EntityDetail]
}>()

const toast = useToast()
const entities = useEntities()
const { isDm } = useCampaigns()

const meta = computed(() => entityTypeMeta(props.type))

const typeFields = computed(() => TYPE_FIELDS[props.type] ?? [])

/* Drafting help, when a key is configured */
const ai = useAi()
const aiText = ref(false)
const drafting = ref(false)

onMounted(async () => {
  if (!isDm.value) {
    return
  }
  try {
    aiText.value = (await ai.status()).text
  } catch {
    aiText.value = false
  }
})

async function draftBody() {
  if (!form.name.trim() || drafting.value) {
    return
  }

  drafting.value = true
  try {
    // The summary is the DM's own brief, and the type's fields are what they
    // have already decided — a kobold beggar came back as a human innkeeper
    // when race and occupation stayed in the form instead of going with it.
    const facts = Object.fromEntries(
      typeFields.value
        .map(field => [field.key, String(form.data[field.key] ?? '').trim()])
        .filter(([, value]) => value)
    )

    const { text } = await ai.draft({
      type: props.type,
      name: form.name.trim(),
      brief: form.summary.trim() || null,
      facts
    })
    // Never overwrite: a draft lands under whatever they already wrote
    form.body = form.body.trim() ? `${form.body.trim()}\n\n${text}` : text
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    drafting.value = false
  }
}

/* Characters belong to someone at the table — the DM says who */
const players = usePlayers()
const roster = ref<Player[]>([])

const isCharacter = computed(() => props.type === 'character')

/* --- Shape of the form ------------------------------------------------------ */

const family = computed(() => ENTITY_FAMILY[props.type])
const art = computed(() => FAMILY_ART[family.value])

/** Only offered while creating: afterwards the gallery on its own page owns it */
const cover = ref<File | null>(null)

/** The summary is also what a draft is built from, so ask for it in kind */
const SUMMARY_HINTS: Record<EntityFamily, string> = {
  being: 'Who they are in one line — the innkeeper who saw everything.',
  place: 'What it is in one line — the mill nobody walks past after dark.',
  beat: 'What happens here, in one line.',
  thing: 'One line, shown in lists and search.'
}

const summaryHint = computed(() => SUMMARY_HINTS[family.value])

/* --- Where it happens -------------------------------------------------------
 * Asked while creating, not afterwards. A scene made without a place is a
 * scene nobody puts anywhere: the world gets built from the outside in — the
 * region, then the town, then what happens there — and the moment the DM is
 * thinking about the scene is the moment they know where it is.
 *
 * Creation only. Once it exists, the "In the world" card on its own page owns
 * this, and two controls for one relation would only disagree with each other.
 */
const PLACEABLE: EntityType[] = ['location', 'scene', 'encounter']

const asksWhere = computed(() => !props.entity && PLACEABLE.includes(props.type))

const where = ref<EntitySummary | null>(null)
const whereQuery = ref('')
const whereResults = ref<EntitySummary[]>([])

let whereTimer: ReturnType<typeof setTimeout> | undefined

watch(whereQuery, (q) => {
  clearTimeout(whereTimer)

  if (!q.trim()) {
    whereResults.value = []
    return
  }

  whereTimer = setTimeout(async () => {
    const page = await entities.list({ type: 'location', q: q.trim(), page_size: 8 })
    whereResults.value = page.items
  }, 250)
})

onBeforeUnmount(() => clearTimeout(whereTimer))

onMounted(async () => {
  if (isCharacter.value && isDm.value) {
    roster.value = await players.list()
  }
})

const playerItems = computed(() => [
  { value: null, label: 'Nobody yet' },
  ...roster.value.map(player => ({ value: player.id, label: player.name }))
])

const form = reactive({
  name: props.entity?.name ?? props.initialName ?? '',
  player_id: props.entity?.player_id ?? null as string | null,
  summary: props.entity?.summary ?? '',
  body: props.entity?.body ?? '',
  visibility: (props.entity?.visibility ?? 'dm_only') as Visibility,
  tags: [...(props.entity?.tags ?? [])] as string[],
  data: { ...(props.entity?.data ?? {}) } as Record<string, unknown>
})

const saving = ref(false)

const visibilityItems = VISIBILITIES.map(v => ({
  value: v.value,
  label: v.label,
  icon: v.icon
}))

async function submit() {
  if (!form.name.trim()) {
    return
  }

  saving.value = true

  try {
    // Empty structured fields are dropped so `data` stays clean
    const data = Object.fromEntries(
      Object.entries(form.data).filter(([, value]) => value !== '' && value != null)
    )

    const payload = {
      name: form.name.trim(),
      summary: form.summary.trim() || null,
      body: form.body || null,
      visibility: form.visibility,
      tags: form.tags,
      data,
      // Only the DM hands a sheet to a seat; players always get their own
      ...(isCharacter.value && isDm.value ? { player_id: form.player_id } : {})
    }

    const saved = props.entity
      ? await entities.update(props.entity.id, payload)
      : await entities.create({ ...payload, type: props.type })

    if (!props.entity && cover.value) {
      // After creation for the same reason as the placement below: an image
      // needs an id to hang on. The first one becomes the cover on its own.
      try {
        await entities.addImage(saved.id, cover.value)
      } catch {
        toast.add({
          title: 'Created, but the picture didn’t upload',
          description: 'Add it from the gallery on its page.',
          icon: 'i-lucide-image-off',
          color: 'warning'
        })
      }
    }

    if (!props.entity && where.value) {
      // After creation, because the link needs both ends to exist. Its result
      // is deliberately discarded: it's the shorter read shape, and putting it
      // in `saved` would drop the fields the toasts below read. A failure here
      // must not lose the entity the DM just wrote — it exists, it's simply
      // unplaced, and the card on its own page fixes that in two clicks.
      try {
        await entities.link(saved.id, where.value.id, 'located_in')
      } catch {
        toast.add({
          title: `Created, but not placed in ${where.value.name}`,
          description: 'Set it from the “In the world” card.',
          icon: 'i-lucide-map-pin-off',
          color: 'warning'
        })
      }
    }

    if (saved.rewritten_references) {
      toast.add({
        title: `Updated [[links]] in ${saved.rewritten_references} other entr${saved.rewritten_references === 1 ? 'y' : 'ies'}`,
        description: 'Renaming carries your prose along with it.',
        icon: 'i-lucide-replace',
        color: 'info'
      })
    }

    if (saved.unresolved_links.length) {
      toast.add({
        title: `${saved.unresolved_links.length} unresolved link(s)`,
        description: `No entity yet for: ${saved.unresolved_links.join(', ')}`,
        icon: 'i-lucide-unlink',
        color: 'warning'
      })
    }

    emit('saved', saved)
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <!-- One column of stacked sections rather than a split. The split left a tall
       column of prose beside a short column of settings, so half the form was
       empty space next to the part you spend the longest in. -->
  <form
    class="space-y-6"
    @submit.prevent="submit"
  >
    <!-- A map with no image is nothing at all, so for places it leads -->
    <CoverPicker
      v-if="!entity && art === 'hero'"
      v-model="cover"
      hero
      :label="`Drop the ${meta.label.toLowerCase()} image here, or click to choose`"
    />

    <div class="flex flex-col gap-5 sm:flex-row">
      <div class="min-w-0 flex-1 space-y-4">
        <UFormField
          label="Name"
          required
        >
          <UInput
            v-model="form.name"
            :placeholder="meta.label"
            size="lg"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Summary"
          help="One line, shown in lists and search. Drafts are written from it."
        >
          <UInput
            v-model="form.summary"
            :placeholder="summaryHint"
            class="w-full"
          />
        </UFormField>
      </div>

      <CoverPicker
        v-if="!entity && art === 'portrait'"
        v-model="cover"
        class="shrink-0 sm:w-40"
      />
    </div>

    <!-- Everything factual in one block: a monster's CR and who may see it are
         the same kind of answer, and used to sit in two competing places -->
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        v-if="isCharacter && isDm"
        label="Player"
        help="Whose character this is at the table."
      >
        <USelectMenu
          v-model="form.player_id"
          :items="playerItems"
          value-key="value"
          class="w-full"
        />
      </UFormField>

      <UFormField
        v-if="isDm"
        label="Visibility"
        :help="VISIBILITIES.find(v => v.value === form.visibility)?.hint"
      >
        <USelectMenu
          v-model="form.visibility"
          :items="visibilityItems"
          value-key="value"
          class="w-full"
        />
      </UFormField>

      <TypeFields
        v-if="typeFields.length"
        v-model="form.data"
        :fields="typeFields"
      />

      <UFormField
        v-if="asksWhere"
        label="Where"
        class="sm:col-span-2"
        :help="where
          ? `Inside ${where.name}.`
          : 'The place this sits in. Skip it and set it later.'"
      >
        <div class="space-y-2">
          <UInput
            v-if="!where"
            v-model="whereQuery"
            icon="i-lucide-map-pinned"
            placeholder="Barovija, Vranov Brod…"
            class="w-full"
          />

          <UButton
            v-else
            :label="where.name"
            :icon="entityTypeMeta(where.type).icon"
            trailing-icon="i-lucide-x"
            color="neutral"
            variant="soft"
            @click="where = null; whereQuery = ''"
          />

          <div
            v-if="!where && whereResults.length"
            class="space-y-1"
          >
            <button
              v-for="hit in whereResults"
              :key="hit.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-elevated"
              @click="where = hit"
            >
              <UIcon
                :name="entityTypeMeta(hit.type).icon"
                class="size-4 shrink-0"
              />
              <span class="truncate">{{ hit.name }}</span>
            </button>
          </div>

          <p
            v-else-if="!where && whereQuery.trim()"
            class="text-sm text-muted"
          >
            No places match — make the region or town first, or leave this empty.
          </p>
        </div>
      </UFormField>

      <UFormField
        label="Tags"
        class="sm:col-span-2"
      >
        <UInputTags
          v-model="form.tags"
          placeholder="Add a tag and press Enter"
          class="w-full"
        />
      </UFormField>
    </div>

    <UFormField
      label="Body"
      help="Markdown. Write [[Entity Name]] to link — links resolve on save, and unresolved names are reported, not lost."
    >
      <template
        v-if="aiText"
        #hint
      >
        <UButton
          label="Draft it"
          icon="i-lucide-sparkles"
          size="xs"
          color="neutral"
          variant="ghost"
          :loading="drafting"
          :disabled="!form.name.trim()"
          @click="draftBody"
        />
      </template>
      <UTextarea
        v-model="form.body"
        :rows="12"
        placeholder="The [[Goblin King]] fled toward [[Blackmoor Keep]]…"
        class="w-full font-mono text-sm"
      />
    </UFormField>

    <!-- Behind the curtain: what the party wrongly believes, and what's true -->
    <div
      v-if="isDm"
      class="space-y-4 rounded-xl border border-default p-4"
    >
      <p class="flex items-center gap-2 text-sm font-medium text-highlighted">
        <UIcon
          name="i-lucide-eye-off"
          class="size-4 text-dimmed"
        />
        Yours only — the API never sends this to a player
      </p>

      <UFormField
        label="What the party believes"
        help="The version they've been told. Handy to have next to the truth."
      >
        <UInput
          :model-value="(form.data.dm_players_think as string | undefined) ?? ''"
          placeholder="He is protecting the village."
          class="w-full"
          @update:model-value="value => (form.data.dm_players_think = value)"
        />
      </UFormField>

      <UFormField
        label="Notes"
        help="Markdown, and [[links]] work here too."
      >
        <UTextarea
          :model-value="(form.data.dm_notes as string | undefined) ?? ''"
          :rows="5"
          placeholder="He leads the cult feeding the artefact. Panics if you mention [[the Old Mill]]."
          class="w-full font-mono text-sm"
          @update:model-value="value => (form.data.dm_notes = value)"
        />
      </UFormField>
    </div>

    <div class="flex justify-end gap-2 border-t border-default pt-4">
      <slot name="secondary" />
      <UButton
        type="submit"
        :label="entity ? 'Save changes' : `Create ${meta.label}`"
        size="lg"
        :loading="saving"
        :disabled="!form.name.trim()"
      />
    </div>
  </form>
</template>
