<script setup lang="ts">
const toast = useToast()
const { confirm } = useConfirm()
const {
  current,
  isDm,
  update,
  remove,
  members: fetchMembers,
  removeMember
} = useCampaigns()
const { user } = useAuth()
const mediaUrl = useMediaUrl()

const form = reactive({ name: '', summary: '' })

/* The setup: what kind of game, what the party is told, and the truth under it */
const setup = ref<CampaignData>({})
const savingSetup = ref(false)

function loadSetup() {
  setup.value = { ...(current.value?.data ?? {}) }
}

async function saveSetup() {
  if (!current.value) {
    return
  }

  savingSetup.value = true
  try {
    // Blank fields shouldn't linger as empty strings in the record
    const data = Object.fromEntries(
      Object.entries(setup.value).filter(([, value]) => value !== '' && value != null)
    ) as CampaignData
    await update(current.value.id, { data })
    toast.add({ title: 'Setup saved', icon: 'i-lucide-circle-check', color: 'success' })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    savingSetup.value = false
  }
}
const saving = ref(false)

const members = ref<CampaignMember[]>([])
const membersLoading = ref(true)

async function load() {
  if (!current.value) {
    return
  }

  form.name = current.value.name
  form.summary = current.value.summary ?? ''
  loadSetup()

  membersLoading.value = true
  try {
    members.value = await fetchMembers(current.value.id)
  } finally {
    membersLoading.value = false
  }
}

watch(() => current.value?.id, load, { immediate: true })

const changed = computed(() =>
  !!current.value
  && (form.name.trim() !== current.value.name
    || form.summary.trim() !== (current.value.summary ?? ''))
)

