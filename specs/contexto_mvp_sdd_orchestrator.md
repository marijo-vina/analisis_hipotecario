## 1. Propósito del documento

Este archivo proporciona el contexto general del MVP para un agente de IA orientado a **Spec Driven Development (SDD Orchestrator)**. Su objetivo es servir como entrada base para generar especificaciones funcionales, técnicas, modelos de datos, contratos de API, criterios de aceptación y tareas de implementación incremental.

El proyecto corresponde a una plataforma web interna para el área de **Créditos Hipotecarios / Finanzas Personales** de **Gestión Financiera**.

---

## 2. Contexto operativo del negocio

Gestión Financiera ofrece asesoría hipotecaria personalizada y acompaña al cliente durante el proceso de selección, integración e ingreso de expedientes ante bancos. El área hipotecaria actualmente realiza gran parte del perfilamiento y análisis de manera manual, especialmente la revisión documental, el cálculo de ingresos, el cálculo de pasivos y la comparación contra criterios bancarios.

El flujo operativo real puede entenderse como un embudo cronológico:

1. Captación y preperfilamiento inicial.
2. Gestión documental y revisión de documentos.
3. Análisis financiero y capacidad de pago.
4. Cruce con políticas bancarias y diagnóstico de viabilidad.
5. Simulación, envío del expediente y formalización.

El principal cuello de botella identificado está en la revisión manual de documentos financieros, especialmente recibos de nómina, estados de cuenta y reporte de buró de crédito.

---

## 3. Objetivo general del MVP

Desarrollar en 8 semanas una plataforma web interna que permita a las asesoras hipotecarias gestionar clientes y expedientes, cargar documentos, procesar información financiera mediante OCR/IA, validar datos relevantes y calcular una capacidad de pago preliminar para clientes asalariados.

El sistema debe funcionar como una herramienta de asistencia operativa. No sustituye la validación humana ni representa una aprobación bancaria.

---

## 4. Alcance del MVP

### Incluido en el MVP

- Login interno para asesoras.
- Gestión básica de clientes.
- Creación y gestión de expedientes hipotecarios.
- Selección del tipo de crédito solicitado.
- Selección del tipo de persona: inicialmente **Asalariado**.
- Captura de datos generales del cliente y del crédito.
- Carga de documentos financieros y personales.
- Almacenamiento de documentos en Google Cloud Storage.
- Procesamiento documental con Google Document AI.
- Extracción estructurada con Gemini.
- Validación básica de identidad e ingresos.
- Cálculo de pasivos desde buró de crédito.
- Cálculo de ingreso admisible para asalariados.
- Caso especial de asalariados con nómina dividida mediante **pagadoras**.
- Cálculo de capacidad de pago por banco.
- Generación de reporte interno básico.
- Comparativa preliminar por banco.
- Documentación técnica y funcional.

### No incluido en el MVP

- Wizard público en landing page.
- Acceso del cliente final a la plataforma.
- Personas morales.
- PFAE / profesionistas independientes.
- Perfil mixto con actividad independiente como flujo completo de PFAE.
- Integración directa con bancos.
- Aprobación automática de crédito.
- CRM completo.
- Business Intelligence avanzado.
- Reportes comerciales finales para cliente.
- Simuladores hipotecarios oficiales.

---

## 5. Perfil atendido por el MVP

El MVP se enfoca exclusivamente en **persona asalariada**.

### Perfil asalariado

Cliente que trabaja en una empresa y recibe ingresos por nómina. Para el análisis inicial se consideran:

- Recibos de nómina.
- Estados de cuenta donde se deposita la nómina.
- Reporte de buró de crédito.
- INE.
- Comprobante de domicilio.

### Caso especial dentro del perfil asalariado: nómina dividida / pagadoras

El MVP debe contemplar, al menos a nivel de especificación, el caso especial de **asalariados con nóminas provenientes de diferentes razones sociales**, comúnmente llamadas **pagadoras**.

Este caso ocurre cuando el cliente tiene una relación laboral asalariada, pero su remuneración mensual no aparece concentrada en una sola empresa empleadora. En su lugar, el ingreso se fracciona entre una empresa principal y una o más razones sociales adicionales que depositan una parte del sueldo, bono, comisión o complemento de nómina.

Para efectos del MVP, este caso **sigue perteneciendo al perfil asalariado**, no al flujo de PFAE ni Persona Moral, siempre que el ingreso se pueda comprobar como nómina o ingreso laboral recurrente.

#### Datos que deben registrarse por cada pagadora

