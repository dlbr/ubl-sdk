import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function analyzeChanges() {
  const textFile = process.argv[2];
  if (!textFile) {
    console.error('Text file is required');
    process.exit(1);
  }

  const content = fs.readFileSync(textFile, 'utf8');
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `
    Analyze the following technical MFIN SEF update text.
    Compare it against current MasterValidator and UBL logic requirements.
    
    If changes are required to the code to maintain compliance, generate the necessary diff/patch code and explain the rationale.
    If no changes are needed, output "NO_CHANGES".
    
    Text: ${content}
  `;

  try {
    const result = await model.generateContent(prompt);
    console.log("--- AI ANALYSIS & PROPOSED DIFF ---");
    console.log(result.response.text());
    console.log("-----------------------------------");
  } catch (err) {
    console.error('AI Analysis failed:', err);
    process.exit(1);
  }
}

analyzeChanges();