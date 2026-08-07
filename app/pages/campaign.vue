<script setup lang="ts">
const toast = useToast()
const { confirm } = useConfirm()
const {
  current,
  isDm,
  update,
  remove,
  members: fetchMembers,
  invite,
  removeMember
} = useCampaigns()
const { user } = useAuth()
const mediaUrl = useMediaUrl()

const form = reactive({ name: '', summary: '' })
const saving = ref(false)

const members = ref<CampaignMember[]>([])
const membersLoading = ref(true)

const inviteForm = reactive({ email: '', role: 'player' as CampaignRole })
const inviting = ref(false)

async function load() {
  if (!current.value) {
    return
  }

  form.name = current.value.name
  form.summary = current.value.summary ?? ''

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

async function sendInvite() {
  if (!current.value || !inviteForm.email.trim()) {
    return
  }

  inviting.value = true
  try {
    const member = await invite(current.value.id, {
      email: inviteForm.email.trim(),
      role: inviteForm.role
    })
    members.value = [...members.value, member]
    inviteForm.email = ''
    toast.add({
      title: `${member.user.full_name || member.user.email} joined`,
      icon: 'i-lucide-user-plus',
      color: 'success'
    })
  } catch (error) {
    toast.add({
      title: apiErrorMessage(error, 'Could not invite'),
      description: 'Players need an account first — they register themselves.',
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
  } finally {
    inviting.value = false
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
        </ContentCard>

        <!-- Players -->
        <ContentCard
          title="Players"
          icon="i-lucide-users"
          :description="isDm ? 'Invite by email — they need an account first.' : undefined"
          flush
        >
          <div
            v-if="membersLoading"
            class="space-y-2 p-4 sm:p-5"
          >
            <USkeleton
              v-for="i in 3"
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
                v-if="isDm && member.role !== 'dm'"
                icon="i-lucide-user-minus"
                color="neutral"
                variant="ghost"
                size="sm"
                aria-label="Remove player"
                @click="kick(member)"
              />
            </li>
          </ul>

          <form
            v-if="isDm"
            class="flex flex-wrap items-end gap-2 border-t border-default p-4 sm:px-5"
            @submit.prevent="sendInvite"
          >
            <UFormField
              label="Invite a player"
              class="min-w-48 flex-1"
            >
              <UInput
                v-model="inviteForm.email"
                type="email"
                placeholder="player@example.com"
                class="w-full"
              />
            </UFormField>
            <UButton
              type="submit"
              label="Invite"
              icon="i-lucide-user-plus"
              :loading="inviting"
              :disabled="!inviteForm.email.trim()"
            />
          </form>
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
