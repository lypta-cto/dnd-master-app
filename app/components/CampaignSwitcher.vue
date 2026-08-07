<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const { campaigns, current, select } = useCampaigns()

const creating = ref(false)

const items = computed<DropdownMenuItem[][]>(() => [
  campaigns.value.map(campaign => ({
    label: campaign.name,
    icon: campaign.id === current.value?.id ? 'i-lucide-check' : 'i-lucide-swords',
    onSelect: () => select(campaign.id)
  })),
  [{ label: 'New campaign', icon: 'i-lucide-plus', onSelect: () => (creating.value = true) }]
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :ui="{ content: 'w-64' }"
    :content="{ align: 'start' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      class="w-full justify-between"
      :class="collapsed && 'justify-center'"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
    >
      <span class="flex min-w-0 items-center gap-2">
        <UIcon
          name="i-lucide-swords"
          class="size-4 shrink-0 text-primary"
        />
        <span
          v-if="!collapsed"
          class="truncate text-sm font-medium text-highlighted"
        >
          {{ current?.name ?? 'No campaign' }}
        </span>
      </span>
    </UButton>
  </UDropdownMenu>

  <CampaignWizard v-model:open="creating" />
</template>
