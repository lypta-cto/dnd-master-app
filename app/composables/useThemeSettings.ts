export interface ThemeSettings {
  primary: string
  neutral: string
  font: string
  radius: number
}

export interface ColorOption {
  value: string
  label: string
  /** Shown in the settings swatch — matches the Tailwind 500 shade */
  swatch: string
}

export interface FontOption {
  value: string
  label: string
  /** CSS font stack applied at runtime */
  stack: string
  /** Class from main.css — used for the preview tile *and* to let @nuxt/fonts discover the family */
  class: string
}

/** Ordered by hue so the swatch grid reads as a spectrum */
export const PRIMARY_COLORS: ColorOption[] = [
  { value: 'brand', label: 'Brand', swatch: '#1b6bf2' },
  { value: 'red', label: 'Red', swatch: 'oklch(63.7% 0.237 25.331)' },
  { value: 'orange', label: 'Orange', swatch: 'oklch(70.5% 0.213 47.604)' },
  { value: 'amber', label: 'Amber', swatch: 'oklch(76.9% 0.188 70.08)' },
  { value: 'yellow', label: 'Yellow', swatch: 'oklch(79.5% 0.184 86.047)' },
  { value: 'lime', label: 'Lime', swatch: 'oklch(76.8% 0.233 130.85)' },
  { value: 'green', label: 'Green', swatch: 'oklch(72.3% 0.219 149.579)' },
  { value: 'emerald', label: 'Emerald', swatch: 'oklch(69.6% 0.17 162.48)' },
  { value: 'teal', label: 'Teal', swatch: 'oklch(70.4% 0.14 182.503)' },
  { value: 'cyan', label: 'Cyan', swatch: 'oklch(71.5% 0.143 215.221)' },
  { value: 'sky', label: 'Sky', swatch: 'oklch(68.5% 0.169 237.323)' },
  { value: 'blue', label: 'Blue', swatch: 'oklch(62.3% 0.214 259.815)' },
  { value: 'indigo', label: 'Indigo', swatch: 'oklch(58.5% 0.233 277.117)' },
  { value: 'violet', label: 'Violet', swatch: 'oklch(60.6% 0.25 292.717)' },
  { value: 'purple', label: 'Purple', swatch: 'oklch(62.7% 0.265 303.9)' },
  { value: 'fuchsia', label: 'Fuchsia', swatch: 'oklch(66.7% 0.295 322.15)' },
  { value: 'pink', label: 'Pink', swatch: 'oklch(65.6% 0.241 354.308)' },
  { value: 'rose', label: 'Rose', swatch: 'oklch(64.5% 0.246 16.439)' },
  // Greys work as a primary too — useful for a deliberately monochrome app
  { value: 'slate', label: 'Slate', swatch: 'oklch(55.4% 0.046 257.417)' },
  { value: 'gray', label: 'Gray', swatch: 'oklch(55.1% 0.027 264.364)' },
  { value: 'zinc', label: 'Zinc', swatch: 'oklch(55.2% 0.016 285.938)' },
  { value: 'stone', label: 'Stone', swatch: 'oklch(55.3% 0.013 58.071)' },
  { value: 'ink', label: 'Ink', swatch: '#6c7689' }
]

export const NEUTRAL_COLORS: ColorOption[] = [
  { value: 'ink', label: 'Ink', swatch: '#6c7689' },
  { value: 'slate', label: 'Slate', swatch: 'oklch(55.4% 0.046 257.417)' },
  { value: 'gray', label: 'Gray', swatch: 'oklch(55.1% 0.027 264.364)' },
  { value: 'zinc', label: 'Zinc', swatch: 'oklch(55.2% 0.016 285.938)' },
  { value: 'neutral', label: 'Neutral', swatch: 'oklch(55.6% 0 none)' },
  { value: 'stone', label: 'Stone', swatch: 'oklch(55.3% 0.013 58.071)' }
]