async function save() {
  if (!current.value) {
    return
  }

  saving.value = true
  try {
    await update(current.value.id, {
      name: form.name.trim(),
      summary: form.summary.trim() || null
    })
    toast.add({ title: 'Campaign updated', icon: 'i-lucide-circle-check', color: 'success' })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function kick(member: CampaignMember) {
  if (!current.value) {
    return
  }

  const ok = await confirm({
    title: `Remove ${member.user.full_name || member.user.email}?`,
    description: 'They lose access to everything shared in this campaign.',
    confirmLabel: 'Remove',
    color: 'error'
  })

  if (!ok) {
    return
  }

  await removeMember(current.value.id, member.id)
  members.value = members.value.filter(m => m.id !== member.id)
}

async function destroyCampaign() {
  if (!current.value) {
    return
  }

  const ok = await confirm({
    title: `Delete “${current.value.name}”?`,
    description: 'Every NPC, location, note and link in it is gone for good.',
    confirmLabel: 'Delete campaign',
    color: 'error'
  })

  if (!ok) {
    return
  }

  await remove(current.value.id)
  toast.add({ title: 'Campaign deleted', icon: 'i-lucide-trash-2', color: 'error' })
  await navigateTo('/')
}
</script>

<template>
  <AppPage
    title="Campaign"
    :description="!current
      ? 'Select a campaign first.'
      : isDm
        ? `Settings and players for ${current.name}.`
        : `Who you're playing ${current.name} with.`"
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: 'Campaign' }
    ]"
  >
    <EmptyState
      v-if="!current"
      icon="i-lucide-swords"
      title="No campaign selected"
      description="Pick or create a campaign in the sidebar."
    />

    <div
      v-else
      class="grid gap-4 lg:grid-cols-3"
    >
      <div class="space-y-4 lg:col-span-2">
        <!-- Basics — the DM's settings; players get the read-only card below -->
        <ContentCard
          v-if="isDm"
          title="Basics"
          icon="i-lucide-swords"
        >
          <div class="space-y-4">
            <UFormField label="Name">
              <UInput
                v-model="form.name"
                :disabled="!isDm"
                class="w-full"
              />
            </UFormField>
            <UFormField
              label="Summary"
              help="Shows under the campaign name on the dashboard."
            >
              <UTextarea
                v-model="form.summary"
                :rows="2"
                :disabled="!isDm"
                class="w-full"
              />
            </UFormField>
            <div
              v-if="isDm"
              class="flex justify-end"
            >
              <UButton
                label="Save"
                :loading="saving"
                :disabled="!changed || !form.name.trim()"
                @click="save"
              />
            </div>
          </div>
        </ContentCard>

        <!-- The setup, in the order the wizard asks for it -->
        <ContentCard
          v-if="isDm"
          title="The game"
          icon="i-lucide-dices"
          description="What kind of thing this is, what the party is told, and what's really going on."
        >
          <template #actions>
            <UButton
              label="Save"
              size="sm"
              :loading="savingSetup"
              @click="saveSetup"
            />
          </template>

          <div class="space-y-5">
            <div class="grid gap-4 sm:grid-cols-3">
              <UFormField label="Kind of game">
                <USelectMenu
                  v-model="setup.campaign_type"
                  :items="CAMPAIGN_TYPES"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="System">
                <UInput
                  v-model="setup.system"
                  placeholder="D&D 5e"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Expected length">
                <UInput
                  v-model="setup.duration"
                  placeholder="5–6h"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div class="grid gap-4 sm:grid-cols-4">
              <UFormField label="Players">
                <UInputNumber
                  v-model="setup.player_count"
                  :min="1"
                  :max="12"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Starting level">
                <UInputNumber
                  v-model="setup.starting_level"
                  :min="1"
                  :max="20"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Genre">
                <UInputMenu
                  v-model="setup.genre"
                  :items="GENRES"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Tone">
                <UInputMenu
                  v-model="setup.tone"
                  :items="TONES"
                  class="w-full"
                />
              </UFormField>
            </div>

            <UFormField
              label="Premise"
              help="What the party believes they're walking into. They can read this."
            >
              <UTextarea
                v-model="setup.premise"
                :rows="2"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Opening lines"
              help="What you read out to start."
            >
              <UTextarea
                v-model="setup.player_intro"
                :rows="2"
                class="w-full"
              />
            </UFormField>

            <div class="space-y-4 rounded-xl border border-default p-4">
              <p class="flex items-center gap-2 text-sm font-medium text-highlighted">
                <UIcon
                  name="i-lucide-eye-off"
                  class="size-4 text-dimmed"
                />
                Yours only — the API never sends this to a player
              </p>

              <UFormField label="What is actually going on">
                <UTextarea
                  v-model="setup.dm_truth"
                  :rows="2"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Who drives it">
                <UInput
                  v-model="setup.dm_villain"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="The turn">
                <UTextarea
                  v-model="setup.dm_twist"
                  :rows="2"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
        </ContentCard>

        <!-- What a player needs from this page: what we're playing, and who with -->
        <ContentCard
          v-if="!isDm"
          title="About"
          icon="i-lucide-swords"
        >
          <p class="font-medium text-highlighted">
            {{ current.name }}
          </p>
          <p class="mt-1 text-sm text-muted">
            {{ current.summary || 'Your DM hasn\'t written a summary yet.' }}
          </p>

          <p
            v-if="current.data.premise"
            class="mt-3 text-sm text-toned"
          >
            {{ current.data.premise }}
          </p>

          <dl
            v-if="current.data.system || current.data.campaign_type"
            class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm"
          >
            <div
              v-if="current.data.campaign_type"
              class="flex gap-2"
            >
              <dt class="text-muted">
                Format
              </dt>
              <dd class="text-toned">
                {{ CAMPAIGN_TYPES.find(t => t.value === current!.data.campaign_type)?.label }}
              </dd>
            </div>
            <div
              v-if="current.data.system"
              class="flex gap-2"
            >
              <dt class="text-muted">
                System
              </dt>
              <dd class="text-toned">
                {{ current.data.system }}
              </dd>
            </div>
          </dl>
        </ContentCard>

        <PlayerRoster :is-dm="isDm" />

        <!-- Accounts with access. The roster above is the table; this is the
             door — a DM co-running the game, or a player who signed in. -->
        <ContentCard
          v-if="isDm"
          title="Accounts"
          icon="i-lucide-key-round"
          description="Who can sign in to this campaign."
          flush
        >
          <div
            v-if="membersLoading"
            class="space-y-2 p-4 sm:p-5"
          >
            <USkeleton
              v-for="i in 2"
              :key="i"
              class="h-12 rounded-xl"
            />
          </div>

          <ul v-else>
            <li
              v-for="member in members"
              :key="member.id"
              class="flex items-center gap-3 border-b border-default p-4 last:border-0 sm:px-5"
            >
              <UAvatar
                :src="mediaUrl(member.user.avatar_url)"
                :alt="member.user.full_name ?? member.user.email"
                :text="(member.user.full_name ?? member.user.email).slice(0, 2).toUpperCase()"
                size="md"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-highlighted">
                  {{ member.user.full_name || member.user.email }}
                  <span
                    v-if="member.user.id === user?.id"
                    class="text-muted"
                  >(you)</span>
                </p>
                <p class="truncate text-xs text-muted">
                  {{ member.user.email }}
                </p>
              </div>
              <UBadge
                :label="member.role === 'dm' ? 'DM' : 'Player'"
                :color="member.role === 'dm' ? 'primary' : 'neutral'"
                variant="subtle"
              />
              <UButton
                v-if="member.role !== 'dm'"
                icon="i-lucide-user-minus"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Revoke access"
                @click="kick(member)"
              />
            </li>
          </ul>
        </ContentCard>
      </div>

      <div class="space-y-4">
        <ContentCard
          v-if="isDm"
          title="Cast display"
          icon="i-lucide-tv"
          description="The TV link and controls live on the cast screen."
        >
          <UButton
            label="Open cast screen"
            color="neutral"
            variant="outline"
            trailing-icon="i-lucide-arrow-right"
            to="/cast"
          />
        </ContentCard>

        <ContentCard
          v-if="isDm"
          title="Danger zone"
          icon="i-lucide-triangle-alert"
        >
          <UButton
            label="Delete campaign"
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            block
            @click="destroyCampaign"
          />
        </ContentCard>
      </div>
    </div>
  </AppPage>
</template>
