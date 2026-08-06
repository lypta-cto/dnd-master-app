export default defineAppConfig({
  // Per-app branding — the mark itself lives in components/AppLogoMark.vue
  app: {
    name: 'Lypta Admin',
    tagline: 'One dashboard for every part of the business.'
  },

  ui: {
    colors: {
      primary: 'brand',
      neutral: 'ink'
    }
  }
})
