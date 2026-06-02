# 13. Plan por sprints

## Sprint 1 — Base del sistema y gestión de expedientes

### Duración sugerida

Semana 1 y semana 2.

### Objetivo del sprint

Construir la base operativa del sistema: autenticación, clientes, expedientes, selección de tipo de crédito, estados del expediente, carga documental inicial y almacenamiento en la nube.

### Módulos incluidos

- Setup inicial del proyecto.
- Autenticación interna.
- Gestión de clientes.
- Gestión de expedientes hipotecarios.
- Catálogo de tipos de crédito.
- Estados del expediente.
- Carga de documentos.
- Integración inicial con Google Cloud Storage.
- Base de datos inicial.

### Historias de usuario principales

#### HU-01 — Login interno

Como asesora, quiero iniciar sesión en la plataforma para proteger la información de los clientes.

#### HU-02 — Crear cliente

Como asesora, quiero registrar los datos básicos de un cliente para iniciar su análisis hipotecario.

#### HU-03 — Crear expediente hipotecario

Como asesora, quiero crear un expediente asociado a un cliente para registrar el tipo de crédito solicitado y dar seguimiento al análisis.

#### HU-04 — Cargar documentos

Como asesora, quiero subir documentos al expediente para iniciar la revisión documental.

### Entidades esperadas

- User.
- Client.
- MortgageCase / Expediente.
- Document.
- CreditType catalog.
- CaseStatus catalog.

### Resultado esperado del Sprint 1

Al finalizar el Sprint 1, la plataforma debe permitir:

- Iniciar sesión como usuario interno.
- Crear clientes.
- Consultar clientes.
- Crear expedientes asociados a clientes.
- Seleccionar tipo de crédito solicitado.
- Capturar monto solicitado, valor del inmueble y datos básicos según tipo de crédito.
- Ver estatus del expediente.
- Cargar documentos al expediente.
- Guardar archivos en Google Cloud Storage.
- Guardar metadata documental en PostgreSQL.

### Criterio de cierre del Sprint 1

Un usuario interno debe poder ejecutar el flujo mínimo:

```text
Login → Crear cliente → Crear expediente → Seleccionar tipo de crédito → Cargar documentos → Consultar expediente con documentos cargados
```

---

## Sprint 2 — Procesamiento documental OCR + IA

### Duración sugerida

Semana 3 y semana 4.

### Objetivo del sprint

Procesar documentos cargados, extraer texto mediante OCR y convertir información relevante en datos estructurados mediante IA.

### Módulos incluidos

- Servicio de procesamiento OCR.
- Integración con Google Document AI.
- Servicio de extracción estructurada con Gemini.
- Extracción de nóminas.
- Extracción de nóminas emitidas por pagadoras, si aplica.
- Extracción de estados de cuenta.
- Extracción de buró de crédito.
- Vista de datos extraídos por documento.
- Estados de procesamiento documental.

### Historias de usuario principales

#### HU-05 — Procesar documentos con OCR

Como asesora, quiero que el sistema lea automáticamente los documentos cargados para reducir captura manual.

#### HU-06 — Extraer datos de recibos de nómina

Como asesora, quiero que el sistema identifique datos clave de nómina para calcular ingresos.

#### HU-07 — Extraer datos de estados de cuenta

Como asesora, quiero que el sistema identifique depósitos de nómina en estados de cuenta para validar ingresos bancarizados.

#### HU-08 — Extraer datos de buró de crédito

Como asesora, quiero que el sistema identifique créditos activos, saldos y montos a pagar para calcular pasivos.

### Entidades esperadas

- DocumentProcessingJob.
- ExtractedText.
- PayrollReceiptExtraction.
- PayrollPayer / Pagadora.
- BankStatementExtraction.
- CreditBureauExtraction.
- ExtractedCredit.
- ExtractionAlert.

### Resultado esperado del Sprint 2

Al finalizar el Sprint 2, la plataforma debe permitir:

- Enviar documentos cargados a Google Document AI.
- Guardar texto OCR extraído.
- Enviar texto OCR a Gemini para extracción estructurada.
- Generar JSON estructurado para recibos de nómina.
- Generar JSON estructurado para pagadoras detectadas, si aplica.
- Generar JSON estructurado para estados de cuenta.
- Generar JSON estructurado para buró de crédito.
- Mostrar en la interfaz los datos extraídos.
- Marcar documentos como cargado, en procesamiento, procesado o error.
- Generar alertas cuando falten datos críticos.

