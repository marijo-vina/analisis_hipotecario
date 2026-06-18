# Sprint 2 — Procesamiento documental OCR + IA

## Propósito del sprint

Implementar el flujo inicial de procesamiento documental para que los documentos cargados en expedientes hipotecarios puedan enviarse a OCR, extraer texto y preparar la base para estructurar información relevante con IA.

Este sprint forma parte del MVP enfocado en clientes asalariados. La validación final de los datos extraídos siempre queda en manos de la asesora; el sistema no aprueba créditos automáticamente.

## Contexto previo

El Sprint 1 dejó construida la base operativa del sistema:

- Login interno.
- Gestión de clientes.
- Creación y consulta de expedientes hipotecarios.
- Carga documental.
- Almacenamiento de documentos en Google Cloud Storage.
- Metadata documental.
- Estados del expediente.
- Dashboard operativo inicial.

Sprint 2 debe partir de esa base sin rehacerla ni modificar lógica de negocio existente de manera innecesaria.

## Documentos considerados en Sprint 2

Para el MVP, el procesamiento documental se enfocará en:

- Identificación oficial: INE o pasaporte.
- Reporte de Buró de Crédito Especial.
- Recibos de nómina.
- Estados de cuenta bancarios donde se recibe la nómina.

## Alcance del sprint

Sprint 2 busca habilitar:

- Conexión del backend con Google Document AI.
- Procesamiento OCR de documentos cargados en Google Cloud Storage.
- Recepción y almacenamiento del texto extraído.
- Estados de procesamiento documental.
- Preparación para extracción estructurada con IA.
- Visualización inicial de datos extraídos para revisión humana.

## Fuera de alcance en Sprint 2

No se debe implementar todavía:

- Cálculo de capacidad de pago.
- Motor financiero completo.
- Comparativa bancaria.
- Reglas bancarias por institución.
- Reporte final del expediente.
- Aprobación automática de crédito.
- Integración directa con bancos.

---

## Historias de usuario del Sprint 2

### HU-08 — Procesar documentos con OCR

Como asesora, quiero que el sistema procese documentos cargados en el expediente mediante OCR para reducir la lectura y captura manual de información.

**Resultado esperado:**

- El backend puede enviar documentos a Google Document AI.
- El sistema recibe texto extraído.
- El documento cambia de estado según el resultado del procesamiento.
- Si ocurre un error, queda registrado de forma clara.

---

### HU-09 — Consultar texto extraído de documentos

Como asesora, quiero consultar el texto extraído por OCR para revisar si el documento fue leído correctamente antes de usarlo en análisis posteriores.

**Resultado esperado:**

- El texto OCR queda asociado al documento correspondiente.
- La asesora puede consultar el contenido extraído desde la plataforma.
- Se conserva trazabilidad entre expediente, documento y resultado OCR.

---

### HU-10 — Extraer datos base de identificación oficial

Como asesora, quiero que el sistema identifique datos básicos de la identificación oficial para apoyar la validación de identidad del cliente.

**Resultado esperado:**

- Se intenta extraer nombre completo.
- Se intenta extraer fecha de nacimiento.
- Se intenta extraer CURP o número de identificación, cuando esté disponible.
- Si falta información, el sistema genera una alerta para revisión humana.

---

### HU-11 — Extraer datos base de recibos de nómina

Como asesora, quiero que el sistema identifique datos relevantes de los recibos de nómina para preparar el cálculo posterior de ingresos.

**Resultado esperado:**

- Se intenta extraer nombre del empleado.
- Se intenta extraer empresa o razón social.
- Se intenta extraer periodo de pago.
- Se intenta extraer ingreso bruto, ingreso neto y deducciones.
- Se identifica si el recibo parece contener timbrado fiscal o QR.
- La asesora puede revisar y corregir datos posteriormente.

---

### HU-12 — Extraer datos base de estados de cuenta

Como asesora, quiero que el sistema identifique información relevante de estados de cuenta para ubicar depósitos relacionados con nómina.

**Resultado esperado:**

- Se intenta extraer banco.
- Se intenta extraer titular de la cuenta.
- Se intenta extraer periodo del estado de cuenta.
- Se identifican movimientos o depósitos relevantes.
- Se conserva el concepto original de cada movimiento detectado.

---

### HU-13 — Extraer datos base de Buró de Crédito

Como asesora, quiero que el sistema identifique información relevante del reporte de Buró para preparar el análisis posterior de pasivos.

**Resultado esperado:**

- Se intenta extraer score si está disponible.
- Se intenta identificar créditos activos.
- Se intenta extraer institución, saldo actual y monto a pagar.
- Se intenta diferenciar créditos revolventes y pagos fijos.
- Se generan alertas si se detectan datos críticos o incompletos.

---

### HU-14 — Mostrar datos extraídos para revisión

Como asesora, quiero revisar los datos extraídos antes de que sean utilizados en cálculos financieros para asegurar que la información sea correcta.

**Resultado esperado:**

- La plataforma muestra los datos extraídos por documento.
- La asesora puede identificar información faltante o inconsistente.
- Los datos extraídos no se consideran definitivos sin revisión humana.
- El expediente conserva trazabilidad del procesamiento.

---

## Consideraciones de diseño

- Priorizar servicios pequeños y mantenibles.
- Separar OCR de extracción estructurada.
- No mezclar procesamiento documental con cálculo financiero.
- Registrar errores de forma clara.
- Mantener compatibilidad con la arquitectura existente.
- Evitar almacenar información sensible innecesaria.
- Documentar variables de entorno requeridas.
- Mantener pruebas y build en verde.

## Tarea actual

La primera tarea del sprint es:

### Tarea 2.1 — Preparar configuración de Google Document AI

Objetivo:

Configurar la conexión inicial entre el backend NestJS y Google Document AI para procesar documentos desde Google Cloud Storage y confirmar que el sistema puede recibir texto OCR extraído.

Criterios mínimos:

- Backend conectado correctamente con Document AI.
- Processor OCR configurado.
- Variables de entorno documentadas.
- Servicio base creado.
- Prueba mínima con documento no sensible.
- Texto OCR recibido sin errores críticos.
- Tests y build pasando.
