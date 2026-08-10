# 4. Esquema JSON — Comprobante de domicilio

## Propósito

Extraer datos de domicilio para validación documental y operativa del expediente. Este documento no se usa para cálculo financiero ni capacidad de pago.

## Esquema

```json
{
  "schemaVersion": "1.0",
  "documentType": "PROOF_OF_ADDRESS",
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
  "proofOfAddress": {
    "proofType": "ELECTRICITY | WATER | LANDLINE_PHONE | INTERNET | GAS | OTHER | UNKNOWN",
    "holderName": "string | null",
    "serviceProvider": "string | null",
    "address": {
      "fullAddress": "string | null",
      "street": "string | null",
      "exteriorNumber": "string | null",
      "interiorNumber": "string | null",
      "neighborhood": "string | null",
      "municipality": "string | null",
      "city": "string | null",
      "state": "string | null",
      "postalCode": "string | null"
    },
    "period": "string | null",
    "issueDate": "YYYY-MM-DD | null",
    "dueDate": "YYYY-MM-DD | null",
    "isRecent": "boolean | null",
    "isCompanyHolder": "boolean | null",
    "holderValidation": {
      "holderMatchesApplicant": "boolean | null",
      "confidence": "number | null",
      "reason": "string | null",
      "evidenceText": "string | null"
    }
  },
  "missingFields": [],
  "alerts": []
}
```

## Reglas y alertas sugeridas

- Generar alerta si falta dirección completa.
- Generar alerta si falta código postal.
- Generar alerta si falta nombre del titular.
- Generar alerta si falta periodo o fecha de emisión.
- Generar alerta si el comprobante no parece reciente.
- Generar alerta si el titular parece ser una empresa.
- Generar alerta si el tipo de comprobante no puede identificarse.
- Si el titular no coincide con el cliente, marcar revisión manual, no rechazo automático.

## Ejemplo simulado

```json
{
  "schemaVersion": "1.0",
  "documentType": "PROOF_OF_ADDRESS",
  "extractionMetadata": {
    "sourceDocumentId": "doc_address_001",
    "mortgageCaseId": "case_001",
    "ocrProcessedAt": "2026-06-22T10:32:00Z",
    "extractedAt": "2026-06-22T10:33:00Z",
    "model": "gemini-2.5-pro",
    "confidence": 0.87
  },
  "documentRequirementContext": {
    "incomeBehavior": "NOT_APPLICABLE",
    "requiredPayrollReceiptMonths": null,
    "requiredBankStatementMonths": null,
    "detectedDocumentMonths": null,
    "isRequirementSatisfied": null,
    "requirementNotes": null
  },
  "proofOfAddress": {
    "proofType": "ELECTRICITY",
    "holderName": "MARIA JOSE PEREZ LOPEZ",
    "serviceProvider": "CFE",
    "address": {
      "fullAddress": "CALLE 20 NUM 100 COLONIA CENTRO MERIDA YUCATAN CP 97000",
      "street": "CALLE 20",
      "exteriorNumber": "100",
      "interiorNumber": null,
      "neighborhood": "CENTRO",
      "municipality": "MERIDA",
      "city": "MERIDA",
      "state": "YUCATAN",
      "postalCode": "97000"
    },
    "period": "MAYO 2026",
    "issueDate": "2026-05-31",
    "dueDate": "2026-06-15",
    "isRecent": true,
    "isCompanyHolder": false,
    "holderValidation": {
      "holderMatchesApplicant": false,
      "confidence": 0.88,
      "reason": "El titular del comprobante no coincide exactamente con el nombre del solicitante.",
      "evidenceText": "Titular: JUAN CARLOS PÉREZ LÓPEZ"
    }
  },
  "missingFields": [],
  "alerts": []
}
```