import json
import requests
import os
from pathlib import Path

# Configuratie
CONFIG_PATH = Path("/home/kareltestspecial/KDC/central-ai-waterfall/ai-models.json")
OR_API_KEY = os.getenv("OPENROUTER_API_KEY")

def fetch_free_models():
    print("🔍 Ophalen van gratis OpenRouter modellen...")
    try:
        response = requests.get("https://openrouter.ai/api/v1/models")
        if response.status_code == 200:
            models = response.json().get('data', [])
            # Filter op modellen die gratis zijn (:free in de ID)
            free_models = [m['id'] for m in models if ':free' in m['id']]
            return free_models
    except Exception as e:
        print(f"❌ Fout bij ophalen modellen: {e}")
    return []

def update_config():
    if not CONFIG_PATH.exists():
        print("❌ ai-models.json niet gevonden!")
        return

    with open(CONFIG_PATH, 'r') as f:
        config = json.load(f)

    # 1. Update Gemini Modellen (gebaseerd op GEMINI.md mandate feb 2026)
    config["google-1"] = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-2.5-pro"
    ]
    config["google-2"] = [
        "gemini-3-flash-preview",
        "gemini-2.0-flash-lite",
        "gemini-2.5-flash-preview-09-2025"
    ]

    # 2. Update OpenRouter Gratis Modellen
    free_models = fetch_free_models()
    if free_models:
        # Verdeel over stacks
        config["openrouter-1"] = [m for m in free_models if "gemini" in m or "qwen" in m or "deepseek" in m][:5]
        config["openrouter-2"] = [m for m in free_models if m not in config["openrouter-1"]][:10]
        print(f"✅ {len(free_models)} gratis modellen gevonden en toegevoegd.")
    else:
        print("⚠️ Geen nieuwe gratis modellen gevonden, behoud huidige lijst.")

    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f, indent=4)
    
    print("🚀 ai-models.json is succesvol bijgewerkt!")

if __name__ == "__main__":
    update_config()
