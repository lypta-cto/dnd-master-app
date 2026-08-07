# DM Master — frontend

Nuxt 4 dashboard for running D&D campaigns. Built on
[admin-dashboard-template-front](https://github.com/lypta-cto/admin-dashboard-template-front),
so the shell, theming and auth wiring come from there.

Stack: Nuxt 4, Nuxt UI v4, Tailwind CSS v4, TypeScript, ESLint.

> **Status:** MVP-1 working end to end — campaigns, the linked entity wiki with
> `[[wiki links]]`, backlinks, campaign-wide search in ⌘K, per-entity visibility, entity
> images, and the cast screen (DM controls + a public `/display/{id}?t=` page over SSE).
> See [docs/mvp.md](docs/mvp.md) for the plan and what's next.

## Running it

The backend has to be up first, on **port 8001**:

```bash
cd ../dnd-master-app-backend
docker compose up -d db
uvicorn app.main:app --port 8001
```

Then:

```bash
cp .env.example .env
npm install
npm run dev
```

Other scripts: `npm run build`, `npm run lint`, `npm run typecheck`.

## What's already here

- **Auth** — sign in, register, session restore, automatic token refresh, `can(role)`
- **App shell** — collapsible sidebar, top bar with ⌘K search, notifications, theme toggle
- **Live theming** — Settings → Appearance changes colour, font and radius app-wide
- **Rebrandable** — Settings → Workspace renames the app everywhere, no redeploy
- **Profile photos** — upload, validated and resized by the API
- **Building blocks** — `ContentCard`, `DataTable`, `FormSlideover`, `StatCard`,
  `EmptyState`, `useConfirm()`

## Branding

| What | Where |
| --- | --- |
| Logo mark | [`app/components/AppLogoMark.vue`](app/components/AppLogoMark.vue) — **placeholder d20**, swap the SVG paths |
| Colours | `--color-brand-*` (ember) and `--color-ink-*` (warm grey) in [`main.css`](app/assets/css/main.css) |
| Login artwork | `public/auth-bg.jpg` — **watermarked stock, replace before going public** |
| Name & tagline | [`app.config.ts`](app/app.config.ts) fallback; live values in Settings → Workspace |

## Adding a section

1. Create the page under `app/pages/`
2. Add it to [`useNavigation.ts`](app/composables/useNavigation.ts)

```vue
<template>
  <AppPage
    title="Campaigns"
    :breadcrumb="[{ icon: 'i-lucide-house', to: '/' }, { label: 'Campaigns' }]"
  >
    <ContentCard flush>
      <DataTable :data="campaigns" :columns="columns" />
    </ContentCard>
  </AppPage>
</template>
```

The template repo's `/components` page catalogues every block with live examples — worth
keeping open in a tab while building.
