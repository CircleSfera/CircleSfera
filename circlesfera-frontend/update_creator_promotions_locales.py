import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

creator_en = en_data.get('creator', {})
if 'promotions' not in creator_en:
    creator_en['promotions'] = {}
creator_en['promotions'].update({
    "created": "Promotion created",
    "error_create": "Error creating promotion",
    "select_content": "Select Content",
    "configure_reach": "Configure Reach",
    "boost_best": "Boost your best content",
    "untitled": "Untitled",
    "no_posts": "No posts available",
    "selected_post": "Selected post",
    "change_post": "Change post",
    "daily_budget": "Daily Budget ({{currency}})",
    "campaign_duration": "Campaign Duration",
    "days": "{{count}} Days",
    "processing": "Processing...",
    "boost_total": "Boost for {{currency}}{{total}} total",
    "center": "Advertising Center",
    "marketing": "Performance Marketing for Creators",
    "new_campaign": "New Campaign",
    "no_active": "No active campaigns",
    "boost_desc": "Boost your best posts to reach thousands of new people and multiply your followers.",
    "create_first": "Create my first campaign",
    "in_progress": "In Progress ({{count}})",
    "campaign": "{{type}} Campaign",
    "started_on": "Started on {{date}}",
    "investment": "Investment",
    "total_reach": "Total Reach",
    "plan_execution": "Plan Execution",
    "days_left": "{{count}} Days Left",
    "confirm": "Confirm",
    "no": "No",
    "stop": "Stop",
    "completed_history": "Campaign History ({{count}})",
    "completed_campaign": "Completed Campaign",
    "total": "Total",
    "finished": "Promotion finished",
    "error_cancel": "Error cancelling",
    "restarted": "Campaign restarted",
    "error_repeat": "Error repeating"
})
en_data['creator'] = creator_en

creator_es = es_data.get('creator', {})
if 'promotions' not in creator_es:
    creator_es['promotions'] = {}
creator_es['promotions'].update({
    "created": "Promoción creada",
    "error_create": "Error al crear promoción",
    "select_content": "Seleccionar Contenido",
    "configure_reach": "Configurar Alcance",
    "boost_best": "Impulsa tu mejor contenido",
    "untitled": "Sin título",
    "no_posts": "No hay publicaciones disponibles",
    "selected_post": "Publicación seleccionada",
    "change_post": "Cambiar publicación",
    "daily_budget": "Presupuesto Diario ({{currency}})",
    "campaign_duration": "Duración de Campaña",
    "days": "{{count}} Días",
    "processing": "Procesando...",
    "boost_total": "Impulsar por {{currency}}{{total}} total",
    "center": "Centro de Publicidad",
    "marketing": "Performance Marketing para Creadores",
    "new_campaign": "Nueva Campaña",
    "no_active": "Sin campañas activas",
    "boost_desc": "Impulsa tus mejores publicaciones para llegar a miles de personas nuevas y multiplicar tus seguidores.",
    "create_first": "Crear mi primera campaña",
    "in_progress": "En Curso ({{count}})",
    "campaign": "Campaña {{type}}",
    "started_on": "Iniciada el {{date}}",
    "investment": "Inversión",
    "total_reach": "Alcance Total",
    "plan_execution": "Ejecución del Plan",
    "days_left": "{{count}} Días Restantes",
    "confirm": "Confirmar",
    "no": "No",
    "stop": "Detener",
    "completed_history": "Histórico de Campañas ({{count}})",
    "completed_campaign": "Campaña Finalizada",
    "total": "Totales",
    "finished": "Promoción finalizada",
    "error_cancel": "Error al cancelar",
    "restarted": "Campaña reiniciada",
    "error_repeat": "Error al repetir"
})
es_data['creator'] = creator_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated creator promotions locales.")
