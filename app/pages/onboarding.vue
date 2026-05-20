<template>
  <div class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
    <OnboardingForm />
    
    <p class="mt-8 text-center text-xs text-gray-400 font-bold uppercase tracking-widest">
      &larr; <NuxtLink to="/" class="hover:text-gray-600 underline transition">Nazad na početnu</NuxtLink>
    </p>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap');
.font-sans { font-family: 'Inter', sans-serif; }
</style>
