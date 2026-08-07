<script setup lang="ts">
/**
 * Opening a campaign, in the order you actually think about one.
 *
 * Not a form to fill in: four questions that make the rest of the app useful.
 * What kind of game this is, what the party is told, what's really going on,
 * and who's coming. Everything past the name can be skipped — a campaign with
 * a name works fine, and the answers can arrive later on the campaign page.
 */
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const { create, update, currentId } = useCampaigns()
const players = usePlayers()

const STEPS = [
  { title: 'The game', hint: 'What kind of thing are we playing?' },
  { title: 'The premise', hint: 'What the party is told.' },
  { title: 'The truth', hint: 'What is actually going on. Yours only.' },
  { title: 'The table', hint: 'Who is coming.' }
] as const

const step = ref(0)
const saving = ref(false)
const createdId = ref<string | null>(null)

const form = reactive({
  name: '',
  summary: '',
  campaign_type: 'one_shot' as CampaignType,
  system: 'D&D 5e',
  player_count: 5,
  starting_level: 3,
  duration: '',
  genre: '',
  tone: '',
  premise: '',
  player_intro: '',
  dm_truth: '',
  dm_villain: '',
  dm_twist: ''
})

/* Names typed on the last step, added once the campaign exists */
const names = ref<string[]>([])
const nameDraft = ref('')

function addName() {
  const name = nameDraft.value.trim()
  if (!name) {
    return
  }
  names.value = [...names.value, name]
  nameDraft.value = ''
}

const canContinue = computed(() => step.value > 0 || !!form.name.trim())

function trimmed(value: string) {
  return value.trim() || undefined
}

/** Everything the DM actually answered — blanks don't belong in the record */
function buildData(): CampaignData {
  return JSON.parse(JSON.stringify({
    campaign_type: form.campaign_type,
    system: trimmed(form.system),
    player_count: form.player_count || undefined,
    starting_level: form.starting_level || undefined,
    duration: trimmed(form.duration),
    genre: trimmed(form.genre),
    tone: trimmed(form.tone),
    premise: trimmed(form.premise),
    player_intro: trimmed(form.player_intro),
    dm_truth: trimmed(form.dm_truth),
    dm_villain: trimmed(form.dm_villain),
    dm_twist: trimmed(form.dm_twist)
  }))
}

/** Steps 1–3 collect; the campaign is written once, before the roster step */
async function ensureCampaign() {
  if (createdId.value) {
    await update(createdId.value, {
      summary: trimmed(form.summary) ?? null,
      data: buildData()
    })
    return createdId.value
  }

  const campaign = await create({
    name: form.name.trim(),
    summary: trimmed(form.summary) ?? null,
    data: buildData()
  })
  createdId.value = campaign.id
  currentId.value = campaign.id
  return campaign.id
}

async function next() {
  if (step.value < 2) {
    step.value += 1
    return
  }

  if (step.value === 2) {
    saving.value = true
    try {
      await ensureCampaign()
      step.value = 3
    } catch (error) {
      toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
    } finally {
      saving.value = false
    }
    return
  }

  await finish()
}

async function finish() {
  saving.value = true

  try {
    await ensureCampaign()

    if (names.value.length) {
      // Sequential on purpose: the roster keeps the order they were typed in
      for (const name of names.value) {
        await players.create({ name })
      }
    }

    toast.add({
      title: `“${form.name.trim()}” is ready`,
      description: names.value.length ? `${names.value.length} at the table.` : undefined,
      icon: 'i-lucide-swords',
      color: 'success'
    })

    open.value = false
    await navigateTo('/')
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    saving.value = false
  }
}

