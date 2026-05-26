<script setup lang="ts">
const { klijentId } = useSefAuth()

useSeoMeta({
  title: 'Dokumentacija | SEF Bridge',
  description: 'Tehnička dokumentacija SEF Bridge platforme — eFakture, eOtpremnice, NBS kursna lista, Cloudflare Workers RPC arhitektura.'
})

const endpoints = [
  {
    group: 'Javno (bez autentifikacije)',
    color: 'slate',
    items: [
      { method: 'GET', path: '/kursna-lista', desc: 'Zvanični NBS srednji kurs za danas. EUR, USD, CHF sa trend indikatorom.' },
      { method: 'GET', path: '/api/public/v1/kursna-lista/og.png', desc: 'OG slika za social sharing — automatski generisana.' },
    ]
  },
  {
    group: 'Autentifikacija',
    color: 'violet',
    items: [
      { method: 'POST', path: '/api/auth/login', desc: 'Prijava — verifikuje SEF API ključ, kreira AES-256-GCM sesiju (8h).' },
      { method: 'POST', path: '/api/auth/logout', desc: 'Odjava — briše __Host- kolačić, zabranuje keširanje.' },
      { method: 'GET', path: '/api/auth/session', desc: 'Trenutna sesija (klijentId, pib, operater).' },
      { method: 'GET', path: '/api/onboarding/search?q=naziv', desc: 'FTS5 pretraga u REGISTAR_DB po nazivu firme ili PIB-u.' },
    ]
  },
  {
    group: 'Fakture',
    color: 'blue',
    items: [
      { method: 'GET', path: '/api/fakture?page=1', desc: 'Lista faktura iz Durable Object read-modela. Paginizovano.' },
      { method: 'POST', path: '/api/fakture/send', desc: 'Slanje eFakture na SEF portal. JSON → UBL 2.1 MFIN profil → R2 arhiva.' },
    ]
  },
  {
    group: 'Otpremnice / Prijemnice',
    color: 'emerald',
    items: [
      { method: 'POST', path: '/api/otpremnice/send', desc: 'eOtpremnica na MFIN portal. Zahteva Standard ili Enterprise plan.' },
      { method: 'POST', path: '/api/prijemnice/receive', desc: 'Potvrda prijema eOtpremnice — ažurira status u D1.' },
      { method: 'POST', path: '/api/otpremnice/reconciliation/:id', desc: 'Knjižno odobrenje (credit note) prema otpremnici.' },
    ]
  },
  {
    group: 'Dashboard & Audit',
    color: 'amber',
    items: [
      { method: 'GET', path: '/api/dashboard/stats', desc: 'Plan, licenca, kvota, usage — sve iz Durable Object-a.' },
      { method: 'GET', path: '/api/dashboard/logs', desc: 'Audit log grešaka i operacija.' },
      { method: 'GET', path: '/api/audit/download', desc: 'JSON manifest sa XML sadržajima za poreski audit (10 godina retencija).' },
      { method: 'GET', path: '/api/analytics/pppdv-export?period=2026-05', desc: 'TXT izvoz za PP PDV formu.' },
      { method: 'GET', path: '/api/webhook-setup', desc: 'Webhook URL-ovi za konfiguraciju na državnom SEF portalu.' },
    ]
  },
  {
    group: 'Webhooks (prima SEF portal)',
    color: 'rose',
    items: [
      { method: 'POST', path: '/api/webhooks/sef-update', desc: 'SEF portal šalje statusne promene faktura u realnom vremenu.' },
      { method: 'POST', path: '/api/webhooks/otpremnice', desc: 'eOtpremnice portal šalje status update — ažurira D1 i audit log.' },
    ]
  },
]

const plans = [
  { name: 'Micro', limit: '50 faktura/mes', features: ['eFakture (SEF)', 'Audit log 10 god.', 'NBS kursna lista', 'Dashboard'], highlight: false },
  { name: 'Standard', limit: '300 faktura/mes', features: ['Sve iz Micro', 'eOtpremnice (300/mes)', 'ePrijemnice', 'PP PDV export', 'Webhook relay'], highlight: true },
  { name: 'Enterprise', limit: 'Neograničeno', features: ['Sve iz Standard', 'Agency modul', 'Multi-klijent', 'Priority support', 'SLA 99.9%'], highlight: false },
]

const colorMap: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700',
  violet: 'bg-violet-100 text-violet-700',
  blue: 'bg-blue-100 text-blue-700',
  emerald: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  rose: 'bg-rose-100 text-rose-700',
}

const methodColor: Record<string, string> = {
  GET: 'bg-emerald-500 text-white',
  POST: 'bg-blue-600 text-white',
  PUT: 'bg-amber-500 text-white',
  DELETE: 'bg-rose-600 text-white',
}
</script>

