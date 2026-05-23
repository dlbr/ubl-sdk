<script setup lang="ts">
// SEF Bridge Index Page - v4.21.0
</script>

<template>
  <div class="min-h-screen bg-gray-50 font-sans text-gray-900">
    <nav class="border-b border-gray-200 bg-white">
      <div class="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <h1 class="text-xl font-black tracking-tighter">SEF BRIDGE</h1>
        <div class="flex gap-4">
          <NuxtLink to="/onboarding" class="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700">Aktiviraj nalog</NuxtLink>
        </div>
      </div>
    </nav>

    <main class="max-w-7xl mx-auto px-4 py-16">
      <section class="text-center mb-24">
        <h1 class="text-5xl font-black mb-6 tracking-tighter">Digitalni most za vašu firmu</h1>
        <p class="text-xl text-gray-600 max-w-2xl mx-auto">Automatizovano i poreski ispravno izdavanje faktura uz Steel Fortress arhitekturu.</p>
      </section>

      <section class="mb-24">
        <h2 class="text-3xl font-black mb-12 text-center tracking-tighter">Kako SEF Bridge radi za vas?</h2>
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h3 class="font-bold text-lg mb-2 text-blue-600">A - Automatska kontrola</h3>
            <p class="text-sm text-gray-600">Sistem sam proverava ispravnost pre slanja.</p>
          </div>
          <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h3 class="font-bold text-lg mb-2 text-blue-600">B - Bezbednost</h3>
            <p class="text-sm text-gray-600">Vaši podaci su zaštićeni "kamikaza" tehnologijom koja sprečava svako curenje.</p>
          </div>
          <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h3 class="font-bold text-lg mb-2 text-blue-600">D - Determinizam</h3>
            <p class="text-sm text-gray-600">Naš sistem ne greši – fakture se generišu identično svaki put.</p>
          </div>
          <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h3 class="font-bold text-lg mb-2 text-blue-600">E - Edge brzina</h3>
            <p class="text-sm text-gray-600">Sve operacije se izvršavaju munjevito, bez zastoja.</p>
          </div>
          <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h3 class="font-bold text-lg mb-2 text-blue-600">F - Forenzički trag</h3>
            <p class="text-sm text-gray-600">Svaka faktura je trajno i sigurno arhivirana.</p>
          </div>
          <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h3 class="font-bold text-lg mb-2 text-blue-600">I - Integracija</h3>
            <p class="text-sm text-gray-600">Mi smo prevodilac između vašeg knjigovodstva i države.</p>
          </div>
          <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h3 class="font-bold text-lg mb-2 text-blue-600">K - Kontinuirana validacija</h3>
            <p class="text-sm text-gray-600">Čuvar koji vas štiti od kazni.</p>
          </div>
          <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h3 class="font-bold text-lg mb-2 text-blue-600">O - Oslobađanje od stresa</h3>
            <p class="text-sm text-gray-600">Vi ne brinete o tehničkim detaljima, mi brinemo za vas.</p>
          </div>
          <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h3 class="font-bold text-lg mb-2 text-blue-600">P - Poreska preciznost</h3>
            <p class="text-sm text-gray-600">Automatsko mapiranje svih poreskih kategorija.</p>
          </div>
          <div class="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h3 class="font-bold text-lg mb-2 text-blue-600">S - Standardizacija</h3>
            <p class="text-sm text-gray-600">Vaše fakture su uvek po međunarodnom UBL 2.1 standardu.</p>
          </div>
        </div>
      </section>

      <section class="bg-gray-900 text-gray-100 p-12 rounded-3xl">
        <h2 class="text-3xl font-black mb-8 tracking-tighter">Tehnički temelj: Steel Fortress arhitektura</h2>
        <div class="grid md:grid-cols-2 gap-8 text-sm">
          <div>
            <h4 class="font-bold text-blue-400 mb-2">Gatekeeper (MasterValidator)</h4>
            <p class="text-gray-400">Sanitacija i poslovna logika pre ulaska u sistem.</p>
          </div>
          <div>
            <h4 class="font-bold text-blue-400 mb-2">Factory (SefUblBuilder)</h4>
            <p class="text-gray-400">Deterministička transformacija u XML.</p>
          </div>
          <div>
            <h4 class="font-bold text-blue-400 mb-2">XSD Shield (xmllint)</h4>
            <p class="text-gray-400">Sintaksna neprobojnost u CI/CD procesu.</p>
          </div>
          <div>
            <h4 class="font-bold text-blue-400 mb-2">Audit-Ready Persistence</h4>
            <p class="text-gray-400">Nepromenljiv arhiv (Immutable Ledger).</p>
          </div>
        </div>
        <div class="mt-12 text-center">
            <NuxtLink to="/docs" class="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-500">Dokumentacija za developere</NuxtLink>
        </div>
      </section>
    </main>
  </div>
</template>
