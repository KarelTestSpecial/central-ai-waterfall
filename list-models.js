import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config({ path: '/home/kareltestspecial/KDC/central-ai-waterfall/.env' });

async function listModels() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) { console.error("Geen sleutel!"); return; }

    try {
        console.log("Ophalen van modellen lijst...");
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();
        
        console.log("BESCHIKBARE MODELLEN VOOR JOUW KEY:");
        data.models.forEach(m => {
            if (m.supportedGenerationMethods.includes("generateContent")) {
                console.log(`- ${m.name.replace('models/', '')}`);
            }
        });
    } catch (e) {
        console.error("Fout:", e.message);
    }
}

listModels();
