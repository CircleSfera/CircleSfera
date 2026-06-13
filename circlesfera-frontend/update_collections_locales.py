import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

coll_en = en_data.get('collections', {})
coll_en.update({
    "new_collection": "New Collection",
    "collection_name": "Collection Name",
    "placeholder_name": "e.g. Travel, Recipes",
    "create": "Create Collection",
    "posts_count": "{{count}} posts",
    "saved_title": "Saved",
    "no_saved": "No saved posts yet",
    "no_saved_desc": "Save posts to view them later by tapping the bookmark icon."
})
en_data['collections'] = coll_en

coll_es = es_data.get('collections', {})
coll_es.update({
    "new_collection": "Nueva Colección",
    "collection_name": "Nombre de Colección",
    "placeholder_name": "ej. Viajes, Recetas",
    "create": "Crear Colección",
    "posts_count": "{{count}} posts",
    "saved_title": "Guardados",
    "no_saved": "Aún no hay posts guardados",
    "no_saved_desc": "Guarda posts para verlos más tarde tocando el icono de marcador."
})
es_data['collections'] = coll_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated collections locales.")
