<script setup lang="ts">
// Applies the colour / font / radius preferences from Settings → Appearance
useApplyTheme()

// Falls back to app.config.ts until the workspace loads
const { name: appName } = useWorkspace()

// The session is restored from the API's httpOnly cookie on the client, so
// hold the shell back until we know who (if anyone) is signed in — otherwise
// the dashboard flashes before the middleware can redirect to /login.
// The display route is exempt: it's a TV with a token, auth never resolves
// there and the splash would sit forever.
const { ready } = useAuth()
const route = useRoute()
const showApp = computed(
  () => import.meta.server || ready.value || route.path.startsWith('/display/')
)

useHead({
  titleTemplate: title => (title ? `${title} · ${appName.value}` : appName.value),
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})
</script>

<template>
  <UApp>
    <NuxtLayout v-if="showApp">
      <NuxtPage />
    </NuxtLayout>

    <div
      v-else
      class="app-canvas flex min-h-svh items-center justify-center"
    >
      <AppLogoMark class="size-10 animate-pulse text-primary" />
    </div>
  </UApp>
</template>
