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
    // The summary is the DM's own brief — the draft is built around it
    const { text } = await ai.draft({
      type: props.type,
      name: form.name.trim(),
      brief: form.summary.trim() || null
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
  <form
    class="space-y-5"
    @submit.prevent="submit"
  >
    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField
        label="Name"
        required
      >
        <UInput
          v-model="form.name"
          :placeholder="meta.label"
          class="w-full"
        />
      </UFormField>

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
    </div>

    <UFormField label="Summary">
      <UInput
        v-model="form.summary"
        placeholder="One line that shows up in lists and search."
        class="w-full"
      />
    </UFormField>

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
        :rows="14"
        placeholder="The [[Goblin King]] fled toward [[Blackmoor Keep]]…"
        class="w-full font-mono text-sm"
      />
    </UFormField>

    <div
      v-if="typeFields.length"
      class="grid gap-4 sm:grid-cols-2"
    >
      <UFormField
        v-for="field in typeFields"
        :key="field.key"
        :label="field.label"
      >
        <USelectMenu
          v-if="field.options"
          :model-value="(form.data[field.key] as string | undefined)"
          :items="field.options"
          :placeholder="field.label"
          class="w-full capitalize"
          @update:model-value="value => (form.data[field.key] = value)"
        />
        <UInput
          v-else
          :model-value="(form.data[field.key] as string | undefined) ?? ''"
          :placeholder="field.placeholder"
          class="w-full"
          @update:model-value="value => (form.data[field.key] = value)"
        />
      </UFormField>
    </div>

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

    <UFormField label="Tags">
      <UInputTags
        v-model="form.tags"
        placeholder="Add a tag and press Enter"
        class="w-full"
      />
    </UFormField>

    <div class="flex justify-end gap-2">
      <slot name="secondary" />
      <UButton
        type="submit"
        :label="entity ? 'Save changes' : `Create ${meta.label}`"
        :loading="saving"
        :disabled="!form.name.trim()"
      />
    </div>
  </form>
</template>
