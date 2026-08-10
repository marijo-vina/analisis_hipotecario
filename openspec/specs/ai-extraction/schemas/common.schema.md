# 1. Convenciones generales

## Formatos estándar

- Fechas: `YYYY-MM-DD`.
- Fechas con hora: ISO 8601. Ejemplo: `2026-06-22T10:30:00Z`.
- Montos: número decimal, sin símbolo `$`, sin comas. Ejemplo: `15500.75`.
- Moneda: `MXN`.
- RFC: string en mayúsculas.
- CURP: string en mayúsculas.
- Nombres: string en mayúsculas, sin abreviaturas inventadas.
- Campos no detectados: usar `null`, no strings vacíos.
- Confianza de extracción: número decimal entre `0` y `1`.

## Valores estándar para severidad de alertas

```json
"INFO | WARNING | CRITICAL"
```

## Valores estándar para categorías de alerta

```json
"IDENTITY | ADDRESS | INCOME | CREDIT_BUREAU | BANK_STATEMENT | DOCUMENT_QUALITY | MANUAL_VALIDATION | REQUIREMENT"
```

---

# 2. Estructura común para todos los esquemas

Todos los documentos deben seguir esta estructura base:

```json
{
  "schemaVersion": "1.0",
  "documentType": "string",
  "extractionMetadata": {
    "sourceDocumentId": "string | null",
    "mortgageCaseId": "string | null",
    "ocrProcessedAt": "datetime | null",
    "extractedAt": "datetime | null",
    "model": "string | null",
    "confidence": 0.0
  },
  "documentRequirementContext": {
    "incomeBehavior": "FIXED | VARIABLE | UNKNOWN | NOT_APPLICABLE",
    "requiredPayrollReceiptMonths": "number | null",
    "requiredBankStatementMonths": "number | null",
    "detectedDocumentMonths": "number | null",
    "isRequirementSatisfied": "boolean | null",
    "requirementNotes": "string | null"
  },
  "missingFields": [],
  "alerts": []
}
```

## Estructura común para alertas

```json
{
  "code": "string",
  "severity": "INFO | WARNING | CRITICAL",
  "category": "IDENTITY | ADDRESS | INCOME | CREDIT_BUREAU | BANK_STATEMENT | DOCUMENT_QUALITY | MANUAL_VALIDATION | REQUIREMENT",
  "message": "string",
  "field": "string | null",
  "requiresManualReview": true
}
```
# 3. Reglas transversales de suficiencia documental

Estas reglas no son cálculos financieros; son reglas de preparación para saber si el expediente tiene suficientes documentos para extracción y validación posterior.

## Ingreso fijo

```json
{
  "incomeBehavior": "FIXED",
  "payrollReceipts": {
    "minimumForMath": 1,
    "recommendedOperationalMonths": 3,
    "strictRequiredMonths": 1
  },
  "bankStatements": {
    "recommendedOperationalMonths": 3,
    "strictRequiredMonths": 3
  }
}
```

## Ingreso variable

```json
{
  "incomeBehavior": "VARIABLE",
  "payrollReceipts": {
    "minimumForMath": 6,
    "recommendedOperationalMonths": 6,
    "strictRequiredMonths": 6
  },
  "bankStatements": {
    "recommendedOperationalMonths": 6,
    "strictRequiredMonths": 6
  }
}
```

## Ingreso desconocido

```json
{
  "incomeBehavior": "UNKNOWN",
  "payrollReceipts": {
    "minimumForMath": null,
    "recommendedOperationalMonths": 6,
    "strictRequiredMonths": null
  },
  "bankStatements": {
    "recommendedOperationalMonths": 6,
    "strictRequiredMonths": null
  },
  "notes": "Si no se puede determinar si el ingreso es fijo o variable, solicitar revisión manual. Operativamente puede tratarse como variable hasta confirmar estabilidad."
}
```

---
# 4. Consideraciones para Sprint 3

Los esquemas quedan preparados para las siguientes validaciones y cálculos futuros:

1. Comparación de identidad entre INE, nómina, banco, buró y comprobante de domicilio.
2. Validación manual de INE en Lista Nominal.
3. Validación de antigüedad laboral.
4. Determinación de ingreso fijo vs variable.
5. Verificación de suficiencia documental según tipo de ingreso.
6. Conciliación de nómina contra depósito bancario.
7. Identificación de pagadoras.
8. Cálculo de ingreso admisible.
9. Cálculo de pasivos desde buró.
10. Alertas de riesgo financiero y documental.

## Nota importante sobre bancarización

La bancarización se valida comparando:

- ingreso neto del recibo de nómina,
- fecha exacta de pago,
- razón social del empleador o pagadora,
- depósito detectado en estado de cuenta,
- concepto original del movimiento bancario.

Los estados de cuenta no sustituyen a los recibos de nómina. Solo sirven para confirmar que el ingreso timbrado realmente fue depositado al cliente.

---

# 5. Fuera de alcance de la Tarea 2.5

La Tarea 2.5 se limita a definir y documentar los esquemas JSON esperados para la extracción estructurada con IA.  
Las siguientes actividades no forman parte de esta tarea, aunque algunas serán abordadas en tareas posteriores del Sprint 2 o Sprint 3.

## Se abordará en la Tarea 2.6

- Implementar llamada a Gemini.
- Crear servicio de extracción estructurada.
- Enviar texto OCR y tipo de documento al modelo.
- Forzar salida en formato JSON.
- Validar que la respuesta sea JSON válido.

## Se abordará en Sprint 3

- Implementar cálculo de capacidad de pago.
- Implementar cálculo de pasivos.
- Implementar conciliación automática completa entre nómina y estado de cuenta.
- Aplicar reglas financieras con base en los datos extraídos.

## Fuera del MVP actual

- Integrar proveedor KYC.
- Automatizar consulta a Lista Nominal.
- Hacer scraping de páginas oficiales.
- Modificar lógica de negocio fuera de los esquemas.
