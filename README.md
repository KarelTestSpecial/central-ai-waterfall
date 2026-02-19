# AI Waterfall Module

A robust, portable AI content generation module that implements a fallback "waterfall" strategy across multiple providers.

## Features
- **Waterfall Strategy**: Automatically tries the next model in the sequence if the current one fails (e.g., rate limits, server errors).
- **Multi-Provider Support**:
    - Google Gemini (with Gemini 3.0 Thought Signature support)
    - Groq
    - OpenRouter
    - Hugging Face
- **JSON Extraction**: Intelligent parsing of JSON from AI responses, stripping markdown blocks and "thinking" tags.
- **Configurable**: Define your model sequence and settings in `ai-models.json`.

## Installation

1. Ensure you have `pnpm` installed.
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Set up your `.env` file with the following keys:
   ```env
   GEMINI_API_KEY=your_key
   GROQ_API_KEY=your_key
   OPENROUTER_API_KEY=your_key
   HF_TOKEN=your_token
   ```

## Usage

```javascript
import { generateWithAI } from './index.js';

const prompt = "Generate a list of 3 fruit names in JSON format.";
const result = await generateWithAI(prompt, { isJson: true });

console.log(result);
```

## Testing

Run the included test script:
```bash
node test-ai.js
```

## Files
- `index.js`: The core engine logic.
- `ai-models.json`: Configuration of models and sequences.
- `.env`: API keys and secrets.
- `package.json`: Dependency management.
