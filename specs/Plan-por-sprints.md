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

Estado: En progreso

Historias:

* HU-01 Login interno.
* HU-02 Gestión de clientes.
* HU-03 Crear expediente hipotecario.
* HU-04 Actualizar expediente y documentos.

Resultado:

* Cliente registrado.
* Expediente creado.
* Documentos cargados.
* Expediente consultable.

---

## Sprint 2 — OCR e IA

Historias:

* Procesamiento OCR.
* Extracción de nóminas.
* Extracción de estados de cuenta.
* Extracción de buró.

Resultado:

* Datos estructurados generados automáticamente.

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
