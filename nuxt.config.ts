export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
   future: {
    compatibilityVersion: 5,
  },
  devtools: { enabled: false },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      sefApiBase: 'https://sef-sync-worker.dlbr.workers.dev'
    }
  }
})
