export default defineAppConfig({
  // Fallbacks used until the workspace loads from the API. The live values are
  // editable in Settings → Workspace.
  app: {
    name: 'DM Master',
    tagline: 'Run the table, not the paperwork.'
  },

  ui: {
    colors: {
      primary: 'brand',
      neutral: 'ink'
    }
  }
})
