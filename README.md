# Análisis Hipotecario

Sistema de análisis crediticio hipotecario que automatiza la extracción de datos
de documentos financieros y genera una comparativa de viabilidad contra políticas
bancarias. Construido como proyecto integral — desde el pipeline de OCR e IA
hasta el dashboard operativo.

---

## Problema que resuelve

En México, un asesor hipotecario analiza manualmente entre 8 y 15 documentos por
cliente (buró de crédito, recibos de nómina, estados de cuenta, identificaciones)
para determinar si califica para un crédito y con qué banco. Cada expediente
toma horas. Los errores humanos en la extracción de datos pueden llevar a recomendaciones incorrectas.

Este sistema automatiza ese proceso: el asesor sube los PDFs, y en minutos obtiene
un análisis completo con datos extraídos, cálculo de capacidad de pago, y una
tabla de viabilidad por banco.

---

## Estado actual — MVP Asalariado

**Funcional de punta a punta.** El perfil asalariado está completo: subida de
documentos, extracción con OCR + IA, análisis financiero, y dashboard Kanban.

| Componente | Estado |
|---|---|
| Pipeline de extracción documental | ✅ Funcional |
| Buró de crédito (Gemini + coordenadas) | ✅ Funcional |
| Recibos de nómina | ✅ Funcional |
| Estados de cuenta bancarios | ✅ Funcional |
| Identificaciones oficiales | ✅ Funcional |
| Cálculo de pasivos e ingresos | ✅ Funcional |
| Comparativa bancaria multi-banco | ✅ Funcional |
| Dashboard Kanban con estados automáticos | ✅ Funcional |

---

## Principales aportaciones

- **Pipeline híbrido de extracción del buró de crédito.** Combinación de
  extracción determinística por coordenadas (PDF) con clasificación semántica
  vía LLM. La autoridad de datos financieros es determinista; el LLM solo
  interpreta contexto. Esto resolvió el problema de datos inconsistentes que
  ocurría al depender únicamente del LLM.

- **Sistema de estados auto-calculados.** Los estados del expediente no los
  asigna manualmente el asesor — se derivan automáticamente de la presencia y
  procesamiento de documentos. Esto elimina error humano y acelera el flujo.

- **Guardrail de tres campos para datos críticos.** Para `paymentDueAmount`
  (el monto a pagar del buró), el sistema mantiene tres valores: el extraído
  automáticamente, el corregido manualmente por el analista, y el efectivo
  (manual si existe, extraído si está confirmado, null si no). El analista
  siempre puede corregir, y el sistema nunca muestra datos no confirmados.

- **Alertas 100% determinísticas.** Las alertas y flags de riesgo las calcula
  el backend contra reglas de negocio, no el LLM. Esto evita alertas falsas o
  inconsistentes entre ejecuciones.

---

## Alcance actual

**Perfiles de cliente:**
- ✅ Asalariado — completo
- 🔲 PFAE (Persona Física con Actividad Empresarial) — planificado
- 🔲 Persona Moral — planificado

**Tipos de documento procesados:**

| Documento | Extracción | Campos principales |
|---|---|---|
| Buró de crédito | Híbrido (coordenadas + Gemini) | Créditos, saldos, historial de pagos (MOP), fechas |
| Recibos de nómina (CFDI) | Gemini + inferencia de periodicidad | Percepciones, deducciones, RFC, periodicidad |
| Estados de cuenta | Gemini | Depósitos de nómina, titular, balance |
| INE / Pasaporte | Gemini | Nombre, RFC, CURP, fecha de nacimiento |

---

## Arquitectura

```
┌──────────┐     ┌──────────────┐     ┌─────────────┐
│  Cliente  │────▶│  Next.js 16  │────▶│  NestJS API  │
│ (browser) │     │  (App Router)│     │  (Node.js)   │
└──────────┘     └──────────────┘     └──────┬──────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
              ┌─────▼─────┐          ┌──────▼──────┐          ┌──────▼──────┐
              │ PostgreSQL │          │ Google Cloud │          │ Vertex AI   │
              │  (Prisma)  │          │   Storage    │          │ (Gemini 2.5)│
              └───────────┘          └─────────────┘          └─────────────┘
                                             │
                                    ┌────────▼────────┐
                                    │  Document AI     │
                                    │  (OCR / Layout)  │
                                    └─────────────────┘
```

**Monorepo** con dos aplicaciones en `apps/` — API (NestJS) y frontend (Next.js).
Tipos compartidos sin publicación de paquetes. Separación clara de responsabilidades:
el frontend no contiene lógica de negocio; la API es la única fuente de verdad.

---

## Stack

