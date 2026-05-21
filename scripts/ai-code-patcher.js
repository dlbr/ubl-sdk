const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

async function runAiPatcher() {
  const inputFile = process.argv[2];
  if (!inputFile) {
    console.error('Input text file is required');
    process.exit(1);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is required');
    process.exit(1);
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const hotfixText = fs.readFileSync(inputFile, 'utf8');
  
  // Ograničeni smo na ključne fajlove za SEF Builder pravila
  const filesToPatch = [
    'packages/sef-ubl-builder/src/validator.ts',
    'packages/sef-ubl-builder/src/index.ts',
    'packages/sef-ubl-builder/src/types.ts'
  ];

  for (const filePath of filesToPatch) {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) continue;

    console.log(`\n🤖 Analiziranje i krpljenje fajla: ${filePath}`);
    const currentCode = fs.readFileSync(fullPath, 'utf8');

    const systemPrompt = `
Ti si Enterprise RegTech inženjer specijalizovan za Poresku upravu Srbije i UBL 2.1 (SEF API).
Tvoj zadatak je da pročitaš priloženi tekst državnog Hotfix-a i modifikuješ postojeći TypeScript kod tako da bude usklađen.

PRAVILA:
1. Menjaš samo strukture koje su eksplicitno obuhvaćene novim propisom u PDF-u (npr. enumeracije, UBL tagovi, poreske stope).
2. Matematika i naši interni agnostički ključevi (poput osnovicaOpsta, pdvOpsta, billing_ledger) MORAJU ostati netaknuti.
3. Vrati ISKLJUČIVO čisti, ceo novi TypeScript kod za zadati fajl, bez markdown oznaka (poput \`\`\`typescript), bez objašnjenja, bez pozdrava. 
4. Kod mora biti 100% ispravan za kompilaciju.
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'user', parts: [{ text: `DRŽAVNI HOTFIX TEKST:\n${hotfixText}\n\nTRENUTNI KOD (${filePath}):\n${currentCode}` }] }
        ]
      });

      let newCode = response.text || '';
      
      // Cleanup of potential markdown markers if the AI ignores rule 3
      newCode = newCode.replace(/^```(typescript|ts)?\n/i, '').replace(/\n```$/i, '');
      
      if (newCode.length > 50 && newCode !== currentCode) {
        fs.writeFileSync(fullPath, newCode, 'utf8');
        console.log(`✅ AI je uspešno pečovao ${filePath}`);
      } else {
        console.log(`ℹ️ AI nije detektovao potrebu za izmenama u ${filePath}`);
      }

    } catch (err) {
      console.error(`❌ Greška pri patchovanju ${filePath}:`, err.message);
      process.exit(1);
    }
  }
}

runAiPatcher();