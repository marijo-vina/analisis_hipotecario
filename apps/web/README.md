# Frontend — Análisis Hipotecario

Interfaz de usuario del sistema de análisis crediticio hipotecario para
asesores de Gestión Financiera.

## Stack

- Next.js 16 (App Router)
- Tailwind CSS 4
- React 19 (Server + Client Components)

## Requisitos

- API corriendo en `http://localhost:3001` (ver [`apps/api/README.md`](../api/README.md))

## Instalación

```bash
npm install
echo 'API_URL=http://localhost:3001' > .env.local
```

## Ejecución

```bash
npm run dev     # Desarrollo (puerto 3000)
npm run build   # Compilar para producción
npm start       # Producción
```

## Rutas principales

| Ruta | Descripción |
|---|---|
| `/login` | Acceso de asesores |
| `/dashboard` | Dashboard Kanban con estados automáticos |
| `/dashboard/clientes` | Listado y gestión de clientes |
| `/dashboard/expedientes` | Listado de expedientes |
| `/dashboard/expedientes/[id]` | Workspace del expediente (documentos, extracción, análisis) |

## Conexión con la API

El frontend no contiene lógica de negocio. Todas las operaciones (subida de
documentos, extracción, análisis) se hacen mediante llamadas a la API en
`localhost:3001`. La URL se configura en `.env.local` con la variable `API_URL`.

Para producción, esta variable debe apuntar a la URL pública de la API.

## Estructura

```
app/
├── ui/                     # Componentes de interfaz
│   ├── dashboard/          # Dashboard Kanban
│   ├── clientes/           # Listados y formularios de clientes
│   ├── expedientes/        # Workspace del expediente, análisis
│   ├── documents/          # Subida y gestión de documentos
│   ├── extraction/         # Tabs de datos extraídos (buró, nómina, etc.)
│   └── layout/             # Sidebar, shell de la aplicación
├── actions/                # Server actions (autenticación, API calls)
└── lib/                    # Tipos y utilidades compartidas
```
