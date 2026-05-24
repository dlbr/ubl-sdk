import type { Env } from '../../worker/index';
import type { ExecutionContext } from '@cloudflare/workers-types';

declare module 'h3' {
  interface H3EventContext {
    cloudflare: {
      env: Env;
      context: ExecutionContext;
    };
    session: {
      klijentId: string;
      pib: string;
      operater: string;
      createdAt: number;
    };
  }
}

export {};
