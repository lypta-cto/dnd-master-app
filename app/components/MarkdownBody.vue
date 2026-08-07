<script setup lang="ts">
const props = defineProps<{
  body: string | null | undefined
  /** Entities the API resolved from this body's [[links]] */
  linked?: { name: string, slug: string, id: string }[]
  /** Make - [ ] task items clickable; emits which one was toggled */
  editable?: boolean
}>()

const emit = defineEmits<{
  toggleTask: [index: number]
}>()

const { render } = useMarkdown()
const router = useRouter()

const html = computed(() => render(props.body, props.linked ?? []))

// Rendered anchors aren't NuxtLinks, so route them through the SPA by hand
function onClick(event: MouseEvent) {
  const anchor = (event.target as HTMLElement).closest('a.wiki-link')
  if (anchor) {
    event.preventDefault()
    router.push(anchor.getAttribute('href')!)
    return
  }

  // Disabled checkboxes swallow clicks, so the whole list item is the target —
  // a bigger tap area at the table anyway. Index = position among all tasks.
  if (!props.editable) {
    return
  }
  const item = (event.target as HTMLElement).closest('li')
  const root = event.currentTarget as HTMLElement
  if (!item || !item.querySelector(':scope > input[type=checkbox]')) {
    return
  }
  const tasks = [...root.querySelectorAll('li > input[type=checkbox]')]
  const index = tasks.indexOf(item.querySelector(':scope > input[type=checkbox]')!)
  if (index !== -1) {
    emit('toggleTask', index)
  }
}
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- html is the output of DOMPurify.sanitize -->
  <div
    class="markdown-body"
    :class="editable && 'markdown-body--editable'"
    @click="onClick"
    v-html="html"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>

<style scoped>
.markdown-body {
  color: var(--ui-text);
  line-height: 1.7;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  color: var(--ui-text-highlighted);
  font-weight: 600;
  margin: 1.25em 0 0.5em;
}

.markdown-body :deep(h1) { font-size: 1.35rem; }
.markdown-body :deep(h2) { font-size: 1.15rem; }
.markdown-body :deep(h3) { font-size: 1rem; }

.markdown-body :deep(p) { margin: 0.6em 0; }

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0.6em 0;
  padding-left: 1.4em;
  list-style: revert;
}

.markdown-body :deep(li:has(> input[type='checkbox'])) {
  list-style: none;
  margin-left: -1.4em;
  padding: 0.1em 0;
}

.markdown-body.markdown-body--editable :deep(li:has(> input[type='checkbox'])) {
  cursor: pointer;
  border-radius: 6px;
}

.markdown-body.markdown-body--editable :deep(li:has(> input[type='checkbox']):hover) {
  background: var(--ui-bg-elevated);
}

.markdown-body :deep(li > input[type='checkbox']) {
  margin-right: 0.5em;
  accent-color: var(--ui-primary);
}

.markdown-body :deep(blockquote) {
  border-left: 3px solid var(--ui-border-accented);
  padding-left: 1em;
  color: var(--ui-text-muted);
  margin: 0.8em 0;
}

.markdown-body :deep(code) {
  background: var(--ui-bg-elevated);
  border-radius: 4px;
  padding: 0.1em 0.35em;
  font-size: 0.9em;
}

.markdown-body :deep(a.wiki-link) {
  color: var(--ui-primary);
  font-weight: 500;
  text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--ui-primary) 40%, transparent);
}

.markdown-body :deep(a.wiki-link:hover) {
  border-bottom-color: var(--ui-primary);
}

.markdown-body :deep(.wiki-link-unresolved) {
  color: var(--ui-text-muted);
  border-bottom: 1px dotted var(--ui-border-accented);
  cursor: help;
}
</style>