| Capa | Tecnología | Criterio de elección |
|---|---|---|
| Frontend | Next.js 16 + Tailwind 4 | App Router híbrido SSR/CSR. Mismo lenguaje que backend |
| API | NestJS | Arquitectura modular, dependency injection, ecosistema Node |
| ORM | Prisma | Type-safety extremo a extremo, migraciones declarativas |
| Base de datos | PostgreSQL | JSONB para datos extraídos semi-estructurados |
| Almacenamiento | Google Cloud Storage | PDFs con signed URLs, bucket privado |
| OCR | Google Document AI | Superior a Tesseract para documentos financieros mexicanos |
| IA | Gemini 2.5 Flash (Vertex AI) | Mismo proveedor GCP, menor latencia, respuesta JSON nativa |
| PDF parsing | pdfjs-dist | Extracción por coordenadas de columnas financieras |

---

## Cómo funciona — Pipeline documental

```
1. SUBIDA → PDF guardado en GCS, registrado en BD (UPLOADED)
2. OCR → Document AI extrae texto + bounding boxes por palabra
3. EXTRACCIÓN → Gemini recibe OCR + schema JSON + instrucciones específicas
4. POST-PROCESAMIENTO → Normalización, validación de enums, desambiguación
5. FUSIÓN → Datos deterministas (coordenadas) se mergean con datos del LLM
6. ALERTAS → Cálculo determinístico de flags de riesgo
7. PERSISTENCIA → Datos extraídos guardados en Document.extractedData (JSONB)
8. ANÁLISIS → Cálculo de pasivos, ingresos, y comparativa bancaria
```

### Pipeline híbrido del buró de crédito

El buró de crédito es el documento más crítico y complejo. Usa dos extractores:

1. **Coordinate grid extractor** — recorre el PDF con pdfjs-dist, detecta
   columnas por posición X relativa a encabezados ("Saldo Actual", "Monto a Pagar",
   "Límite de Crédito", "Histórico de Pagos"). Extrae montos y códigos MOP
   **sin usar IA**. Es determinístico.

2. **Gemini** — recibe el texto OCR y clasifica semánticamente: tipo de crédito
   (`REVOLVING`, `FIXED_PAYMENT`), nombre de institución, claves de observación,
   flags de quebranto y fraude.

3. **Merge por autoridad** — los valores del extractor determinista ganan sobre
   Gemini para campos financieros. Si ningún extractor confirma un dato, se marca
   para revisión manual en lugar de mostrar valores no verificados.

---

## Decisiones técnicas destacadas

### Buró híbrido: determinista + IA, no solo IA

**Problema:** Gemini (como cualquier LLM) es probabilístico. Confunde
`paymentDueAmount` (monto a pagar) con `lastPaymentAmount` (último pago) porque
ambos aparecen como números en el PDF. Este era el error #1 en producción.

**Decisión:** Separar la extracción en dos capas independientes que se fusionan
con una jerarquía de autoridad explícita. Lo determinístico gana sobre lo
probabilístico. El LLM solo clasifica, no calcula.

**Impacto:** La capa determinista elimina la principal fuente de
inconsistencias en los campos financieros críticos. Para esos campos,
la misma entrada produce el mismo resultado.

### Estados auto-calculados, no manuales

**Problema:** Con 8 estados manuales, el asesor debía decidir cuándo avanzar
el expediente. Esto generaba inconsistencias y cuellos de botella.

**Decisión:** Reducir a 4 estados derivados automáticamente de eventos del
sistema: documentos pendientes, documentos procesados, análisis completado,
y requiere revisión.

### Human-in-the-loop para datos críticos

**Problema:** Si el sistema no puede confirmar un dato (ej: `paymentDueAmount`
con baja confianza), ¿qué mostrar?

**Decisión:** Patrón de triple campo. `extracted` (lo que sacó el sistema) +
`manual` (corrección del analista) + `effective` (manual ?? extracted : null).
El analista siempre puede intervenir. El sistema nunca muestra datos dudosos
como si fueran confirmados.

### Alertas determinísticas, no del LLM

**Problema:** Gemini ocasionalmente generaba alertas inexistentes o inconsistentes.

**Decisión:** El backend calcula todas las alertas contra reglas de negocio
basadas en los datos ya extraídos. El LLM solo extrae; nunca decide qué es
riesgoso.

---

## Estructura del proyecto

```
analisis_hipotecario/
├── apps/
│   ├── api/                     # Backend NestJS
│   │   ├── prisma/              # Schema y migraciones
│   │   └── src/
│   │       ├── documents/       # Extracción documental (buró, nómina, etc.)
│   │       ├── mortgage-cases/  # Gestión de expedientes
│   │       └── case-analysis/   # Análisis de viabilidad bancaria
│   └── web/                     # Frontend Next.js
│       └── app/ui/              # Componentes de interfaz (server + client)
├── designs/                     # Diseños visuales (.fig)
├── docs/                        # Documentación histórica y planes
├── openspec/                    # Especificaciones activas (SDD)
│   ├── specs/                   # Especificaciones por módulo
│   └── changes/                 # Cambios en curso y archivados
├── experiments/                 # Pruebas de concepto
├── GCP-SETUP.md                 # Guía de configuración Google Cloud
└── .env.example                 # Plantilla de variables de entorno
```

