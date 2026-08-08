<script setup lang="ts">
/**
 * A type's own fields, sized to what they hold.
 *
 * Extracted because they appear in two places: above the prose for story
 * beats, where they are the entry, and beside it for everything else. Widths
 * come from the field definition rather than being uniform — CR is a number
 * and used to get the same half-page box as "how to play them".
 */
defineProps<{
  fields: TypeField[]
}>()

const data = defineModel<Record<string, unknown>>({ required: true })
</script>

<template>
  <div class="grid gap-4 sm:grid-cols-2">
    <UFormField
      v-for="field in fields"
      :key="field.key"
      :label="field.label"
      :class="field.long && 'sm:col-span-2'"
    >
      <USelectMenu
        v-if="field.options"
        :model-value="(data[field.key] as string | undefined)"
        :items="field.options"
        :placeholder="field.label"
        class="w-full capitalize"
        @update:model-value="value => (data[field.key] = value)"
      />
      <!-- Open set: type to filter, and anything not on the list is kept -->
      <UInputMenu
        v-else-if="field.suggestions"
        :model-value="(data[field.key] as string | undefined) ?? ''"
        :items="field.suggestions"
        :placeholder="field.placeholder"
        create-item
        class="w-full"
        @update:model-value="value => (data[field.key] = value)"
        @create="value => (data[field.key] = value)"
      />
      <UTextarea
        v-else-if="field.long"
        :model-value="(data[field.key] as string | undefined) ?? ''"
        :rows="2"
        :placeholder="field.placeholder"
        class="w-full"
        @update:model-value="value => (data[field.key] = value)"
      />
      <UInput
        v-else
        :model-value="(data[field.key] as string | undefined) ?? ''"
        :placeholder="field.placeholder"
        :class="field.short ? 'w-32' : 'w-full'"
        @update:model-value="value => (data[field.key] = value)"
      />
    </UFormField>
  </div>
</template>
