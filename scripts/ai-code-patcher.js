import fs from 'fs';

async function patchCode() {
  const textFile = process.argv[2];
  if (!textFile) {
    console.error('Text file is required');
    process.exit(1);
  }

  const content = fs.readFileSync(textFile, 'utf8');

  // Nema require, nema dependency-ja, samo čisti fetch
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `
        Ti si sistem za inženjersku harmonizaciju SEF Bridge-a.
        Analiziraj ovaj tekst iz MFIN dokumentacije: 
        ${content}
        
        Ako MFIN uvodi nova pravila, napiši novi validacioni kod za packages/ubl-sdk/src/validator.ts.
        Output mora biti SAMO kod koji treba dodati u MasterValidator.validate() metod.
        Ako nema promena, vrati string: NO_CHANGES
      ` }] }]
    })
  });

  const data = await response.json();
  const patch = data.candidates?.[0]?.content?.parts?.[0]?.text || "NO_CHANGES";
  
  console.log("--- AI ANALYSIS ---");
  console.log(patch);
}

patchCode();