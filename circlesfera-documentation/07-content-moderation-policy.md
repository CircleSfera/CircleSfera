# 07-Content-Moderation-Policy
## CircleSfera
**Versión:** 3.0 alineada al proyecto real  
**Fecha:** Abril 2026  
**Fuente de verdad:** posicionamiento de producto + capacidades reales del sistema actual

---

## 1. Objetivo

Esta política sustituye la versión anterior para hacerla más realista y alineada con el proyecto. La corrección principal es que la política ya no debe depender de una estructura de datos que hoy no existe formalmente en el schema, como `appeals` o `moderation_actions` persistidas, aunque sí puede definir principios, plazos objetivo y procedimientos operativos.

CircleSfera mantiene una postura de moderación transparente, trazable y orientada a seguridad, legalidad y confianza del ecosistema.

---

## 2. Principios

- Reglas públicas y comprensibles.
- Enforcement consistente.
- Decisiones explicables.
- Trazabilidad interna.
- Priorización de seguridad de usuarios.
- No usar reducciones opacas de visibilidad como mecanismo normalizado de producto.

---

## 3. Ámbito real de moderación

CircleSfera debe moderar, como mínimo, estos espacios actualmente coherentes con el sistema real:

- Posts.
- Comments.
- Stories.
- Media adjunta.
- Profiles y usernames.
- Mensajes y comparticiones en chat, según política interna y obligaciones legales aplicables.

La versión anterior se centraba mucho en posts y cuentas, pero el producto real ya tiene stories y messaging, así que la política debe contemplarlos expresamente.

---

## 4. Contenido prohibido

### Tolerancia cero
- CSAM.
- Explotación sexual infantil.
- Terrorismo y reclutamiento terrorista.
- Trata de personas.
- Imágenes íntimas no consentidas.
- Violencia extrema con finalidad de glorificación o instrucción.
- Fraude grave, phishing o abuso financiero operativo.

### Normalmente prohibido
- Suplantación de identidad.
- Acoso dirigido grave.
- Amenazas creíbles.
- Discurso de odio punible.
- Spam abusivo.
- Venta o promoción de actividades claramente ilícitas.
- Violaciones claras de propiedad intelectual tras revisión adecuada.

### Contenido sexual y sensible
- **MATURE (Sensible)**: Contenido que incluye desnudez artística, lenguaje fuerte o temas sugestivos legales. Este contenido debe clasificarse bajo el rating `MATURE` y solo será visible para usuarios que hayan habilitado explícitamente dicha preferencia.
- **GENERAL**: Contenido apto para todos los públicos.
- **Prohibición Estricta**: Dado el posicionamiento de CircleSfera, el contenido sexual explícito, pornografía o explotación queda terminantemente prohibido, independientemente de su rating.

---

## 5. Contenido sensible o contextual

Puede requerir restricción, aviso o revisión adicional:

- Violencia gráfica en contexto documental, periodístico o artístico.
- Autolesión o suicidio en contexto de prevención o testimonio.
- Temas políticos intensos.
- Contenido religioso o ideológico conflictivo pero legal.
- Desnudez artística no sexualizada, si la política final decide permitirla en ciertos supuestos.

La decisión aquí no debe reducirse a “permitido/prohibido” sin contexto. Debe existir criterio de contexto, riesgo y daño potencial.

---

## 6. Speech protegido

CircleSfera debe proteger, dentro de la legalidad y de sus reglas públicas:

- Crítica política.
- Sátira y parodia.
- Debate religioso.
- Expresión identitaria.
- Debate social duro pero no ilegal.

La plataforma no debe confundir desacuerdo, incorrección o impopularidad con violación automática de reglas.

---

## 7. Señales y fuentes de revisión

Las decisiones pueden originarse por:

- Reporte de usuario.
- Detección automática sobre texto.
- Detección automática sobre media.
- Señales de abuso de cuenta o spam.
- Revisión administrativa o legal.

---

## 8. Proceso operativo realista

### 8.1 Flujo mínimo
1. El contenido o cuenta recibe una señal.
2. Se crea un `Report` con un `targetType` específico (`USER`, `POST`, `COMMENT`, `STORY`, `MESSAGE`).
3. El estado inicial es `PENDING`.
4. Un administrador cambia el estado a `REVIEWING` mientras evalúa.
5. El equipo toma una decisión y marca el reporte como `RESOLVED` o `REJECTED`.
6. Se registra la trazabilidad en `AdminAuditLog`.
7. Se notifica al usuario cuando el tipo de acción lo requiera.

