# Deploying

The app is a Vercel static site; the API is a Render web service; the database
is Neon. `vercel.json` is JSON and can't carry comments, so the reasoning lives
here.

## Why the API is reached at a relative path

`NUXT_PUBLIC_API_BASE` is `/api/v1` — no host. Vercel rewrites `/api/*` to the
Render service, so the browser only ever sees one origin and the refresh cookie
is first-party.

The alternative — calling `https://…onrender.com` directly — makes the two
halves separate sites, because `vercel.app` and `onrender.com` are different
registrable domains. The cookie would then need `SameSite=None`, and Safari
discards those by default. The failure is nasty precisely because it isn't
total: signing in works, and then the session dies fifteen minutes later when
the access token expires and the refresh call silently has no cookie to send.
It would look fine on the laptop it was built on and broken on a player's
phone.

## What must skip the rewrite

`NUXT_PUBLIC_API_ORIGIN` is the API's real origin, used for two things:

- **Images.** They're files on the API's disk; a proxy hop buys nothing.
- **The cast stream.** A proxy may buffer a response, and a buffered event
  stream is a display that connects, says nothing, and never updates again.
  It can go direct because its token travels in the query string — that
  connection needs no cookie, only a CORS allowance.

That CORS allowance is why the API needs `CORS_ORIGINS` even though ordinary
requests are same-origin.

## Both settings are read at build time

There is no server left in a static build to read the environment at runtime.
Changing either one needs a redeploy, not a restart — and a build with the
defaults still in place produces a site that talks to `localhost:8001`, which
looks fine locally and is inert for everyone else.

## Environment

Vercel:

    NUXT_PUBLIC_API_BASE=/api/v1
    NUXT_PUBLIC_API_ORIGIN=https://dnd-master-app-backend.onrender.com

Render (see `render.yaml` in the API repo for the rest):

    FRONTEND_URL=https://dnd-master-app-mu.vercel.app
    CORS_ORIGINS=https://dnd-master-app-mu.vercel.app

## Moving to a real domain

Point the domain at Vercel, then update three values: `FRONTEND_URL` and
`CORS_ORIGINS` on Render, and the rewrite destination in `vercel.json` if the
API's hostname changes too. Nothing in the application code knows the domain.

Once the app and the API are subdomains of one registered domain — say
`dm.example.com` and `api.example.com` — they are same-site for cookies even
though they're still separate origins, so the rewrite becomes an optimisation
rather than a requirement.
