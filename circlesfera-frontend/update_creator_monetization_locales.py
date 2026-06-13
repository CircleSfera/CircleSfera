import json

en_path = './src/locales/en.json'
es_path = './src/locales/es.json'

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(es_path, 'r', encoding='utf-8') as f:
    es_data = json.load(f)

creator_en = en_data.get('creator', {})
if 'monetization' not in creator_en:
    creator_en['monetization'] = {}
creator_en['monetization'].update({
    "error_checkout": "Error starting checkout",
    "error_portal": "Error accessing portal",
    "loading_plans": "Loading plans...",
    "subscription_status": "Subscription Status",
    "current_plan": "Current Plan",
    "select_plan_start": "Select a plan below to start.",
    "manage_subscription": "Manage Subscription",
    "active": "Active",
    "per_month": "/ month",
    "per_year": "/ year",
    "upgrade_now": "Upgrade Now",
    "growth_analytics": "Growth Analytics",
    "growth_desc": "Discover interaction patterns and optimize your reach with our proprietary AI tools.",
    "vip_community": "VIP Community",
    "vip_desc": "Exclusive access to circles of other certified creators and priority in global discovery."
})
en_data['creator'] = creator_en

creator_es = es_data.get('creator', {})
if 'monetization' not in creator_es:
    creator_es['monetization'] = {}
creator_es['monetization'].update({
    "error_checkout": "Error al iniciar el pago",
    "error_portal": "Error al acceder al portal",
    "loading_plans": "Cargando planes...",
    "subscription_status": "Estatus de Suscripción",
    "current_plan": "Plan Actual",
    "select_plan_start": "Selecciona un plan abajo para comenzar.",
    "manage_subscription": "Gestionar Suscripción",
    "active": "Activo",
    "per_month": "/ mes",
    "per_year": "/ año",
    "upgrade_now": "Mejorar Ahora",
    "growth_analytics": "Analíticas de Crecimiento",
    "growth_desc": "Descubre patrones de interacción y optimiza tu alcance con nuestras herramientas de IA propietarias.",
    "vip_community": "Comunidad VIP",
    "vip_desc": "Acceso exclusivo a círculos de otros creadores certificados y prioridad en el descubrimiento global."
})
es_data['creator'] = creator_es

with open(en_path, 'w', encoding='utf-8') as f:
    json.dump(en_data, f, indent=2, ensure_ascii=False)

with open(es_path, 'w', encoding='utf-8') as f:
    json.dump(es_data, f, indent=2, ensure_ascii=False)

print("Updated creator monetization locales.")