---

## Requisitos previos

- Node.js 18+
- PostgreSQL 15+
- Cuenta de Google Cloud con Document AI, Vertex AI y Cloud Storage habilitados
- Guía de setup GCP: [`GCP-SETUP.md`](./GCP-SETUP.md)

---

## Instalación y ejecución

```bash
# 1. Clonar
git clone https://github.com/marijo-vina/analisis_hipotecario.git
cd analisis_hipotecario

# 2. API
cd apps/api
npm install
cp ../../.env.example .env    # Editar .env con valores reales
npx prisma migrate dev
npm run start:dev             # Puerto 3001

# 3. Frontend (nueva terminal)
cd apps/web
npm install
echo 'API_URL=http://localhost:3001' > .env.local
npm run dev                   # Puerto 3000

# 4. Base de datos (si no tenés PostgreSQL local)
docker compose up -d
```

---

## Testing

```bash
cd apps/api
npm run test
# 840 tests, 48 suites, 99.76% pass rate
```

Tests unitarios y de integración para todos los servicios de extracción,
cálculo financiero, y endpoints REST. Los servicios externos (Document AI,
Vertex AI) se mockean con respuestas controladas.

---

## Roadmap

| Fase | Estado |
|---|---|
| Asalariado (buró, nómina, bancos, identificación) | ✅ Completo |
| Deploy a producción (Docker, Cloud Run) | 🔲 Pendiente |
| PFAE — Constancia de Situación Fiscal + factores por régimen | 🔲 4-6 semanas |
| Optimización buró con Python (pdfplumber) | 📋 Recomendado |
| Persona Moral | 🔲 Por definir |

---

## Limitaciones conocidas

- **Precisión del buró:** Gemini ocasionalmente confunde `paymentDueAmount` y
  `lastPaymentAmount`. El coordinate grid extractor mitiga este problema, pero
  PDFs con layouts muy atípicos pueden requerir revisión manual.
- **Sin CI/CD ni Dockerfiles:** El proyecto se ejecuta en desarrollo local.
  Faltan Dockerfiles de producción y scripts de deploy automatizado.
- **PDFs escaneados de baja calidad:** Document AI maneja PDFs escaneados,
  pero la precisión del OCR depende de la calidad del documento original.
- **PFAE y Persona Moral no implementados:** La arquitectura está preparada
  para recibir estos perfiles, pero no se ha desarrollado la extracción
  de sus documentos adicionales.

---

## Próximo desarrollador — guía rápida

1. Leer este README completo
2. Leer `GCP-SETUP.md` y configurar los servicios de Google Cloud
3. El archivo clave es `apps/api/src/documents/credit-bureau-extraction.service.ts` —
   es el servicio más complejo, el corazón del sistema
4. Revisar `openspec/specs/ai-extraction/schemas/` para entender el contrato
   de datos que Gemini debe cumplir
5. La carpeta `experiments/buro-pdf-coordinate-poc/` contiene la POC de
   extracción por coordenadas y apunta la dirección recomendada para el
   upgrade a Python + pdfplumber

---

## Decisiones y aprendizajes

### Lo que haría diferente

- **Comenzar con el coordinate grid extractor desde el día 1.** Las primeras
  iteraciones del buró dependían 100% de Gemini. El coordinate grid extractor
  se construyó después como parche. Si empezara de nuevo, lo construiría
  primero como fuente primaria, y Gemini solo como clasificador semántico.

- **Priorizar infraestructura de despliegue antes.** La funcionalidad tuvo
  prioridad durante el MVP, por lo que Docker y CI/CD quedaron para la
  siguiente fase. En una segunda iteración establecería primero el pipeline
  de despliegue y posteriormente continuaría ampliando funcionalidades.

### Lo que aprendí

- **Extracción documental financiera:** El buró de crédito mexicano, los CFDI
  de nómina, y los estados de cuenta bancarios tienen estructuras predecibles
  pero con variaciones entre emisores. Un LLM solo no es suficiente; hace falta
  una capa determinística que entienda la geometría del documento.

- **Arquitectura híbrida IA + reglas:** La combinación de un LLM para tareas
  semánticas con extractores determinísticos para datos numéricos produce
  resultados más confiables que cualquiera de los dos por separado.

- **Google Cloud Platform:** Integración de Document AI, Vertex AI, y Cloud
  Storage en un solo proyecto. Autenticación con cuentas de servicio,
  procesamiento asíncrono de documentos, y manejo de errores en APIs externas.

---

## Versión entregada

**Versión:** v1.0.0  
**Estado:** Versión funcional del MVP  
**Perfil soportado:** Persona asalariada

Esta versión corresponde al alcance desarrollado durante el proyecto de
estadía profesional y constituye la base para futuras extensiones del sistema.

---

## Contacto

Desarrollado por Marijose Vinajera como proyecto de estadía profesional.

[Repositorio en GitHub](https://github.com/marijo-vina/analisis_hipotecario)
