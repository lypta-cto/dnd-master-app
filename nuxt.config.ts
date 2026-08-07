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

  // Override at runtime with NUXT_PUBLIC_API_BASE
  runtimeConfig: {
    public: {
      apiBase: 'http://localhost:8001/api/v1'
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
