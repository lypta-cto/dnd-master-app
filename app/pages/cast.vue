<script setup lang="ts">
const toast = useToast()
const { current, isDm, detail, rotateDisplayToken } = useCampaigns()
const cast = useCast()
const { confirm } = useConfirm()

const status = ref<CastStatus | null>(null)
const displayToken = ref<string | null>(null)
const textForm = reactive({ text: '', subtext: '' })
const busy = ref(false)

const displayUrl = computed(() => {
  if (!current.value || !displayToken.value) {
    return null
  }
  return `${location.origin}/display/${current.value.id}?t=${displayToken.value}`
})

async function load() {
  if (!current.value || !isDm.value) {
    return
  }

  // Forced: this page is the one that has to show the truth, cache or not
  const [state, campaign] = await Promise.all([cast.status(true), detail(current.value.id)])
  status.value = state
  displayToken.value = campaign.display_token
}

watch(() => current.value?.id, load, { immediate: true })

// The connected-count changes as displays come and go; poll it gently
let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  poll = setInterval(async () => {
    if (current.value && isDm.value) {
      // The connected count only changes on the server, so this must not
      // be served from the shared copy
      status.value = await cast.status(true)
    }
  }, 5000)
})
onUnmounted(() => clearInterval(poll))

async function castText() {
  if (!textForm.text.trim()) {
    return
  }

  busy.value = true
  try {
    status.value = await cast.set({
      mode: 'text',
      payload: { text: textForm.text.trim(), subtext: textForm.subtext.trim() }
    })
  } finally {
    busy.value = false
  }
}

async function clearScreen() {
  busy.value = true
  try {
    status.value = await cast.clear()
  } finally {
    busy.value = false
  }
}

async function copyUrl() {
  if (displayUrl.value) {
    await navigator.clipboard.writeText(displayUrl.value)
    toast.add({ title: 'Display link copied', icon: 'i-lucide-clipboard-check', color: 'success' })
  }
}

async function rotate() {
  if (!current.value) {
    return
  }

  const ok = await confirm({
    title: 'Rotate the display link?',
    description: 'The old link stops working immediately — any open display goes dark.',
    confirmLabel: 'Rotate',
    color: 'warning'
  })

  if (!ok) {
    return
  }

  const campaign = await rotateDisplayToken(current.value.id)
  displayToken.value = campaign.display_token
  toast.add({ title: 'Link rotated', icon: 'i-lucide-refresh-cw', color: 'success' })
}
</script>

<template>
  <AppPage
    title="Cast screen"
    description="What the table sees. Open the display link on a TV or a second window."
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: 'Cast screen' }
    ]"
  >
    <EmptyState
      v-if="!current || !isDm"
      icon="i-lucide-cast"
      title="DM only"
      description="Casting belongs to the DM of the selected campaign."
    />

    <div
      v-else
      class="grid gap-4 lg:grid-cols-3"
    >
      <div class="space-y-4 lg:col-span-2">
        <!-- Now showing -->
        <ContentCard
          title="Now showing"
          icon="i-lucide-monitor-play"
        >
          <template #actions>
            <UBadge
              :color="status?.displays_connected ? 'success' : 'neutral'"
              variant="subtle"
              :icon="status?.displays_connected ? 'i-lucide-wifi' : 'i-lucide-wifi-off'"
              :label="`${status?.displays_connected ?? 0} display(s)`"
            />
            <UButton
              label="Clear"
              icon="i-lucide-monitor-off"
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="busy || status?.mode === 'idle'"
              @click="clearScreen"
            />
          </template>

          <div class="flex min-h-32 items-center justify-center rounded-xl bg-elevated/60 p-6">
            <p
              v-if="!status || status.mode === 'idle'"
              class="text-sm text-dimmed"
            >
              Idle — the table sees the campaign name.
            </p>
            <div
              v-else-if="status.mode === 'text'"
              class="text-center"
            >
              <p class="text-lg font-semibold text-highlighted">
                {{ status.payload.text }}
              </p>
              <p
                v-if="status.payload.subtext"
                class="mt-1 text-sm text-muted"
              >
                {{ status.payload.subtext }}
              </p>
            </div>
            <div
              v-else-if="status.mode === 'slideshow'"
              class="text-center"
            >
              <UBadge
                label="Slideshow"
                icon="i-lucide-images"
                color="primary"
                variant="subtle"
              />
              <p class="mt-2 text-sm text-muted">
                {{ (status.payload.images as any[])?.length ?? 0 }} slides,
                {{ status.payload.interval_seconds ?? 8 }}s each
              </p>
            </div>
            <div
              v-else-if="status.mode === 'image'"
              class="text-center"
            >
              <UBadge
                label="Image"
                icon="i-lucide-image"
                color="primary"
                variant="subtle"
              />
              <p class="mt-2 text-sm text-muted">
                {{ status.payload.caption || status.payload.image_url }}
              </p>
            </div>
          </div>
        </ContentCard>

        <!-- Cast text -->
        <ContentCard
          title="Cast a message"
          icon="i-lucide-type"
          description="Big text on the table's screen — a chapter title, a warning, a name."
        >
          <form
            class="space-y-3"
            @submit.prevent="castText"
          >
            <UInput
              v-model="textForm.text"
              placeholder="Roll initiative!"
              size="lg"
              class="w-full"
            />
            <UInput
              v-model="textForm.subtext"
              placeholder="Optional second line"
              class="w-full"
            />
            <div class="flex justify-end">
              <UButton
                type="submit"
                label="Cast text"
                icon="i-lucide-cast"
                :loading="busy"
                :disabled="!textForm.text.trim()"
              />
            </div>
          </form>
        </ContentCard>

        <SlideshowBuilder @cast="s => (status = s)" />

        <ContentCard
          title="Dice"
          icon="i-lucide-dices"
          description="Roll in private, or cast the result to the table for the drama."
        >
          <DiceRoller />
        </ContentCard>

        <ContentCard
          title="Cast an entity"
          icon="i-lucide-venetian-mask"
          description="Open any NPC or location and press Cast — its portrait lands here."
        >
          <UButton
            label="Browse entities"
            color="neutral"
            variant="outline"
            trailing-icon="i-lucide-arrow-right"
            to="/entities"
          />
        </ContentCard>
      </div>

      <!-- Display link -->
      <div class="space-y-4">
        <ContentCard
          title="Display link"
          icon="i-lucide-tv"
          description="Open once on the TV. No login — the link itself is the key."
        >
          <div class="space-y-3">
            <UInput
              :model-value="displayUrl ?? ''"
              readonly
              class="w-full font-mono text-xs"
            />
            <div class="flex gap-2">
              <UButton
                label="Copy"
                icon="i-lucide-clipboard"
                color="neutral"
                variant="outline"
                size="sm"
                @click="copyUrl"
              />
              <UButton
                label="Open"
                icon="i-lucide-external-link"
                color="neutral"
                variant="outline"
                size="sm"
                :to="displayUrl ?? undefined"
                target="_blank"
              />
              <UButton
                label="Rotate"
                icon="i-lucide-refresh-cw"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="rotate"
              />
            </div>
            <p class="text-xs text-muted">
              Rotate if the link ever leaks — the old one dies instantly.
            </p>
          </div>
        </ContentCard>
      </div>
    </div>
  </AppPage>
</template>
