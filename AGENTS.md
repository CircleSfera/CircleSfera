# AGENTS.md — CircleSfera

## Propósito

Este archivo define las reglas operativas, técnicas, arquitectónicas y de calidad que deben seguir todos los agentes de IA que trabajen en CircleSfera.

CircleSfera es un proyecto serio, profesional y de largo recorrido. Toda acción sobre este repositorio debe priorizar estabilidad, coherencia arquitectónica, seguridad, mantenibilidad, trazabilidad y alineación con el estado real del proyecto.

## Contexto del Proyecto

- Proyecto: CircleSfera
- Tipo de producto: red social full-stack de alcance global
- Stack principal conocido: NestJS, Vite, PostgreSQL, Prisma
- Desarrollo guiado por documentación real y schema.prisma vigente
- Monetización basada en tiers y funcionalidades premium
- Dominio sensible: identidad, contenido, relaciones sociales, chat, stories, suscripciones, promociones, auditoría y datos de usuario
- Principio de producto: plataforma seria, escalable, transparente y controlada por reglas explícitas

## Fuente de Verdad

Cuando exista conflicto entre documentos, se debe respetar este orden de prioridad:

1. `schema.prisma`
2. Código fuente realmente implementado
3. Contratos API vigentes
4. ADRs (Architecture Decision Records)
5. Documentación técnica y funcional
6. Suposiciones

Regla obligatoria:

- Nunca inventar modelos, endpoints, enums, relaciones, permisos, eventos o flujos que no estén respaldados por el código, el schema o documentación canónica actualizada.
- Si hay ambigüedad, el agente debe detenerse, explicitar la inconsistencia y proponer alternativas en vez de asumir.

## Principios Operativos Generales

- Priorizar cambios pequeños, auditables y reversibles.
- No romper comportamiento existente sin justificación explícita.
- No introducir deuda técnica silenciosa.
- No “simular” que algo está implementado si no lo está.
- No crear mocks permanentes en código de producción.
- No ocultar errores con parches cosméticos.
- Toda modificación debe ser consistente con la arquitectura actual del repositorio.
- Toda respuesta del agente debe distinguir claramente entre: hecho verificado, inferencia razonable y propuesta.

## Reglas de Ejecución para Agentes

Antes de modificar código, el agente debe:

1. Leer el contexto local relevante.
2. Identificar los archivos fuente implicados.
3. Revisar contratos, tipos, DTOs, entidades, schema y servicios relacionados.
4. Entender impacto lateral en validación, auth, permisos, eventos, cache, logs, tests y documentación.
5. Proponer una estrategia breve antes de cambios grandes.

Después de modificar código, el agente debe:

- Verificar consistencia de imports, tipos y nombres.
- Ejecutar validaciones/lint/tests relevantes si existen.
- Revisar efectos colaterales.
- Resumir exactamente qué cambió, por qué y qué riesgos quedan abiertos.

## Política de Cambios

### Cambios permitidos sin pedir confirmación adicional

- Refactors pequeños y seguros.
- Correcciones de tipado.
- Ajustes de lint/format sin alterar lógica.
- Mejoras de legibilidad sin impacto funcional.
- Tests acotados para cubrir comportamiento existente.
- Documentación alineada con código real.

### Cambios que requieren confirmación explícita

- Modificación de esquema de base de datos.
- Cambios en contratos API públicos.
- Cambios en auth, permisos, roles o monetización.
- Eliminación de código, tablas, endpoints o flujos existentes.
- Cambios en lógica de negocio crítica.
- Introducción de nuevas dependencias.
- Cambios de infraestructura, despliegue o secretos.
- Operaciones destructivas sobre datos.

## Arquitectura y Diseño

### Reglas de arquitectura

- Respetar separación de responsabilidades.
- Evitar mezclar lógica de negocio con transporte, persistencia o presentación.
- Mantener controladores delgados, servicios claros y acceso a datos encapsulado.
- Evitar funciones gigantes, acoplamiento circular y utilidades ambiguas.
- Favorecer nombres explícitos sobre abstracciones prematuras.
- No duplicar lógica si puede extraerse de forma limpia.
- No sobrediseñar: resolver el problema real actual sin introducir complejidad especulativa.

### Backend

- En NestJS, usar módulos, servicios, controladores, DTOs, guards, interceptors y pipes de forma idiomática.
- Validación de entrada obligatoria en todos los puntos externos.
- No confiar en datos del cliente.
- Toda regla de negocio crítica debe vivir en backend, no en frontend.
- Los errores deben ser explícitos, semánticos y trazables.
- Mantener consistencia entre DTOs, servicios, Prisma y respuestas API.

### Base de datos

- Prisma y PostgreSQL son parte del núcleo del sistema.
- Toda propuesta de cambio de datos debe considerar migraciones, compatibilidad, índices, constraints y rendimiento.
- Nunca asumir cardinalidades o relaciones sin validarlo en `schema.prisma`.
- Evitar consultas ineficientes, N+1, writes redundantes y filtros no indexados en rutas sensibles.
- Toda modificación de schema debe explicar impacto en producción.

## Seguridad

Estas reglas son obligatorias y prioritarias.

- Nunca exponer secretos, tokens, claves ni credenciales.
- Nunca hardcodear secretos.
- No relajar validaciones, permisos o controles por comodidad.
- Sanitizar y validar toda entrada externa.
- Minimizar superficie de exposición de datos sensibles.
- No registrar datos sensibles innecesarios en logs.
- Aplicar principio de mínimo privilegio.
- Revisar impacto en auth, sesiones, ownership y acceso por rol antes de tocar endpoints sensibles.
- Si un cambio puede afectar privacidad, cumplimiento o integridad de datos, detenerse y advertir.

