<script setup lang="ts">
// Reading the workspace is public, so the login screen shows the real branding
const { name: appName, tagline, load } = useWorkspace()
await load()
</script>

<template>
  <!-- Locked to the viewport: the auth screen should never scroll the page -->
  <div class="app-canvas h-svh overflow-hidden lg:grid lg:grid-cols-2">
    <!-- Form column — scrolls internally only if the viewport is very short -->
    <div class="flex h-full flex-col overflow-y-auto">
      <header class="flex shrink-0 items-center justify-between gap-3 p-6">
        <AppLogo />
        <ThemeToggle />
      </header>

      <main class="flex flex-1 items-center justify-center px-6 py-8">
        <div class="app-page-in w-full max-w-sm">
          <slot />
        </div>
      </main>
    </div>

    <!-- Brand column — decorative, so it's dropped entirely on small screens -->
    <aside class="relative hidden h-full overflow-hidden lg:flex lg:flex-col p-12 text-white">
      <!-- Slow Ken Burns pan; the wrapper is oversized so no edge ever shows -->
      <img
        src="/auth-bg.jpg"
        alt=""
        aria-hidden="true"
        class="app-kenburns absolute inset-0 size-full object-cover"
      >

      <!--
        Scrim: mostly a bottom-weighted fade so the copy stays legible while the
        top of the photo keeps its colour. A light brand tint ties it to the UI.
      -->
      <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      <div class="absolute inset-0 bg-primary-950/15" />

      <AppLogoMark class="relative size-10 shrink-0 drop-shadow-lg" />

      <div class="relative mt-auto">
        <p class="text-3xl font-semibold leading-tight text-balance drop-shadow-md">
          {{ tagline }}
        </p>
        <p class="mt-4 max-w-md text-white/80 drop-shadow">
          Metrics, users, projects and billing in one place — with the same
          keyboard shortcuts and the same dark mode everywhere.
        </p>
      </div>

      <p class="relative mt-10 shrink-0 text-sm text-white/60">
        © {{ new Date().getFullYear() }} {{ appName }}
      </p>
    </aside>
  </div>
</template>
