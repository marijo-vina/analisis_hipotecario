# Gestión Financiera — Design System

> **Principio de diseño**
>
> Gestión Financiera es una plataforma para asesoras hipotecarias.
> La interfaz debe transmitir confianza, claridad y agilidad, sin sentirse fría como un sistema bancario tradicional.
>
> La identidad visual se basa en el concepto:
>
> **Cálido, luminoso y con acentos inteligentes.**
>
> El usuario pasa varias horas trabajando en la plataforma. Por ello, el color debe reducir la fatiga visual y utilizarse únicamente para dirigir la atención hacia acciones importantes.

---

# Filosofía de color

La interfaz sigue una proporción aproximada:

- **90%** colores neutros cálidos
- **8%** color institucional
- **2%** colores semánticos

Esto permite que los elementos importantes destaquen sin saturar visualmente la aplicación.

---

# Paleta principal

colors:

  # ---------- Backgrounds ----------

  background: "#FBF8F7"

  surface: "#FAF8F7"

  surface-bright: "#FFFFFF"

  surface-dim: "#F5F1F0"

  surface-container-lowest: "#FFFFFF"

  surface-container-low: "#FCFAF9"

  surface-container: "#F7F3F2"

  surface-container-high: "#F2ECEB"

  surface-container-highest: "#ECE5E3"

  # ---------- Text ----------

  on-background: "#1F1F21"

  on-surface: "#1F1F21"

  on-surface-variant: "#676B73"

  inverse-surface: "#26272B"

  inverse-on-surface: "#FFFFFF"

  # ---------- Brand ----------

  primary: "#9C001F"

  on-primary: "#FFFFFF"

  primary-container: "#FBE7E9"

  on-primary-container: "#7A0018"

  surface-tint: "#9C001F"

  inverse-primary: "#FFCCD3"

  # ---------- Secondary ----------

  secondary: "#667085"

  on-secondary: "#FFFFFF"

  secondary-container: "#EEF2F6"

  on-secondary-container: "#475467"

  # ---------- Accent ----------

  tertiary: "#0F5C81"

  on-tertiary: "#FFFFFF"

  tertiary-container: "#EAF6FC"

  on-tertiary-container: "#0B3E56"

  # ---------- Borders ----------

  outline: "#D7DCE2"

  outline-variant: "#ECEFF3"

  # ---------- Semantic ----------

  success: "#067647"

  on-success: "#FFFFFF"

  success-container: "#ECFDF3"

  on-success-container: "#065F46"

  warning: "#B54708"

  on-warning: "#FFFFFF"

  warning-container: "#FFF7ED"

  on-warning-container: "#7A2E0E"

  info: "#155EEF"

  on-info: "#FFFFFF"

  info-container: "#EFF8FF"

  on-info-container: "#1849A9"

  error: "#D92D20"

  on-error: "#FFFFFF"

  error-container: "#FEF3F2"

  on-error-container: "#912018"

---

# Uso del color

## Color institucional (rojo)

Utilizar únicamente para:

- Botones primarios
- Sidebar activo
- Indicadores de progreso
- Links principales
- Acciones importantes
- Branding

Nunca utilizar el rojo institucional como color de error.

---

## Success

Utilizar para:

- Documento procesado
- Validaciones exitosas
- Resultado vigente
- Datos conciliados

---

## Warning

Utilizar para:

- Observaciones
- Requiere revisión
- Resultado desactualizado
- Documento incompleto

---

## Error

Utilizar únicamente cuando exista un fallo real.

Ejemplos:

- Error del servidor
- OCR fallido
- Documento ilegible
- Operación fallida

---

## Info

Utilizar para:

- Información contextual
- Ayudas
- Tooltips
- Estados informativos

---

# Fondos de columnas Kanban

Las columnas utilizan fondos muy suaves para mejorar la lectura sin competir con las tarjetas.

Pendiente de documentos

background: "#FFF6F6"

Documentación completa

background: "#F6FAFF"

Documentos procesados

background: "#F5FCF8"

Resultado preliminar

background: "#FAF7FF"

Las tarjetas permanecen completamente blancas.

---

# Cards

Las tarjetas siempre utilizan:

background: White

border: Outline

shadow: Muy ligera

Nunca utilizar fondos de colores sólidos.

Los colores únicamente aparecen en:

- badges
- barra lateral
- borde izquierdo
- iconografía
- indicadores

---

# Tipografía

Fuente principal:

Inter

Pesos:

400 Regular

500 Medium

600 Semibold

700 Bold

Nunca utilizar más de cuatro pesos tipográficos.

---

# Border Radius

Cards:

12px

Inputs:

10px

Botones:

10px

Badges:

999px

---

# Espaciado

Escala base:

4

8

12

16

24

32

40

48

64

---

# Sombras

Utilizar sombras muy suaves.

Priorizar siempre:

- contraste
- espacio
- bordes

sobre sombras intensas.

---

# Iconografía

Utilizar:

Lucide Icons

Estilo:

- outline
- 2px
- tamaño consistente

---

# Principios UX

## El color comunica prioridad

No decoración.

## El espacio comunica jerarquía

Más espacio es mejor que más líneas.

## El usuario debe entender el estado en menos de 3 segundos.

## Una acción principal por pantalla.

## Las tarjetas deben ser escaneables.

La información importante siempre aparece en este orden:

1. Cliente
2. Objetivo del crédito
3. Estado
4. Acción requerida

---

# Personalidad visual

La interfaz debe sentirse:

✓ Profesional

✓ Cercana

✓ Moderna

✓ Ligera

✓ Con mucho aire

✓ Fácil de leer

Nunca debe sentirse:

✗ Bancaria

✗ Recargada

✗ Infantil

✗ Oscura

✗ Saturada de rojo

✗ Monótona
