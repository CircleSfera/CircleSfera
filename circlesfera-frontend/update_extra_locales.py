import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

# Suggestions
sugg_en = en_data.get('suggestions', {})
sugg_en.update({
    "suggested": "Suggested for you",
    "follow": "Follow",
    "title": "Suggested for you",
    "see_all": "See All"
})
en_data['suggestions'] = sugg_en

sugg_es = es_data.get('suggestions', {})
sugg_es.update({
    "suggested": "Sugerido para ti",
    "follow": "Seguir",
    "title": "Sugerencias para ti",
    "see_all": "Ver Todo"
})
es_data['suggestions'] = sugg_es

# Post menu/content
post_en = en_data.get('post', {})
if 'menu' not in post_en:
    post_en['menu'] = {}
post_en['menu'].update({
    "edit": "Edit",
    "delete": "Delete",
    "report": "Report",
    "save": "Save"
})
if 'content' not in post_en:
    post_en['content'] = {}
post_en['content'].update({
    "likes": "likes",
    "view_all_comments": "View all {{count}} comments"
})
en_data['post'] = post_en

post_es = es_data.get('post', {})
if 'menu' not in post_es:
    post_es['menu'] = {}
post_es['menu'].update({
    "edit": "Editar",
    "delete": "Eliminar",
    "report": "Reportar",
    "save": "Guardar"
})
if 'content' not in post_es:
    post_es['content'] = {}
post_es['content'].update({
    "likes": "me gusta",
    "view_all_comments": "Ver los {{count}} comentarios"
})
es_data['post'] = post_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated suggestions and post locales.")