<template>
  <div class="min-h-screen bg-[#0a0a0f] text-white font-sans">
    <!-- Nav -->
    <nav class="border-b border-white/10 sticky top-0 z-50 backdrop-blur-xl bg-[#0a0a0f]/80">
      <div class="max-w-6xl mx-auto px-4 flex justify-between items-center h-16">
        <NuxtLink to="/" class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <span class="text-white font-black text-sm">S</span>
          </div>
          <span class="font-bold text-white">SEF Bridge</span>
          <span class="text-xs text-white/30 font-mono">docs</span>
        </NuxtLink>
        <div class="flex items-center gap-4">
          <a href="https://github.com/dlbr/sef-ubl-builder" target="_blank" class="text-sm text-white/50 hover:text-white transition">GitHub ↗</a>
          <NuxtLink v-if="klijentId" to="/dashboard" class="text-sm font-semibold text-blue-400 hover:text-blue-300 transition">Dashboard</NuxtLink>
          <NuxtLink v-else to="/onboarding" class="text-sm font-semibold px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 transition">Aktivacija</NuxtLink>
        </div>
      </div>
    </nav>

    <main class="max-w-6xl mx-auto px-4 py-16 space-y-24">

      <!-- Hero -->
      <header class="text-center space-y-6">
        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-xs text-white/50 font-mono">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          Cloudflare Edge · Workers RPC · Durable Objects
        </div>
        <h1 class="text-5xl font-black tracking-tight bg-gradient-to-r from-white via-blue-200 to-violet-400 bg-clip-text text-transparent leading-tight">
          SEF Bridge Dokumentacija
        </h1>
        <p class="text-lg text-white/50 max-w-2xl mx-auto leading-relaxed">
          Edge-native platforma za automatizovanu obradu eFaktura i eOtpremnica.<br>
          UBL 2.1 MFIN profil · NBS kursna lista · Poreski audit 10 godina.
        </p>
      </header>

      <!-- Arhitektura -->
      <section id="arhitektura">
        <h2 class="text-2xl font-bold mb-8 text-white/90">Arhitektura</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="border border-white/10 rounded-2xl p-6 bg-white/5 hover:bg-white/8 transition">
            <div class="text-2xl mb-3">🌐</div>
            <h3 class="font-bold text-white mb-2">Nuxt 4 Worker</h3>
            <p class="text-sm text-white/50 leading-relaxed">Frontend deployovan kao Cloudflare Worker na <code>sef.dlbr.cloud</code>. AES-256-GCM sesija, edge-side rendering.</p>
          </div>
          <div class="border border-blue-500/30 rounded-2xl p-6 bg-blue-500/10 hover:bg-blue-500/15 transition">
            <div class="text-2xl mb-3">⚡</div>
            <h3 class="font-bold text-white mb-2">Backend Worker (RPC)</h3>
            <p class="text-sm text-white/50 leading-relaxed">Nuxt poziva backend direktno via <strong class="text-blue-300">Service Binding RPC</strong> — bez HTTP overhead-a, bez auth headera. Binding IS autentifikacija.</p>
          </div>
          <div class="border border-violet-500/30 rounded-2xl p-6 bg-violet-500/10 hover:bg-violet-500/15 transition">
            <div class="text-2xl mb-3">🔒</div>
            <h3 class="font-bold text-white mb-2">Durable Objects</h3>
            <p class="text-sm text-white/50 leading-relaxed">Per-klijent SQLite (KlijentBaza). Audit log, fakture, config, kvota — sve izolovano. Zero shared state.</p>
          </div>
          <div class="border border-white/10 rounded-2xl p-6 bg-white/5 hover:bg-white/8 transition">
            <div class="text-2xl mb-3">🗄️</div>
            <h3 class="font-bold text-white mb-2">D1 Centralni Registar</h3>
            <p class="text-sm text-white/50 leading-relaxed">FTS5 pretraga kompanija, agency → klijent mapping, dokument status ledger.</p>
          </div>
          <div class="border border-white/10 rounded-2xl p-6 bg-white/5 hover:bg-white/8 transition">
            <div class="text-2xl mb-3">📦</div>
            <h3 class="font-bold text-white mb-2">R2 Arhiva (10 god.)</h3>
            <p class="text-sm text-white/50 leading-relaxed">Sve UBL XML fajlove čuvamo 10 godina u skladu sa Uredbom o elektronskim fakturama.</p>
          </div>
          <div class="border border-white/10 rounded-2xl p-6 bg-white/5 hover:bg-white/8 transition">
            <div class="text-2xl mb-3">📬</div>
            <h3 class="font-bold text-white mb-2">Queues</h3>
            <p class="text-sm text-white/50 leading-relaxed">SEF compliance queue, eOtpremnice reconciliation queue, webhook delivery queue — async processing.</p>
          </div>
        </div>
      </section>

      <!-- API Referenca -->
      <section id="api">
        <h2 class="text-2xl font-bold mb-8 text-white/90">API Referenca</h2>
        <div class="space-y-8">
          <div v-for="group in endpoints" :key="group.group">
            <div class="flex items-center gap-3 mb-4">
              <span :class="['text-xs font-bold px-2.5 py-1 rounded-full', colorMap[group.color]]">{{ group.group }}</span>
            </div>
            <div class="space-y-2">
              <div v-for="ep in group.items" :key="ep.path"
                class="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/8 hover:border-white/15 transition group">
                <div class="flex items-center gap-3 flex-shrink-0">
                  <span :class="['text-[10px] font-black px-2 py-1 rounded font-mono min-w-[44px] text-center', methodColor[ep.method]]">{{ ep.method }}</span>
                  <code class="text-sm text-white/80 font-mono group-hover:text-white transition">{{ ep.path }}</code>
                </div>
                <p class="text-sm text-white/40 sm:ml-auto sm:text-right max-w-sm">{{ ep.desc }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Planovi -->
      <section id="planovi">
        <h2 class="text-2xl font-bold mb-8 text-white/90">Planovi</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div v-for="plan in plans" :key="plan.name"
            :class="['rounded-2xl p-6 border transition', plan.highlight ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10 bg-white/5']">
            <div v-if="plan.highlight" class="text-xs font-black text-blue-400 uppercase tracking-widest mb-3">Najpopularniji</div>
            <h3 class="text-xl font-bold text-white mb-1">{{ plan.name }}</h3>
            <p class="text-sm text-white/40 mb-6 font-mono">{{ plan.limit }}</p>
            <ul class="space-y-2">
              <li v-for="f in plan.features" :key="f" class="flex items-center gap-2 text-sm text-white/60">
                <span class="text-emerald-400 text-xs">✓</span> {{ f }}
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Integration primer -->
      <section id="integracija">
        <h2 class="text-2xl font-bold mb-8 text-white/90">Brza integracija (JSON → SEF)</h2>
        <div class="bg-[#111118] border border-white/10 rounded-2xl p-6 overflow-auto">
          <pre class="text-sm text-white/70 font-mono leading-relaxed"><code><span class="text-white/30">// 1. Login</span>
<span class="text-blue-300">POST</span> /api/auth/login
{ "pib": "113398540", "api_key": "sk_live_...", "operater": "Petar Petrović" }

<span class="text-white/30">// 2. Pošalji fakturu</span>
<span class="text-blue-300">POST</span> /api/fakture/send
{
  "brojFakture": "2026/001",
  "valuta": "RSD",
  "datumIzdavanja": "2026-05-26",
  "stavke": [{ "naziv": "Usluga razvoja", "kolicina": 1, "cena": 50000, "pdvStopa": 20 }]
}

<span class="text-white/30">// 3. Primaj webhook potvrde</span>
<span class="text-blue-300">POST</span> /api/webhooks/sef-update  <span class="text-white/30">← konfiguriši na SEF portalu</span></code></pre>
        </div>
      </section>

      <!-- Open Source -->
      <section id="open-source" class="rounded-3xl p-8 bg-gradient-to-br from-violet-900/40 to-blue-900/40 border border-violet-500/20 text-center space-y-4">
        <div class="text-3xl">📖</div>
        <h2 class="text-2xl font-bold text-white">UBL Builder — Open Source</h2>
        <p class="text-white/50 max-w-xl mx-auto text-sm leading-relaxed">
          Jezgro sistema (<strong class="text-white/70">sef-ubl-builder</strong>) je potpuno otvoreno.
          UBL 2.1 MFIN profil, svi poreski scenariji, validacija šifara oslobođenja.
        </p>
        <a href="https://github.com/dlbr/sef-ubl-builder" target="_blank"
          class="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white text-gray-900 font-bold text-sm hover:bg-white/90 transition shadow-xl shadow-white/10">
          GitHub Repozitorijum ↗
        </a>
      </section>

    </main>

    <!-- Footer -->
    <footer class="border-t border-white/10 py-8 text-center">
      <p class="text-xs text-white/20 font-mono">SEF Bridge · Cloudflare Edge · MIT licenca · 2026</p>
    </footer>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&family=JetBrains+Mono:wght@500&display=swap');
.font-sans { font-family: 'Inter', sans-serif; }
code { font-family: 'JetBrains Mono', monospace; }
</style>
