<script setup lang="ts">
const { klijentId } = useSefAuth()
</script>

<template>
  <div class="min-h-screen bg-gray-50 font-sans text-gray-900">
    <!-- Header -->
    <nav class="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
        <NuxtLink to="/" class="flex items-center gap-3">
          <div class="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-200">
            <span class="text-white font-black text-lg">S</span>
          </div>
          <span class="font-bold text-lg tracking-tight text-gray-900">SEF Bridge Docs</span>
        </NuxtLink>
        <NuxtLink v-if="klijentId" to="/dashboard" class="text-sm font-bold text-blue-600 hover:underline">
          Nazad na Dashboard
        </NuxtLink>
      </div>
    </nav>

    <main class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div class="bg-white rounded-3xl border border-gray-200 shadow-xl overflow-hidden">
        <div class="p-8 md:p-12">
          <h1 class="text-4xl font-black text-gray-900 mb-6 tracking-tight">API Dokumentacija v2.0</h1>
          <p class="text-xl text-gray-600 mb-12 leading-relaxed">
            Dobrodošli u zvaničnu tehničku dokumentaciju za SEF Bridge. Naš API omogućava ERP sistemima munjevitu i asinhronu integraciju sa državnim sistemom e-Faktura.
          </p>

          <div class="space-y-16">
            <!-- Autentifikacija -->
            <section>
              <h2 class="text-2xl font-black text-gray-900 mb-4 flex items-center gap-3">
                <span class="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm">01</span>
                Autentifikacija
              </h2>
              <p class="text-gray-600 mb-4">
                Sve API operacije zahtevaju <code>X-Klijent-ID</code> zaglavlje. Ovaj ID je tvoj unikatni ključ koji si dobio tokom aktivacije (onboardinga).
              </p>
              <div class="bg-gray-900 rounded-2xl p-6 overflow-x-auto">
                <pre class="text-blue-400 font-mono text-sm">X-Klijent-ID: klijent_123456789</pre>
              </div>
            </section>

            <!-- Slanje Faktura -->
            <section>
              <h2 class="text-2xl font-black text-gray-900 mb-4 flex items-center gap-3">
                <span class="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm">02</span>
                Slanje Batch Faktura
              </h2>
              <p class="text-gray-600 mb-4">
                Ovaj endpoint omogućava slanje jedne ili više faktura odjednom. Sistem odmah vraća <code>202 Accepted</code>, a fakture šalje asinhrono u pozadini.
              </p>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <span class="text-[10px] font-black text-blue-500 uppercase tracking-widest">Metoda</span>
                  <div class="text-lg font-bold">POST</div>
                </div>
                <div class="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <span class="text-[10px] font-black text-blue-500 uppercase tracking-widest">Putanja</span>
                  <div class="text-lg font-bold">/api/fakture/batch</div>
                </div>
              </div>

              <h3 class="text-sm font-black text-gray-400 uppercase tracking-widest mb-3">Struktura Zahteva (JSON)</h3>
              <div class="bg-gray-900 rounded-2xl p-6 overflow-x-auto mb-6">
                <pre class="text-gray-300 font-mono text-xs leading-relaxed">
{
  "fakture": [
    {
      "ID": "INV-2026-001",
      "broj_fakture": "2026/001",
      "iznos": 12500.50,
      "DocumentCurrencyCode": "RSD",
      "Buyer": {
        "Name": "Kupac DOO",
        "Pib": "101234567"
      },
      "Lines": [
        {
          "ItemName": "Softverske usluge",
          "Quantity": 1,
          "Price": 10417.08,
          "VatPercent": 20
        }
      ]
    }
  ]
}</pre>
              </div>

              <div class="bg-blue-50 border border-blue-100 p-6 rounded-2xl">
                <h4 class="text-blue-900 font-bold mb-2">Ponašanje u pozadini</h4>
                <ul class="space-y-2 text-sm text-blue-800">
                  <li class="flex gap-2"><span>✅</span> Fakture se odmah upisuju u tvoj privatni ledger.</li>
                  <li class="flex gap-2"><span>🔄</span> Durable Object alarm se budi i kreće u slanje.</li>
                  <li class="flex gap-2"><span>⚡</span> Ako je SEF portal nedostupan, sistem će pokušavati ponovo dok ne uspe.</li>
                </ul>
              </div>
            </section>

            <!-- Statusi i Webhook -->
            <section>
              <h2 class="text-2xl font-black text-gray-900 mb-4 flex items-center gap-3">
                <span class="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm">03</span>
                Webhook Notifikacije
              </h2>
              <p class="text-gray-600 mb-4">
                Kada SEF promeni status fakture (npr. postane <code>Approved</code> ili <code>Rejected</code>), SEF Bridge će odmah poslati POST zahtev na tvoj definisani Webhook URL.
              </p>
              <div class="bg-gray-900 rounded-2xl p-6 overflow-x-auto mb-4">
                <pre class="text-green-400 font-mono text-xs">
{
  "internal_id": "INV-2026-001",
  "sef_id": "998877",
  "status": "Approved",
  "timestamp": "2026-05-20T14:30:00Z"
}</pre>
              </div>
            </section>

            <!-- Error Logovi -->
            <section>
              <h2 class="text-2xl font-black text-gray-900 mb-4 flex items-center gap-3">
                <span class="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center text-sm">04</span>
                Praćenje Grešaka
              </h2>
              <p class="text-gray-600 mb-4">
                Sve mrežne ili validacione greške možeš povući preko dashboard-a ili direktno upitom na:
              </p>
              <div class="bg-gray-50 p-4 rounded-xl border border-gray-200 inline-block font-mono text-sm">
                GET /api/dashboard/logs
              </div>
            </section>
          </div>

          <div class="mt-20 pt-8 border-t border-gray-100 text-center">
            <p class="text-gray-400 text-sm font-medium">
              SEF Bridge v2.0 &bull; Razvijeno za inženjere &bull; Cloudflare Edge Infrastructure
            </p>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@500&display=swap');
.font-sans { font-family: 'Inter', sans-serif; }
.font-mono { font-family: 'JetBrains Mono', monospace; }

code {
  @apply bg-gray-100 text-blue-600 px-1.5 py-0.5 rounded font-mono text-sm font-bold;
}
</style>
