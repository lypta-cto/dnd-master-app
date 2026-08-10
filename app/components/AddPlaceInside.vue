<script setup lang="ts">
/**
 * A new place, born already standing where it belongs.
 *
 * Building downward used to take a detour: New Location, save, find it,
 * "Place it", search the kingdom. This is the direct road — name it, say
 * what rung it is, and it lands inside this place in one step. The dialog
 * stays open on purpose: a kingdom gets its regions in one sitting, not one
 * dialog each.
 */
const props = defineProps<{
  /** Absent means the top of the world — created, but placed in nothing */
  placeId?: string | null
  placeName?: string | null
  /** The rung of the place this dialog adds into, for guessing the next one */
  placeKind?: string
}>()

const emit = defineEmits<{ created: [] }>()

const open = defineModel<boolean>('open', { required: true })

const entities = useEntities()
const toast = useToast()

/** The rung one step down, offered rather than asked for every time */
const NEXT_RUNG: Record<string, string> = {
  plane: 'kingdom',
  kingdom: 'region',
  region: 'city',
  city: 'district',
  town: 'building',
  village: 'building'
}

const name = ref('')
const kind = ref<string | undefined>(undefined)
const busy = ref(false)

watch(open, (isOpen) => {
  if (isOpen) {
    name.value = ''
    // At the top of the world the first thing you make is a kingdom
    kind.value = props.placeId
      ? NEXT_RUNG[props.placeKind ?? ''] ?? undefined
      : 'kingdom'
  }
})

async function create(openAfter = false) {
  const trimmed = name.value.trim()
  if (!trimmed) {
    return
  }
  busy.value = true

  try {
    const created = await entities.create({
      type: 'location',
      name: trimmed,
      data: kind.value ? { kind: kind.value } : {}
    })
    if (props.placeId) {
      await entities.link(created.id, props.placeId, 'located_in')
    }

    emit('created')

    if (openAfter) {
      open.value = false
      await navigateTo(`/entities/${created.id}`)
      return
    }

    toast.add({
      title: props.placeName
        ? `“${trimmed}” now stands in ${props.placeName}`
        : `“${trimmed}” stands at the top of the world`,
      icon: 'i-lucide-map-pin-check',
      color: 'success'
    })
    // Cleared, not closed: the next region goes in right behind this one
    name.value = ''
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="placeName ? `A new place in ${placeName}` : 'A new place, top of the world'"
    description="Named and placed in one step. The dialog stays open — add the whole tier in one sitting."
    :ui="{ content: 'max-w-md' }"
  >
    <template #body>
      <form
        class="space-y-3"
        @submit.prevent="create(false)"
      >
        <UFormField label="Name">
          <UInput
            v-model="name"
            placeholder="Velegrad, Mračna šuma…"
            autofocus
            class="w-full"
            @keydown.enter.prevent="create(false)"
          />
        </UFormField>

        <UFormField label="Kind">
          <USelectMenu
            v-model="kind"
            :items="LOCATION_KINDS"
            placeholder="What rung of the world is it?"
            class="w-full capitalize"
          />
        </UFormField>

        <div class="flex items-center justify-end gap-2 pt-1">
          <UButton
            label="Add & open"
            icon="i-lucide-arrow-up-right"
            color="neutral"
            variant="ghost"
            :disabled="!name.trim()"
            :loading="busy"
            @click="create(true)"
          />
          <UButton
            type="submit"
            label="Add"
            icon="i-lucide-plus"
            :disabled="!name.trim()"
            :loading="busy"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
