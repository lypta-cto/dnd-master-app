<script setup lang="ts">
/**
 * The fuller picture of a player — the bits that shape what you prep for them.
 *
 * Preferences aren't decoration: they're the answer to "whose scene is this?"
 * when a table of eight makes it easy for someone to sit quiet all night.
 */
const props = defineProps<{
  player: Player
}>()

const emit = defineEmits<{
  saved: [player: Player]
  close: []
}>()

const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const players = usePlayers()

const form = reactive({
  name: props.player.name,
  contact: props.player.contact ?? '',
  experience: props.player.experience,
  preferences: [...props.player.preferences],
  notes: props.player.notes ?? ''
})

const saving = ref(false)

function togglePreference(value: Preference) {
  form.preferences = form.preferences.includes(value)
    ? form.preferences.filter(p => p !== value)
    : [...form.preferences, value]
}

async function save() {
  if (!form.name.trim()) {
    return
  }

  saving.value = true
  try {
    const updated = await players.update(props.player.id, {
      name: form.name.trim(),
      contact: form.contact.trim() || null,
      experience: form.experience,
      preferences: form.preferences,
      notes: form.notes.trim() || null
    })
    emit('saved', updated)
    toast.add({ title: 'Player updated', icon: 'i-lucide-circle-check', color: 'success' })
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
    :title="player.name"
    description="Only you see this — it's your notes on the person, not the character."
    @update:open="value => { if (!value) emit('close') }"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name">
          <UInput
            v-model="form.name"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Contact"
          help="Discord, phone, whatever gets them to the table."
        >
          <UInput
            v-model="form.contact"
            placeholder="discord: ana#1234"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Experience">
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="option in EXPERIENCE_OPTIONS"
              :key="option.value"
              :label="option.label"
              size="xs"
              :color="form.experience === option.value ? 'primary' : 'neutral'"
              :variant="form.experience === option.value ? 'solid' : 'outline'"
              @click="form.experience = form.experience === option.value ? null : option.value"
            />
          </div>
        </UFormField>

        <UFormField
          label="What they come for"
          help="Aim a scene at each of these and nobody sits the evening out."
        >
          <div class="flex flex-wrap gap-1.5">
            <UButton
              v-for="option in PREFERENCE_OPTIONS"
              :key="option.value"
              :label="option.label"
              :icon="option.icon"
              size="xs"
              :color="form.preferences.includes(option.value) ? 'primary' : 'neutral'"
              :variant="form.preferences.includes(option.value) ? 'solid' : 'outline'"
              @click="togglePreference(option.value)"
            />
          </div>
        </UFormField>

        <UFormField label="Notes">
          <UTextarea
            v-model="form.notes"
            :rows="3"
            placeholder="Squeamish about body horror. Loves a good haggle."
            class="w-full"
          />
        </UFormField>

        <div
          v-if="player.characters.length"
          class="rounded-xl border border-default p-3"
        >
          <p class="mb-1.5 text-xs font-medium uppercase tracking-wide text-dimmed">
            Characters
          </p>
          <NuxtLink
            v-for="character in player.characters"
            :key="character.id"
            :to="`/entities/${character.id}`"
            class="block truncate py-0.5 text-sm text-toned hover:text-primary"
          >
            {{ character.name }}
          </NuxtLink>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="emit('close')"
        />
        <UButton
          label="Save"
          :loading="saving"
          :disabled="!form.name.trim()"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
