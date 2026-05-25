// Tipovi za tvoj Router
export type RouterContext<Env = any> = {
  req: Request
  env: Env
  ctx: ExecutionContext
  result?: any
  validJson?: any
  [key: string]: any
}

export type Handler<Env = any> = (c: RouterContext<Env>) => Response | Promise<Response | void> | void

type Route = {
  path: string
  method: string
  handlers: Handler[]
}

export type RouterType<Env = any> = {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>
  request: (path: string, options: any, env: Env, ctx?: ExecutionContext) => Promise<Response>
  on: (method: string, path: string, ...handlers: Handler<Env>[]) => RouterType<Env>
  [key: string]: any 
}

/**
 * Super-simple Router with Middleware support.
 * Chaines multiple handlers for the same route.
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
        
        let match = false;
        let result: any = undefined;

        if (routePath === pathname) {
          match = true;
        } else if (route.path.includes('/:')) {
          const parts = route.path.split('/')
          const pathParts = pathname.split('/')
          if (parts && pathParts && parts.length === pathParts.length) {
            let subMatch = true
            result = { pathname: { groups: {} as any } }
            for (let i = 0; i < parts.length; i++) {
              const part = parts[i];
              if (part && part.startsWith(':')) {
                const paramName = part.substring(1)
                result.pathname.groups[paramName] = pathParts[i]
              } else if (part !== pathParts[i]) {
                subMatch = false
                break
              }
            }
            if (subMatch) match = true;
          }
        }

        if (match) {
          const context: RouterContext<Env> = { req, env, ctx, result };
          for (const handler of route.handlers) {
            const response = await handler(context);
            if (response instanceof Response) return response;
          }
          return new Response('No response from handlers', { status: 500 });
        }
      }

      console.warn(`[Router 404] No match for ${method} ${url.pathname}`);
      return new Response('Not Found', { status: 404 })
    },

    request: async (path: string, options: any, env: Env, ctx?: ExecutionContext): Promise<Response> => {
      const url = `http://localhost${path}`
      const req = new Request(url, options)
      return core.fetch(req, env, ctx || ({ waitUntil: () => {} } as any))
    },

    on: (method: string, path: string, ...handlers: Handler<Env>[]) => {
      routes.push({ path, method: method.toUpperCase(), handlers })
      return receiverProxy
    },
  }

  const receiverProxy = new Proxy(core as unknown as RouterType<Env>, {
    get: (target, prop: string) => {
      if (prop === 'fetch' || prop === 'on' || prop === 'request') return (target as any)[prop].bind(target)
      return (path: string, ...handlers: Handler<Env>[]) => target.on(prop, path, ...handlers)
    },
  })

  return receiverProxy
}
