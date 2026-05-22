// Tipovi za tvoj Router
export type RouterContext<Env = any> = {
  req: Request
  env: Env
  ctx: ExecutionContext
  result: URLPatternResult
  validJson?: any
}

export type Handler<Env = any> = (c: RouterContext<Env>) => Response | Promise<Response>

type Route = {
  pattern: URLPattern
  method: string
  handler: Handler
}

export type RouterType<Env = any> = {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>
  request: (path: string, init?: RequestInit, env?: Env, ctx?: ExecutionContext) => Promise<Response>
  on: (method: string, path: string, handler: Handler<Env>) => RouterType<Env>
  [key: string]: any // Za dinamičke metode poput app.get, app.post...
}

export const Router = <Env = any>(): RouterType<Env> => {
  const routes: Route[] = []

  // Osnovni objekat sa metodama
  const core = {
    fetch: async (req: Request, env: Env, ctx: ExecutionContext): Promise<Response> => {
      const url = new URL(req.url)
      const method = req.method

      for (let i = 0, len = routes.length; i < len; i++) {
        const route = routes[i];
        if (!route) continue;
        
        if (route.method !== 'ALL' && route.method !== method.toUpperCase()) continue

        // OKLOP: URLPattern is reliable, but let's be forensic about pathname
        const result = route.pattern.exec(url)
        if (result) {
          try {
            return await route.handler({ req, env, ctx, result })
          } catch (handlerErr: any) {
            console.error(`[Router] Handler Error on ${url.pathname}:`, handlerErr.message);
            return Response.json({ error: 'Internal Router Error', details: handlerErr.message }, { status: 500 });
          }
        }
      }

      console.warn(`[Router] No match for ${method} ${url.pathname}`);
      return new Response('Not Found', { status: 404 })
    },

    request: async (path: string, init?: RequestInit, env?: Env, ctx?: ExecutionContext): Promise<Response> => {
      const req = new Request(`http://localhost${path}`, init)
      return core.fetch(req, env || {} as Env, ctx || {} as ExecutionContext)
    },

    on: (method: string, path: string, handler: Handler<Env>) => {
      // Robust path: allow optional trailing slash using URLPattern grouping
      const patternPath = path.endsWith('/') ? path : `${path}{/}?`;
      routes.push({
        pattern: new URLPattern({ pathname: patternPath }),
        method: method.toUpperCase(),
        handler,
      })
      return receiverProxy
    },
  }

  // Proxy koji ispravno delegira metode bez prevremenog izvršavanja
  const receiverProxy = new Proxy(core as unknown as RouterType<Env>, {
    get: (target, prop: string) => {
      // Ako se traži fetch, on ili request, vrati ih vezane za originalni objekat
      if (prop === 'fetch' || prop === 'on' || prop === 'request') {
        return (target as any)[prop].bind(target)
      }

      // Za dinamičke metode (app.get, app.post, app.all...)
      return (path: string, handler: Handler<Env>) => target.on(prop, path, handler)
    },
  })

  return receiverProxy
}
