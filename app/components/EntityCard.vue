<script setup lang="ts">
const props = defineProps<{
  entity: EntitySummary
  /** Hide the visibility badge (player views, where everything shown is visible) */
  noVisibility?: boolean
}>()

const mediaUrl = useMediaUrl()
const meta = computed(() => entityTypeMeta(props.entity.type))

/** Where the crop centres — set by the DM from the gallery's Crop focus */
const focusStyle = computed(() => {
  const f = props.entity.data.cover_focus as { x: number, y: number } | undefined
  return f && typeof f.x === 'number' ? { objectPosition: `${f.x}% ${f.y}%` } : undefined
})

const QUEST_COLORS: Record<string, 'primary' | 'success' | 'error' | 'neutral'> = {
  active: 'primary', completed: 'success', failed: 'error', paused: 'neutral'
}

/** The one fact worth showing per type, straight from `data`. */
const dataBadge = computed<{ label: string, color: 'primary' | 'success' | 'error' | 'warning' | 'neutral' } | null>(() => {
  const d = props.entity.data

  switch (props.entity.type) {
    case 'quest': {
      const status = String(d.status ?? 'active')
      return { label: status, color: QUEST_COLORS[status] ?? 'primary' }
    }
    case 'session': {
      const played = d.status === 'played'
      const when = d.date ? ` · ${d.date}` : ''
      return { label: `${played ? 'played' : 'planned'}${when}`, color: played ? 'success' : 'warning' }
    }
    case 'monster':
      return d.cr ? { label: `CR ${d.cr}`, color: 'error' } : null
    case 'npc': {
      const status = String(d.status ?? '')
      if (!status || status === 'alive') return null
      return { label: status, color: status === 'dead' ? 'error' : 'warning' }
    }
    case 'character': {
      const bits = [d.level ? `Lv ${d.level}` : null, d.class].filter(Boolean)
      return bits.length ? { label: bits.join(' · '), color: 'neutral' } : null
    }
    default:
      return null
  }
})
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
          v-if="!noVisibility"
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
