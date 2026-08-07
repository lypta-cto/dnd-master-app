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
const campaigns = useCampaigns()
const { create, update, currentId } = campaigns
const players = usePlayers()
const entities = useEntities()

const STEPS = [
  { title: 'The game', hint: 'What kind of thing are we playing?' },
  { title: 'The premise', hint: 'What the party is told.' },
  { title: 'The truth', hint: 'What is actually going on. Yours only.' },
  { title: 'The table', hint: 'Who is coming.' }
] as const

const step = ref(0)
const saving = ref(false)
const createdId = ref<string | null>(null)

/** Kept separate so reopening the dialog can put the form back to it */
const BLANK_FORM = {
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
}

const form = reactive({ ...BLANK_FORM })

/* The table, built up on the last step and written once the campaign exists.
   A player without a character is normal (they'll make one); a character
   without a player is not, so the two are entered together. */
interface Seat {
  name: string
  character: string
  /**
   * What already exists on the server.
   *
   * The roster is written one seat at a time, and the request can fail —
   * a dropped connection, a restarting API. When it does, the dialog stays
   * open so the DM can try again, and without this the retry started from the
   * first seat and created everything above the failure a second time. Five
   * attempts left five copies of the first character and one of the last.
   */
  playerId?: string
  characterCreated?: boolean
}

const seats = ref<Seat[]>([])
const seatDraft = reactive({ name: '', character: '' })

/** Same reason as the flags on a seat: a retry must not make a second one */
const startCreated = ref(false)

function addSeat() {
  const name = seatDraft.name.trim()
  if (!name) {
    return
  }
  seats.value = [...seats.value, { name, character: seatDraft.character.trim() }]
  seatDraft.name = ''
  seatDraft.character = ''
}

/* Somewhere for the party to be standing when the game starts */
const start = reactive({ name: '', summary: '' })

/* A goblin to throw and a tavern to throw it in */
const starterPack = ref(true)

/**
 * The dialog is never unmounted, so it has to forget on its own.
 *
 * Without this it reopened exactly as it was left — including `createdId`,
 * which makes `ensureCampaign` update rather than create. Opening it a second
 * time to start a new campaign would quietly edit the first one and file the
 * new table's players and characters under it.
 */
watch(open, (isOpen) => {
  if (!isOpen) {
    return
  }

  step.value = 0
  createdId.value = null
  startCreated.value = false
  seats.value = []
  seatDraft.name = ''
  seatDraft.character = ''
  starterPack.value = true
  start.name = ''
  start.summary = ''
  Object.assign(form, BLANK_FORM)
})

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

    // Everything below runs again if an earlier attempt failed part-way, so
    // each step records that it is done and the retry picks up where it
    // stopped. The starter pack needs no flag of its own — the API skips names
    // that are already there.
    if (starterPack.value) {
      await campaigns.installStarterPack()
    }

    if (start.name.trim() && !startCreated.value) {
      // Shared: where you are isn't a secret from the party
      await entities.create({
        type: 'location',
        name: start.name.trim(),
        summary: start.summary.trim() || null,
        visibility: 'shared'
      })
      startCreated.value = true
    }

    // Sequential on purpose: the roster keeps the order they were typed in
    for (const seat of seats.value) {
      if (!seat.playerId) {
        seat.playerId = (await players.create({ name: seat.name })).id
      }

      if (seat.character && !seat.characterCreated) {
        await entities.create({
          type: 'character',
          name: seat.character,
          player_id: seat.playerId,
          visibility: 'shared',
          data: { level: form.starting_level }
        })
        seat.characterCreated = true
      }
    }

    toast.add({
      title: `“${form.name.trim()}” is ready`,
      description: seats.value.length ? `${seats.value.length} at the table.` : undefined,
      icon: 'i-lucide-swords',
      color: 'success'
    })

    open.value = false
    await navigateTo('/')
  } catch (error) {
    toast.add({
      title: apiErrorMessage(error),
      // The DM's next move is to press it again, and they should know that
      // costs them nothing — everything already written stays written.
      description: 'Nothing was lost. Try again and it picks up where it stopped.',
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
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

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            label="Where it starts"
            help="Created as a shared location — the party knows where they are."
          >
            <UInput
              v-model="start.name"
              placeholder="Vranov Brod"
              class="w-full"
            />
          </UFormField>
          <UFormField label="In a line">
            <UInput
              v-model="start.summary"
              placeholder="A valley village that locks its doors at dusk."
              class="w-full"
            />
          </UFormField>
        </div>
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
          @submit.prevent="addSeat"
        >
          <UFormField
            label="Player"
            class="flex-1"
          >
            <UInput
              v-model="seatDraft.name"
              placeholder="Ana"
              autofocus
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Their character"
            class="flex-1"
          >
            <UInput
              v-model="seatDraft.character"
              placeholder="Arannis"
              class="w-full"
            />
          </UFormField>
          <UButton
            type="submit"
            icon="i-lucide-user-plus"
            color="neutral"
            variant="outline"
            :disabled="!seatDraft.name.trim()"
            aria-label="Add"
          />
        </form>

        <ul
          v-if="seats.length"
          class="space-y-1"
        >
          <li
            v-for="(seat, index) in seats"
            :key="`${seat.name}-${index}`"
            class="flex items-center gap-2 rounded-lg border border-default px-2 py-1.5"
          >
            <span class="text-sm font-medium text-highlighted">{{ seat.name }}</span>
            <span
              v-if="seat.character"
              class="truncate text-sm text-muted"
            >plays {{ seat.character }}</span>
            <span
              v-else
              class="text-sm text-dimmed"
            >character later</span>
            <UButton
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              class="ml-auto"
              :aria-label="`Remove ${seat.name}`"
              @click="seats = seats.filter((_, i) => i !== index)"
            />
          </li>
        </ul>
        <p
          v-else
          class="text-sm text-dimmed"
        >
          Nobody yet — you can also do this later on the campaign page.
        </p>

        <USwitch
          v-model="starterPack"
          label="Add a starter set"
          description="Ten stock monsters and six places to rename — so the first session isn't a blank page."
        />
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
