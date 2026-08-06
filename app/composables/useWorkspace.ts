export interface Workspace {
  name: string
  tagline: string | null
}

/**
 * Installation-wide settings — the app name in the sidebar, the tagline on the
 * login screen. Lives on the backend rather than in a cookie because it's the
 * same for everyone, not a per-browser preference.
 *
 * `app.config.ts` still holds the fallback, so the shell renders sensibly
 * before the session (and therefore this) has loaded.
 */
export function useWorkspace() {
  const api = useApi()
  const { app } = useAppConfig()

  const workspace = useState<Workspace | null>('workspace', () => null)
  const loaded = useState<boolean>('workspace-loaded', () => false)

  const name = computed(() => workspace.value?.name || app.name)
  const tagline = computed(() => workspace.value?.tagline || app.tagline)

  /** Reading is public, so this works on the login screen too */
  async function load(force = false) {
    if (loaded.value && !force) {
      return workspace.value
    }

    try {
      workspace.value = await api.get<Workspace>('/workspace')
      loaded.value = true
    } catch {
      // A missing workspace shouldn't break the shell — the fallback covers it
    }

    return workspace.value
  }

  /** Admin only; the API rejects anyone else with a 403 */
  async function update(payload: Partial<Workspace>) {
    workspace.value = await api.patch<Workspace>('/workspace', payload)
    loaded.value = true
    return workspace.value
  }

  return { workspace, name, tagline, loaded, load, update }
}
