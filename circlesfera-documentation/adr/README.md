# Architecture Decision Records (ADRs)

Este directorio contiene los registros de decisiones de arquitectura de CircleSfera, siguiendo el patrón de Documentación de Arquitectura de Software Ligera (MADR / ADR).

> Un ADR es un documento breve que captura una decisión de arquitectura clave hecha junto con su contexto y sus consecuencias.

## Índice de ADRs Actuales

- **[ADR-0009: Feed Fan-out](./0009-feed-fan-out.md)** (Referencia de modelo de Push y Vector search).
- **[ADR-0010: Plataforma de Monetización](./0010-monetization.md)** (Plataforma y fee del 20% server-side).
- **[ADR-0015: División de Identidad de Perfil vs Usuario](./0015-user-profile-identity-split.md)** (Independencia de Auth y entidades sociales).

*(Nota: Los archivos referenciados arriba están documentados individualmente en Notion y/o en el historial del repositorio. Todo nuevo ADR debe escribirse aquí.)*

## Plantilla para nuevos ADR

Para crear un nuevo ADR, sigue este formato básico:

```markdown
# [Breve título descriptivo, por ejemplo: ADR-0016: Cambio a Caché Distribuido]

* Estado: [Propuesto | Aceptado | Rechazado | Obsoleto]
* Fecha: [YYYY-MM-DD]

## Contexto y Definición del Problema
Describir brevemente el problema de negocio o técnico que requiere ser resuelto.

## Decisión
Describir la decisión y su justificación. ¿Por qué se eligió sobre otras alternativas?

## Consecuencias
¿Qué pasa después de aplicar esta decisión? Positivo, negativo y neutro. (Ej: Aumento de latencia, reducción de coste, acoplamiento necesario).
```
