import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

let config = {
    "google-1": [], "google-2": [], "google-3": [],
    "openrouter-1": [], "openrouter-2": [], "openrouter-3": [],
    "groq": [], "huggingface": [],
    "settings": { "temperature": 0.7, "timeout_ms": 30000 }
};

const EXHAUSTED_PROVIDERS = new Map(); // Track 429s
const USAGE_LOG_PATH = path.resolve(__dirname, 'usage.log');

try {
    const configPath = path.resolve(__dirname, 'ai-models.json');
    if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
} catch (e) {
    console.warn(`[AI-WATERFALL] Could not load config: ${e.message}`);
}

/**
 * Logs usage to a central file.
 */
function logUsage(caller, model, inputType) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} | Project: ${caller || 'unknown'} | Model: ${model} | Type: ${inputType}\n`;
    try {
        fs.appendFileSync(USAGE_LOG_PATH, logEntry);
    } catch (e) {
        console.error(`[AI-WATERFALL] Failed to write to log: ${e.message}`);
    }
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

export async function generateWithAI(input, { isJson = true, modelStack = null, temp = config.settings.temperature, caller = 'anonymous' } = {}) {
    const logPrefix = `[AI-WATERFALL]`;
    const timeout = config.settings.timeout_ms || 30000;

    // Convert input to string prompt if it's an array (messages)
    let prompt = "";
    let inputType = "prompt";
    if (Array.isArray(input)) {
        inputType = "messages";
        prompt = input.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
    } else {
        prompt = input;
    }

    let sequence = [];
    if (modelStack) {
        sequence = typeof modelStack === 'string' ? modelStack.split(',').map(m => m.trim()) : modelStack;
    } else {
        sequence = [
            ...(config["google-1"] || []),
            ...(config.groq || []),
            ...(config["openrouter-1"] || []),
            ...(config["google-2"] || []),
            ...(config["openrouter-2"] || []),
            ...(config.huggingface || [])
        ];
    }

    // Add an emergency safety stack at the end
    const safetyStack = [
        "llama-3.3-70b-versatile", "qwen/qwen-2.5-72b-instruct:free", 
        "google/gemini-2.0-flash-001", "mistralai/mistral-7b-instruct:free"
    ];
    sequence = [...new Set([...sequence, ...safetyStack])];

    let lastError = null;
    
    for (const [index, modelName] of sequence.entries()) {
        const provider = getProvider(modelName);
        
        // Skip provider if it gave a 429 recently (10 min lockout)
        if (EXHAUSTED_PROVIDERS.has(provider)) {
            const lockoutTime = EXHAUSTED_PROVIDERS.get(provider);
            if (Date.now() < lockoutTime) {
                console.log(`${logPrefix} Skipping ${provider} (Quota exhausted until ${new Date(lockoutTime).toLocaleTimeString()})`);
                continue;
            } else {
                EXHAUSTED_PROVIDERS.delete(provider);
            }
        }

        try {
            console.log(`${logPrefix} [${index + 1}/${sequence.length}] Trying ${modelName} for ${caller}...`);
            let result = null;
            const options = { modelName, prompt, isJson, temp };

            if (provider === 'groq') result = await withTimeout(tryGroq(options), timeout);
            else if (provider === 'google') result = await withTimeout(tryGoogle(options), timeout);
            else if (provider === 'openrouter') result = await withTimeout(tryOpenRouter(options), timeout);
            else if (provider === 'huggingface') result = await withTimeout(tryHuggingFace(options), timeout);

            if (result) {
                logUsage(caller, modelName, inputType);
                return result;
            }
        } catch (e) {
            lastError = e;
            console.warn(`${logPrefix} ⚠️ ${modelName} failed: ${e.message.substring(0, 150)}`);
            
            if (e.message.includes('429') || e.message.includes('Quota')) {
                console.error(`${logPrefix} !!! QUOTA EXHAUSTED FOR ${provider.toUpperCase()} !!!`);
                EXHAUSTED_PROVIDERS.set(provider, Date.now() + 10 * 60 * 1000); // 10 min lockout
            }
        }
    }

    return null;
}

function getProvider(modelName) {
    if (config.groq?.includes(modelName)) return 'groq';
    if (config["google-1"]?.includes(modelName) || config["google-2"]?.includes(modelName) || config["google-3"]?.includes(modelName) || (!modelName.includes('/') && !modelName.includes(':'))) return 'google';
    if (config["openrouter-1"]?.includes(modelName) || config["openrouter-2"]?.includes(modelName) || config["openrouter-3"]?.includes(modelName) || modelName.includes(':')) return 'openrouter';
    return 'huggingface';
}

async function tryGoogle({ modelName, prompt, isJson, temp }) {
    if (!process.env.GEMINI_API_KEY) throw new Error("No Gemini key");
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { responseMimeType: isJson ? "application/json" : "text/plain", temperature: temp }
    });
    const result = await model.generateContent(prompt);
    const parts = result.response.candidates?.[0]?.content?.parts || [];
    const textPart = parts.find(p => p.text);
    return parseOutput(textPart ? textPart.text : result.response.text(), isJson);
}

async function tryGroq({ modelName, prompt, isJson, temp }) {
    if (!process.env.GROQ_API_KEY) throw new Error("No Groq key");
    const body = {
        model: modelName,
        messages: [{ role: "user", content: prompt }],
        temperature: temp
    };
    if (isJson && (modelName.includes('70b') || modelName.includes('32b'))) {
        body.response_format = { type: "json_object" };
    }
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Groq ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return parseOutput(data.choices[0].message.content, isJson);
}

async function tryOpenRouter({ modelName, prompt, isJson, temp }) {
    if (!process.env.OPENROUTER_API_KEY) throw new Error("No OR key");
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "X-Title": "KarelsAssistant" },
        body: JSON.stringify({
            model: modelName,
            messages: [{ role: "user", content: prompt }],
            temperature: temp
        })
    });
    if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return parseOutput(data.choices[0].message.content, isJson);
}

async function tryHuggingFace({ modelName, prompt, isJson, temp }) {
    if (!process.env.HF_TOKEN) throw new Error("No HF token");
    const response = await fetch(`https://api-inference.huggingface.co/models/${modelName}`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${process.env.HF_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ inputs: prompt, parameters: { temperature: temp } })
    });
    if (!response.ok) throw new Error(`HF ${response.status}`);
    const data = await response.json();
    const text = Array.isArray(data) ? data[0].generated_text : data.generated_text;
    return parseOutput(text, isJson);
}

export function parseOutput(text, isJson) {
    if (!text) return null;
    let cleanText = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (!isJson) return cleanText;
    try {
        let clean = cleanText.replace(/```json/g, '').replace(/```/g, '').trim();
        const startObj = clean.indexOf('{');
        const startArr = clean.indexOf('[');
        const start = (startObj !== -1 && (startArr === -1 || startObj < startArr)) ? startObj : startArr;
        if (start !== -1) {
            const end = clean.lastIndexOf(clean[start] === '{' ? '}' : ']');
            if (end !== -1) return JSON.parse(clean.substring(start, end + 1));
        }
        return JSON.parse(clean);
    } catch (e) { return null; }
}
