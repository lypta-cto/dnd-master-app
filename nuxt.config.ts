// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  // Everything meaningful sits behind auth that only the client can resolve
  // (the API's httpOnly cookie never reaches the Nuxt server). SSR could only
  // ever render the signed-out shell — and hydrating the real UI over that
  // shell is precisely the class of DOM-mangling mismatch we hit on pages
  // branching on the current campaign. A dashboard needs no SEO; render where
  // the truth lives.

  modules: [
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/ui'
  ],
  ssr: false,

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'system',
    fallback: 'light'
  },

  // Set at build time with NUXT_PUBLIC_API_BASE / NUXT_PUBLIC_API_ORIGIN — this
  // is a static build, so there is no server left to read them at runtime.
  runtimeConfig: {
    public: {
      /**
       * Where ordinary requests go. In production this is the relative
       * `/api/v1`: the host rewrites it to the API service, which makes the
       * whole app one origin and the refresh cookie first-party. Two real
       * origins would need SameSite=None, which Safari discards by default —
       * an iPhone at the table would drop its session every quarter hour.
       */
      apiBase: 'http://localhost:8001/api/v1',
      /**
       * The API's own origin, for the two things that must not go through the
       * rewrite: uploaded images, and the cast stream — a proxy is free to
       * buffer a response, and a buffered event stream is a display that never
       * updates. Empty means "same origin as this page".
       */
      apiOrigin: 'http://localhost:8001'
    }
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // Families offered in Settings → Appearance (see app/assets/css/main.css)
  fonts: {
    defaults: {
      weights: [400, 500, 600, 700]
    },
    families: [
      { name: 'Inter', provider: 'google' },
      { name: 'Geist', provider: 'google' },
      { name: 'DM Sans', provider: 'google' },
      { name: 'Plus Jakarta Sans', provider: 'google' }
    ]
  }
})
