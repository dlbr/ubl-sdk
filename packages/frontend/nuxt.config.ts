export default defineNuxtConfig({
  sourcemap: false,
  compatibilityDate: "2026-05-25",
  future: {
    compatibilityVersion: 5,
  },
  nitro: {
    preset: 'cloudflare_module',
  },
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/main.css']
})
