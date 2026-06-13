import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['createPost'] = {
    "accessibility": {
        "title": "Accessibility",
        "subtitle": "Optimize for screen readers",
        "done": "Done",
        "info": "\"Alt text describes your photos for people with visual impairments. CircleSfera can help you generate them using our proprietary AI.\"",
        "placeholder": "Write alt text...",
        "generating": "Generating...",
        "magic_ai": "Magic AI"
    }
}

es_data['createPost'] = {
    "accessibility": {
        "title": "Accesibilidad",
        "subtitle": "Optimiza para lectores de pantalla",
        "done": "Listo",
        "info": "\"El texto alternativo describe tus fotos para personas con discapacidad visual. CircleSfera puede ayudarte a generarlos usando nuestra IA propietaria.\"",
        "placeholder": "Escribe el texto alternativo...",
        "generating": "Generando...",
        "magic_ai": "IA Mágica"
    }
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated create post locales.")
