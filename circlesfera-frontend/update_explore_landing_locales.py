import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

exp_en = en_data.get('explore', {})
if 'landing' not in exp_en:
    exp_en['landing'] = {}
exp_en['landing'].update({
    "title": "Explore CircleSfera - The Next Generation Social Network",
    "desc": "Discover the features, philosophy, and tools behind CircleSfera. Built for authentic connection and visual excellence.",
    "the_platform": "The Platform",
    "discover_new": "Discover a New",
    "dimension": "Dimension of Social",
    "intro_text": "CircleSfera is more than an app. It's a sanctuary for visual storytelling, authentic connections, and digital sovereignty. Step away from the noise and explore depth.",
    "feat1_title": "Visual Depth & Clarity",
    "feat1_desc": "Experience content without compressions that ruin your art. CircleSfera is built to honor the cinematic quality of your vision.",
    "feat2_title": "AI-Powered Discovery",
    "feat2_desc": "Our proprietary Semantic AI Engine understands the context and emotion behind your content, matching it with audiences who truly care.",
    "feat3_title": "Privacy by Design",
    "feat3_desc": "You control the narrative. Use Private Circles to share intimate moments, or broadcast to the entire network when you are ready.",
    "feat4_title": "Built for Creators",
    "feat4_desc": "Integrated monetization, elite analytics, and verified tiers. We provide the tools you need to build a sustainable digital career.",
    "join_title": "Join thousands of creators shaping the future.",
    "join_desc": "The next generation of the internet belongs to those who create. Claim your username and start building your legacy today.",
    "create_account": "Create Your Account",
    "view_monetization": "View Monetization"
})
en_data['explore'] = exp_en

# Added footer locales to common for use in landing pages
common_en = en_data.get('common', {})
if 'footer' not in common_en:
    common_en['footer'] = {}
common_en['footer'].update({
    "desc": "A refined social layer built for those who value visual depth and authentic connection.",
    "platform": "Platform",
    "explore": "Explore",
    "login": "Log In",
    "signup": "Sign Up",
    "legal": "Legal",
    "privacy": "Privacy",
    "terms": "Terms",
    "guidelines": "Guidelines",
    "copyright": "© 2026 CircleSfera Social. All rights reserved.",
    "designed_for": "Designed for the next generation of creators."
})
en_data['common'] = common_en

exp_es = es_data.get('explore', {})
if 'landing' not in exp_es:
    exp_es['landing'] = {}
exp_es['landing'].update({
    "title": "Explora CircleSfera - La Red Social de Próxima Generación",
    "desc": "Descubre las funciones, la filosofía y las herramientas detrás de CircleSfera. Construido para conexiones auténticas y excelencia visual.",
    "the_platform": "La Plataforma",
    "discover_new": "Descubre una Nueva",
    "dimension": "Dimensión de lo Social",
    "intro_text": "CircleSfera es más que una app. Es un santuario para la narrativa visual, conexiones auténticas y soberanía digital. Aléjate del ruido y explora la profundidad.",
    "feat1_title": "Profundidad y Claridad Visual",
    "feat1_desc": "Experimenta el contenido sin compresiones que arruinan tu arte. CircleSfera está construido para honrar la calidad cinematográfica de tu visión.",
    "feat2_title": "Descubrimiento con IA",
    "feat2_desc": "Nuestro Motor Semántico de IA entiende el contexto y la emoción detrás de tu contenido, conectándolo con audiencias a las que realmente les importa.",
    "feat3_title": "Privacidad por Diseño",
    "feat3_desc": "Tú controlas la narrativa. Usa Círculos Privados para compartir momentos íntimos, o transmite a toda la red cuando estés listo.",
    "feat4_title": "Construido para Creadores",
    "feat4_desc": "Monetización integrada, analíticas de élite y niveles de verificación. Te brindamos las herramientas que necesitas para construir una carrera digital sostenible.",
    "join_title": "Únete a miles de creadores dando forma al futuro.",
    "join_desc": "La próxima generación de internet pertenece a los que crean. Reclama tu nombre de usuario y comienza a construir tu legado hoy.",
    "create_account": "Crea tu Cuenta",
    "view_monetization": "Ver Monetización"
})
es_data['explore'] = exp_es

common_es = es_data.get('common', {})
if 'footer' not in common_es:
    common_es['footer'] = {}
common_es['footer'].update({
    "desc": "Una capa social refinada construida para quienes valoran la profundidad visual y la conexión auténtica.",
    "platform": "Plataforma",
    "explore": "Explorar",
    "login": "Iniciar Sesión",
    "signup": "Registrarse",
    "legal": "Legal",
    "privacy": "Privacidad",
    "terms": "Términos",
    "guidelines": "Directrices",
    "copyright": "© 2026 CircleSfera Social. Todos los derechos reservados.",
    "designed_for": "Diseñado para la próxima generación de creadores."
})
es_data['common'] = common_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated explore landing locales.")
