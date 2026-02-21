import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '/home/kareltestspecial/KDC/central-ai-waterfall/.env' });

async function testDirectGemini() {
    const key = process.env.GEMINI_API_KEY;
    console.log("Sleutel gevonden:", key ? "Ja (begint met " + key.substring(0, 5) + "...)" : "Nee");
    
    if (!key) return;

    try {
        const genAI = new GoogleGenerativeAI(key);
        // Gebruik een gegarandeerd model
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        console.log("Directe aanvraag sturen...");
        const result = await model.generateContent("Hallo, dit is een test.");
        console.log("Antwoord ontvangen:", result.response.text());
        console.log("✅ GEMINI SLEUTEL WERKT!");
    } catch (e) {
        console.error("❌ GEMINI SLEUTEL FAALT:", e.message);
    }
}

testDirectGemini();
