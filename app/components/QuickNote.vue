<script setup lang="ts">
/**
 * ⌘J — the mid-session scratchpad.
 *
 * The table won't wait for you to file things properly: hit the shortcut,
 * type the name or event, hit ⌘↵, keep playing. It lands as a dm_only note
 * tagged `table-note`, and any [[names]] you typed are already linked, so
 * tidying up later starts from something connected.
 */
const { current, isDm } = useCampaigns()
const entities = useEntities()
const toast = useToast()

const open = ref(false)
const text = ref('')
const saving = ref(false)

defineShortcuts({
  meta_j: {
    usingInput: true,
    handler: () => {
      if (current.value && isDm.value) {
        open.value = !open.value
      }
    }
  }
})

async function save() {
  const body = text.value.trim()
  if (!body || saving.value) {
    return
  }

  saving.value = true

  try {
    // First line names the note; the rest stays in the body
    const firstLine = body.split('\n')[0]!.replace(/[#*[\]]/g, '').trim()
    const name = (firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine) || 'Table note'

    const note = await entities.create({
      type: 'note',
      name,
      body,
      tags: ['table-note'],
      visibility: 'dm_only'
    })

    toast.add({
      title: 'Noted',
      description: note.unresolved_links.length
        ? `Mentions ${note.unresolved_links.length} thing(s) that don't exist yet`
        : undefined,
      icon: 'i-lucide-scroll-text',
      color: 'success',
      actions: [{
        label: 'Open',
        onClick: () => navigateTo(`/entities/${note.id}`)
      }]
    })

    text.value = ''
    open.value = false
  } catch (error) {
    toast.add({ title: apiErrorMessage(error, 'Could not save'), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Quick note"
    description="First line becomes the title. [[Names]] link themselves."
    :ui="{ content: 'max-w-lg' }"
  >
    <template #body>
      <UTextarea
        v-model="text"
        :rows="5"
        autofocus
        placeholder="The innkeeper is [[Strahd von Zarovich]] in disguise?!"
        class="w-full font-mono text-sm"
        @keydown.meta.enter.prevent="save"
      />
      <div class="mt-3 flex items-center justify-between">
        <span class="text-xs text-dimmed">⌘↵ to save · saved as a DM-only note</span>
        <UButton
          label="Save note"
          icon="i-lucide-scroll-text"
          :loading="saving"
          :disabled="!text.trim()"
          @click="save"
        />
      </div>
    </template>
  </UModal>
</template>
