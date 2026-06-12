# Sistema de Diseño CircleSfera
## Guía de Diseño Profesional - Nivel Meta

### Visión General
Sistema de diseño unificado que establece principios, patrones y componentes reutilizables para crear experiencias consistentes, accesibles y hermosas en toda la plataforma CircleSfera.

---

## 1. Filosofía de Diseño

### Principios Fundamentales

#### 1.1 Claridad y Simplicidad
- **Eliminar fricción**: Cada elemento debe tener un propósito claro
- **Jerarquía visual**: Usar tamaño, color y espaciado para guiar la atención
- **Información progresiva**: Mostrar lo esencial primero, expandir cuando sea necesario

#### 1.2 Consistencia
- **Patrones unificados**: Componentes y comportamientos consistentes en toda la app
- **Lenguaje visual coherente**: Colores, tipografías y espaciados estandarizados
- **Experiencias familiares**: Usuarios deben sentirse cómodos al navegar

#### 1.3 Elegancia Moderna
- **Estética minimalista**: Menos es más - eliminar elementos innecesarios
- **Micro-interacciones**: Animaciones sutiles que dan vida a la interfaz
- **Glassmorphism refinado**: Efectos de vidrio esmerilado con buen gusto

#### 1.4 Accesibilidad
- **Contraste adecuado**: WCAG AA mínimo, AAA donde sea posible
- **Navegación por teclado**: Todo debe ser accesible sin mouse
- **Focus visible**: Indicadores claros de foco para navegación

#### 1.5 Performance Visual
- **Transiciones fluidas**: 60fps en todas las animaciones
- **Carga progresiva**: Estados de carga elegantes
- **Optimización de renders**: Componentes eficientes

---

## 2. Paleta de Colores

### 2.1 Colores Primarios (Púrpura Cálido)
```
Primary Purple (Púrpura Principal)
- 50:  #faf5ff  (Fondos muy claros)
- 400: #c084fc  (Acciones secundarias)
- 500: #a855f7  (Brand principal)
- 600: #9333ea  (Hovers y estados activos)
- 700: #7e22ce  (Énfasis fuerte)
- 950: #3b0764  (Más oscuro)
```

### 2.2 Colores de Acento (Rosa Cálido)
```
Accent Pink (Rosa Complementario)
- 50:  #fdf2f8  (Fondos muy claros)
- 400: #f472b6  (Acentos suaves)
- 500: #ec4899  (Acento principal)
- 600: #db2777  (Hovers y estados activos)
- 700: #be185d  (Énfasis fuerte)
- 950: #500724  (Más oscuro)
```

### 2.3 Colores Neutros
```
Slate (Escala de grises)
- 50:  #f8fafc  (Texto sobre dark)
- 400: #94a3b8  (Texto secundario)
- 500: #64748b  (Texto terciario)
- 800: #1e293b  (Fondos oscuros)
- 900: #0f172a  (Fondos más oscuros)
- 950: #020617  (Base casi negra)
```

### 2.4 Colores Semánticos
- **Success (Verde)**: Confirmaciones, acciones exitosas
- **Warning (Amarillo)**: Advertencias, atención requerida
- **Danger (Rojo)**: Errores, acciones destructivas

### 2.5 Gradientes Principales
```
Primary Gradient: from-primary-600 via-primary-500 to-accent-500
Text Gradient: from-primary-400 via-primary-500 to-accent-500
Hover Gradient: from-primary-500 via-accent-500 to-primary-600
```

### 2.6 Modo Oscuro
- **Background Base**: `#000000` (Negro puro)
- **Background Elevado**: `rgba(15, 23, 42, 0.4)` (Slate-900 con transparencia)
- **Bordes**: `rgba(51, 65, 85, 0.3)` (Slate-700 con transparencia)
- **Texto Principal**: `#ffffff` (Blanco puro)
- **Texto Secundario**: `rgba(148, 163, 184, 1)` (Slate-400)

---

## 3. Tipografía

