/**
 * Resolves a media path returned by the API.
 *
 * Uploads are stored as root-relative paths (`/uploads/avatars/x.webp`) so the
 * database survives a change of host. That means the browser would otherwise
 * resolve them against the *frontend* origin, so they get the API's origin here.
 * Absolute URLs — an OAuth provider's avatar, a CDN — are passed through.
 */
export function useMediaUrl() {
  const config = useRuntimeConfig().public

  const apiOrigin = computed(() => {
    if (config.apiOrigin) {
      return config.apiOrigin.replace(/\/$/, '')
    }
    // `apiBase` is relative in a proxied deployment, so there's no origin to
    // take from it — and none is needed: same origin resolves on its own.
    try {
      return new URL(config.apiBase).origin
    } catch {
      return ''
    }
  })

  return function mediaUrl(path?: string | null): string | undefined {
    if (!path) {
      return undefined
    }
    if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) {
      return path
    }
    return `${apiOrigin.value}${path.startsWith('/') ? '' : '/'}${path}`
  }
}
