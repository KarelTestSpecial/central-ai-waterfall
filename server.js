import express from 'express';
import cors from 'cors';
import { generateWithAI } from './index.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPort } from './port-registry-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();

// ... existing endpoints (generate, completions, health) ...

const startServer = async () => {
    // Request port from central registry
    const PORT = await getPort('central-ai-waterfall', {
        project: 'karelsassistant',
        description: 'Gecentraliseerde AI Waterfall Service',
        preferredPort: 5005,
        fallback: 5005
    });

    app.use(cors());
    app.use(express.json());

    app.post('/generate', async (req, res) => {
        try {
            const { prompt, isJson, modelStack, temp, caller } = req.body;
            
            if (!prompt) {
                return res.status(400).json({ error: "Prompt is required" });
            }

            const projectCaller = caller || req.headers['x-project-id'] || 'unknown';
            console.log(`[AI-SERVICE] Request from ${projectCaller}. Prompt length: ${prompt.length}`);
            
            const result = await generateWithAI(prompt, { 
                isJson: isJson !== undefined ? isJson : true,
                modelStack,
                temp,
                caller: projectCaller
            });

            if (result) {
                res.json({ success: true, data: result });
            } else {
                res.status(502).json({ success: false, error: "All AI models failed." });
            }
        } catch (error) {
            console.error("[AI-SERVICE] Error:", error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // OpenAI Compatible Endpoint
    app.post('/v1/chat/completions', async (req, res) => {
        try {
            const { messages, model, temperature, stream } = req.body;
            
            if (!messages || !Array.isArray(messages)) {
                return res.status(400).json({ error: "Messages array is required" });
            }

            // Try to get project name from Authorization header or X-Project-ID
            let projectCaller = req.headers['x-project-id'];
            if (!projectCaller && req.headers['authorization']) {
                const auth = req.headers['authorization'];
                if (auth.startsWith('Bearer ')) {
                    projectCaller = auth.substring(7); // Use the "API Key" as caller name
                }
            }
            if (!projectCaller) projectCaller = 'openai-client';

            console.log(`[AI-SERVICE] OpenAI-style request from ${projectCaller} using model ${model}`);

            if (stream) {
                return res.status(400).json({ error: "Streaming not supported in waterfall yet." });
            }

            const result = await generateWithAI(messages, { 
                isJson: false, // Usually chat completions are text, unless specified in prompt
                modelStack: model ? [model] : null,
                temp: temperature,
                caller: projectCaller
            });

            if (result) {
                // Format response as OpenAI completion
                res.json({
                    id: `chatcmpl-${Date.now()}`,
                    object: "chat.completion",
                    created: Math.floor(Date.now() / 1000),
                    model: model || "waterfall-default",
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: "assistant",
                                content: typeof result === 'string' ? result : JSON.stringify(result)
                            },
                            finish_reason: "stop"
                        }
                    ],
                    usage: {
                        prompt_tokens: -1,
                        completion_tokens: -1,
                        total_tokens: -1
                    }
                });
            } else {
                res.status(502).json({ success: false, error: "All AI models failed." });
            }
        } catch (error) {
            console.error("[AI-SERVICE] OpenAI Error:", error);
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.get('/health', (req, res) => {
        res.json({ status: "ok", service: "ai-waterfall" });
    });

    app.listen(PORT, () => {
        console.log(`[AI-SERVICE] Running on http://localhost:${PORT}`);
    });
};

startServer().catch(err => {
    console.error("Failed to start AI Waterfall:", err);
    process.exit(1);
});
