export interface AiStatus {
  /** Claude, for drafting prose */
  text: boolean
  /** A separate provider — Anthropic has no image generation */
  images: boolean
}

/**
 * Drafting help, when it's switched on.
 *
 * Both halves need their own key, so the UI asks once per campaign what's
 * available and hides what isn't — a button that always errors is worse than no
 * button. Nothing here writes prose into an entity on its own: a draft comes
 * back to the form and the DM decides whether to keep it.
 */
export function useAi() {
  const api = useApi()
  const { currentId } = useCampaigns()

  function base() {
    if (!currentId.value) {
      throw new Error('No campaign selected')
    }
    return `/campaigns/${currentId.value}/ai`
  }

  const status = () => api.get<AiStatus>(base())

  const draft = (payload: {
    type: EntityType
    name: string
    brief?: string | null
    use_campaign_context?: boolean
  }) => api.post<{ text: string }>(`${base()}/draft`, payload)

  /** Draws what's already written and files it in the entity's gallery */
  const illustrate = (entityId: string, payload: { extra?: string | null, caption?: string | null } = {}) =>
    api.post<EntityImage>(`${base()}/entities/${entityId}/illustrate`, payload)

  return { status, draft, illustrate }
}
