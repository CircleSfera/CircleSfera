import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['createPost']['location'] = {
    "title": "Add Location",
    "search": "Find a location...",
    "use_current": "Use Current Location",
    "suggested": "Suggested Location",
    "not_found": "No locations found",
    "try_different": "Try searching for a different city or region."
}

es_data['createPost']['location'] = {
    "title": "Añadir Ubicación",
    "search": "Buscar ubicación...",
    "use_current": "Usar Ubicación Actual",
    "suggested": "Ubicación Sugerida",
    "not_found": "No se encontraron ubicaciones",
    "try_different": "Intenta buscar una ciudad o región diferente."
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated location locales.")