### Criterio de cierre del Sprint 2

Un usuario interno debe poder ejecutar el flujo:

```text
Expediente con documentos → Procesar OCR → Extraer datos estructurados → Consultar datos extraídos y alertas
```

---

## Sprint 3 — Validaciones y motor financiero para asalariados

### Duración sugerida

Semana 5 y semana 6.

### Objetivo del sprint

Implementar validaciones clave y cálculos financieros para determinar capacidad de pago preliminar de clientes asalariados.

### Módulos incluidos

- Validación de identidad entre documentos.
- Validación nómina vs estado de cuenta.
- Cálculo de pasivos desde buró.
- Cálculo de ingreso neto y bruto promedio.
- Cálculo de ingreso consolidado con pagadoras, si aplica.
- Catálogo de bancos.
- Parámetros CE por banco.
- Criterio de ingreso por banco: neto o bruto.
- Cálculo de capacidad de pago por banco.
- Clasificación preliminar de resultados.

### Historias de usuario principales

#### HU-09 — Validar identidad

Como asesora, quiero comparar datos de identidad entre documentos para detectar inconsistencias.

#### HU-10 — Conciliar nómina contra depósito bancario

Como asesora, quiero comparar el ingreso neto del recibo de nómina contra depósitos bancarios para confirmar bancarización.

#### HU-11 — Calcular pasivos desde buró

Como asesora, quiero calcular los compromisos mensuales del cliente para estimar capacidad de pago.

#### HU-12 — Calcular ingreso admisible

Como asesora, quiero calcular ingreso neto y bruto promedio para alimentar la capacidad de pago.

#### HU-13 — Calcular capacidad de pago por banco

Como asesora, quiero ver la capacidad de pago estimada por banco para identificar opciones preliminares.

### Entidades esperadas

- ValidationAlert.
- IdentityValidationResult.
- IncomeValidationResult.
- LiabilityCalculation.
- LiabilityItem.
- IncomeCalculation.
- PayrollPayerValidationResult.
- Bank.
- BankPolicyParameter.
- PaymentCapacityResult.

### Resultado esperado del Sprint 3

Al finalizar el Sprint 3, la plataforma debe permitir:

- Comparar identidad del cliente contra datos extraídos.
- Generar alertas por diferencias de nombre, RFC o CURP.
- Conciliar recibos de nómina con depósitos bancarios.
- Calcular deuda mensual total desde buró.
- Ordenar pasivos por tarjetas/revolventes y después créditos fijos.
- Calcular ingreso neto promedio.
- Calcular ingreso bruto promedio.
- Calcular ingreso aceptado por pagadoras según banco, si aplica.
- Aplicar criterio de ingreso por banco.
- Aplicar factor CE por banco.
- Calcular máximo a endeudar.
- Calcular capacidad de pago final.
- Mostrar una tabla comparativa por banco.

### Criterio de cierre del Sprint 3

Un usuario interno debe poder ejecutar el flujo:

```text
Datos extraídos → Validar identidad → Conciliar ingresos → Calcular pasivos → Calcular ingreso admisible → Calcular capacidad por banco
```

---

## Sprint 4 — Reporte, pruebas, ajustes y documentación

### Duración sugerida

Semana 7 y semana 8.

### Objetivo del sprint

Cerrar el MVP con reporte interno, comparativa bancaria, pruebas funcionales, corrección de errores críticos y documentación final.

### Módulos incluidos

- Reporte interno del expediente.
- Comparativa básica por banco.
- Resumen financiero.
- Resumen documental.
- Resumen de alertas.
- Pruebas funcionales completas.
- Corrección de errores críticos.
- Documentación técnica.
- Documentación funcional.
- Preparación de demo final.

### Historias de usuario principales

#### HU-14 — Generar reporte interno

Como asesora, quiero generar un resumen del análisis para revisar rápidamente la viabilidad del cliente.

#### HU-15 — Ver comparativa por banco

Como asesora, quiero ver una tabla comparativa de capacidad de pago por banco para identificar opciones preliminares.

#### HU-16 — Probar flujo completo

Como desarrolladora, quiero probar el flujo completo del sistema para asegurar que el MVP funcione correctamente.

#### HU-17 — Documentar el sistema

Como desarrolladora, quiero documentar la arquitectura, módulos y reglas para facilitar la evaluación académica y futuras mejoras.

