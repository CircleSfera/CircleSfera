import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

chat_en = en_data.get('chat', {})
chat_en.update({
    "new_message": "New Message",
    "creating": "Creating...",
    "to": "To:",
    "search_dots": "Search...",
    "name_group_optional": "Name your group (optional)",
    "no_account_found": "No account found.",
    "no_following": "No Following",
    "suggested": "Suggested"
})
en_data['chat'] = chat_en

chat_es = es_data.get('chat', {})
chat_es.update({
    "new_message": "Nuevo Mensaje",
    "creating": "Creando...",
    "to": "Para:",
    "search_dots": "Buscar...",
    "name_group_optional": "Nombra tu grupo (opcional)",
    "no_account_found": "No se encontró la cuenta.",
    "no_following": "No sigues a nadie",
    "suggested": "Sugeridos"
})
es_data['chat'] = chat_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated new chat locales.")
