// scripts/verify.js
import { execSync } from 'child_process';
import { sendNotification } from './notify.js';

async function runVerify() {
  try {
    console.log("🔍 Faza 1: Provera TypeScript tipova...");
    execSync('npx tsc --noEmit', { stdio: 'inherit' });
    console.log("✅ Tipovi su ispravni.");

    console.log("\n🔍 Faza 2: Build...");
    execSync('cd packages/sef-ubl-builder && npx tsc && npx esbuild src/index.ts --bundle --platform=node --format=esm --outfile=dist/index.js && cd ../..', { stdio: 'inherit' });
    console.log("✅ Build uspešan.");

    console.log("\n🔍 Faza 3: Smoke Test protiv Demo SEF API-ja...");
    execSync('npx tsx smoke_test.ts', { stdio: 'inherit' });
    
    console.log("\n🚀 SVE PROVERE PROŠLE. Sistem je spreman za deploy.");
  } catch (e) {
    const errorMsg = `Provera nije uspela! Detalji: ${e.message}`;
    console.error(`\n❌ ${errorMsg}`);
    await sendNotification(errorMsg);
    process.exit(1);
  }
}

runVerify();
