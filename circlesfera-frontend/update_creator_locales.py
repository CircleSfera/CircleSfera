import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

creator_en = en_data.get('creator', {})
creator_en.update({
    "title": "Creator Panel",
    "subtitle": "Manage your content, finances and audience",
    "new_content": "New Content",
    "wallet": "My Wallet"
})
en_data['creator'] = creator_en

creator_es = es_data.get('creator', {})
creator_es.update({
    "title": "Panel de Creador",
    "subtitle": "Gestiona tu contenido, finanzas y audiencia",
    "new_content": "Nuevo Contenido",
    "wallet": "Mi Billetera"
})
es_data['creator'] = creator_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated creator locales.")
