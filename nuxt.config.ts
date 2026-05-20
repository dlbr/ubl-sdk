export default defineNuxtConfig({
  sourcemap: false,
  compatibilityDate: "2024-11-01",
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
