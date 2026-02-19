import { generateWithAI } from './index.js';

async function test() {
    console.log("🚀 Testing AI Waterfall System...");
    const prompt = "Please respond with a JSON object containing a short joke about a programmer.";
    
    const result = await generateWithAI(prompt, { isJson: true });
    
    if (result) {
        console.log("✅ Result received:");
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.error("❌ Failed to get a response from any model.");
    }
}

test();
