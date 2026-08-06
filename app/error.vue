<script setup lang="ts">
import type { NuxtError } from '#app'

defineProps<{ error: NuxtError }>()
</script>

<template>
  <UApp>
    <div class="app-canvas min-h-screen flex items-center justify-center p-6">
      <div class="app-card max-w-md w-full text-center px-6 py-12">
        <p class="text-5xl font-semibold text-highlighted tabular-nums">
          {{ error.statusCode }}
        </p>
        <p class="mt-2 text-muted">
          {{ error.statusMessage || 'Something went wrong.' }}
        </p>

        <UButton
          class="mt-6 rounded-xl"
          icon="i-lucide-arrow-left"
          label="Back to dashboard"
          @click="clearError({ redirect: '/' })"
        />
      </div>
    </div>
  </UApp>
</template>
