type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface ApiOptions {
  method?: HttpMethod
  /** Objects are sent as JSON; FormData passes through so uploads keep their boundary */
  body?: Record<string, unknown> | FormData | undefined
  query?: Record<string, unknown>
  headers?: Record<string, string>
}

/**
 * Thin wrapper around $fetch for the backend API.
 *
 * - Sends the in-memory access token as a Bearer header
 * - `credentials: 'include'` so the httpOnly refresh cookie travels
 * - On a 401 it refreshes once, then replays the request
 *
 * The retry is deliberately once-only: if refreshing also fails the session is
 * genuinely gone, and looping would hammer the API.
 */
export function useApi() {
  const { apiBase } = useRuntimeConfig().public
  const { accessToken, refresh, clearSession } = useAuthState()

  async function request<T>(path: string, options: ApiOptions = {}): Promise<T> {
    const send = () =>
      $fetch<T>(path, {
        baseURL: apiBase,
        credentials: 'include',
        method: options.method,
        body: options.body,
        query: options.query,
        headers: {
          ...options.headers,
          ...(accessToken.value ? { Authorization: `Bearer ${accessToken.value}` } : {})
        }
      })

    try {
      return await send()
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status

      // Never refresh in response to a failing refresh — that's how you loop
      if (status !== 401 || path.includes('/auth/refresh')) {
        throw error
      }

      if (!(await refresh())) {
        clearSession()
        throw error
      }

      return await send()
    }
  }

  return {
    request,
    get: <T>(path: string, options?: ApiOptions) => request<T>(path, { ...options, method: 'GET' }),
    post: <T>(path: string, body?: ApiOptions['body'], options?: ApiOptions) =>
      request<T>(path, { ...options, method: 'POST', body }),
    patch: <T>(path: string, body?: ApiOptions['body'], options?: ApiOptions) =>
      request<T>(path, { ...options, method: 'PATCH', body }),
    del: <T>(path: string, options?: ApiOptions) => request<T>(path, { ...options, method: 'DELETE' })
  }
}
