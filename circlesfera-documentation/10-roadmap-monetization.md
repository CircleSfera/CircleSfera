# Estrategia de Monetización y Economía de Creadores

Este documento detalla la estrategia operativa y técnica exclusiva para el apartado comercial de CircleSfera. La monetización se apoya en una integración robusta con **Stripe Connect**, lo que permite un entorno seguro, híbrido y libre de problemas de compliance.

---

## 1. Monetización: Tier Subscriptions y Pay-Per-View (PPV)

Habiendo solucionado los problemas de cumplimiento mediante la integración de Stripe Connect, la estrategia de monetización de CircleSfera se consolida en un modelo híbrido, predecible y transparente.

### Características del Modelo
- **Suscripciones de Plataforma / Creador:** Diferentes niveles (Tiers) que otorgan beneficios específicos.
- **Pay-Per-View (PPV):** Venta directa de contenido individual (ej. Stories privadas o Posts exclusivos) procesada de forma segura a través de Stripe Connect.
- **Insignias (Badges):** Los suscriptores reciben insignias visibles en sus perfiles y comentarios según su Tier de suscripción, incentivando el estatus social.

### Reglas de Acceso y Compliance
- **Un plan activo a la vez:** Como dicta el PRD principal, un usuario solo puede tener un Tier activo simultáneamente para evitar fraude o confusiones en facturación.
- **Disponibilidad de PPV (Lifetime Access vs Rental):** Definir políticas de caducidad para el PPV. Si un creador es baneado o borra el post, la plataforma debe conservar el contenido bloqueado únicamente para los compradores existentes o emitir reembolsos (*chargebacks*) automatizados para minimizar disputas en Stripe.
- **Trazabilidad (Ledger):** Todos los intentos, fallos, cobros y payouts deben registrarse en un log auditable.

---

## 2. Onboarding de Creadores y Payouts (Stripe Connect)

Para recibir dinero de Tiers y PPV, el creador pasa a ser un vendedor (Connected Account).

- **KYC y Alta (Onboarding):** Flujo obligatorio mediante Stripe Express/Custom para verificar la identidad del creador antes de poder habilitar Tiers o PPV.
- **Take Rate (Comisión de Plataforma):** Definición estricta de las comisiones en el Application Fee de Stripe (ej. 15% para la plataforma, 85% para el creador).
- **Payouts:** Los fondos se transfieren al balance de Stripe del creador. Se habilitará un calendario de pagos automático (ej. mensual/rolling de 7 días) o retiros manuales bajo umbrales mínimos, mitigando riesgos de fraude por cobros anticipados.

---

## 3. Creator Dashboard

El Dashboard es la herramienta operativa principal para que el creador convierta audiencia en suscriptores y compradores.

### Módulos Principales
- **Overview de Ingresos:** Ingreso Recurrente Mensual (MRR) por Tiers y total acumulado de ventas únicas (PPV).
- **Audience & Tiers:** Distribución geográfica, alcance, followers ganados y retención de suscriptores según la insignia adquirida.
- **Content Analytics:** Desglose de conversión comercial por pieza: impresiones, guardados, conversión a follow, **y conversión de post bloqueado a compra (PPV)**.

---

## 4. Sponsored Placements (Ubicaciones Patrocinadas)

Para impulsar el crecimiento orgánico de los creadores sin entrar en conflicto con normativas de manipulación de algoritmos, se implementarán **Sponsored Placements** (evitando estrictamente el término "Boost Content").

### Flujo de Publicidad Nativa (Creator to Platform)
A diferencia de Tiers/PPV (Fan-to-Creator), aquí el creador paga a CircleSfera. Se gestiona mediante un **Stripe PaymentIntent** directo:
1. El creador selecciona un post o frame ya publicado.
2. Pulsa en **Promocionar** y define un objetivo (Profile visits, Follows, Conversiones a Tier).
3. Define un presupuesto diario y segmentación básica (intereses, país).
4. El pago se cobra a la tarjeta del creador por adelantado (o retenido en su balance).
5. Las métricas de anuncio se consolidan en el Creator Dashboard.

> [!WARNING]
> Para garantizar el cumplimiento comercial (compliance), los Sponsored Placements se marcarán explícitamente como "Patrocinado" (Sponsored) ante los usuarios, asegurando total transparencia.