### 3.1 Fuente Principal
**Inter** - Variable font para máxima flexibilidad
- **Weights**: 400 (Regular), 500 (Medium), 600 (Semibold), 700 (Bold)
- **Features**: cv02, cv03, cv04, cv11 (OpenType features)

### 3.2 Escala Tipográfica
```
Display: 3rem-8rem   (Heroes, títulos principales)
Heading: 1.5rem-3rem (Títulos de sección)
Body:    0.875rem-1rem (Contenido, párrafos)
Small:   0.75rem-0.875rem (Metadata, labels)
Tiny:    0.625rem (Badges, tags)
```

### 3.3 Jerarquía de Texto
- **Headings**: Semibold (600) o Bold (700)
- **Body**: Regular (400) o Medium (500)
- **Labels**: Medium (500)
- **Captions**: Regular (400)

---

## 4. Espaciado

### 4.1 Sistema de Espaciado (8px base)
```
0.5:  4px   (Espaciado mínimo)
1:    8px   (Base)
1.5:  12px  (Compacto)
2:    16px  (Estándar)
3:    24px  (Cómodo)
4:    32px  (Espacioso)
6:    48px  (Secciones)
8:    64px  (Márgenes grandes)
12:   96px  (Separadores grandes)
```

### 4.2 Padding por Componente
- **Botones**: `px-4 py-2.5` (md), `px-6 py-3` (lg)
- **Cards**: `p-4` (compacto), `p-6` (estándar), `p-8` (espacioso)
- **Inputs**: `px-4 py-3`
- **Sidebar**: `px-4 py-3` (items)

---

## 5. Bordes y Radio

### 5.1 Radio de Bordes
```
sm:   8px   (Botones pequeños, badges)
md:   12px  (Botones, inputs)
lg:   16px  (Cards, modales)
xl:   20px  (Contenedores grandes)
2xl:  24px  (Contenedores extra grandes)
full: 9999px (Botones circulares, avatares)
```

### 5.2 Ancho de Bordes
- **Default**: `1px`
- **Énfasis**: `2px`
- **Separadores**: `1px` con opacidad reducida

---

## 6. Sombras

### 6.1 Sistema de Elevación
```
Elevation 1 (Suave):     0 2px 8px rgba(0, 0, 0, 0.15)
Elevation 2 (Estándar):  0 4px 16px rgba(0, 0, 0, 0.2)
Elevation 3 (Moderado):  0 10px 30px rgba(0, 0, 0, 0.25)
Elevation 4 (Alto):      0 20px 50px rgba(0, 0, 0, 0.3)
```

### 6.2 Sombras con Color (Glow Effects)
```
Glow Primary: 0 0 20px rgba(168, 85, 247, 0.4)
Glow Accent: 0 0 20px rgba(236, 72, 153, 0.4)
Glow Combined: 0 0 30px rgba(168, 85, 247, 0.4), 0 0 60px rgba(236, 72, 153, 0.2)
Glow Success: 0 0 20px rgba(34, 197, 94, 0.4)
Glow Danger:  0 0 20px rgba(239, 68, 68, 0.4)
```

---

## 7. Componentes Base

### 7.1 Botones

#### Variantes
- **Primary**: Gradiente púrpura/rosa (`from-primary-600 via-primary-500 to-accent-500`), texto blanco, sombra con glow púrpura
- **Secondary**: Glassmorphism oscuro (`glass-dark`), hover más brillante
- **Ghost**: Transparente, hover con fondo `white/5` y backdrop-blur
- **Danger**: Gradiente rojo, para acciones destructivas
- **Success**: Gradiente verde, para confirmaciones
- **Outline**: Borde púrpura, fondo transparente, hover con fondo `primary-500/10`

#### Estados
- **Default**: Estado normal
- **Hover**: Escala 1.02, sombra aumentada
- **Active**: Escala 0.98, feedback táctil
- **Disabled**: Opacidad 50%, cursor not-allowed
- **Loading**: Spinner, texto opaco

### 7.2 Cards
- **Fondo**: `bg-slate-900/40` con `backdrop-blur-sm`
- **Borde**: `border border-slate-800/50`
- **Radio**: `rounded-2xl`
- **Sombra**: `shadow-elegant`
- **Hover**: Escala sutil, borde más visible

