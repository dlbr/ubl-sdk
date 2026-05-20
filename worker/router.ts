// Tipovi za tvoj Pico ruter
export type PicoContext<Env = any> = {
  req: Request
  env: Env
  ctx: ExecutionContext
  result: URLPatternResult
  validJson?: any
}

export type Handler<Env = any> = (c: PicoContext<Env>) => Response | Promise<Response>

type Route = {
  pattern: URLPattern
  method: string
  handler: Handler
}

export type PicoType<Env = any> = {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>
  request: (path: string, init?: RequestInit, env?: Env, ctx?: ExecutionContext) => Promise<Response>
  on: (method: string, path: string, handler: Handler<Env>) => PicoType<Env>
  [key: string]: any // Za dinamičke metode poput app.get, app.post...
}

export const Pico = <Env = any>(): PicoType<Env> => {
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

        const result = route.pattern.exec(url)
        if (result) return await route.handler({ req, env, ctx, result })
      }

      return new Response('Not Found', { status: 404 })
    },

    request: async (path: string, init?: RequestInit, env?: Env, ctx?: ExecutionContext): Promise<Response> => {
      const req = new Request(`http://localhost${path}`, init)
      return core.fetch(req, env || {} as Env, ctx || {} as ExecutionContext)
    },

    on: (method: string, path: string, handler: Handler<Env>) => {
      routes.push({
        // Match only by pathname, hostname defaults to '*'
        pattern: new URLPattern({ pathname: path }),
        method: method.toUpperCase(),
        handler,
      })
      return receiverProxy // Omogućava app.get().post().put() lančano vezivanje
    },
  }

  // Proxy koji ispravno delegira metode bez prevremenog izvršavanja
  const receiverProxy = new Proxy(core as unknown as PicoType<Env>, {
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
