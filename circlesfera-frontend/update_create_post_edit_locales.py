import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['createPost']['edit'] = {
    "edit_media": "Edit Media",
    "filters_adjustments": "Filters & Adjustments",
    "n_files": "{{count}} files",
    "post": "Post",
    "story": "Story",
    "frame": "Frame"
}

es_data['createPost']['edit'] = {
    "edit_media": "Editar Medio",
    "filters_adjustments": "Filtros y Ajustes",
    "n_files": "{{count}} archivos",
    "post": "Post",
    "story": "Historia",
    "frame": "Frame"
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated create post edit locales.")