/** Bail out early with just the essentials — the rest lives on the campaign page */
async function createNow() {
  saving.value = true
  try {
    await ensureCampaign()
    toast.add({ title: `“${form.name.trim()}” created`, icon: 'i-lucide-swords', color: 'success' })
    open.value = false
    await navigateTo('/')
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="STEPS[step]!.title"
    :description="STEPS[step]!.hint"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <!-- Where you are, and that none of it is compulsory -->
      <div class="mb-5 flex gap-1.5">
        <span
          v-for="(item, index) in STEPS"
          :key="item.title"
          class="h-1 flex-1 rounded-full transition-colors"
          :class="index <= step ? 'bg-primary' : 'bg-elevated'"
        />
      </div>

      <!-- 1. The game -->
      <div
        v-if="step === 0"
        class="space-y-4"
      >
        <UFormField
          label="Name"
          required
        >
          <UInput
            v-model="form.name"
            placeholder="Ravenford"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField label="Kind of game">
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="type in CAMPAIGN_TYPES"
              :key="type.value"
              :label="type.label"
              size="xs"
              :color="form.campaign_type === type.value ? 'primary' : 'neutral'"
              :variant="form.campaign_type === type.value ? 'solid' : 'outline'"
              @click="form.campaign_type = type.value"
            />
          </div>
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="System">
            <UInput
              v-model="form.system"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Players">
            <UInputNumber
              v-model="form.player_count"
              :min="1"
              :max="12"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Starting level">
            <UInputNumber
              v-model="form.starting_level"
              :min="1"
              :max="20"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="Genre">
            <UInputMenu
              v-model="form.genre"
              :items="GENRES"
              placeholder="horror"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Tone">
            <UInputMenu
              v-model="form.tone"
              :items="TONES"
              placeholder="dark"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Expected length">
            <UInput
              v-model="form.duration"
              placeholder="5–6h"
              class="w-full"
            />
          </UFormField>
        </div>
      </div>

      <!-- 2. The premise -->
      <div
        v-else-if="step === 1"
        class="space-y-4"
      >
        <UFormField
          label="Premise"
          help="What the party believes they're walking into. Two or three sentences."
        >
          <UTextarea
            v-model="form.premise"
            :rows="3"
            placeholder="People vanish from an isolated village every night. The locals blame a monster in the woods."
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Opening lines"
          help="What you read out to start. Having it written down beats improvising cold."
        >
          <UTextarea
            v-model="form.player_intro"
            :rows="3"
            placeholder="The road ends at a shuttered inn. Nobody answers the door until you say who sent you…"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Short summary"
          help="One line, shown under the campaign name."
        >
          <UInput
            v-model="form.summary"
            placeholder="Gothic horror in an isolated valley."
            class="w-full"
          />
        </UFormField>
      </div>

      <!-- 3. The truth -->
      <div
        v-else-if="step === 2"
        class="space-y-4"
      >
        <div class="flex items-start gap-2 rounded-xl bg-elevated p-3 text-sm text-muted">
          <UIcon
            name="i-lucide-eye-off"
            class="mt-0.5 size-4 shrink-0"
          />
          <p>Players never see this — not in lists, not in search, not through the API.</p>
        </div>

        <UFormField
          label="What is actually going on"
          help="The answer the premise is hiding."
        >
          <UTextarea
            v-model="form.dm_truth"
            :rows="3"
            placeholder="The creature is trying to stop the villagers feeding an old artefact."
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Who drives it"
          help="A person, a faction or a thing — whatever keeps the pressure on."
        >
          <UInput
            v-model="form.dm_villain"
            placeholder="Father Aldric, who leads the cult"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="The turn"
          help="The reveal that recolours everything before it."
        >
          <UTextarea
            v-model="form.dm_twist"
            :rows="2"
            placeholder="The missing villagers are alive — the monster has been hiding them."
            class="w-full"
          />
        </UFormField>
      </div>

      <!-- 4. The table -->
      <div
        v-else
        class="space-y-4"
      >
        <p class="text-sm text-muted">
          Names are enough. Nobody needs an account — you can invite them later if
          they want their sheet on their phone.
        </p>

        <form
          class="flex items-end gap-2"
          @submit.prevent="addName"
        >
          <UFormField
            label="Add a player"
            class="flex-1"
          >
            <UInput
              v-model="nameDraft"
              placeholder="Ana"
              autofocus
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            icon="i-lucide-user-plus"
            color="neutral"
            variant="outline"
            :disabled="!nameDraft.trim()"
            aria-label="Add"
          />
        </form>

        <div
          v-if="names.length"
          class="flex flex-wrap gap-1.5"
        >
          <UBadge
            v-for="(name, index) in names"
            :key="`${name}-${index}`"
            :label="name"
            color="neutral"
            variant="subtle"
            size="lg"
            class="cursor-pointer"
            @click="names = names.filter((_, i) => i !== index)"
          />
        </div>
        <p
          v-else
          class="text-sm text-dimmed"
        >
          Nobody yet — you can also do this later on the campaign page.
        </p>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center gap-2">
        <UButton
          v-if="step > 0 && step < 3"
          label="Back"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="step -= 1"
        />

        <UButton
          v-if="step < 2"
          label="Create now"
          color="neutral"
          variant="ghost"
          :disabled="!form.name.trim() || saving"
          @click="createNow"
        />

        <div class="ml-auto flex gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            :disabled="saving"
            @click="open = false"
          />
          <UButton
            :label="step === 3 ? 'Done' : step === 2 ? 'Create campaign' : 'Continue'"
            :loading="saving"
            :disabled="!canContinue"
            @click="next"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