### 8.2 Estados Formales de Reporte
Para garantizar coherencia técnica, el sistema utiliza estos estados cerrados:
- **PENDING**: Reporte recibido, pendiente de triaje.
- **REVIEWING**: En revisión activa por un moderador.
- **RESOLVED**: Acción tomada y reporte cerrado.
- **REJECTED**: Reporte desestimado (no se encontró violación).

### Razones Estándar de Reporte (Enum)
Para garantizar trazabilidad, las razones deben ser: `SPAM`, `HARASSMENT`, `ILLEGAL_CONTENT`, `VIOLENCE`, `HATE_SPEECH`, `IMPERSONATION`, `CSAM`, `OTHER`.

---

## 9. Medidas posibles

- Sin acción.
- Etiquetado o aviso.
- Restricción temporal de contenido.
- Eliminación de contenido.
- Limitación de funciones de cuenta.
- Suspensión temporal.
- Desactivación o baneo de cuenta en casos graves.
- Escalado legal cuando aplique.

La severidad debe ser proporcional al riesgo, la reincidencia y el daño potencial.

---

## 10. Transparencia y notificación

Cuando CircleSfera actúe sobre contenido o cuenta, debe intentar comunicar de forma clara:

- Qué se hizo.
- Qué parte del contenido o conducta causó la intervención.
- Qué regla pública se considera aplicable.
- Si existe o no posibilidad de revisión posterior.

No conviene prometer siempre “cita legal exacta” en todos los casos de producto, porque muchas decisiones serán de reglas de plataforma y seguridad operativa, no solo de derecho penal estricto.

---

## 11. Revisión o reconsideración

CircleSfera puede mantener un proceso de reconsideración de decisiones. Pero la política oficial, alineada al sistema actual, debe describirlo como proceso operativo y SLA objetivo, no como módulo persistido garantizado en base de datos si todavía no existe así.

### SLA objetivo recomendado
- Contenido presuntamente ilegal o muy grave: prioridad alta.
- Casos estándar: revisión en ventana razonable.
- Reconsideraciones: objetivo de resolución en 72 horas cuando sea viable.

---

## 12. Moderación automatizada

### Uso permitido
- Clasificación preliminar y asignación automática de `contentRating`.
- Priorización de revisión.
- Detección de patrones evidentes.
- Scoring de riesgo en media.

### Uso no recomendado como regla única
- Baneo definitivo totalmente automático en casos no evidentes.
- Decisiones complejas de contexto sin revisión humana.

La automatización debe asistir, no sustituir totalmente, la revisión humana en casos ambiguos.

---

## 13. Historias, chat y contenido efímero

La política anterior no integraba del todo la realidad del producto actual.

### Stories
- Deben moderarse aunque expiren.
- Las vistas y reacciones no sustituyen la revisión del contenido.
- Los highlights vuelven persistente una story y pueden requerir reevaluación.

### Messaging
- El chat introduce un área sensible de privacidad.
- Cualquier revisión de mensajes debe tener base clara, controles internos y proporcionalidad.
- La compartición de post/story en chat debe seguir respetando disponibilidad y permisos del contenido fuente.

---

## 14. Registro interno y accountability

Aunque el schema actual no modele una entidad formal de `ModerationAction`, CircleSfera sí debe mantener trazabilidad operativa usando `Report`, `AdminAuditLog` y registros internos complementarios. La política no debe depender de nomenclatura técnica concreta, sino de capacidad real de explicar y auditar decisiones.

---

## 15. Decisiones cerradas

- La política oficial pasa a cubrir posts, comments, stories, profiles y chat.
- El contenido sexual explícito queda fuera de plataforma como regla general.
- Las reconsideraciones se documentan como proceso operativo, no como entidad persistida garantizada.
- La moderación automatizada se usa como apoyo, no como reemplazo ciego del juicio humano.
- La política pública debe ser compatible con la realidad operativa del producto y con asesoramiento legal específico cuando toque DSA, GDPR o derecho penal aplicable.
