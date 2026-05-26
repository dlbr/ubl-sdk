export type RouterContext<Env = any> = {
  req: Request
  env: Env
  ctx: ExecutionContext
  result?: any
  validJson?: any
  [key: string]: any
}

export type Handler<Env = any> = (c: RouterContext<Env>) => Promise<Response | void> | Response | void

export type Route<Env = any> = {
  path: string
  method: string
  handlers: Handler<Env>[]
}

export const Router = <Env = any>() => {
  const routes: Route<Env>[] = []

  const target = {
    on: (method: string, path: string, ...handlers: Handler<Env>[]) => {
      routes.push({ path, method: method.toUpperCase(), handlers })
      return receiverProxy
    },
    fetch: async (req: Request, env: Env, ctx: ExecutionContext) => {
      const url = new URL(req.url)
      const method = req.method.toUpperCase()
      const pathname = url.pathname.replace(/\/$/, '') || '/'

      for (const route of routes) {
        if (route.method !== 'ALL' && route.method !== method) continue

        const routePath = route.path.replace(/\/$/, '') || '/'
        let match = false
        let result: any = {}

        if (routePath === pathname) {
          match = true;
        } else if (routePath.includes(':')) {
          const pathParts = pathname.split('/').filter(Boolean)
          const routeParts = routePath.split('/').filter(Boolean)

          if (pathParts.length === routeParts.length) {
            match = true
            for (let i = 0; i < routeParts.length; i++) {
              if (routeParts[i].startsWith(':')) {
                result[routeParts[i].slice(1)] = pathParts[i]
              } else if (routeParts[i] !== pathParts[i]) {
                match = false
                break
              }
            }
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

      console.error(`[Router 404] No match for ${method} ${pathname}. Registered routes: ${routes.length}`);
      return new Response('Not Found', { status: 404 })
    },
    request: async (path: string, options: any, env: Env, ctx?: any) => {
      const url = path.startsWith('http') ? path : `http://localhost${path}`
      const req = new Request(url, options)
      return target.fetch(req, env, ctx || {})
    }
  }

  const receiverProxy = new Proxy(target, {
    get: (target, prop: string) => {
      if (prop === 'fetch' || prop === 'on' || prop === 'request') return (target as any)[prop].bind(target)
      return (path: string, ...handlers: Handler<Env>[]) => target.on(prop, path, ...handlers)
    },
  })

  return receiverProxy
}
