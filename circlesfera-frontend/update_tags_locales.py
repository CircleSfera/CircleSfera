import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['createPost']['tags'] = {
    "title": "Tag People",
    "tap_photo": "Tap photo to tag people",
    "search_user": "Search user...",
    "searching": "Searching...",
    "no_users": "No users found",
    "type_to_search": "Type to search",
    "unsupported": "Tagging is only supported on images.",
    "done": "Done",
    "tags_on_photo": "Tags on this photo",
    "no_tags_yet": "No tags yet. Tap the photo to add tags."
}

es_data['createPost']['tags'] = {
    "title": "Etiquetar Personas",
    "tap_photo": "Toca la foto para etiquetar",
    "search_user": "Buscar usuario...",
    "searching": "Buscando...",
    "no_users": "No se encontraron usuarios",
    "type_to_search": "Escribe para buscar",
    "unsupported": "El etiquetado solo es compatible con imágenes.",
    "done": "Listo",
    "tags_on_photo": "Etiquetas en esta foto",
    "no_tags_yet": "Aún no hay etiquetas. Toca la foto para añadirlas."
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated tags locales.")