Por cada pagadora detectada, el sistema debe preparar estructura para registrar:

- Nombre o razón social de la pagadora.
- Pago mensual neto recibido.
- Banco donde se recibe el depósito.
- Cuenta o referencia bancaria, si está disponible.
- Concepto exacto del depósito en el estado de cuenta.
- Recurrencia del depósito: semanal, quincenal, mensual u otra.
- Periodo de pago asociado.
- Indicador de si cotiza IMSS o no cotiza IMSS.
- Relación con el recibo de nómina correspondiente, si existe.
- Observaciones de validación manual.

#### Reglas de validación para pagadoras

- El ingreso de pagadora debe buscarse en los estados de cuenta como depósito recurrente.
- El concepto de transferencia es un dato crítico, porque algunos bancos solo aceptan el ingreso si el concepto refleja explícitamente nómina.
- El sistema debe permitir marcar una pagadora como aceptada, condicionada o descartada para el cálculo.
- Si existe recibo de nómina timbrado de esa razón social, debe asociarse con el depósito bancario correspondiente.
- Si no existe recibo timbrado o el concepto bancario es ambiguo, debe generarse alerta para revisión humana.
- La asesora debe poder decidir si el ingreso se considera en el cálculo final, de acuerdo con la política bancaria aplicable.

#### Tratamiento por banco documentado para el MVP

Para el caso de pagadoras, el MVP debe dejar preparado el motor de reglas para parametrizar criterios por banco. Como punto inicial:

- **Santander:** puede acumular la porción de la pagadora bajo criterio de ingreso neto, aplicando su factor CE correspondiente.
- **Scotiabank:** puede aceptar ingresos por pagadoras solo si el concepto en el estado de cuenta se refleja explícitamente como “Nómina”. Si el concepto aparece como SPEI, transferencia, bono u otro concepto genérico sin indicar nómina, ese ingreso debe quedar marcado como no considerado para Scotiabank.

#### Tratamiento de ingresos variables en pagadoras

Si el ingreso proveniente de una pagadora corresponde a bonos, comisiones o montos variables, se debe tratar como ingreso variable de asalariado:

- Solicitar o analizar hasta 6 meses de evidencia.
- Calcular promedio lineal o promedio definido por la política operativa.
- Mantener trazabilidad de los meses considerados.
- Generar alerta si los depósitos no son recurrentes o si cambian de concepto.

#### Implicación para el SDD Orchestrator

El agente SDD debe modelar las pagadoras como una entidad o subentidad asociada al cálculo de ingresos del expediente, por ejemplo:

```text
PayrollPayer / Pagadora
- id
- expediente_id
- nombre_pagadora
- pago_mensual
- banco
- cuenta
- concepto_transferencia
- recurrencia
- periodo_pago
- cotiza_imss
- ingreso_aceptado
- banco_aplicable
- motivo_descartado
- observaciones
```

Este caso debe impactar principalmente:

- La especificación de extracción de nóminas.
- La especificación de extracción de estados de cuenta.
- La conciliación nómina vs banco.
- El cálculo de ingreso admisible.
- El motor de reglas por banco.
- El reporte interno del expediente.

---

## 6. Tipos de crédito que debe contemplar el expediente

Aunque el MVP no implementará el wizard público completo, el expediente interno sí debe permitir seleccionar el tipo de crédito solicitado por el cliente.

### Catálogo de tipos de crédito

1. Compra de casa o departamento.
2. Mejora de hipoteca actual.
3. Obtención de liquidez.
4. Adquisición de terreno.
5. Remodelación, ampliación o mejora.
6. Construcción de vivienda.

### Datos generales por tipo de crédito

#### Compra de casa o departamento

- Ubicación del inmueble.
- Valor aproximado de la propiedad.
- Monto aproximado del crédito requerido.
- Fecha tentativa del trámite.

#### Mejora de hipoteca actual

- Ubicación del inmueble.
- Valor aproximado del inmueble.
- Banco actual.
- Mensualidad actual.
- Tiempo restante por pagar.
- Fecha tentativa del trámite.

#### Obtención de liquidez

- Indicar si existe inmueble tipo casa-habitación para dejar en garantía.
- Propietario de la garantía: propia, cónyuge, familiar directo o tercero sin parentesco.
- Ubicación del inmueble en garantía.
- Valor aproximado del inmueble en garantía.
- Estado de gravamen.
- Fecha tentativa del trámite.

#### Adquisición de terreno

