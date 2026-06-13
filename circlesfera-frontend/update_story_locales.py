import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['createPost']['story'] = {
    "add_music": "Add Music",
    "close_friends": "Close Friends",
    "your_story": "Your Story"
}

es_data['createPost']['story'] = {
    "add_music": "Añadir Música",
    "close_friends": "Mejores Amigos",
    "your_story": "Tu Historia"
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated story locales.")
