# Admin Dashboard Template

Reusable Nuxt 4 + Nuxt UI v4 dashboard shell — the starting point for any app that needs
an authenticated dashboard behind it.

**The pages are deliberately empty.** This repo is a shell plus a set of building blocks,
not a product. Nothing here knows about users, revenue or projects; you bring the domain.
[`/components`](app/pages/components.vue) shows every block in one place.

Stack: Nuxt 4, Nuxt UI v4 (MIT — includes the dashboard components), Tailwind CSS v4,
TypeScript, ESLint, Inter via `@nuxt/fonts`.

## What's in the shell

- **Collapsible sidebar** — drag to resize, collapses to an icon-only rail with tooltips
  (chevron on the sidebar's right edge), turns into a slideover below `lg`. State persists
  in a cookie.
- **Top bar** — breadcrumb, search (`⌘K`), notifications, light/dark toggle, user menu.
- **Live theming** — Settings → Appearance changes the primary colour, neutral colour,
  font and corner radius for the whole app, instantly and persisted.
- **Rebrandable at runtime** — Settings → Workspace renames the app everywhere (sidebar,
  browser tab, login screen) without a redeploy. Admins only.
- **Profile photos** — upload from Settings; validated, resized and re-encoded by the API.
- **Light & dark** — follows the OS by default, user choice is persisted.
- **Login page** — `/login` on its own `auth` layout: split form / photo panel, locked to
  the viewport height, social providers, inline validation.
- **Auth** — wired to the [FastAPI backend](https://github.com/lypta-cto/admin-dashboard-template-back):
  sign in, register, session restore, automatic token refresh, `can(role)` for role gates.
- **Responsive** — mobile through wide desktop; the top bar stays fixed and page bodies
  scroll on their own.

## Building blocks

| Block | For |
| --- | --- |
| [`ContentCard`](app/components/ContentCard.vue) | Titled surface with header actions, footer and a loading state. `flush` when the child reaches the edge |
| [`DataTable`](app/components/DataTable.vue) | Search, sorting, pagination, loading and empty states over any row shape |
| [`StatCard`](app/components/StatCard.vue) | KPI tile with an optional delta badge |
| [`FormSlideover`](app/components/FormSlideover.vue) | Create/edit panel; fields in the default slot, footer buttons built in |
| [`EmptyState`](app/components/EmptyState.vue) | Placeholder for pages and panels with nothing in them |
| [`useConfirm()`](app/composables/useConfirm.ts) | `await confirm({ … })` before destructive actions |
| [`useNotifications()`](app/composables/useNotifications.ts) | Feed behind the bell in the top bar |
| [`useCommandPalette()`](app/composables/useCommandPalette.ts) | `register()` your own ⌘K groups alongside Navigation |

## Auth

Talks to the FastAPI backend. Start it first, then set the URL:

```bash
cp .env.example .env    # NUXT_PUBLIC_API_BASE=http://localhost:8000/api/v1
```

**How the session works.** The access token is held **in memory only** — never
localStorage, which any XSS on the page can read. The long-lived credential is an
httpOnly cookie owned by the API, which JavaScript cannot touch. On a full page load
[`useAuth().restore()`](app/composables/useAuth.ts) trades that cookie for a fresh access
token, and [`useApi()`](app/composables/useApi.ts) retries once through `/auth/refresh`
whenever a call comes back 401.

Because the cookie belongs to the API's origin, the Nuxt server can't read it — auth
resolves on the client. [`middleware/auth.global.ts`](app/middleware/auth.global.ts)
therefore returns early during SSR, and `app.vue` holds the shell back behind a splash
until the first refresh settles, so the dashboard never flashes before a redirect.

| | |
| --- | --- |
| `/login` | email + password |
| `/register` | self-service sign-up, signs you straight in |
| `can('admin')` | ranked `viewer < member < admin < owner`, so owners pass admin checks |

Google sign-in exists on the backend but is off until you add OAuth credentials.

## Theming

Settings → Appearance is a live theme playground. Preferences are stored in the
`app-theme` cookie, so the server renders the chosen theme on first paint — no flash.

`useThemeSettings()` is the read/write API and `useApplyTheme()` (called once in
`app.vue`) applies it: colours by mutating `appConfig.ui.colors`, font and radius through
an injected `:root` style block. To offer a new colour or font, add an entry to
`PRIMARY_COLORS` / `NEUTRAL_COLORS` / `FONTS` in
[`useThemeSettings.ts`](app/composables/useThemeSettings.ts) — and for a font, also add a
matching `.app-font-*` class in `main.css` (that class is both the preview tile's style
and how `@nuxt/fonts` discovers the family) plus the family in `nuxt.config.ts`.

## Setup

```bash
npm install
```

Dev server:

```bash
npm run dev
```

Other scripts: `npm run build`, `npm run preview`, `npm run lint`, `npm run typecheck`.

## Reusing this for a new app

Four files cover most of the work:

| File | What to change |
| --- | --- |
| [`app/app.config.ts`](app/app.config.ts) | App name, tagline, default colour aliases |
| [`app/components/AppLogoMark.vue`](app/components/AppLogoMark.vue) | The logo itself — swap the SVG paths |
| [`app/assets/css/main.css`](app/assets/css/main.css) | `--color-brand-*` / `--color-ink-*` scales, canvas colour, font classes |
| [`app/composables/useNavigation.ts`](app/composables/useNavigation.ts) | Sidebar items (main + footer groups) |
| [`app/composables/useThemeSettings.ts`](app/composables/useThemeSettings.ts) | `DEFAULT_THEME` plus the colour/font/radius options on offer |
| [`app/pages/`](app/pages) | Your actual screens |

## Structure

```
app/
  app.config.ts             branding + Nuxt UI colour aliases
  app.vue                   root shell
  error.vue                 error page
  assets/css/main.css       design tokens, .app-* utilities, font classes, animations
  layouts/
    default.vue             UDashboardGroup + sidebar + ⌘K search
    auth.vue                split login layout: form + brand panel
  components/
    AppLogoMark.vue         the brand mark (SVG) — replace this to rebrand
    AppLogo.vue             mark + wordmark, collapsed-aware
    AppSidebar.vue          sidebar: logo, collapse chevron, nav, sign out
    AppPage.vue             page wrapper: panel + top bar + title row
    ThemeToggle.vue         light/dark switch
    UserMenu.vue            avatar dropdown
    NotificationsMenu.vue   bell + feed popover
    ContentCard.vue         titled surface (see Building blocks)
    DataTable.vue           search / sort / paginate wrapper
    FormSlideover.vue       create-edit panel
    ConfirmDialog.vue       mounted once by the default layout
    StatCard.vue            KPI tile
    SettingsRow.vue         label/description + control row
    EmptyState.vue          placeholder for unbuilt pages
  composables/
    useApi.ts               fetch wrapper: bearer token, cookies, 401 retry
    useAuth.ts              session, roles, login/register/logout
    useWorkspace.ts         app name and tagline from the API
    useMediaUrl.ts          resolves upload paths against the API origin
    useNavigation.ts        sidebar items
    useNotifications.ts     bell feed
    useCommandPalette.ts    ⌘K group registry
    useConfirm.ts           promise-based confirmation
    useThemeSettings.ts     appearance preferences + the options on offer
  middleware/
    auth.global.ts          route guard
  pages/                    empty shells + /components catalogue
public/avatar.jpg           profile photo used by useCurrentUser
public/auth-bg.webp         login background photo (slow Ken Burns pan)
```

Motion is CSS-only: `.app-page-in` in `main.css` fades and staggers page content on
mount, the sidebar animates its width, and everything is disabled under
`prefers-reduced-motion`.

### Adding a page

```vue
<template>
  <AppPage
    title="Reports"
    description="Everything your team exported this month."
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: 'Reports' }
    ]"
  >
    <template #actions>
      <UButton icon="i-lucide-plus" label="New report" />
    </template>

    <div class="app-card p-5">…</div>
  </AppPage>
</template>
```

Then add the route to `useNavigation.ts`.

## Notes

- Data on the dashboard page is hardcoded — it's there to show the layout. The chart is a
  placeholder div; drop in a chart library when the backend exists.
- `useCurrentUser()` returns a mocked user. Replace its body with a real fetch and the
  sidebar footer, user menu and avatar all follow.
- Icons are [Lucide](https://lucide.dev) (`i-lucide-*`), bundled locally via
  `@iconify-json/lucide`.
- Design reference screenshots live in [`design/`](design).
