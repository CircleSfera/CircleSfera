import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

en_data['feed'] = {
    "home_title": "Home",
    "brand_name": "CircleSfera",
    "no_posts": "No posts yet. Explore to find creators!"
}

en_data['explore'] = {
    "page_title": "Explore the Universe",
    "page_desc": "Discover trending posts, local creators, and use our AI-powered search to find exactly what you're looking for on CircleSfera.",
    "heading": "Explore",
    "search_placeholder": "Search users, #tags, or described content...",
    "searching": "Searching...",
    "smart_search": "Smart Search",
    "beta_ai": "Beta AI",
    "conceptual_match": "CONCEPTUAL MATCH",
    "no_conceptual_matches": "No conceptual matches found for this query...",
    "people": "People",
    "followed_by": "Followed by",
    "trending_topics": "Trending Topics",
    "no_people_found": "No people found",
    "no_tags_found": "No tags found",
    "no_results": "No results found for",
    "recent_searches": "Recent Searches",
    "clear_all": "Clear All",
    "no_recent_searches": "No recent searches",
    "for_you": "For You",
    "trending": "Trending",
    "discover_content": "Discover new content here based on your tastes."
}

es_data['feed'] = {
    "home_title": "Inicio",
    "brand_name": "CircleSfera",
    "no_posts": "Todavía no hay publicaciones. ¡Explora para encontrar creadores!"
}

es_data['explore'] = {
    "page_title": "Explora el Universo",
    "page_desc": "Descubre publicaciones en tendencia, creadores locales y usa nuestra búsqueda impulsada por IA para encontrar exactamente lo que buscas en CircleSfera.",
    "heading": "Explorar",
    "search_placeholder": "Busca usuarios, #etiquetas o contenido descrito...",
    "searching": "Buscando...",
    "smart_search": "Búsqueda Inteligente",
    "beta_ai": "Beta AI",
    "conceptual_match": "COINCIDENCIA CONCEPTUAL",
    "no_conceptual_matches": "No se encontraron coincidencias conceptuales para esta búsqueda...",
    "people": "Personas",
    "followed_by": "Seguido por",
    "trending_topics": "Temas en Tendencia",
    "no_people_found": "No se encontraron personas",
    "no_tags_found": "No se encontraron etiquetas",
    "no_results": "No se encontraron resultados para",
    "recent_searches": "Búsquedas Recientes",
    "clear_all": "Borrar Todo",
    "no_recent_searches": "No hay búsquedas recientes",
    "for_you": "Para Ti",
    "trending": "Trending",
    "discover_content": "Descubre contenido nuevo aquí basado en tus gustos."
}

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated feed and explore translations.")
