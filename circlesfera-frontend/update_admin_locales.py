import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

admin_en = en_data.get('admin', {})
admin_en.update({
    "panel": "Admin Panel",
    "description": "CircleSfera Management and Moderation",
    "connected_as": "Connected as"
})
en_data['admin'] = admin_en

admin_es = es_data.get('admin', {})
admin_es.update({
    "panel": "Panel de Administración",
    "description": "Gestión y moderación de CircleSfera",
    "connected_as": "Conectado como"
})
es_data['admin'] = admin_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated admin locales.")
