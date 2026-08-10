# 5. Esquema JSON — Reporte de Buró de Crédito Especial

## Propósito

Extraer datos de comportamiento crediticio, créditos activos, créditos cerrados relevantes, saldos, pagos y alertas de riesgo. Esta información servirá en Sprint 3 para calcular pasivos.

## Esquema

```json
{
  "schemaVersion": "1.0",
  "documentType": "CREDIT_BUREAU_REPORT",
  "extractionMetadata": {
    "sourceDocumentId": null,
    "mortgageCaseId": null,
    "ocrProcessedAt": null,
    "extractedAt": null,
    "model": null,
    "confidence": 0.0
  },
  "documentRequirementContext": {
    "incomeBehavior": "NOT_APPLICABLE",
    "requiredPayrollReceiptMonths": null,
    "requiredBankStatementMonths": null,
    "detectedDocumentMonths": null,
    "isRequirementSatisfied": null,
    "requirementNotes": null
  },
  "borrower": {
    "fullName": "string | null",
    "birthDate": "YYYY-MM-DD | null",
    "rfc": "string | null",
    "lastReportedAddress": "string | null"
  },
  "report": {
    "consultationDate": "YYYY-MM-DD | null",
    "numberOfInquiries": "number | null",
    "publicScore": "number | null"
  },
  "credits": [
    {
      "institution": "string | null",
      "creditType": "string | null",
      "classification": "REVOLVING | FIXED_PAYMENT | MORTGAGE | AUTO | PERSONAL_LOAN | DEPARTMENT_STORE | NON_BANK_SERVICE | UNKNOWN",
      "status": "ACTIVE | CLOSED | UNKNOWN",
      "currentBalance": "number | null",
      "amountToPay": "number | null",
      "creditLimit": "number | null",
      "currency": "MXN",
      "paymentHistory": "string | null",
      "mopCodes": [],
      "hasLatePayments": "boolean | null",
      "hasSeriousDelinquency": "boolean | null",
      "hasWriteOff": "boolean | null",
      "hasFraudFlag": "boolean | null",
      "rawTextReference": "string | null"
    }
  ],
  "riskSummary": {
    "hasWriteOff": "boolean | null",
    "hasFraudFlag": "boolean | null",
    "hasMinorDelinquency": "boolean | null", 
    "hasSeriousDelinquency": "boolean | null",
    "hasPreventiveKeys": "boolean | null",
    "possibleHomonym": "boolean | null",
    "riskNotes": "string | null"
  },
  "missingFields": [],
  "alerts": []
}
```

## Reglas y alertas sugeridas

- Alertar si hay quita, quebranto, fraude, mora grave o claves preventivas.
- Alertar si el score está en zona de riesgo.
- Alertar si falta saldo actual o monto a pagar en créditos activos.
- Alertar posible homónimo si aparecen créditos que no coinciden con la identidad esperada.
- No calcular pasivos en esta tarea, solo dejar los campos listos.

## Campos preparados para Sprint 3

- Para créditos revolventes: se necesitará `currentBalance`, `amountToPay` y `classification`.
- Para créditos fijos: se necesitará `amountToPay` y `classification`.
- Fórmula futura de revolventes: mayor entre `currentBalance * 0.06` y `amountToPay`.
- Fórmula futura de pagos fijos: `amountToPay`.

## Ejemplo simulado

```json
{
  "schemaVersion": "1.0",
  "documentType": "CREDIT_BUREAU_REPORT",
  "extractionMetadata": {
    "sourceDocumentId": "doc_buro_001",
    "mortgageCaseId": "case_001",
    "ocrProcessedAt": "2026-06-22T10:34:00Z",
    "extractedAt": "2026-06-22T10:35:00Z",
    "model": "gemini-2.5-pro",
    "confidence": 0.84
  },
  "documentRequirementContext": {
    "incomeBehavior": "NOT_APPLICABLE",
    "requiredPayrollReceiptMonths": null,
    "requiredBankStatementMonths": null,
    "detectedDocumentMonths": null,
    "isRequirementSatisfied": null,
    "requirementNotes": null
  },
  "borrower": {
    "fullName": "MARIA JOSE PEREZ LOPEZ",
    "birthDate": "1992-04-12",
    "rfc": "PELJ920412AB1",
    "lastReportedAddress": "AV REFORMA 100 COL JUAREZ CIUDAD DE MEXICO CP 06600"
  },
  "report": {
    "consultationDate": "2026-06-01",
    "numberOfInquiries": 3,
    "publicScore": 685
  },
  "credits": [
    {
      "institution": "BBVA",
      "creditType": "TARJETA DE CREDITO",
      "classification": "REVOLVING",
      "status": "ACTIVE",
      "currentBalance": 100000.0,
      "amountToPay": 2000.0,
      "creditLimit": 150000.0,
      "currency": "MXN",
      "paymentHistory": "111111111111",
      "mopCodes": ["1"],
      "hasLatePayments": false,
      "hasSeriousDelinquency": false,
      "hasWriteOff": false,
      "hasFraudFlag": false,
      "rawTextReference": "BBVA TARJETA CREDITO SALDO 100000 PAGO 2000"
    },
    {
      "institution": "RADIOMOVIL DIPSA",
      "creditType": "TELEFONIA CELULAR",
      "classification": "NON_BANK_SERVICE",
      "status": "ACTIVE",
      "currentBalance": 0.0,
      "amountToPay": 599.0,
      "creditLimit": null,
      "currency": "MXN",
      "paymentHistory": "111111111111",
      "mopCodes": ["1"],
      "hasLatePayments": false,
      "hasSeriousDelinquency": false,
      "hasWriteOff": false,
      "hasFraudFlag": false,
      "rawTextReference": "RADIOMOVIL DIPSA TELCEL PLAN RENTA PAGO 599"
    }
  ],
  "riskSummary": {
    "hasWriteOff": false,
    "hasFraudFlag": false,
    "hasMinorDelinquency": false,
    "hasSeriousDelinquency": false,
    "hasPreventiveKeys": false,
    "possibleHomonym": false,
    "riskNotes": null
  },
  "missingFields": [],
  "alerts": []
}
```