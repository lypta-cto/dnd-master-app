export type Role = 'viewer' | 'member' | 'admin' | 'owner'

/** Mirrors the backend's UserRead schema */
export interface AuthUser {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: Role
  is_active: boolean
  is_verified: boolean
  has_password: boolean
  created_at: string
}

interface AuthResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: AuthUser
}

const ROLE_RANK: Record<Role, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3
}

/**
 * Low-level session state.
 *
 * Split out from `useAuth` so `useApi` can read the token and trigger a refresh
 * without the two composables importing each other. Refresh uses a raw $fetch
 * for the same reason.
 */
export function useAuthState() {
  const { apiBase } = useRuntimeConfig().public

  // In memory only — never localStorage, which any XSS on the page can read.
  // The long-lived credential is the backend's httpOnly cookie.
  const accessToken = useState<string | null>('auth-token', () => null)
  const user = useState<AuthUser | null>('auth-user', () => null)

  /** False until the first refresh attempt has settled */
  const ready = useState<boolean>('auth-ready', () => false)

  // Parallel 401s should share one refresh, not fire several
  const inFlight = useState<Promise<boolean> | null>('auth-refreshing', () => null)

  function setSession(response: AuthResponse) {
    accessToken.value = response.access_token
    user.value = response.user
  }

  function clearSession() {
    accessToken.value = null
    user.value = null
  }

  async function refresh(): Promise<boolean> {
    if (inFlight.value) {
      return inFlight.value
    }

    const attempt = (async () => {
      try {
        const response = await $fetch<AuthResponse>('/auth/refresh', {
          baseURL: apiBase,
          method: 'POST',
          credentials: 'include'
        })
        setSession(response)
        return true
      } catch {
        clearSession()
        return false
      } finally {
        ready.value = true
        inFlight.value = null
      }
    })()

    inFlight.value = attempt
    return attempt
  }

  return { accessToken, user, ready, setSession, clearSession, refresh }
}

export function useAuth() {
  const api = useApi()
  const mediaUrl = useMediaUrl()
  const { accessToken, user, ready, setSession, clearSession, refresh } = useAuthState()

  const isAuthenticated = computed(() => !!user.value && !!accessToken.value)

  const displayName = computed(() => user.value?.full_name || user.value?.email || '')

  /** Ready to drop straight into an <img src> */
  const avatarUrl = computed(() => mediaUrl(user.value?.avatar_url))

  const initials = computed(() =>
    displayName.value
      .split(/[\s@.]+/)
      .filter(Boolean)
      .map(part => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  )

  /** True when the signed-in user's role is at least `minimum` */
  function can(minimum: Role) {
    if (!user.value) {
      return false
    }
    return ROLE_RANK[user.value.role] >= ROLE_RANK[minimum]
  }

  /** Called once on the client to turn the refresh cookie back into a session */
  async function restore() {
    if (ready.value) {
      return isAuthenticated.value
    }
    await refresh()
    return isAuthenticated.value
  }

  async function login(credentials: { email: string, password: string }) {
    const response = await api.post<AuthResponse>('/auth/login', credentials)
    setSession(response)
    ready.value = true
    return response.user
  }

  async function register(payload: { email: string, password: string, full_name?: string }) {
    const response = await api.post<AuthResponse>('/auth/register', payload)
    setSession(response)
    ready.value = true
    return response.user
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } finally {
      // Clear locally even if the call failed — the user asked to be signed out
      clearSession()
      await navigateTo('/login')
    }
  }

  async function fetchMe() {
    const me = await api.get<AuthUser>('/auth/me')
    user.value = me
    return me
  }

  return {
    user,
    displayName,
    avatarUrl,
    initials,
    isAuthenticated,
    ready,
    can,
    restore,
    login,
    register,
    logout,
    fetchMe
  }
}
