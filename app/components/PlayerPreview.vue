<script setup lang="ts">
/**
 * "What do my players actually see?" — answered without logging out.
 *
 * The rules here are the backend's own: a dm_only entity simply isn't there for
 * a player (the API answers 404), and links to dm_only entities never resolve
 * for them, so those mentions fall back to plain text. Everything below is
 * derived from data the DM's request already returned — no second fetch, no
 * second source of truth to drift.
 */
const props = defineProps<{
  entity: EntityDetail
}>()

const open = defineModel<boolean>('open', { default: false })

const mediaUrl = useMediaUrl()

const hidden = computed(() => props.entity.visibility === 'dm_only')

const visibleLinks = computed(() =>
  props.entity.links.filter(link => link.visibility !== 'dm_only')
)
const hiddenLinks = computed(() =>
  props.entity.links.filter(link => link.visibility === 'dm_only')
)
const visibleBacklinks = computed(() =>
  props.entity.backlinks.filter(link => link.visibility !== 'dm_only')
)

/**
 * The DM's own request carries `dm_` fields; a player's never would. Listing
 * them here — by name, not by content — is the point of the preview: you see
 * what you're holding back, not just what you're giving away.
 */
const withheld = computed(() =>
  Object.keys(props.entity.data)
    .filter(key => key.startsWith('dm_'))
    .map(key => (key === 'dm_notes'
      ? 'your notes'
      : key === 'dm_players_think'
        ? 'what the party believes'
        : key.replace(/^dm_/, '').replace(/_/g, ' ')))
)

const focusStyle = computed(() => {
  const f = props.entity.data.cover_focus as { x: number, y: number } | undefined
  return f && typeof f.x === 'number' ? { objectPosition: `${f.x}% ${f.y}%` } : undefined
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="Player view"
    :description="hidden
      ? 'This entity is DM only.'
      : `How ${entity.name} reads for someone at the table.`"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <!-- Invisible entirely -->
      <div
        v-if="hidden"
        class="flex flex-col items-center gap-3 py-8 text-center"
      >
        <UIcon
          name="i-lucide-eye-off"
          class="size-8 text-dimmed"
        />
        <p class="font-medium text-highlighted">
          Players see nothing here
        </p>
        <p class="max-w-sm text-sm text-muted">
          It doesn't appear in their lists or search, and opening the link
          directly answers "not found" — the id itself gives nothing away.
        </p>
        <p class="text-sm text-muted">
          Set it to <strong class="text-toned">Shared</strong> when the party earns it.
        </p>
      </div>

      <div
        v-else
        class="space-y-4"
      >
        <div class="flex items-start gap-3">
          <img
            v-if="entity.image_url"
            :src="mediaUrl(entity.image_url)"
            :alt="entity.name"
            class="size-16 shrink-0 rounded-xl object-cover"
            :style="focusStyle"
          >
          <div class="min-w-0">
            <p class="font-medium text-highlighted">
              {{ entity.name }}
            </p>
            <p class="mt-0.5 text-sm text-muted">
              {{ entity.summary || 'No summary — players get the body only.' }}
            </p>
          </div>
        </div>

        <!-- Body, with dm_only mentions demoted to plain text exactly as the API would -->
        <div
          v-if="entity.body"
          class="rounded-xl border border-default p-3"
        >
          <MarkdownBody
            :body="entity.body"
            :linked="visibleLinks"
          />
        </div>

        <div
          v-if="visibleBacklinks.length"
          class="text-sm text-muted"
        >
          Mentioned in
          <span class="text-toned">{{ visibleBacklinks.map(b => b.name).join(', ') }}</span>
        </div>

        <div
          v-if="withheld.length"
          class="flex items-start gap-2 rounded-xl bg-elevated p-3 text-sm"
        >
          <UIcon
            name="i-lucide-eye-off"
            class="mt-0.5 size-4 shrink-0 text-dimmed"
          />
          <p class="text-muted">
            Kept back:
            <span class="text-toned">{{ withheld.join(', ') }}</span>.
          </p>
        </div>

        <div
          v-if="hiddenLinks.length"
          class="flex items-start gap-2 rounded-xl bg-elevated p-3 text-sm"
        >
          <UIcon
            name="i-lucide-eye-off"
            class="mt-0.5 size-4 shrink-0 text-dimmed"
          />
          <p class="text-muted">
            {{ hiddenLinks.length }}
            {{ hiddenLinks.length === 1 ? 'mention stays' : 'mentions stay' }}
            plain text for them —
            <span class="text-toned">{{ hiddenLinks.map(l => l.name).join(', ') }}</span>
            {{ hiddenLinks.length === 1 ? 'is' : 'are' }} still DM only.
          </p>
        </div>
      </div>
    </template>
  </UModal>
</template>
