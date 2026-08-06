<script setup lang="ts">
const { items, unreadCount, hasUnread, markRead, markAllRead } = useNotifications()
</script>

<template>
  <UPopover :content="{ align: 'end', sideOffset: 8 }">
    <UButton
      class="app-icon-btn relative"
      color="neutral"
      variant="ghost"
      icon="i-lucide-bell"
      :aria-label="hasUnread ? `Notifications, ${unreadCount} unread` : 'Notifications'"
    >
      <UChip
        v-if="hasUnread"
        color="error"
        size="sm"
        inset
        standalone
        class="absolute top-1.5 right-1.5"
      />
    </UButton>

    <template #content>
      <div class="w-80 max-w-[calc(100vw-2rem)]">
        <div class="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-default">
          <p class="text-sm font-medium text-highlighted">
            Notifications
            <UBadge
              v-if="hasUnread"
              :label="String(unreadCount)"
              color="primary"
              variant="subtle"
              size="sm"
              class="ml-1"
            />
          </p>

          <UButton
            v-if="hasUnread"
            label="Mark all read"
            color="neutral"
            variant="ghost"
            size="xs"
            @click="markAllRead"
          />
        </div>

        <div class="max-h-96 overflow-y-auto">
          <p
            v-if="!items.length"
            class="px-3 py-8 text-sm text-center text-muted"
          >
            You're all caught up.
          </p>

          <component
            :is="item.to ? resolveComponent('NuxtLink') : 'div'"
            v-for="item in items"
            :key="item.id"
            :to="item.to"
            class="flex w-full items-start gap-3 px-3 py-3 text-left border-b border-default last:border-0 hover:bg-elevated/60 cursor-pointer"
            @click="markRead(item.id)"
          >
            <span
              class="flex items-center justify-center size-8 shrink-0 rounded-lg"
              :class="item.read ? 'bg-elevated text-dimmed' : 'bg-primary/10 text-primary'"
            >
              <UIcon
                :name="item.icon ?? 'i-lucide-bell'"
                class="size-4"
              />
            </span>

            <div class="min-w-0 flex-1">
              <p
                class="text-sm truncate"
                :class="item.read ? 'text-toned' : 'font-medium text-highlighted'"
              >
                {{ item.title }}
              </p>
              <p
                v-if="item.description"
                class="mt-0.5 text-sm text-muted line-clamp-2"
              >
                {{ item.description }}
              </p>
              <p class="mt-1 text-xs text-dimmed">
                {{ formatNotificationTime(item.createdAt) }}
              </p>
            </div>

            <span
              v-if="!item.read"
              class="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
            />
          </component>
        </div>
      </div>
    </template>
  </UPopover>
</template>
