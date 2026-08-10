<script setup lang="ts">
/**
 * A type's own fields, sized to what they hold.
 *
 * Deliberately renders no wrapper: these sit in the form's own grid alongside
 * visibility and the rest, so that a monster's CR and its visibility are one
 * block of facts rather than two competing ones. Widths come from the field
 * definition rather than being uniform — CR is a number and used to get the
 * same half-page box as "how to play them".
 */
defineProps<{
  fields: TypeField[]
}>()

const data = defineModel<Record<string, unknown>>({ required: true })

/* --- Six scores, one stored string ------------------------------------------
 * The data keeps "16/12/14/8/10/6" exactly as before; only the typing
 * changes. Six labelled boxes replace the count-the-slashes single field.
 */
const ABILITY_NAMES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']

function abilityAt(raw: unknown, index: number): string {
  return String(raw ?? '').split('/')[index]?.trim() ?? ''
}

function setAbility(key: string, index: number, value: string) {
  const parts = ABILITY_NAMES.map((_, i) => abilityAt(data.value[key], i))
  parts[index] = value.trim()
  const joined = parts.join('/')
  // All six empty means the field was cleared, not filled with slashes
  data.value[key] = parts.some(Boolean) ? joined : undefined
}
</script>

<template>
  <UFormField
    v-for="field in fields"
    :key="field.key"
    :label="field.label"
    :class="(field.long || field.abilities) && 'sm:col-span-2'"
  >
    <div
      v-if="field.abilities"
      class="grid max-w-md grid-cols-6 gap-1.5"
    >
      <label
        v-for="(name, index) in ABILITY_NAMES"
        :key="name"
        class="flex flex-col gap-0.5"
      >
        <span class="text-center text-[10px] font-medium tracking-wide text-dimmed">{{ name }}</span>
        <UInput
          type="number"
          :model-value="abilityAt(data[field.key], index)"
          size="sm"
          :aria-label="`${name} score`"
          :ui="{ base: 'text-center px-1' }"
          @update:model-value="value => setAbility(field.key, index, String(value ?? ''))"
        />
      </label>
    </div>
    <USelectMenu
      v-else-if="field.options"
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
      :class="field.short ? 'w-32' : 'w-full'"
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
</template>