- Ubicación del terreno.
- Valor aproximado del terreno.
- Monto aproximado del crédito requerido.
- Indicar si el terreno cuenta con servicios básicos.
- Fecha tentativa del trámite.

#### Remodelación, ampliación o mejora

- Ubicación del inmueble.
- Valor aproximado del inmueble.
- Monto aproximado requerido para remodelación.
- Fecha tentativa del trámite.

#### Construcción de vivienda

- Ubicación del terreno donde se quiere construir.
- Valor proyectado de la construcción.
- Indicar si el cliente es dueño del terreno.
- Fecha tentativa del trámite.

---

## 7. Reglas operativas importantes

### Reglas de preperfilamiento inicial

El sistema debe estar preparado para registrar o consultar información relacionada con:

- Ingreso mensual aproximado.
- Forma de comprobación de ingresos.
- Historial crediticio declarado.
- Tipo de persona.
- Tipo de crédito solicitado.
- Temporalidad del trámite.

### Knockouts o descartes tempranos relevantes

Aunque el MVP interno no necesariamente ejecutará todos los knockouts como flujo público, las reglas deben documentarse para futuras fases:

- Historial crediticio destructivo o atrasos graves.
- Score de buró en zona de rechazo aproximada.
- Ingresos insuficientes.
- Ingresos no comprobables sin coacreditado.
- Antigüedad laboral insuficiente para asalariados.
- Edad + plazo superior al límite aceptado por bancos.
- Endeudamiento estimado demasiado alto.
- Para liquidez: garantía de tercero sin parentesco puede no ser viable.
- Para terreno: falta de servicios básicos puede generar no viabilidad.

---

## 8. Documentos del MVP

### Tipos de documento permitidos

- Recibo de nómina.
- Recibo de nómina emitido por pagadora, si aplica.
- Estado de cuenta.
- Buró de crédito.
- INE.
- Comprobante de domicilio.

### Datos clave a extraer de recibos de nómina

- Nombre del empleado.
- RFC del empleado.
- Empresa empleadora o razón social pagadora.
- RFC de la empresa o pagadora.
- Periodo de pago.
- Ingreso bruto.
- Deducciones.
- Ingreso neto.
- Fecha de pago.
- Percepciones variables: bonos, comisiones, horas extra.
- Timbrado fiscal / QR.
- Antigüedad o fecha de ingreso, si aparece.
- Indicador de si el recibo corresponde a empresa principal o pagadora.

### Datos clave a extraer de estados de cuenta

- Nombre del titular.
- Banco emisor.
- Número de cuenta o CLABE, si está disponible.
- Periodo del estado de cuenta.
- Depósitos recibidos.
- Identificación de depósitos de nómina.
- Identificación de depósitos provenientes de pagadoras, si aplica.
- Fechas y montos de depósitos.
- Conceptos de movimientos.
- Saldo promedio, si está disponible.

### Datos clave a extraer de buró de crédito

- Score, si está disponible.
- Créditos activos y cerrados.
- Tipo de crédito.
- Institución otorgante.
- Saldo actual.
- Monto a pagar.
- Comportamiento de pago.
- MOP o claves de atraso, si están disponibles.
- Alertas de moras, quitas o claves preventivas.

---

## 9. Reglas financieras principales

### Cálculo de pasivos desde buró

Los créditos deben clasificarse en:

1. Créditos revolventes.
2. Créditos simples o pagos fijos.

#### Regla para créditos revolventes

```text
Pasivo revolvente = mayor entre (saldo actual × 6%) y monto a pagar reportado
```

#### Regla para créditos simples / pagos fijos

```text
Pasivo fijo = monto a pagar reportado
```

#### Deuda mensual total

```text
Deuda mensual total = suma de pasivos revolventes + suma de pasivos fijos
```

### Cálculo de ingreso admisible asalariado

Para asalariado puro:

- Si el sueldo es fijo y constante, se puede tomar el ingreso del mes cerrado.
- Si el ingreso es variable por bonos, comisiones u otros conceptos, se calcula promedio usando 3 a 6 meses.
- El sistema debe calcular ingreso neto promedio e ingreso bruto promedio.
- La asesora debe poder revisar y ajustar manualmente si es necesario.

#### Caso especial: ingreso por pagadoras

Cuando el cliente asalariado recibe parte de su remuneración por pagadoras, el sistema debe separar el ingreso en:

1. Ingreso de nómina principal.
2. Ingreso complementario por pagadora.
3. Ingreso total considerado por banco.

La fórmula base para el cálculo interno será:

```text
Ingreso asalariado consolidado = ingreso nómina principal + suma de ingresos aceptados por pagadoras
```

