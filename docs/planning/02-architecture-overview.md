# 02. Architecture Overview

## 1. Patrón de Repositorio

El proyecto utiliza un patrón de **Monorepo Manual**, sin herramientas de orquestación complejas como Nx o Turborepo. Esto permite mantener la simplicidad operativa durante la fase MVP.

```text
/analisis_hipotecario
├── apps/
│   ├── api/       # Backend (NestJS)
│   └── web/       # Frontend (Next.js)
├── specs/         # Documentación y especificaciones SDD
├── package.json   # Dependencias globales (opcional)
```

**Importante:** `apps/api` y `apps/web` no son submódulos de Git, sino directorios regulares versionados desde la raíz del repositorio.

## 2. Stack Tecnológico

### 2.1 Frontend (`/apps/web`)
- **Framework:** Next.js (App Router recomendado).
- **Librería de UI:** React.
- **Lenguaje:** TypeScript.
- **Estilos:** Tailwind CSS.
- **Puerto local:** `http://localhost:3000`

### 2.2 Backend (`/apps/api`)
- **Framework:** NestJS.
- **Lenguaje:** TypeScript.
- **ORM:** Prisma ORM.
- **Puerto local:** `http://localhost:3001`
- **Configuración Base:** CORS habilitado para el frontend, `ValidationPipe` global, y Health Check.

### 2.3 Base de Datos
- **Motor:** PostgreSQL.
- **Entorno Local:** Contenedor Docker.

### 2.4 Servicios Externos (Integraciones IA y Nube)
- **Almacenamiento:** Google Cloud Storage (GCS) para guardar los documentos (PDFs, imágenes) subidos.
- **OCR:** Google Document AI para extracción cruda de texto.
- **IA Estructurada:** Gemini (Gemini 2.5 Pro API) para parsear el texto OCR hacia JSON estructurado (nóminas, estados de cuenta, buró).

## 3. Flujo de Comunicación

1. **Cliente Web:** El usuario (asesora) interactúa con la UI en Next.js.
2. **API REST:** El frontend se comunica vía peticiones HTTP (REST) con el backend en NestJS.
3. **Persistencia:** El backend interactúa con PostgreSQL usando Prisma ORM para guardar estados y metadata.
4. **Archivos:** Los binarios (PDFs) se envían del backend a GCS.
5. **Procesamiento Asíncrono / Síncrono:** El backend llama a Document AI y luego a Gemini para el análisis documental.