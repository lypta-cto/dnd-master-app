<script setup lang="ts">
const { state, respond } = useConfirm()

const color = computed(() => state.value.color ?? 'primary')

const icon = computed(() =>
  state.value.icon ?? (color.value === 'error' ? 'i-lucide-trash-2' : 'i-lucide-circle-alert')
)
</script>

<template>
  <UModal
    :open="state.open"
    :title="state.title"
    :description="state.description"
    :ui="{ content: 'max-w-md', header: 'hidden' }"
    @update:open="value => !value && respond(false)"
  >
    <template #content>
      <div class="p-5">
        <div class="flex items-start gap-4">
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-xl"
            :class="color === 'error' ? 'bg-error/10 text-error' : 'bg-primary/10 text-primary'"
          >
            <UIcon
              :name="icon"
              class="size-5"
            />
          </span>

          <div class="min-w-0 pt-0.5">
            <p class="font-semibold text-highlighted">
              {{ state.title }}
            </p>
            <p
              v-if="state.description"
              class="mt-1 text-sm text-muted"
            >
              {{ state.description }}
            </p>
          </div>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <UButton
            :label="state.cancelLabel ?? 'Cancel'"
            color="neutral"
            variant="outline"
            @click="respond(false)"
          />
          <UButton
            :label="state.confirmLabel ?? 'Confirm'"
            :color="color"
            @click="respond(true)"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
