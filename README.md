# Análisis Hipotecario

Sistema de análisis crediticio hipotecario automatizado. Procesa documentos financieros
mexicanos (buró de crédito, nóminas, estados de cuenta, identificaciones) usando OCR e
inteligencia artificial, y genera una comparativa de viabilidad contra políticas de
múltiples bancos.

**Perfiles soportados:** Asalariado ✅ | PFAE 🔲 | Persona Moral 🔲

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router) + Tailwind 4 |
| API | NestJS (Node.js) |
| Base de datos | PostgreSQL + Prisma ORM |
| OCR | Google Document AI (Layout Parser) |
| IA | Gemini 2.5 Flash (Vertex AI) |
| Almacenamiento | Google Cloud Storage |
| PDF parsing | pdfjs-dist (extracción por coordenadas) |

---

## Requisitos previos

- Node.js 18+
- PostgreSQL 15+ (local o Cloud SQL)
- Cuenta de Google Cloud con Document AI, Vertex AI y Cloud Storage habilitados
- (Ver [GCP-SETUP.md](./GCP-SETUP.md) para configurar GCP desde cero)

---

## Estructura del proyecto

```
analisis_hipotecario/
├── apps/
│   ├── api/                     # Backend NestJS
│   │   ├── prisma/              # Schema y migraciones
│   │   ├── src/
│   │   │   ├── documents/       # Extracción documental (buró, nómina, etc.)
│   │   │   ├── mortgage-cases/  # Gestión de expedientes
│   │   │   ├── case-analysis/   # Análisis de viabilidad bancaria
│   │   │   └── ...
│   │   └── .env
│   └── web/                     # Frontend Next.js
│       └── app/
│           ├── ui/              # Componentes de interfaz
│           ├── actions/         # Server actions
│           └── lib/             # Utilidades compartidas
├── designs/                     # Archivos de diseño (.fig)
├── docs/                        # Documentación histórica
│   ├── planning/                # Planes iniciales y specs viejas
│   └── sdd-archive/             # Ciclos SDD antiguos
├── experiments/                 # Pruebas de concepto
├── openspec/                    # Especificaciones activas (SDD)
│   ├── specs/                   # Especificaciones por módulo
│   │   └── ai-extraction/       # Schemas de extracción documental
│   └── changes/                 # Cambios en curso y archivados
├── GCP-SETUP.md                 # Guía de configuración GCP
└── .env.example                 # Plantilla de variables de entorno
```

---

## Instalación y ejecución

### 1. Clonar e instalar dependencias

```bash
git clone https://github.com/marijo-vina/analisis_hipotecario.git
cd analisis_hipotecario

# API
cd apps/api
npm install
cp ../../.env.example .env   # editar .env con valores reales
npx prisma migrate dev
cd ../..

# Frontend
cd apps/web
npm install
echo 'API_URL=http://localhost:3001' > .env.local
cd ../..
```

### 2. Levantar PostgreSQL (si no tenés uno local)

```bash
docker compose up -d
```

### 3. Arrancar en desarrollo

```bash
# Terminal 1 — API (puerto 3001)
cd apps/api
npm run start:dev

# Terminal 2 — Frontend (puerto 3000)
cd apps/web
npm run dev
```

Abrir http://localhost:3000

---

## Cómo funciona — flujo de extracción

```
PDF subido → GCS → Document AI (OCR) → Gemini (extracción IA) → Post-procesamiento → Datos estructurados
```

### Tipos de documento procesados

| Documento | Extracción | Campos principales |
|---|---|---|
| Buró de crédito | Gemini + coordenadas | Créditos, saldos, historial de pagos, MOP |
| Recibos de nómina | Gemini + inferencia | Percepciones, deducciones, periodicidad |
| Estados de cuenta | Gemini | Depósitos de nómina, RFC del titular |
| INE / Pasaporte | Gemini | Nombre, RFC, CURP, fecha de nacimiento |
| Mi Score | Gemini | Score crediticio |

### Pipeline híbrido del buró de crédito

El buró usa dos extractores que se fusionan:

1. **Coordinate grid extractor** (determinista): detecta columnas del PDF por
   posición X y extrae `paymentDueAmount`, `creditLimit`, `currentBalance`,
   `mopCodes` directamente. No depende de IA.
2. **Gemini** (semántico): clasifica tipo de crédito (`REVOLVING`, `FIXED_PAYMENT`),
   interpreta claves de observación, extrae nombre de institución.

La fusión usa una jerarquía de autoridad: el valor determinista gana sobre Gemini
para campos financieros. Si ningún extractor confirma el dato, se marca para
revisión manual.

---

## Tests

```bash
cd apps/api
npm run test
# 840 tests, 48 suites
```

---

## Roadmap

| Fase | Estado |
|---|---|
| Asalariado completo | ✅ Funcional |
| Deploy a producción | 🔲 Pendiente — requiere Dockerfiles y GCP setup |
| PFAE (constancia fiscal SAT) | 🔲 4-6 semanas estimadas |
| Persona Moral | 🔲 Por definir |
| Python para buró (pdfplumber) | 📋 Recomendado para mejorar precisión financiera |

---

## Limitaciones conocidas

- **Precisión del buró**: Gemini ocasionalmente intercambia `paymentDueAmount`
  con `lastPaymentAmount`. El coordinate grid extractor mitiga esto, pero en
  PDFs con layouts atípicos puede requerir revisión manual.
- **Sin CI/CD**: El deploy no está automatizado. Se requiere levantar
  manualmente en Cloud Run o VM.
- **Sin Dockerfiles**: El proyecto no está dockerizado para producción.
  Ver `docker-compose.yml` para desarrollo local (solo PostgreSQL).
- **PDFs escaneados**: Document AI maneja PDFs escaneados, pero la calidad del
  OCR depende de la legibilidad del documento original.

---

## Próximo desarrollador — por dónde empezar

1. Leer este README
2. Leer `GCP-SETUP.md` y configurar los servicios de Google Cloud
3. Revisar `apps/api/src/documents/credit-bureau-extraction.service.ts` —
   es el servicio más complejo y el corazón del sistema
4. Revisar `specs/ai-extraction/` para entender los schemas de extracción
5. Los experimentos en `experiments/buro-pdf-coordinate-poc/` muestran la
   dirección recomendada para mejorar la precisión del buró (Python + pdfplumber)

---

## Contacto

Desarrollado por Marijo Viña como proyecto de estadía profesional para
Gestión Financiera.

Repositorio: https://github.com/marijo-vina/analisis_hipotecario
