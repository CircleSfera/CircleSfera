import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

creator_en = en_data.get('creator', {})
if 'dashboard' not in creator_en:
    creator_en['dashboard'] = {}
creator_en['dashboard'].update({
    "see_all": "See all",
    "content_performance": "Content Performance",
    "see_all_content": "See all content",
    "untitled_post": "Untitled post",
    "promote_post": "Promote post",
    "performance": "Performance",
    "vs_avg": "+{{score}}% vs Avg.",
    "studio_management": "Studio Management",
    "finance_earnings": "Finance & Earnings",
    "finance_desc": "Configure your payment methods and review your total income.",
    "ads_promotions": "Advertising & Ads",
    "ads_desc": "Create campaigns to promote your profile and reach more people.",
    "audience": "Audience",
    "retention": "Retention",
    "most_active_day": "Your audience is most active on {{day}}",
    "most_active_hour": "At {{hour}}:00 (Local)",
    "retention_chart_aria": "Retention chart: {{rate}}%"
})
en_data['creator'] = creator_en

creator_es = es_data.get('creator', {})
if 'dashboard' not in creator_es:
    creator_es['dashboard'] = {}
creator_es['dashboard'].update({
    "see_all": "Ver todo",
    "content_performance": "Rendimiento del Contenido",
    "see_all_content": "Ver todo el contenido",
    "untitled_post": "Publicación sin título",
    "promote_post": "Promocionar post",
    "performance": "Performance",
    "vs_avg": "+{{score}}% vs Avg.",
    "studio_management": "Gestión del Estudio",
    "finance_earnings": "Finanzas & Ganancias",
    "finance_desc": "Configura tus métodos de pago y revisa tus ingresos totales.",
    "ads_promotions": "Publicidad & Ads",
    "ads_desc": "Crea campañas para promocionar tu perfil y llegar a más gente.",
    "audience": "Audiencia",
    "retention": "Retención",
    "most_active_day": "Tu audiencia es más activa los {{day}}",
    "most_active_hour": "A las {{hour}}:00 (Local)",
    "retention_chart_aria": "Gráfico circular de retención de audiencia: {{rate}}%"
})
es_data['creator'] = creator_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated creator dashboard locales.")
