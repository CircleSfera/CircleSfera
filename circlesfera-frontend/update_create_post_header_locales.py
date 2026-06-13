import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['createPost']['header'] = {
    "add_to_story": "Add to Story",
    "new_frame": "New Frame",
    "new_post": "New Post",
    "share": "Share",
    "next": "Next"
}

es_data['createPost']['header'] = {
    "add_to_story": "Añadir a Historia",
    "new_frame": "Nuevo Frame",
    "new_post": "Nueva Publicación",
    "share": "Compartir",
    "next": "Siguiente"
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated create post header locales.")
