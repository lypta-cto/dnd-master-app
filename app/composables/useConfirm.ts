export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  icon?: string
  /** Use 'error' for destructive actions */
  color?: 'primary' | 'error' | 'warning'
}

interface ConfirmState extends ConfirmOptions {
  open: boolean
}

const CLOSED: ConfirmState = { open: false, title: '' }

/**
 * Only ever assigned from a click handler, so it never exists during SSR.
 * Kept outside the composable so `confirm()` and <ConfirmDialog> share it.
 */
let resolver: ((value: boolean) => void) | null = null

/**
 * Promise-based confirmation dialog. <ConfirmDialog> is mounted once in the
 * default layout, so any component can just await this:
 *
 *   const { confirm } = useConfirm()
 *   if (await confirm({ title: 'Delete campaign?', color: 'error' })) { … }
 */
export function useConfirm() {
  const state = useState<ConfirmState>('confirm-dialog', () => ({ ...CLOSED }))

  function confirm(options: ConfirmOptions) {
    // A second call while one is open resolves the first as cancelled
    resolver?.(false)

    state.value = { ...options, open: true }

    return new Promise<boolean>((resolve) => {
      resolver = resolve
    })
  }

  function respond(value: boolean) {
    state.value = { ...state.value, open: false }
    resolver?.(value)
    resolver = null
  }

  return { state, confirm, respond }
}