### 7.3 Inputs
- **Fondo**: `bg-slate-900/30`
- **Borde**: `border border-slate-800/50`
- **Focus**: Ring azul, borde azul, fondo más opaco
- **Placeholder**: Color slate-500

### 7.4 Badges
- **Tamaños**: sm, md, lg
- **Variantes**: Primary, Success, Warning, Danger, Neutral
- **Shape**: Píldora (full rounded)

---

## 8. Efectos Visuales

### 8.1 Glassmorphism (Estilo VisionOS)

#### Utilidades CSS
- **glass-light**: `bg-white/5 backdrop-blur-2xl border-white/10`
- **glass-dark**: `bg-black/20 backdrop-blur-2xl border-white/5`
- **glass-elevated**: `bg-white/8 backdrop-blur-2xl border-white/15`
- **glass-primary**: `bg-primary-500/10 backdrop-blur-2xl border-primary-500/20`
- **glass-accent**: `bg-accent-500/10 backdrop-blur-2xl border-accent-500/20`
- **glass-sidebar**: `bg-black/30 backdrop-blur-2xl border-white/5`
- **glass-card**: `bg-slate-900/40 backdrop-blur-xl border-slate-800/50`
- **glass-modal**: `bg-black/40 backdrop-blur-3xl border-white/10`
- **glass-bottom-nav**: `bg-black/40 backdrop-blur-2xl border-white/10`

### 8.2 Gradientes
- **Primary Gradient**: `from-primary-600 via-primary-500 to-accent-500`
- **Text Gradient**: `from-primary-400 via-primary-500 to-accent-500` (`.text-gradient-primary`)
- **Hover Gradient**: `from-primary-500 via-accent-500 to-primary-600`

### 8.3 Animaciones

#### Duración Estándar
- **Instant**: 0ms (Estados inmediatos)
- **Fast**: 150ms (Hovers, micro-interacciones)
- **Normal**: 300ms (Transiciones estándar)
- **Slow**: 500ms (Transiciones importantes)

#### Easing
- **Ease Out**: Para entradas (smooth landing)
- **Ease In**: Para salidas (aceleración)
- **Ease In Out**: Para transiciones bidireccionales

#### Keyframes Principales
- **fade-in**: Opacidad y translateY
- **slide-up**: TranslateY desde abajo
- **scale-in**: Escala desde 0.95
- **shimmer**: Efecto de carga elegante

---

## 9. Layout y Grid

### 9.1 Contenedores
- **Max Width**: 935px (Feed principal)
- **Sidebar**: 280px (Navegación)
- **Padding**: 24px (px-6) en móvil, 32px en desktop

### 9.2 Grid System
- **Columns**: 12 columnas en desktop
- **Gap**: 16px estándar, 24px espacioso

---

## 10. Estados de Interacción

### 10.1 Hover
- Escala sutil (1.01-1.02)
- Sombra aumentada
- Borde más visible
- Color más brillante

### 10.2 Active
- Escala hacia abajo (0.97-0.98)
- Feedback visual inmediato

### 10.3 Focus
- Ring visible (2px primary-500)
- Outline offset
- Sombra de focus

### 10.4 Loading
- Skeleton screens elegantes
- Spinners sutiles
- Shimmer effects para contenido

---

## 11. Responsive Design

### Breakpoints
```
sm:  640px  (Móvil grande)
md:  768px  (Tablet)
lg:  1024px (Desktop pequeño)
xl:  1280px (Desktop)
2xl: 1536px (Desktop grande)
```

### Estrategia
- **Mobile First**: Diseñar primero para móvil
- **Progressive Enhancement**: Añadir funcionalidades en desktop
- **Touch Targets**: Mínimo 44x44px

---

## 12. Accesibilidad

### 12.1 Contraste
- **Texto sobre fondo oscuro**: Mínimo 4.5:1
- **Texto sobre fondo claro**: Mínimo 4.5:1
- **Textos grandes**: Mínimo 3:1

