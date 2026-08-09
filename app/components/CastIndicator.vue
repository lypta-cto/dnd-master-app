<script setup lang="ts">
/**
 * What's on the table, in the top bar, everywhere.
 *
 * Casting used to be something you did and then lost track of: the page you
 * cast from was the only place that knew, so walking to another screen left
 * you guessing whether the party was still staring at a map. This follows you,
 * takes you back to whatever is up, and stops it without going looking.
 */
const { isDm, current, detail } = useCampaigns()
const cast = useCast()
const toast = useToast()

const { showing, showingLabel, showingEntityId } = cast

const stopping = ref(false)

onMounted(() => {
  if (isDm.value) {
    // Never fatal: a top-bar chip is not worth an error toast on page load
    cast.status().catch(() => {})
  }
})

/**
 * The same link the TV is on, for the DM's own second tab.
 *
 * "What is the table actually seeing right now" shouldn't require walking to
 * the television — one click opens the display view exactly as the party has
 * it, fog and all. The token is fetched once per campaign and quietly: a
 * missing token just means no eye button, not an error.
 */
const displayToken = ref<string | null>(null)

watch(
  () => (isDm.value ? current.value?.id : null),
  async (id) => {
    displayToken.value = null
    if (!id) {
      return
    }
    try {
      displayToken.value = (await detail(id)).display_token
    } catch {
      // The chip works fine without the extra button
    }
  },
  { immediate: true }
)

const displayUrl = computed(() =>
  current.value && displayToken.value
    ? `/display/${current.value.id}?t=${displayToken.value}`
    : null
)

/** Back to whatever put it there, so the fix is one click from the alert */
const target = computed(() => {
  if (showingEntityId.value) {
    return `/entities/${showingEntityId.value}`
  }
  return showing.value?.mode === 'initiative' ? '/combat' : '/cast'
})

async function stop() {
  stopping.value = true
  try {
    await cast.clear()
    toast.add({ title: 'Table screen cleared', icon: 'i-lucide-cast', color: 'success' })
  } catch (error) {
    toast.add({
      title: apiErrorMessage(error),
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
  } finally {
    stopping.value = false
  }
}
</script>

<template>
  <div
    v-if="isDm && showing"
    class="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2 pr-0.5"
  >
    <NuxtLink
      :to="target"
      class="flex items-center gap-1.5 text-xs font-medium text-primary"
    >
      <!-- Pulsing, because this is the one thing on screen that other people
           are looking at right now -->
      <span class="relative flex size-1.5">
        <span class="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
        <span class="relative inline-flex size-1.5 rounded-full bg-primary" />
      </span>
      <span class="hidden sm:inline">On the table:</span>
      <span class="max-w-32 truncate">{{ showing.payload.caption || showingLabel }}</span>
    </NuxtLink>

    <!-- The control room, one click away from anywhere -->
    <UTooltip text="Open the cast screen controls">
      <UButton
        icon="i-lucide-sliders-horizontal"
        color="primary"
        variant="ghost"
        size="xs"
        aria-label="Cast controls"
        to="/cast"
      />
    </UTooltip>

    <!-- Exactly what the party sees, in a tab of your own -->
    <UTooltip
      v-if="displayUrl"
      text="See what the table sees, in a new tab"
    >
      <UButton
        icon="i-lucide-eye"
        color="primary"
        variant="ghost"
        size="xs"
        aria-label="Open the table's view in a new tab"
        :to="displayUrl"
        target="_blank"
      />
    </UTooltip>

    <UButton
      icon="i-lucide-x"
      color="primary"
      variant="ghost"
      size="xs"
      :loading="stopping"
      aria-label="Stop casting"
      @click="stop"
    />
  </div>
</template>
