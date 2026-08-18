# Guía de Configuración — Google Cloud Platform

Este documento describe los servicios de GCP necesarios para ejecutar el
sistema y cómo recrearlos en una cuenta de GCP propia de Gestión Financiera.

**Tiempo estimado de setup: 1-2 horas** (la mayor parte es esperar a que
se active el procesador de Document AI).

---

## 1. Crear un proyecto en GCP

1. Ir a [Google Cloud Console](https://console.cloud.google.com)
2. Crear un proyecto nuevo (ej: `gf-hipotecario-prod`)
3. Anotar el **Project ID** — se usa en todas las variables de entorno

---

## 2. Habilitar las APIs necesarias

En el panel de APIs y Servicios > Biblioteca, buscar y habilitar:

| API | Propósito |
|---|---|
| **Cloud Document AI API** | OCR de documentos PDF |
| **Vertex AI API** | Gemini para extracción de datos |
| **Cloud Storage API** | Almacenamiento de PDFs subidos |

---

## 3. Crear el bucket de Cloud Storage

1. Ir a Cloud Storage > Buckets
2. Crear bucket (ej: `gf-hipotecario-docs-prod`)
3. Región: `us-central1` (o la que prefieran)
4. Clase: Standard
5. Control de acceso: Uniforme (recomendado)

---

## 4. Crear el procesador de Document AI

1. Ir a [Document AI](https://console.cloud.google.com/ai/document-ai)
2. Crear procesador:
   - Tipo: **Layout Parser** (extrae texto, tablas, y bounding boxes)
   - Nombre: `hipotecario-layout-parser`
   - Región: `us`
3. Una vez creado, copiar el **Processor ID** (formato: `3856012ede9fdbfd`)
   → va en la variable `GCLOUD_PROCESSOR_ID`

---

## 5. Crear cuenta de servicio y credenciales

1. Ir a IAM y administración > Cuentas de servicio
2. Crear cuenta de servicio:
   - Nombre: `hipotecario-api`
   - Rol 1: **Storage Object Admin** (leer/escribir/borrar archivos del bucket)
   - Rol 2: **Document AI API User** (usar el procesador de OCR)
   - Rol 3: **Vertex AI User** (usar Gemini)
3. Crear clave JSON:
   - Seleccionar la cuenta → Claves → Agregar clave → JSON
   - Guardar el archivo como `gcp-credentials.json`
   - **NUNCA commitear este archivo al repositorio.** Está en `.gitignore`.

---

## 6. Configurar variables de entorno

Copiar `.env.example` a `apps/api/.env` y reemplazar estos valores:

```
GCLOUD_PROJECT_ID=<Project ID del paso 1>
GCS_PROJECT_ID=<Project ID del paso 1>
GCS_BUCKET_NAME=<nombre del bucket del paso 3>
GCLOUD_PROCESSOR_ID=<Processor ID del paso 4>
GEMINI_PROJECT_ID=<Project ID del paso 1>
GOOGLE_APPLICATION_CREDENTIALS=./gcp-credentials.json

# --- Correo y Confirmación (SMTP) ---
APP_URL=https://tu-dominio-frontend.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu-correo@gmail.com
SMTP_PASS=tu-contrasena-de-aplicacion
MAIL_FROM="Operaciones Hipotecarias <no-reply@gestionfinanciera.com>"
```

---

## 7. Verificar y preparar el despliegue

```bash
# Desde la raíz del proyecto
cd apps/api

# Instalar dependencias
npm install

# Aplicar actualización de base de datos (crear tablas User, VerificationToken, etc.)
npx prisma db push --config ./prisma.config.ts

# Arrancar la API
npm run start:dev
```

Si arranca sin errores de autenticación GCP ni de base de datos, el setup está completo.

---

## Nota: costos estimados

Con uso moderado (< 200 documentos por mes):

| Servicio | Costo mensual aprox |
|---|---|
| Document AI (Layout Parser) | $10-30 USD |
| Vertex AI (Gemini 2.5 Flash) | $5-15 USD |
| Cloud Storage | < $1 USD |
| **Total estimado** | **$20-50 USD/mes** |
