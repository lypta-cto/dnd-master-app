/** Routes reachable without a session */
const PUBLIC_ROUTES = ['/login', '/register']

export default defineNuxtRouteMiddleware(async (to) => {
  // The refresh cookie belongs to the API's origin, so the Nuxt server can't
  // see it. Auth is resolved on the client; SSR just renders the empty shell.
  if (import.meta.server) {
    return
  }

  const { restore, isAuthenticated } = useAuth()

  // Turns the httpOnly cookie back into a session. Runs once — `restore`
  // short-circuits after the first attempt has settled.
  await restore()

  const isPublic = PUBLIC_ROUTES.includes(to.path)

  if (isPublic) {
    return isAuthenticated.value ? navigateTo('/') : undefined
  }

  if (!isAuthenticated.value) {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
