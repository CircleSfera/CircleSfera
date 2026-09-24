# AGENTS.md — CircleSfera

## Propósito

Reglas operativas para agentes de IA en CircleSfera: red social full-stack de producción (NestJS,
React, PostgreSQL/Prisma, Redis, Stripe). Priorizar estabilidad, seguridad, coherencia
arquitectónica y alineación con el estado real del proyecto — no con aspiraciones.

`circlesfera-landing/` fue eliminado (Jul 2026); no restaurarlo ni desplegarlo.

## Fuente de verdad

La autoridad es específica por dominio, no una precedencia lineal universal. Antes de resolver un
conflicto, clasifica primero qué tipo de pregunta estás respondiendo y consulta la fuente apropiada
para ese tipo — modelo completo, dominios de autoridad y las 4 clases de conflicto (Documentation
Drift, Implementation Drift, Decision Conflict, Ambiguous/Unknown) en
[`.ai/core/authority.md`](.ai/core/authority.md). Comportamiento del agente y niveles de decisión (MAY
DECIDE / MAY RECOMMEND / MUST CONFIRM / MUST STOP) en
[`.ai/core/agent-contract.md`](.ai/core/agent-contract.md).

Guía rápida por tipo de pregunta:

| Pregunta | Autoridad |
| --- | --- |
| ¿Qué datos/relaciones existen? | `circlesfera-backend/prisma/schema.prisma` |
| ¿Qué hace el código ahora mismo? | Código fuente implementado |
| ¿Qué contrato API expone el sistema? | Controllers + DTOs vigentes |
| ¿Qué decisión de arquitectura se aprobó? | ADRs — índice en [`circlesfera-documentation/adr/README.md`](circlesfera-documentation/adr/README.md) |
| ¿Qué debería ser cierto del producto? | `circlesfera-documentation/`, empezando por [`00-status.md`](circlesfera-documentation/00-status.md) |
| ¿Qué terminología es canónica? | [`.ai/core/terminology.md`](.ai/core/terminology.md) |
| ¿Qué decisión sigue intencionalmente sin resolver? | [`.ai/core/deferred-decisions.md`](.ai/core/deferred-decisions.md) |

Nunca inventar modelos, endpoints, enums, relaciones, permisos o flujos no respaldados por schema o
código. Si hay ambigüedad, detenerse, explicitar la inconsistencia y proponer alternativas.

Detalle operativo (stack, glosario, gaps): [`.ai/core/`](.ai/core/). Mapa pregunta → artefacto:
[`.ai/core/sources-of-truth.md`](.ai/core/sources-of-truth.md).

## Routing de tareas

Antes de trabajo no trivial, leer [`.ai/orchestrator.md`](.ai/orchestrator.md). El agente **infiere**
el modo (ship / advise / review), el playbook de entrada y el encadenamiento (p. ej. schema →
feature) sin que el usuario nombre el workflow. Los slash commands de [`.agents/workflows/`](.agents/workflows/)
son atajos opcionales. Cursor carga [`.cursor/rules/`](.cursor/rules/) por glob.

## Política de cambios

El framework **diseña, implementa y cambia schema** cuando el producto lo necesita. La lista de
confirmación es un **gate** (proponer → esperar → ejecutar), no una prohibición.

**Sin confirmación extra:** refactors pequeños, tipado, lint/format sin cambiar lógica, legibilidad,
tests acotados del comportamiento existente, docs alineadas con código real.

**Requieren confirmación explícita, luego implementación completa:** schema/migraciones; contratos
API públicos; auth, permisos, roles o monetización; eliminación de código/tablas/endpoints; lógica
de negocio crítica; nuevas dependencias; infraestructura, despliegue o secretos; operaciones
destructivas sobre datos.

El freno real es OUT OF SCOPE en [`00-status.md`](circlesfera-documentation/00-status.md). Playbooks:
[`feature`](.ai/playbooks/feature.md), [`architecture`](.ai/playbooks/architecture.md),
[`schema-change`](.ai/playbooks/schema-change.md), [`ui-redesign`](.ai/playbooks/ui-redesign.md).

