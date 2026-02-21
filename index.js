import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

let config = {
    "groq": ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
    "settings": { "temperature": 0.7, "timeout_ms": 30000 }
};

const EXHAUSTED_PROVIDERS = new Map();
const USAGE_LOG_PATH = path.resolve(__dirname, 'usage.log');

try {
    const configPath = path.resolve(__dirname, 'ai-models.json');
    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (e) {}

function logUsage(caller, model, inputType) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} | Project: ${caller || 'unknown'} | Model: ${model} | Type: ${inputType}\n`;
    try { fs.appendFileSync(USAGE_LOG_PATH, logEntry); } catch (e) {}
}

async function withTimeout(promise, ms) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    });
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}

export function getConfig() { return config; }
export function getExhaustedProviders() { return Array.from(EXHAUSTED_PROVIDERS.keys()); }
export function getSequence(modelStack = null) {
    return ["gemini-flash-latest", "gemini-2.0-flash", "llama-3.3-70b-versatile"];
}

export async function generateWithAI(input, { isJson = true, modelStack = null, temp = 0.7, caller = 'anonymous' } = {}) {
    const logPrefix = `[AI-WATERFALL]`;
    const timeout = 60000;

    let prompt = Array.isArray(input) ? input.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n") : input;
    const sequence = ["gemini-flash-latest", "gemini-2.0-flash", "llama-3.3-70b-versatile", "mixtral-8x7b-32768"];

    for (const modelName of sequence) {
        const provider = (modelName.includes('llama') || modelName.includes('mixtral')) ? 'groq' : 'google';
        try {
            console.log(`${logPrefix} Trying ${modelName}...`);
            let result = null;
            if (provider === 'google') result = await withTimeout(tryGoogle({ modelName, prompt, isJson, temp }), timeout);
            else if (provider === 'groq') result = await withTimeout(tryGroq({ modelName, prompt, isJson, temp }), timeout);

            if (result) {
                logUsage(caller, modelName, Array.isArray(input) ? "messages" : "prompt");
                return result;
            }
        } catch (e) {
            console.warn(`${logPrefix} ⚠️ ${modelName} failed: ${e.message}`);
        }
    }
    return null;
}

async function tryGoogle({ modelName, prompt, isJson, temp }) {
    if (!process.env.GEMINI_API_KEY) throw new Error("No Gemini key");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: isJson ? "application/json" : "text/plain", temperature: temp } });
    const result = await model.generateContent(prompt);
    const parts = result.response.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(p => p.text);
    const text = textPart ? textPart.text : (result.response.text ? result.response.text() : "");
    return parseOutput(text, isJson);
}

async function tryGroq({ modelName, prompt, isJson, temp }) {
    if (!process.env.GROQ_API_KEY) throw new Error("No Groq key");
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName, messages: [{ role: "user", content: prompt }], temperature: temp })
    });
    if (!response.ok) throw new Error(`Groq ${response.status}`);
    const data = await response.json();
    return parseOutput(data.choices[0].message.content, isJson);
}

export function parseOutput(text, isJson) {
    if (!text) return null;
    let cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!isJson) return cleanText;
    try {
        let clean = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();
        const start = clean.indexOf('{') !== -1 ? clean.indexOf('{') : clean.indexOf('[');
        if (start !== -1) {
            const end = clean.lastIndexOf(clean[start] === '{' ? '}' : ']');
            if (end !== -1) return JSON.parse(clean.substring(start, end + 1));
        }
        return JSON.parse(clean);
    } catch (e) { return null; }
}