### 12.2 Navegación
- **Tab Order**: Lógico y predecible
- **Skip Links**: Para saltar navegación
- **ARIA Labels**: Donde sea necesario

### 12.3 Feedback
- **Focus Visible**: Siempre visible
- **Error States**: Claros y descriptivos
- **Success States**: Confirmación visual

---

## 13. Performance

### 13.1 Optimizaciones Visuales
- **Lazy Loading**: Para imágenes y componentes
- **Will-change**: Solo donde sea necesario
- **Transform/Opacity**: Para animaciones (GPU accelerated)

### 13.2 Best Practices
- Evitar animaciones en scroll pesadas
- Usar `requestAnimationFrame` para animaciones
- Debounce en resize y scroll

---

## 14. Implementación Técnica

### 14.1 Tailwind CSS
- **Config**: `tailwind.config.ts`
- **Custom Utilities**: `globals.css`
- **JIT Mode**: Habilitado

### 14.2 Componentes
- **CVA**: Para variantes de componentes
- **TypeScript**: Tipado estricto
- **Composition**: Componentes compuestos

---

## 15. Guías de Uso

### 15.1 Cuándo Usar Glassmorphism
- Cards elevadas
- Modales y overlays
- Sidebar y navegación
- NO en elementos pequeños o de poca importancia

### 15.2 Cuándo Usar Gradientes
- CTAs principales
- Títulos y headers
- Elementos de énfasis
- NO en texto largo o fondo de contenido

### 15.3 Cuándo Usar Animaciones
- Feedback de interacción (hover, click)
- Transiciones de estado
- Carga de contenido
- NO en elementos estáticos o de baja importancia

---

## 16. Herramientas y Recursos

### Design Tokens
- Definidos en `tailwind.config.ts`
- Accesibles vía clases Tailwind
- Documentados en este sistema

### Component Library
- Ubicación: `components/ui/`
- Variantes documentadas
- Ejemplos de uso

---

## 17. Framer Motion

### 17.1 Configuración Centralizada
**Archivo**: `lib/motion-config.ts`

#### Transiciones Estándar
- **smooth**: Tween 300ms easeOut
- **gentle**: Tween 400ms easeOut
- **quick**: Tween 200ms easeOut
- **spring**: Spring natural (stiffness: 300, damping: 30)
- **springGentle**: Spring suave (stiffness: 200, damping: 25)

#### Variantes Reusables
- **fadeVariants**: Fade in/out simple
- **fadeUpVariants**: Fade in con movimiento vertical
- **scaleVariants**: Scale in/out
- **staggerContainer**: Contenedor con stagger children
- **staggerItem**: Item individual para stagger
- **hoverScale**: Hover con escala
- **hoverLift**: Hover con elevación
- **buttonVariants**: Estados de botón (rest, hover, tap)
- **modalVariants**: Animaciones de modal
- **cardVariants**: Estados de card (rest, hover)

### 17.2 Principios de Animación
- **Duración**: 200-400ms para transiciones normales
- **Spring**: Usar para interacciones naturales
- **Stagger**: 80ms delay entre items en listas
- **Sutileza**: Animaciones discretas, no distractivas

---

## 18. Navegación Responsive

### 18.1 Desktop (≥768px)
- **Sidebar**: Fijo a la izquierda, 260px de ancho
- **Glassmorphism**: `glass-sidebar` con blur profundo
- **Transiciones**: Hover con movimiento horizontal suave

### 18.2 Móvil (<768px)
- **Sidebar**: Oculto
- **Bottom Nav**: Fijo en la parte inferior
- **Glassmorphism**: `glass-bottom-nav` con blur y borde superior
- **Indicadores**: Animación con `layoutId` para transición suave

---

## Changelog
- **v2.0** (Diciembre 2024): Rediseño completo con paleta púrpura/rosa, glassmorphism estilo VisionOS, y Framer Motion
- **v1.0** (2024): Sistema inicial establecido

---

**Última actualización**: Diciembre 2024
**Mantenido por**: Equipo de Diseño CircleSfera

