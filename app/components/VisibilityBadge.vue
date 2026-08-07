<script setup lang="ts">
const props = defineProps<{
  visibility: Visibility
}>()

const meta = computed(() => VISIBILITIES.find(v => v.value === props.visibility)!)

const color = computed(() =>
  ({ dm_only: 'warning' as const, shared: 'success' as const, public: 'info' as const })[
    props.visibility
  ]
)
</script>

<template>
  <UTooltip :text="meta.hint">
    <UBadge
      :color="color"
      variant="subtle"
      size="sm"
      :icon="meta.icon"
      :label="meta.label"
    />
  </UTooltip>
</template>
