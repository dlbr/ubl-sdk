export default defineNuxtConfig({
  sourcemap: false,
  compatibilityDate: "2026-05-25",
  future: {
    compatibilityVersion: 5,
  },
  nitro: {
    preset: 'cloudflare_module',
    // Node built-ins su dostupni kroz nodejs_compat flag u wrangler.toml
    // Ne bundlovati ih — Workers runtime ih resolveuje na runtime
    rollupConfig: {
      external: [
        'node:buffer',
        'node:timers',
        'node:stream',
        'node:events',
        'node:process',
        'node:util',
      ],
    },
  },
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/main.css']
})
