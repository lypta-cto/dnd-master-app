// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/ui'
  ],

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
      apiBase: 'http://localhost:8000/api/v1'
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
