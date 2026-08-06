<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
  submitLabel?: string
  cancelLabel?: string
  loading?: boolean
  /** Disable the submit button — pass your form's validity */
  disabled?: boolean
}>(), {
  submitLabel: 'Save',
  cancelLabel: 'Cancel',
  loading: false,
  disabled: false
})

const emit = defineEmits<{
  submit: []
  cancel: []
}>()

const open = defineModel<boolean>('open', { default: false })

defineSlots<{
  /** Form fields */
  default?: () => unknown
  /** Replaces the footer buttons entirely */
  footer?: () => unknown
}>()

function cancel() {
  emit('cancel')
  open.value = false
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    :description="description"
    :ui="{ content: 'max-w-lg', body: 'flex-1 overflow-y-auto' }"
  >
    <template #body>
      <form
        id="form-slideover"
        class="space-y-5"
        @submit.prevent="emit('submit')"
      >
        <slot />
      </form>
    </template>

    <template #footer>
      <slot name="footer">
        <div class="flex w-full justify-end gap-2">
          <UButton
            :label="cancelLabel"
            color="neutral"
            variant="outline"
            :disabled="loading"
            @click="cancel"
          />
          <UButton
            type="submit"
            form="form-slideover"
            :label="submitLabel"
            :loading="loading"
            :disabled="disabled"
          />
        </div>
      </slot>
    </template>
  </USlideover>
</template>
