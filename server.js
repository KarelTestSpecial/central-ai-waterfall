import express from 'express';
import cors from 'cors';
import { generateWithAI, getSequence, getExhaustedProviders, getConfig } from './index.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getPort } from './port-registry-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/generate', async (req, res) => {
    try {
        const { prompt, isJson, modelStack, temp, caller } = req.body;
        const result = await generateWithAI(prompt, { isJson, modelStack, temp, caller });
        if (result) res.json({ success: true, data: result });
        else res.status(502).json({ success: false, error: "All AI models failed." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/v1/chat/completions', async (req, res) => {
    try {
        const { messages, model, temperature, stream } = req.body;
        if (stream) console.log("[AI-SERVICE] Streaming requested but not supported.");
        const result = await generateWithAI(messages, { isJson: false, modelStack: model ? [model] : null, temp: temperature });
        if (result) {
            res.json({
                id: `chatcmpl-${Date.now()}`,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model: model || "waterfall",
                choices: [{ index: 0, message: { role: "assistant", content: typeof result === 'string' ? result : JSON.stringify(result) }, finish_reason: "stop" }],
                usage: { prompt_tokens: -1, completion_tokens: -1, total_tokens: -1 }
            });
        } else {
            res.status(502).json({ success: false, error: "All AI models failed." });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

const USAGE_LOG_PATH = path.resolve(__dirname, 'usage.log');

// --- Dashboard API ---

app.get('/api/status', (req, res) => {
    const sequence = getSequence();
    const exhausted = getExhaustedProviders();
    const config = getConfig();
    
    // Simpele statistiek: tel regels in log
    let totalRequests = 0;
    try {
        if (fs.existsSync(USAGE_LOG_PATH)) {
            const content = fs.readFileSync(USAGE_LOG_PATH, 'utf8');
            totalRequests = content.split('\n').filter(line => line.trim()).length;
        }
    } catch (e) {}

    res.json({
        sequence,
        exhausted,
        config,
        stats: {
            total: totalRequests,
            providers: 4 // Google, Groq, OpenRouter, HF
        }
    });
});

app.get('/api/logs', (req, res) => {
    try {
        if (fs.existsSync(USAGE_LOG_PATH)) {
            const content = fs.readFileSync(USAGE_LOG_PATH, 'utf8');
            const lines = content.split('\n').slice(-50).join('\n');
            return res.json({ logs: lines });
        }
        res.json({ logs: "Geen logs gevonden." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ... existing endpoints (generate, completions, health) ...

const startServer = async () => {
    // Request port from central registry
    const PORT = await getPort('central-ai-waterfall', {
        project: 'karelsassistant',
        description: 'Gecentraliseerde AI Waterfall Service',
        preferredPort: 5005,
        fallback: 5005
    });

    app.get('/health', (req, res) => {
        res.json({ status: "ok", service: "ai-waterfall" });
    });

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[AI-SERVICE] Running on http://0.0.0.0:${PORT}`);
    });
};

startServer().catch(err => {
    console.error("Failed to start AI Waterfall:", err);
    process.exit(1);
});
