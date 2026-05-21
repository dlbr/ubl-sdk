<script setup lang="ts">
const { klijentId, isAuthenticated } = useSefAuth()
</script>

<template>
  <div class="min-h-screen bg-white font-sans text-gray-900">
    <!-- Navigacija -->
    <nav class="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-200">S</div>
        <span class="text-2xl font-black tracking-tighter uppercase">SEF <span class="text-blue-600">Bridge</span></span>
      </div>
      <div class="flex items-center gap-6">
        <NuxtLink v-if="isAuthenticated" to="/dashboard" class="font-bold text-blue-600 hover:text-blue-700 underline decoration-2 underline-offset-4 transition">Dashboard →</NuxtLink>
        <NuxtLink v-else to="/onboarding" class="bg-gray-900 text-white px-6 py-2 rounded-full font-bold hover:bg-black transition shadow-xl">Započni Onboarding</NuxtLink>
      </div>
    </nav>

    <!-- Hero Sekcija -->
    <header class="max-w-5xl mx-auto px-6 py-24 text-center space-y-8">
      <div class="inline-block bg-blue-50 text-blue-700 px-4 py-1.5 rounded-full text-sm font-black uppercase tracking-widest border border-blue-100 mb-4">
        Forenzička Izolacija Podataka
      </div>
      <h1 class="text-l md:text-8xl font-black tracking-tighter leading-[0.9] text-gray-900">
        INTEGRACIJA SA SEF-OM KOJA <span class="text-blue-600 italic">NIKADA</span> NE PADA.
      </h1>
      <p class="text-xl md:text-2xl text-gray-500 max-w-3xl mx-auto leading-relaxed font-medium">
        Prvi multi-tenant API bridge u Srbiji sa fizički odvojenim SQLite bazama za svakog klijenta na Cloudflare Edge infrastrukturi.
      </p>
      <div class="flex flex-col sm:flex-row gap-4 justify-center pt-8">
        <NuxtLink to="/onboarding" class="bg-blue-600 text-white px-10 py-5 rounded-2xl font-black text-xl hover:bg-blue-700 transition shadow-2xl shadow-blue-200 hover:scale-[1.02] active:scale-95">
          Registruj Firmu Odmah
        </NuxtLink>
        <a href="#zasto" class="bg-white border-2 border-gray-200 px-10 py-5 rounded-2xl font-black text-xl hover:bg-gray-50 transition">
          Saznaj Više
        </a>
      </div>
    </header>

    <!-- Zasto Sekcija -->
    <section id="zasto" class="bg-gray-50 py-32 border-y border-gray-200">
      <div class="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12">
        <div class="space-y-4">
          <div class="text-4xl">🔐</div>
          <h3 class="text-2xl font-black tracking-tight">100% Izolacija</h3>
          <p class="text-gray-500 leading-relaxed font-medium">
            Vaši podaci nisu u "zajedničkoj gomili". Svaka firma dobija svoj kriptovani sef na samoj ivici mreže. Niko ne vidi vaše promete.
          </p>
        </div>
        <div class="space-y-4">
          <div class="text-4xl">⚡</div>
          <h3 class="text-2xl font-black tracking-tight">Neprekidan Rad</h3>
          <p class="text-gray-500 leading-relaxed font-medium">
            Transakcioni batch import guta hiljade faktura u milisekundi. Jitter backoff mehanizam štiti vezu od državnih restrikcija.
          </p>
        </div>
        <div class="space-y-4">
          <div class="text-4xl">⚓</div>
          <h3 class="text-2xl font-black tracking-tight">Pametni Webhook-ovi</h3>
          <p class="text-gray-500 leading-relaxed font-medium">
            Vaš ERP dobija notifikaciju iste sekunde kada kupac promeni status fakture (Odobreno, Odbijeno ili Pregledano).
          </p>
        </div>
      </div>
    </section>

    <!-- Pricing Sekcija -->
    <LandingPricing />

    <!-- Footer -->
    <footer class="py-12 text-center text-gray-400 text-sm font-bold uppercase tracking-widest bg-gray-50 border-t border-gray-200">
      &copy; 2026 SEF BRIDGE PRO. EDGE INFRASTRUKTURA REPUBLIKE SRBIJE.
    </footer>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap');
.font-sans { font-family: 'Inter', sans-serif; }
</style>
