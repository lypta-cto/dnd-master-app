<script setup lang="ts">
/**
 * Who is actually at the table.
 *
 * A seat is a person the DM wrote down — no account needed, because most
 * players never want one. Adding eight of them should take a minute, so the
 * quick-add field asks for a name and nothing else; everything richer lives
 * behind Edit, and an account is an invitation away if they want their sheet
 * on their phone.
 */
const props = defineProps<{
  isDm: boolean
}>()

const toast = useToast()
const { confirm } = useConfirm()
const players = usePlayers()
const { currentId } = useCampaigns()

const roster = ref<Player[]>([])
const loading = ref(true)
const adding = ref(false)
const newName = ref('')

const editing = ref<Player | null>(null)
const inviting = ref<Player | null>(null)
const inviteEmail = ref('')
const inviteBusy = ref(false)

async function load() {
  if (!currentId.value) {
    loading.value = false
    return
  }

  loading.value = true
  try {
    roster.value = await players.list()
  } finally {
    loading.value = false
  }
}

watch(() => currentId.value, load, { immediate: true })

async function addPlayer() {
  const name = newName.value.trim()
  if (!name || adding.value) {
    return
  }

  adding.value = true
  try {
    roster.value = [...roster.value, await players.create({ name })]
    newName.value = ''
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    adding.value = false
  }
}

function onSaved(player: Player) {
  roster.value = roster.value.map(p => (p.id === player.id ? player : p))
  editing.value = null
}

async function removePlayer(player: Player) {
  const sheets = player.characters.length

  const ok = await confirm({
    title: `Remove ${player.name}?`,
    description: sheets
      ? `Their ${sheets === 1 ? 'character stays' : 'characters stay'} in the campaign, without a player.`
      : 'They come off the roster. Nothing else changes.',
    confirmLabel: 'Remove',
    color: 'error'
  })

  if (!ok) {
    return
  }

  await players.remove(player.id)
  roster.value = roster.value.filter(p => p.id !== player.id)
}

function startInvite(player: Player) {
  inviting.value = player
  inviteEmail.value = player.invited_email ?? ''
}

async function sendInvite() {
  const player = inviting.value
  const email = inviteEmail.value.trim()
  if (!player || !email) {
    return
  }

  inviteBusy.value = true
  try {
    const updated = await players.invite(player.id, email)
    roster.value = roster.value.map(p => (p.id === updated.id ? updated : p))
    inviting.value = null
    toast.add({
      title: updated.account
        ? `${updated.name} can sign in now`
        : `Invitation noted — ${email} claims the seat when they register`,
      icon: 'i-lucide-user-check',
      color: 'success'
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    inviteBusy.value = false
  }
}

function characterLine(player: Player) {
  return player.characters
    .map((character) => {
      const level = character.data.level ? `Lv ${character.data.level}` : null
      const klass = character.data.class as string | undefined
      const detail = [level, klass].filter(Boolean).join(' ')
      return detail ? `${character.name} (${detail})` : character.name
    })
    .join(' · ')
}

function accountBadge(player: Player) {
  if (player.account) {
    return { label: 'Has account', color: 'success' as const }
  }
  if (player.invited_email) {
    return { label: 'Invited', color: 'warning' as const }
  }
  return null
}

function rowMenu(player: Player) {
  return [[
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => (editing.value = player) },
    ...(player.account
      ? []
      : [{
          label: player.invited_email ? 'Change invitation' : 'Invite to the app',
          icon: 'i-lucide-mail',
          onSelect: () => startInvite(player)
        }]),
    { label: 'Remove', icon: 'i-lucide-user-minus', color: 'error' as const, onSelect: () => removePlayer(player) }
  ]]
}
</script>

<template>
  <ContentCard
    title="The table"
    icon="i-lucide-users"
    :description="props.isDm
      ? 'People, not accounts — an account is only needed if they want their sheet on their phone.'
      : 'Everyone playing this campaign.'"
    flush
  >
    <div
      v-if="loading"
      class="space-y-2 p-4 sm:p-5"
    >
      <USkeleton
        v-for="i in 3"
        :key="i"
        class="h-12 rounded-xl"
      />
    </div>

    <p
      v-else-if="!roster.length"
      class="p-4 text-sm text-muted sm:px-5"
    >
      {{ props.isDm ? 'Nobody yet — add the people who are coming.' : 'The DM hasn\'t added the roster yet.' }}
    </p>

    <ul v-else>
      <li
        v-for="player in roster"
        :key="player.id"
        class="flex items-center gap-3 border-b border-default p-4 last:border-0 sm:px-5"
      >
        <UAvatar
          :src="player.account?.avatar_url ?? undefined"
          :alt="player.name"
          :text="player.name.slice(0, 2).toUpperCase()"
          size="md"
        />

        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 truncate text-sm font-medium text-highlighted">
            {{ player.name }}
            <UBadge
              v-if="accountBadge(player)"
              :label="accountBadge(player)!.label"
              :color="accountBadge(player)!.color"
              variant="subtle"
              size="sm"
            />
          </p>
          <p class="truncate text-xs text-muted">
            <template v-if="player.characters.length">
              {{ characterLine(player) }}
            </template>
            <template v-else-if="player.contact">
              {{ player.contact }}
            </template>
            <template v-else>
              No character yet
            </template>
          </p>
        </div>

        <div class="hidden shrink-0 gap-1 sm:flex">
          <UBadge
            v-for="preference in player.preferences"
            :key="preference"
            :label="preference"
            color="neutral"
            variant="subtle"
            size="sm"
            class="capitalize"
          />
        </div>

        <UDropdownMenu
          v-if="props.isDm"
          :items="rowMenu(player)"
          :content="{ align: 'end' }"
        >
          <UButton
            icon="i-lucide-ellipsis-vertical"
            color="neutral"
            variant="ghost"
            size="sm"
            :aria-label="`Actions for ${player.name}`"
          />
        </UDropdownMenu>
      </li>
    </ul>

    <!-- Quick add: a name is enough to get someone on the roster -->
    <form
      v-if="props.isDm"
      class="flex flex-wrap items-end gap-2 border-t border-default p-4 sm:px-5"
      @submit.prevent="addPlayer"
    >
      <UFormField
        label="Add a player"
        class="min-w-48 flex-1"
      >
        <UInput
          v-model="newName"
          placeholder="Ana"
          class="w-full"
        />
      </UFormField>
      <UButton
        type="submit"
        label="Add"
        icon="i-lucide-user-plus"
        color="neutral"
        variant="outline"
        :loading="adding"
        :disabled="!newName.trim()"
      />
    </form>

    <PlayerFormModal
      v-if="editing"
      :key="editing.id"
      :player="editing"
      :open="true"
      @saved="onSaved"
      @close="editing = null"
    />

    <UModal
      :open="!!inviting"
      title="Invite to the app"
      :description="`${inviting?.name} gets their own login and can edit their sheet. Everything else stays with you.`"
      @update:open="value => { if (!value) inviting = null }"
    >
      <template #body>
        <UFormField
          label="Email"
          help="If they already have an account they're in right away; otherwise the seat waits for them to register."
        >
          <UInput
            v-model="inviteEmail"
            type="email"
            placeholder="ana@example.com"
            class="w-full"
            autofocus
            @keydown.enter="sendInvite"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            @click="inviting = null"
          />
          <UButton
            label="Send"
            icon="i-lucide-mail"
            :loading="inviteBusy"
            :disabled="!inviteEmail.trim()"
            @click="sendInvite"
          />
        </div>
      </template>
    </UModal>
  </ContentCard>
</template>
