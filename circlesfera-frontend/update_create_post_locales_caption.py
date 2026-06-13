import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['createPost']['caption'] = {
    "add_location": "Add Location",
    "tag_people": "Tag People",
    "accessibility": "Accessibility",
    "advanced_settings": "Advanced Settings",
    "add_music": "Add Music",
    "write_caption": "Write a caption...",
    "you": "You",
    "hide_like_view": "Hide like and view counts",
    "hide_like_view_desc": "Only you will see the total number of likes and views on this post.",
    "turn_off_comments": "Turn off commenting",
    "turn_off_comments_desc": "You can change this later by going to the ... menu at the top of your post."
}

es_data['createPost']['caption'] = {
    "add_location": "Añadir Ubicación",
    "tag_people": "Etiquetar Personas",
    "accessibility": "Accesibilidad",
    "advanced_settings": "Ajustes Avanzados",
    "add_music": "Añadir Música",
    "write_caption": "Escribe una descripción...",
    "you": "Tú",
    "hide_like_view": "Ocultar recuento de me gusta y visualizaciones",
    "hide_like_view_desc": "Solo tú verás el número total de me gusta y visualizaciones en esta publicación.",
    "turn_off_comments": "Desactivar comentarios",
    "turn_off_comments_desc": "Puedes cambiar esto más tarde en el menú ... en la parte superior de tu publicación."
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated create post locales (caption/advanced).")
