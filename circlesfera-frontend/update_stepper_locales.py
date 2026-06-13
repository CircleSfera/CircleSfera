import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['createPost']['stepper'] = {
    "upload": "Upload",
    "edit": "Edit",
    "share": "Share"
}

es_data['createPost']['stepper'] = {
    "upload": "Subir",
    "edit": "Editar",
    "share": "Compartir"
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated create post stepper locales.")
