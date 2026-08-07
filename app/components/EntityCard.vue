<script setup lang="ts">
const props = defineProps<{
  entity: EntitySummary
  /** Hide the visibility badge (player views, where everything shown is visible) */
  noVisibility?: boolean
  /** Selection mode: clicks pick the card instead of opening it */
  selectable?: boolean
  selected?: boolean
}>()

const emit = defineEmits<{
  toggle: [id: string]
}>()

// Capture phase: NuxtLink's own handler runs on bubble and bails when the
// event is already defaulted, so this is what keeps a pick from navigating.
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
    class="app-card group relative flex gap-3 p-3 transition-colors hover:border-accented"
    :class="selectable && (selected ? 'border-primary ring-1 ring-primary' : 'cursor-pointer')"
    @click.capture="onClick"
  >
    <span
      v-if="selectable"
      class="absolute right-2 top-2 flex size-5 items-center justify-center rounded-md border transition-colors"
      :class="selected ? 'border-primary bg-primary text-inverted' : 'border-accented bg-default'"
    >
      <UIcon
        v-if="selected"
        name="i-lucide-check"
        class="size-3.5"
      />
    </span>

    <img
      v-if="entity.image_url"
      :src="mediaUrl(entity.image_url)"
      :alt="entity.name"
      class="size-14 shrink-0 rounded-xl object-cover"
      :style="focusStyle"
    >
    <span
      v-else
      class="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
    >
      <UIcon
        :name="meta.icon"
        class="size-6"
      />
    </span>

    <div class="min-w-0 flex-1">
      <div class="flex items-start justify-between gap-2">
        <p class="truncate font-medium text-highlighted group-hover:text-primary">
          {{ entity.name }}
        </p>
        <VisibilityBadge
          v-if="!noVisibility && !selectable"
          :visibility="entity.visibility"
        />
      </div>

      <p class="mt-0.5 line-clamp-2 text-sm text-muted">
        {{ entity.summary || meta.label }}
      </p>

      <UBadge
        v-if="dataBadge"
        :label="dataBadge.label"
        :color="dataBadge.color"
        variant="subtle"
        size="sm"
        class="mt-1.5 capitalize"
      />

      <div
        v-if="entity.tags.length"
        class="mt-1.5 flex flex-wrap gap-1"
      >
        <UBadge
          v-for="tag in entity.tags.slice(0, 4)"
          :key="tag"
          :label="tag"
          color="neutral"
          variant="subtle"
          size="sm"
        />
      </div>
    </div>
  </NuxtLink>
</template>
