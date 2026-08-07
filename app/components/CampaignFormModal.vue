<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const { create } = useCampaigns()

const form = reactive({ name: '', summary: '' })
const saving = ref(false)

async function submit() {
  if (!form.name.trim()) {
    return
  }

  saving.value = true

  try {
    const campaign = await create({
      name: form.name.trim(),
      summary: form.summary.trim() || null
    })
    toast.add({ title: `“${campaign.name}” created`, icon: 'i-lucide-swords', color: 'success' })
    open.value = false
    form.name = ''
    form.summary = ''
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
    title="New campaign"
    description="A campaign holds everything: NPCs, locations, notes, the lot."
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <form
        class="space-y-4"
        @submit.prevent="submit"
      >
        <UFormField
          label="Name"
          required
        >
          <UInput
            v-model="form.name"
            placeholder="Curse of Strahd"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UFormField label="Summary">
          <UTextarea
            v-model="form.summary"
            placeholder="Gothic horror in the mists of Barovia."
            :rows="2"
            class="w-full"
          />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :disabled="saving"
            @click="open = false"
          />
          <UButton
            type="submit"
            label="Create campaign"
            :loading="saving"
            :disabled="!form.name.trim()"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
