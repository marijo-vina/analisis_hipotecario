# API — Análisis Hipotecario

Backend NestJS del sistema de análisis crediticio hipotecario.

## Requisitos

- Node.js 18+
- PostgreSQL 15+
- Servicios GCP configurados (ver [`GCP-SETUP.md`](../../GCP-SETUP.md))

## Instalación

```bash
npm install
cp ../../.env.example .env    # Editar con valores reales
npx prisma generate
npx prisma migrate dev
```

## Ejecución

```bash
npm run start:dev    # Desarrollo con hot reload (puerto 3001)
npm run build        # Compilar TypeScript
npm run start:prod   # Producción
```

## Tests

```bash
npm run test          # Unitarios + integración (840 tests, 48 suites)
npm run test:cov      # Con cobertura
```

## Estructura principal

```
src/
├── documents/              # Extracción documental con OCR + Gemini
│   ├── credit-bureau-extraction.service.ts   # Pipeline híbrido del buró
│   ├── coordinate-extraction.service.ts      # Extracción por coordenadas PDF
│   ├── payroll-extraction.service.ts         # Recibos de nómina (CFDI)
│   ├── bank-statement-extraction.service.ts  # Estados de cuenta
│   ├── official-id-extraction.service.ts     # Identificaciones oficiales
│   └── gemini.service.ts                     # Cliente Vertex AI Gemini
├── case-analysis/          # Motor de viabilidad bancaria
├── mortgage-cases/         # Gestión de expedientes
├── prisma/                 # Schema y migraciones
└── generated/prisma/       # Cliente Prisma generado
```

## Servicios externos

| Servicio | Uso |
|---|---|
| Google Document AI | OCR de PDFs (Layout Parser) |
| Vertex AI (Gemini 2.5 Flash) | Extracción de datos con IA |
| Google Cloud Storage | Almacenamiento de PDFs subidos |
| PostgreSQL | Base de datos (Prisma ORM) |
