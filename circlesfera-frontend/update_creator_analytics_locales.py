import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

creator_en = en_data.get('creator', {})
if 'analytics' not in creator_en:
    creator_en['analytics'] = {}
creator_en['analytics'].update({
    "audience_evolution": "Audience Evolution",
    "views": "Views",
    "followers": "Followers",
    "not_enough_data": "Not enough data yet",
    "upload_content": "Upload content to start measuring your audience."
})
en_data['creator'] = creator_en

creator_es = es_data.get('creator', {})
if 'analytics' not in creator_es:
    creator_es['analytics'] = {}
creator_es['analytics'].update({
    "audience_evolution": "Evolución de Audiencia",
    "views": "Vistas",
    "followers": "Seguidores",
    "not_enough_data": "No hay suficientes datos aún",
    "upload_content": "Sube contenido para empezar a medir tu audiencia."
})
es_data['creator'] = creator_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated creator analytics locales.")