### Resultado esperado del Sprint 4

Al finalizar el Sprint 4, la plataforma debe permitir:

- Visualizar reporte interno por expediente.
- Consultar datos del cliente.
- Consultar datos del expediente.
- Consultar documentos procesados.
- Consultar alertas generadas.
- Consultar ingresos calculados.
- Consultar desglose de pagadoras y su aceptación por banco, si aplica.
- Consultar deuda mensual total.
- Consultar capacidad de pago por banco.
- Consultar recomendaciones preliminares.
- Ejecutar una demo completa de inicio a fin.
- Contar con documentación técnica y funcional.

### Criterio de cierre del Sprint 4

Un usuario interno debe poder ejecutar el flujo completo:

```text
Login → Crear cliente → Crear expediente → Cargar documentos → Procesar OCR/IA → Validar datos → Calcular capacidad de pago → Generar reporte interno → Ver comparativa bancaria
```

---

## 14. Resultado esperado del MVP completo

Al finalizar los 4 sprints, el MVP debe permitir que una asesora de Gestión Financiera:

1. Inicie sesión en una plataforma interna.
2. Registre un cliente asalariado.
3. Cree un expediente hipotecario.
4. Seleccione el tipo de crédito solicitado.
5. Capture datos generales del crédito.
6. Cargue documentos financieros.
7. Procese documentos mediante OCR.
8. Extraiga información estructurada mediante IA.
9. Revise datos extraídos.
10. Consulte alertas documentales.
11. Valide identidad e ingresos.
12. Calcule pasivos desde buró.
13. Calcule ingreso admisible.
14. Revise ingresos por pagadoras y su aceptación por banco, si aplica.
15. Calcule capacidad de pago por banco.
16. Visualice una comparativa bancaria preliminar.
17. Genere un reporte interno del expediente.

El sistema debe reducir la carga operativa manual y mejorar la organización de la información, pero la decisión final seguirá dependiendo de validación humana y de las políticas vigentes de cada banco.

---

## 15. Backlog futuro posterior al MVP

### Futuro Sprint 5 — Perfil PFAE / Independiente

- Procesar Constancia de Situación Fiscal.
- Procesar declaración anual.
- Procesar estados de cuenta de 6 a 12 meses.
- Calcular promedio suavizado.
- Aplicar factores por actividad.
- Validar antigüedad fiscal.

### Futuro Sprint 6 — Persona Moral

- Procesar acta constitutiva.
- Extraer porcentaje accionario.
- Procesar estados de cuenta de empresa.
- Procesar declaración anual de empresa.
- Procesar buró de empresa.
- Aplicar reglas especiales por banco.

### Futuro Sprint 7 — Wizard público

- Integrar formulario en landing page.
- Capturar prospectos.
- Aplicar reglas knockout en tiempo real.
- Clasificar lead como viable, revisión especial o no viable.
- Enviar lead al área hipotecaria.

### Futuro Sprint 8 — Reportes avanzados

- Exportación PDF profesional.
- Exportación Excel.
- Comparativas comerciales para cliente.
- Historial de versiones del análisis.
- Observaciones editables por asesora.

---

## 16. Principios de diseño del MVP

- Primero especificar, después construir.
- Priorizar trazabilidad sobre automatización total.
- Mantener validación humana.
- Evitar aprobar créditos automáticamente.
- Documentar reglas financieras explícitamente.
- Diseñar para extender a PFAE y Persona Moral en el futuro.
- Mantener separación entre captación pública y operación interna.
- Proteger datos personales y financieros.
- Registrar alertas en vez de bloquear todos los casos automáticamente.
- Permitir revisión manual de datos críticos.

---

## 17. Resumen ejecutivo para el SDD Orchestrator

Construir una plataforma web interna de asistencia hipotecaria para Gestión Financiera, enfocada en clientes asalariados, organizada en 4 sprints. El sistema debe gestionar clientes y expedientes, seleccionar tipo de crédito, cargar documentos, procesar OCR/IA, extraer datos financieros, validar identidad e ingresos, calcular pasivos, contemplar el caso especial de pagadoras dentro del perfil asalariado, calcular capacidad de pago por banco y generar un reporte interno. El desarrollo debe seguir Spec Driven Development, generando primero especificaciones funcionales, modelos de datos, contratos API, reglas de negocio y criterios de aceptación antes de implementar código.
