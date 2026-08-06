export interface AppNotification {
  id: string
  title: string
  description?: string
  icon?: string
  /** ISO string — formatted deterministically so SSR and client agree */
  createdAt: string
  read: boolean
  to?: string
}

/**
 * Notification feed for the bell in the top bar.
 *
 * Seeded with placeholders. Swap the `useState` initialiser for a fetch (or
 * push them in over a websocket) — the menu reads nothing else.
 */
export function useNotifications() {
  const items = useState<AppNotification[]>('notifications', () => [
    {
      id: 'n1',
      title: 'Welcome to the workspace',
      description: 'Take a look around — everything here is a placeholder.',
      icon: 'i-lucide-sparkles',
      createdAt: '2026-08-06T09:12:00',
      read: false
    },
    {
      id: 'n2',
      title: 'Export finished',
      description: 'Your export is ready to download.',
      icon: 'i-lucide-download',
      createdAt: '2026-08-05T17:40:00',
      read: false
    },
    {
      id: 'n3',
      title: 'Settings updated',
      description: 'Appearance preferences were changed.',
      icon: 'i-lucide-settings',
      createdAt: '2026-08-04T11:05:00',
      read: true
    }
  ])

  const unreadCount = computed(() => items.value.filter(item => !item.read).length)
  const hasUnread = computed(() => unreadCount.value > 0)

  function markRead(id: string) {
    const target = items.value.find(item => item.id === id)
    if (target) {
      target.read = true
    }
  }

  function markAllRead() {
    items.value = items.value.map(item => ({ ...item, read: true }))
  }

  function dismiss(id: string) {
    items.value = items.value.filter(item => item.id !== id)
  }

  return { items, unreadCount, hasUnread, markRead, markAllRead, dismiss }
}

/** Absolute, locale-fixed so the server and client render the same string */
export function formatNotificationTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}
