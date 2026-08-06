<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const { user, displayName, avatarUrl, initials, logout } = useAuth()

const items = computed<DropdownMenuItem[][]>(() => [
  [{
    label: displayName.value,
    description: user.value?.email,
    type: 'label' as const,
    avatar: { src: avatarUrl.value, alt: displayName.value, text: initials.value }
  }],
  [
    { label: 'Profile', icon: 'i-lucide-user', to: '/settings' },
    { label: 'Settings', icon: 'i-lucide-settings', to: '/settings' }
  ],
  [
    { label: 'Sign out', icon: 'i-lucide-log-out', color: 'error' as const, onSelect: () => logout() }
  ]
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :ui="{ content: 'w-56' }"
    :content="{ align: 'end', sideOffset: 8 }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      class="p-0.5 rounded-full hover:bg-elevated"
      aria-label="Open user menu"
    >
      <UAvatar
        :src="avatarUrl"
        :alt="displayName"
        :text="initials"
        size="md"
      />
    </UButton>
  </UDropdownMenu>
</template>
