// Tipovi za tvoj Router
export type RouterContext<Env = any> = {
  req: Request
  env: Env
  ctx: ExecutionContext
  result?: any
  validJson?: any
}

export type Handler<Env = any> = (c: RouterContext<Env>) => Response | Promise<Response>

type Route = {
  path: string
  method: string
  handler: Handler
}

export type RouterType<Env = any> = {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>
  on: (method: string, path: string, handler: Handler<Env>) => RouterType<Env>
  [key: string]: any 
}

/**
 * Super-simple Router without URLPattern complexity.
 * Supports exact match or simple param like :id at the end.
 */
export const Router = <Env = any>(): RouterType<Env> => {
  const routes: Route[] = []

  const core = {
    fetch: async (req: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
      const url = new URL(req.url)
      const method = req.method.toUpperCase()
      const pathname = url.pathname.replace(/\/$/, '') || '/'

      for (const route of routes) {
        if (route.method !== 'ALL' && route.method !== method) continue

        // Exact match (ignoring trailing slash)
        const routePath = route.path.replace(/\/$/, '') || '/'
        
        if (routePath === pathname) {
          return await route.handler({ req, env, ctx })
        }

        // Simple ID match: /api/fakture/:id
        if (route.path.includes('/:')) {
          const parts = route.path.split('/')
          const pathParts = pathname.split('/')
          if (parts && pathParts && parts.length === pathParts.length) {
            let match = true
            const result = { pathname: { groups: {} as any } }
            for (let i = 0; i < parts.length; i++) {
              if (parts[i].startsWith(':')) {
                const paramName = parts[i].substring(1)
                result.pathname.groups[paramName] = pathParts[i]
              } else if (parts[i] !== pathParts[i]) {
                match = false
                break
              }
            }
            if (match) return await route.handler({ req, env, ctx, result })
          }
        }
      }

      console.warn(`[Router 404] No match for ${method} ${url.pathname}`);
      return new Response('Not Found', { status: 404 })
    },

    on: (method: string, path: string, handler: Handler<Env>) => {
      routes.push({ path, method: method.toUpperCase(), handler })
      return receiverProxy
    },
  }

  const receiverProxy = new Proxy(core as unknown as RouterType<Env>, {
    get: (target, prop: string) => {
      if (prop === 'fetch' || prop === 'on') return (target as any)[prop].bind(target)
      return (path: string, handler: Handler<Env>) => target.on(prop, path, handler)
    },
  })

  return receiverProxy
}