export const FONTS: FontOption[] = [
  { value: 'inter', label: 'Inter', class: 'app-font-inter', stack: `'Inter', ui-sans-serif, system-ui, sans-serif` },
  { value: 'geist', label: 'Geist', class: 'app-font-geist', stack: `'Geist', ui-sans-serif, system-ui, sans-serif` },
  { value: 'dm-sans', label: 'DM Sans', class: 'app-font-dm-sans', stack: `'DM Sans', ui-sans-serif, system-ui, sans-serif` },
  { value: 'jakarta', label: 'Jakarta', class: 'app-font-jakarta', stack: `'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif` },
  { value: 'system', label: 'System', class: 'app-font-system', stack: `ui-sans-serif, system-ui, -apple-system, sans-serif` }
]

export const RADII = [
  { value: 0, label: '0' },
  { value: 0.25, label: 'XS' },
  { value: 0.375, label: 'S' },
  { value: 0.5, label: 'M' },
  { value: 0.75, label: 'L' },
  { value: 1, label: 'XL' }
]

export const DEFAULT_THEME: ThemeSettings = {
  primary: 'brand',
  neutral: 'ink',
  font: 'inter',
  radius: 0.5
}

/** A stale or hand-edited cookie shouldn't be able to break rendering */
function sanitize(value?: Partial<ThemeSettings> | null): ThemeSettings {
  return {
    primary: PRIMARY_COLORS.some(c => c.value === value?.primary) ? value!.primary! : DEFAULT_THEME.primary,
    neutral: NEUTRAL_COLORS.some(c => c.value === value?.neutral) ? value!.neutral! : DEFAULT_THEME.neutral,
    font: FONTS.some(f => f.value === value?.font) ? value!.font! : DEFAULT_THEME.font,
    radius: RADII.some(r => r.value === value?.radius) ? value!.radius! : DEFAULT_THEME.radius
  }
}

/**
 * Reads/writes the user's appearance preferences. Stored in a cookie so the
 * server renders the right theme on first paint (no flash of default colours).
 */
export function useThemeSettings() {
  const cookie = useCookie<ThemeSettings>('app-theme', {
    default: () => ({ ...DEFAULT_THEME }),
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365
  })

  // useState (not the cookie ref) is the shared reactive source — every caller
  // gets the same object, so a change in Settings reaches the layout instantly.
  // The cookie is only persistence plus what SSR reads on first paint.
  const theme = useState<ThemeSettings>('app-theme', () => sanitize(cookie.value))

  function write(next: ThemeSettings) {
    theme.value = next
    cookie.value = next
  }

  function set<K extends keyof ThemeSettings>(key: K, value: ThemeSettings[K]) {
    write({ ...theme.value, [key]: value })
  }

  function reset() {
    write({ ...DEFAULT_THEME })
  }

  const isDefault = computed(() =>
    (Object.keys(DEFAULT_THEME) as (keyof ThemeSettings)[]).every(key => theme.value[key] === DEFAULT_THEME[key])
  )

  return { theme, set, reset, isDefault }
}

/**
 * Applies the preferences to the document. Call exactly once, from app.vue.
 */
export function useApplyTheme() {
  const { theme } = useThemeSettings()
  const appConfig = useAppConfig()

  // Nuxt UI regenerates its colour variables whenever these change
  watchEffect(() => {
    appConfig.ui.colors.primary = theme.value.primary
    appConfig.ui.colors.neutral = theme.value.neutral
  })

  const css = computed(() => {
    const stack = FONTS.find(f => f.value === theme.value.font)?.stack ?? FONTS[0]!.stack

    // Doubled :root beats the default in main.css without needing !important
    return `:root:root { --ui-radius: ${theme.value.radius}rem; --font-sans: ${stack}; font-family: var(--font-sans); }`
  })

  useHead({
    style: [{ id: 'app-theme', innerHTML: css, tagPriority: 'critical' }]
  })
}