Sin embargo, la suma final no debe aplicarse igual para todos los bancos. Cada banco puede aceptar, condicionar o rechazar la parte de pagadoras según sus políticas. Por eso el resultado debe calcularse por banco y conservar el motivo de inclusión o descarte.

```text
Ingreso admisible por banco = ingreso principal aceptado + ingresos de pagadoras aceptados por ese banco
```

### Criterio de ingreso por banco

Algunos bancos calculan con ingreso neto y otros con ingreso bruto.

#### Bancos de ingreso neto

- Banorte.
- HSBC.
- Santander.

#### Bancos de ingreso bruto

- Scotiabank.
- Banamex.
- BX+.
- Mifel.
- Banregio.
- Afirme.

### Factores CE por banco

- Banorte: 0.60.
- Afirme: 0.60.
- Scotiabank: 0.55.
- Santander: 0.50.
- HSBC: 0.50.
- Banamex: 0.50.
- BX+: 0.50.
- Mifel: 0.50.
- Banregio: 0.50.

### Fórmulas finales

```text
Máximo a endeudar = ingreso mensual admisible × factor CE del banco
```

```text
Capacidad de pago final = máximo a endeudar - deuda mensual total
```

---

## 10. Validaciones clave

### Validación de identidad

Comparar nombre, RFC y CURP cuando estén disponibles entre:

- Cliente registrado.
- INE.
- Recibos de nómina.
- Estados de cuenta.
- Buró de crédito.

El sistema debe generar alertas si detecta inconsistencias. Las alertas no necesariamente bloquean el expediente, pero deben quedar visibles para revisión humana.

### Validación de nómina vs estado de cuenta

Comparar ingreso neto de recibos de nómina contra depósitos bancarios:

- Monto similar.
- Fecha compatible.
- Concepto compatible con nómina o transferencia del empleador.

Si no se encuentra depósito compatible, generar alerta.

### Validación especial de pagadoras

Cuando existan pagadoras:

- Comparar cada depósito de pagadora contra el estado de cuenta.
- Registrar el concepto exacto del movimiento.
- Validar recurrencia y periodo de pago.
- Identificar si la pagadora cotiza IMSS.
- Asociar recibo de nómina de pagadora cuando exista.
- Generar alerta si el concepto no contiene “Nómina” y el banco evaluado exige ese concepto.
- Mostrar en el reporte qué bancos consideraron o descartaron el ingreso de pagadora.

### Validación de documentos

- Documento faltante.
- Documento con error de OCR.
- Documento sin datos críticos.
- Nómina sin timbrado o sin QR detectable.
- Estado de cuenta con periodo incompleto.
- Buró sin créditos detectados o con información insuficiente.

---

## 11. Arquitectura tecnológica propuesta

### Frontend

- React.
- Next.js.
- TypeScript.
- Tailwind CSS.

### Backend

- NestJS.
- TypeScript.
- Prisma ORM.

### Base de datos

- PostgreSQL.

### Almacenamiento documental

- Google Cloud Storage.

### OCR e IA

- Google Document AI.
- Gemini 2.5 Pro API.

### Reportes

- Generación interna en pantalla.
- Exportación PDF opcional para el MVP si el tiempo lo permite.
- Exportación Excel queda como mejora futura.

---

## 12. Enfoque Spec Driven Development

Antes de programar cada módulo, el SDD Orchestrator debe generar o actualizar especificaciones en Markdown.

### Carpeta sugerida

```text
specs/
├── 00-project-context.md
├── 01-domain-glossary.md
├── 02-architecture-overview.md
├── 03-data-model.md
├── 04-api-contracts.md
├── 05-auth.spec.md
├── 06-clients.spec.md
├── 07-expedientes.spec.md
├── 08-documents.spec.md
├── 09-ocr-extraction.spec.md
├── 10-financial-engine.spec.md
├── 11-pagadoras.spec.md
├── 12-reporting.spec.md
└── 13-acceptance-criteria.md
```

### Reglas para el agente SDD

- No generar código antes de tener una especificación clara.
- Cada feature debe tener objetivo, actores, flujo, datos, validaciones y criterios de aceptación.
- Cada API debe tener contrato esperado antes de implementarse.
- Cada entidad debe estar definida antes de crear el modelo Prisma.
- Cada cálculo financiero debe estar expresado como regla y fórmula antes de programarse.
- El sistema debe privilegiar trazabilidad y revisión humana.
- El resultado del sistema siempre debe presentarse como preliminar.

---