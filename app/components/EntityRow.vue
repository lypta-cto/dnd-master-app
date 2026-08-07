<script setup lang="ts">
/**
 * One line of a long list.
 *
 * The card is right for a dozen entries and wrong for two hundred: past a
 * point you stop browsing and start scanning for a name, and every pixel of
 * card padding is a name you have to scroll past. Same data, same click
 * targets, a third of the height.
 */
const props = defineProps<{
  entity: EntitySummary
  noVisibility?: boolean
  selectable?: boolean
  selected?: boolean
}>()

const emit = defineEmits<{
  toggle: [id: string]
}>()

// Capture phase, for the same reason as the card: NuxtLink's handler runs on
// bubble and would navigate before a pick registers.
function onClick(event: MouseEvent) {
  if (!props.selectable) {
    return
  }
  event.preventDefault()
  emit('toggle', props.entity.id)
}

const mediaUrl = useMediaUrl()
const meta = computed(() => entityTypeMeta(props.entity.type))
const focusStyle = computed(() => coverFocusStyle(props.entity))
const dataBadge = computed(() => entityBadge(props.entity))
</script>

<template>
  <NuxtLink
    :to="`/entities/${entity.id}`"
    class="group flex items-center gap-3 border-b border-default px-3 py-2 transition-colors last:border-b-0 hover:bg-elevated/50"
    :class="selectable && (selected ? 'bg-primary/10' : 'cursor-pointer')"
    @click.capture="onClick"
  >
    <span
      v-if="selectable"
      class="flex size-4 shrink-0 items-center justify-center rounded border transition-colors"
      :class="selected ? 'border-primary bg-primary text-inverted' : 'border-accented bg-default'"
    >
      <UIcon
        v-if="selected"
        name="i-lucide-check"
        class="size-3"
      />
    </span>

    <img
      v-if="entity.image_url"
      :src="mediaUrl(entity.image_url)"
      :alt="entity.name"
      class="size-8 shrink-0 rounded-lg object-cover"
      :style="focusStyle"
    >
    <span
      v-else
      class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
    >
      <UIcon
        :name="meta.icon"
        class="size-4"
      />
    </span>

    <span class="min-w-0 shrink-0 basis-56 truncate text-sm font-medium text-highlighted group-hover:text-primary">
      {{ entity.name }}
    </span>

    <!-- The summary gives up its space first: the name is what you're scanning -->
    <span class="hidden min-w-0 flex-1 truncate text-sm text-muted sm:block">
      {{ entity.summary }}
    </span>

    <UBadge
      v-if="dataBadge"
      :label="dataBadge.label"
      :color="dataBadge.color"
      variant="subtle"
      size="sm"
      class="hidden shrink-0 capitalize md:inline-flex"
    />

    <VisibilityBadge
      v-if="!noVisibility && !selectable"
      :visibility="entity.visibility"
      class="shrink-0"
    />
  </NuxtLink>
</template>
