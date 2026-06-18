# PLAN_POR_SPRINTS.md

## Proyecto

Sistema de Análisis Hipotecario para Gestión Financiera.

### Objetivo MVP

Reducir el trabajo manual de captura y análisis documental para clientes asalariados mediante:

* Gestión de expedientes.
* OCR documental.
* Extracción estructurada con IA.
* Validaciones financieras.
* Cálculo preliminar de capacidad de pago.
* Reporte interno de análisis.

---

## Alcance MVP

### Incluido

* Usuarios internos.
* Clientes asalariados.
* Expedientes hipotecarios.
* Carga documental.
* OCR + IA.
* Validaciones documentales.
* Cálculo de capacidad de pago.
* Comparativa bancaria.
* Reporte interno.

### No incluido

* Portal para clientes.
* Firma electrónica.
* Aprobación automática de créditos.
* Personas Morales.
* PFAE.
* Integraciones bancarias directas.

---

## Sprint 1 — Base Operativa

Estado: Completado

Historias entregadas:
- HU-01 Login interno.
- HU-02 Gestión de clientes.
- HU-03 Crear expediente hipotecario.
- HU-04 Frontend operativo de clientes y expedientes.
- HU-05 Estados del expediente.
- HU-06 Carga documental y metadata.
- HU-07 Dashboard / ajustes operativos.

Resultado:
- Login funcional.
- Clientes registrados.
- Expedientes creados y consultables.
- Documentos cargados en Google Cloud Storage.
- Metadata documental registrada.
- Estados de expediente disponibles.
- Dashboard interno operativo.

---

## Sprint 2 — Procesamiento documental OCR + IA

Estado: En progreso

Objetivo:
Procesar documentos cargados en expedientes mediante OCR, extraer texto, preparar extracción estructurada con IA y mostrar datos obtenidos para revisión humana.

Tareas:
- Tarea 2.1 Preparar configuración de Google Document AI.
- Tarea 2.2 Procesar documentos cargados con OCR.
- Tarea 2.3 Guardar texto extraído.
- Tarea 2.4 Extraer datos estructurados de nóminas.
- Tarea 2.5 Extraer datos estructurados de estados de cuenta.
- Tarea 2.6 Extraer datos estructurados de buró de crédito.

Resultado esperado:
- Documentos procesables desde Google Cloud Storage.
- Texto OCR almacenado.
- Datos estructurados iniciales disponibles para revisión.

---

## Sprint 3 — Motor Financiero

Historias:

* Validación de identidad.
* Conciliación ingresos.
* Cálculo de pasivos.
* Capacidad de pago.

Resultado:

* Comparativa preliminar por banco.

---

## Sprint 4 — Reportes y Cierre

Historias:

* Reporte interno.
* Comparativa bancaria.
* Pruebas integrales.
* Documentación.

Resultado:

* MVP funcional demostrable.

---

## Principios

* SDD obligatorio.
* Human in the Loop.
* No aprobar créditos automáticamente.
* Toda decisión financiera debe ser trazable.
* Priorizar mantenibilidad sobre velocidad.
* Registrar conocimiento en OpenSpec y Engram.

---

## Arquitectura

Frontend:

* Next.js

Backend:

* NestJS

Base de datos:

* PostgreSQL

ORM:

* Prisma

Storage:

* Google Cloud Storage

OCR:

* Google Document AI

IA:

* Gemini / OpenAI / OpenCode Go

Metodología:

* SDD + OpenSpec + Engram