## Antes / después de cambiar código

Antes: leer el módulo dueño (servicio, DTOs, tests, modelos Prisma), delimitar impacto (schema,
auth, cache, colas, sockets, i18n, tests, docs, dinero) y comprobar
[`00-status.md`](circlesfera-documentation/00-status.md) (OUT OF SCOPE e *in development*).

Después: verificar tipos/imports, correr lint/tests relevantes, resumir qué cambió, por qué y qué
riesgo queda abierto. No afirmar checks no ejecutados.

Principios de ingeniería y calidad: [`.ai/core/principles.md`](.ai/core/principles.md),
[`.ai/core/quality.md`](.ai/core/quality.md). Gaps conocidos: [`.ai/core/known-gaps.md`](.ai/core/known-gaps.md).

## Frontend y diseño (mobile-first)

- Diseñar y comprobar primero en **390×844 px** (iPhone 15 Pro). Desktop añade columnas paralelas;
  nunca escala proporcionalmente componentes o tipografía.
- Densidad comparable o superior a Instagram / Threads / X / TikTok: más contenido real que
  decoración.
- Botones: `44–48px`. Inputs: `48–52px`. Avatares: `32` / `40` / `56`. Cards: altura por contenido.
- Espaciado en escala `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Márgenes de pantalla `16–24px`.
- Aprovechar el **80–90%** del viewport útil en móvil.

Tokens canónicos: `circlesfera-frontend/src/index.css`. Narrative de diseño: docs 09/13 (Notion).

## Seguridad y dominio

- Nunca exponer o hardcodear secretos; no loguear tokens, cookies, plaintext de chat ni payloads de pago.
- No relajar guards, validación, throttle o exclusiones CSRF por comodidad.
- No mover autorización al cliente ni confiar en montos/precios/entitlements del cliente.
- Reglas de negocio críticas viven en el backend (servicios), no solo en la UI.
- No introducir flujos opacos de moderación, ranking o privilegios; respetar transparencia del producto.
- No asumir features de otras redes si no existen en CircleSfera real (schema + código).
- Respetar tiers y monetización reales (`PlatformPlan`, fee 20% ADR-0010, catálogos server-side).

## Documentación

Si el sistema y la documentación no coinciden, clasifica el conflicto antes de tocar cualquiera de los
dos (ver [`.ai/core/authority.md`](.ai/core/authority.md)): documentación desactualizada →
corrígela; código que no sigue una decisión normativa vigente → trátalo como candidato a defecto, no
reescribas la documentación para legitimarlo; dos fuentes autoritativas en conflicto → detente y
escala; evidencia insuficiente → verifica antes de decidir. Presente = shipped. Proceso:
[`.ai/playbooks/docs-sync.md`](.ai/playbooks/docs-sync.md).

## Estilo de respuesta

Directo, preciso, sin vender humo. Separar hecho verificado / inferencia / propuesta.

Formato útil: Objetivo → Hallazgos → Cambios → Verificación → Riesgos abiertos → Siguientes pasos.

## Prohibiciones

No inventar requisitos, tablas, endpoints ni estados de implementación que no existan aún en
schema/código (sí se pueden **añadir** con confirmación vía `schema-change` / `feature`). No
reescribir áreas grandes sin necesidad. No cambios destructivos ni tocar secretos/despliegue sin
permiso. No afirmar “todo alineado” sin haberlo revisado.

## Preferencias

Profesionalidad sobre velocidad aparente. Consistencia del proyecto sobre improvisación. Precisión
documental sobre storytelling. Seguridad y mantenibilidad sobre atajos. Alineación con producción y
`schema.prisma`. Ante duda entre rapidez y solidez, elegir solidez.

Referencias de sección en docs: `section 9.4` (nunca el símbolo de sección).

## Instrucción final

Si falta contexto, no asumir. Si hay conflicto entre documentos y código, clasifícalo (ver
[`.ai/core/authority.md`](.ai/core/authority.md)) y señálalo — no asumas de antemano qué lado corregir.
Si el cambio es sensible, pedir confirmación y, al recibirla, implementar.
