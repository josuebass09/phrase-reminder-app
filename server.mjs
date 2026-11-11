// Serves the built app on Railway, with security headers and caching that suit it.
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

// The browser may only send requests to this app and the backend.
function backendOrigin() {
  try {
    return [new URL(process.env.VITE_API_URL ?? '').origin]
  } catch {
    console.warn('VITE_API_URL is not set, so the app cannot reach the backend')
    return []
  }
}

const app = new Hono()

app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", ...backendOrigin()],
      baseUri: ["'none'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
    },
  }),
)

// Vite puts a content hash in every file under /assets, so those can be cached for good.
// Everything else, including index.html and the service worker, must be checked on
// each load, or devices keep running an old version after a deploy.
app.use(async (c, next) => {
  await next()
  const immutable = c.req.path.startsWith('/assets/') && c.res.status === 200
  c.header('Cache-Control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache')
})

// The commit this deploy serves, from Railway at run time, for the admin's Versions.
// It isn't available while the app builds, so it can't go into the bundle.
const version = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || null
app.get('/version.json', (c) => c.json({ version }))

app.use(serveStatic({ root: './dist' }))

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, ({ port }) => {
  console.log(`Listening on port ${port}`)
})
