# Análisis de Funcionalidades Faltantes: CircleSfera vs. Instagram

Este documento detalla las funcionalidades clave que actualmente no están presentes en el esquema de base de datos o estructura de archivos del proyecto, comparadas con la experiencia completa de Instagram.

## 1. Experiencia de Usuario y Creación de Contenido (Core)

### Historias Interactivas (Stories)

Aunque existe la subida básica de historias (imagen/video), faltan elementos interactivos cruciales para el engagement:

- **Stickers Interactivos:** Encuestas, Preguntas y Respuestas, Cuestionarios, Cuenta Regresiva, Enlaces, "Tu Turno".
- **Música/Audio:** Integración con librerías de música para añadir pistas a historias.
- **Efectos AR/Filtros Avanzados:** Actualmente solo hay un campo `filter` string simple.

### Reels y Audio

El modelo `Post` soporta `type: "FRAME"`, pero falta la infraestructura dedicada:

- **Audio Original/Librería de Música:** Guardar audios, tendencias, páginas de audio.
- **Remix/Dúo:** Funcionalidad para reaccionar o colaborar con otro reel.
- **Plantillas:** Creación rápida basada en otros reels.

### Edición de Fotos Avanzada

- **Herramientas de Edición:** Ajustes de brillo, contraste, estructura, calidez, saturación, color, atenuación.
- **Etiquetado de Productos:** Para tiendas/comercio.

## 2. Comunicación y Mensajería (Direct)

### Mensajería Avanzada

El chat actual soporta texto y archivos básicos, pero faltan:

- **Notas (Notes):** Actualizaciones de estado cortas visibles en la bandeja de entrada (muy popular recientemente).
- **Mensajes de Voz:** Grabación y reproducción nativa con visualización de onda.
- **Llamadas de Audio y Video:** Integración WebRTC para comunicación en tiempo real.
- **Modo Efímero (Vanish Mode):** Mensajes que desaparecen al cerrar el chat.
- **Temas de Chat:** Personalización visual por conversación.
- **Respuestas Rápidas/Guardadas:** Para cuentas profesionales o creadores.

## 3. Descubrimiento y Recomendación (Explore)

### Algoritmos de Recomendación

Actualmente hay un historial de búsqueda, pero falta:

- **Página de Explorar Personalizada:** Algoritmo que sugiera contenido basado en intereses, likes previos y cuentas seguidas.
- **Temas/Canales:** Agrupación de contenido por categorías (e.g., Viajes, Comida, Arte).
- **Sugerencias de "Personas que quizás conozcas":** Basado en amigos mutuos o contactos.

## 4. Funcionalidades Sociales y de Comunidad

### Mejores Amigos (Close Friends)

- **Posts para Mejores Amigos:** Actualmente solo implementado en Stories, Instagram permite posts en feed visibles solo para CF.
- **Listas Personalizadas:** Crear múltiples listas de audiencia, no solo "Mejores Amigos".

### Colaboraciones

- **Posts Colaborativos:** Publicar un post que aparezca en el perfil de dos usuarios simultáneamente (autores compartidos).

### En Vivo (Live)

_(Mencionado por el usuario como excluido, pero listado aquí por completitud)_

- Transmisión en vivo, comentarios en vivo, solicitar unirse, insignias/donaciones.

## 5. Gestión de Cuenta y Seguridad

### Seguridad Avanzada

- **Autenticación en Dos Pasos (2FA):** SMS o App de autenticación.
- **Actividad de Inicio de Sesión:** Ver dispositivos y ubicaciones activas.
- **Cuentas Vinculadas:** Gestión de múltiples perfiles con un solo login.

### Privacidad y Bienestar

- **Cuentas Restringidas:** "Shadow ban" personal para usuarios molestos sin bloquearlos.
- **Palabras Ocultas:** Filtrado automático de comentarios ofensivos.
- **Control de Contenido Sensible:** Ajustes de qué tanto contenido "límite" ver.
- **Estado de Actividad:** Mostrar "En línea ahora" o "Activo hace xm".

## 6. Herramientas para Creadores y Profesionales

### Panel de Profesionales

- **Estadísticas (Insights):** Métricas detalladas de posts, historias, reels y crecimiento de seguidores.
- **Herramientas de Monetización:** Regalos (Gifts) en Reels, Suscripciones.
- **Tienda (Shop):** Catálogo de productos y etiquetas de compra.

## 7. Otros Detalles Técnicos/UX

- **Modo Oscuro/Claro:** (Depende del frontend, verificar si hay toggle global).
- **Archivo de Posts/Historias:** Ver contenido antiguo archivado (privado) en lugar de eliminarlo (campo `deletedAt` existe, pero un estado `ARCHIVED` explícito sería mejor).
- **Guardados/Colecciones:** Organizar los posts guardados en carpetas (actualmente `Bookmark` es plano).

---

### Recomendación de Prioridad (Siguientes Pasos)

Basado en la complejidad y valor para el usuario, sugeriría priorizar:

1.  **Notas en mensajes (Notes):** Alta viralidad, implementación de complejidad media.
2.  **Estado de Actividad y "Escribiendo...":** Mejora drástica en la sensación de "tiempo real" del chat.
3.  **Colecciones de Guardados:** Mejora la utilidad de guardar contenido.
4.  **Sugerencias de Usuarios:** Crucial para el crecimiento de la red (network effect).
5.  **Audio/Música (Simulado):** Aunque sea una librería básica de sonidos o integración con API externa, es vital para Reels.
