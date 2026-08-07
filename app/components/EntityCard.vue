<script setup lang="ts">
const props = defineProps<{
  entity: EntitySummary
  /** Hide the visibility badge (player views, where everything shown is visible) */
  noVisibility?: boolean
}>()

const mediaUrl = useMediaUrl()
const meta = computed(() => entityTypeMeta(props.entity.type))
</script>

<template>
  <NuxtLink
    :to="`/entities/${entity.id}`"
    class="app-card group flex gap-3 p-3 transition-colors hover:border-accented"
  >
    <img
      v-if="entity.image_url"
      :src="mediaUrl(entity.image_url)"
      :alt="entity.name"
      class="size-14 shrink-0 rounded-xl object-cover"
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
          v-if="!noVisibility"
          :visibility="entity.visibility"
        />
      </div>

      <p class="mt-0.5 line-clamp-2 text-sm text-muted">
        {{ entity.summary || meta.label }}
      </p>

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