## Reglas de Dominio CircleSfera

- CircleSfera no es una demo; todo se trata como software de producto real.
- El dominio social implica especial cuidado con identidad, publicaciones, relaciones, historias, mensajes, suscripciones, promociones y auditoría.
- No introducir lógica que contradiga la transparencia del producto ni políticas explícitas del proyecto.
- No introducir flujos ambiguos en moderación, visibilidad, ranking o privilegios sin validación explícita.
- No asumir features “tipo Instagram/TikTok” si no están respaldadas por CircleSfera real.
- Todo cambio funcional debe respetar los tiers, restricciones y reglas reales del proyecto.

## Estándares de Código

- Escribir código claro, sobrio y mantenible.
- Preferir legibilidad sobre cleverness.
- Nombres descriptivos y coherentes con el lenguaje del repositorio.
- Evitar comentarios redundantes; comentar solo lo no evidente.
- No dejar código muerto, console logs de depuración ni bloques comentados permanentes.
- No mezclar estilos inconsistentes dentro del mismo archivo.
- Mantener funciones pequeñas cuando sea razonable.
- Evitar booleans ambiguos; usar nombres semánticos.

## Estándares de Calidad

Todo cambio debe aspirar a:

- corrección funcional
- consistencia arquitectónica
- seguridad
- mantenibilidad
- observabilidad
- rendimiento razonable
- facilidad de revisión

Checklist mínimo antes de dar un cambio por válido:

- ¿Compila?
- ¿Respeta tipos?
- ¿Respeta contratos?
- ¿Respeta schema y dominio?
- ¿Evita regresiones obvias?
- ¿Está suficientemente claro para otro desarrollador?

## Testing

- Añadir o ajustar tests cuando el cambio lo justifique.
- No escribir tests irreales que solo validen mocks triviales.
- Los tests deben cubrir comportamiento relevante, no solo implementación interna.
- Si no se añaden tests, explicar por qué.
- No marcar como “resuelto” algo que no fue validado de forma razonable.

## Documentación

- Toda documentación debe reflejar el estado real del proyecto, no aspiraciones futuras presentadas como presentes.
- Si se detecta incoherencia documental, señalarla explícitamente.
- Mantener alineación entre schema, código, API y documentos técnicos.
- No versionar como definitivo un documento que esté basado en suposiciones.
- Cuando se toque lógica importante, sugerir actualización documental correspondiente.

## Dependencias

- No añadir dependencias sin necesidad real.
- Antes de introducir una librería, evaluar si el problema ya puede resolverse con el stack actual.
- Preferir soluciones consistentes con la base tecnológica existente.
- Toda nueva dependencia debe justificar: propósito, impacto, mantenimiento y riesgo.

## Rendimiento y Escalabilidad

- Considerar rendimiento en endpoints calientes, feeds, chat, stories, búsquedas y relaciones sociales.
- Evitar trabajo innecesario en cada request.
- Pensar en índices, paginación, límites, batching y acceso eficiente a datos.
- No optimizar prematuramente, pero tampoco ignorar cuellos de botella evidentes.

## Observabilidad y Debugging

- Los errores deben aportar contexto útil sin filtrar información sensible.
- Si se toca lógica crítica, considerar logs estructurados, métricas o trazas si aplica.
- No ocultar errores con catch silenciosos.
- Todo fallback debe ser intencional y visible para mantenimiento.

## Estilo de Interacción del Agente

Cuando el agente responda o proponga cambios, debe:

- ser directo y preciso
- indicar incertidumbres reales
- no vender humo
- no afirmar validaciones no ejecutadas
- no exagerar calidad o completitud
- separar claramente diagnóstico, propuesta y ejecución realizada

Formato recomendado de respuesta:

- Objetivo
- Hallazgos relevantes
- Cambios propuestos o realizados
- Riesgos / dudas abiertas
- Siguientes pasos

## Prohibiciones Explícitas

El agente no debe:

- inventar requisitos
- inventar tablas o relaciones
- inventar endpoints
- inventar estados de implementación
- reescribir grandes áreas del sistema sin necesidad
- hacer cambios destructivos sin permiso
- tocar secretos o despliegue sin confirmación
- ocultar limitaciones
- afirmar “todo está alineado” sin haberlo revisado

## Convenciones de Trabajo Recomendadas

Para tareas complejas, seguir este orden:

1. Comprender contexto.
2. Localizar fuente de verdad.
3. Delimitar impacto.
4. Proponer plan breve.
5. Ejecutar cambio mínimo viable y correcto.
6. Verificar.
7. Resumir con transparencia.

## Preferencias para CircleSfera

- Se prioriza profesionalidad sobre velocidad aparente.
- Se prioriza consistencia del proyecto sobre soluciones improvisadas.
- Se prioriza precisión documental sobre storytelling técnico.
- Se prioriza seguridad y mantenibilidad sobre atajos.
- Se prioriza alineación con el estado real de producción y `schema.prisma`.

## Instrucción Final

Si falta contexto, no asumir.
Si hay conflicto entre documentos y código, señalarlo.
Si el cambio es sensible, pedir confirmación.
Si el sistema real contradice la documentación, corregir la documentación, no la realidad.
Si existe duda entre rapidez y solidez, elegir solidez.
