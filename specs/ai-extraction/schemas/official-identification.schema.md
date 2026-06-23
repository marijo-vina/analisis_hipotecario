# 3. Esquema JSON — Identificación oficial

## Propósito

Extraer datos de identidad necesarios para validar nombre, edad, CURP y documento oficial del cliente. Para INE, la vigencia real en Lista Nominal será validada manualmente por la asesora.

## Esquema

```json
{
  "schemaVersion": "1.0",
  "documentType": "OFFICIAL_ID",
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
  "identity": {
    "idType": "INE | PASSPORT | UNKNOWN",
    "fullName": "string | null",
    "birthDate": "YYYY-MM-DD | null",
    "curp": "string | null",
    "voterKey": "string | null",
    "idNumber": "string | null",
    "visibleExpirationDate": "YYYY-MM-DD | null",
    "isExpiredByVisibleDate": "boolean | null",
    "hasSignature": "boolean | null",
    "hasPhoto": "boolean | null"
  },
  "externalValidation": {
    "required": "boolean",
    "status": "NOT_VALIDATED | VALID | NOT_VALID | MANUAL_REVIEW | NOT_APPLICABLE",
    "method": "MANUAL_INE_PAGE | MANUAL_REVIEW | NOT_APPLICABLE",
    "validatedAt": "datetime | null",
    "validatedBy": "string | null",
    "notes": "string | null"
  },
  "missingFields": [],
  "alerts": []
}
```

## Reglas y alertas sugeridas

- Si `idType = INE`, `externalValidation.required = true`.
- Si `idType = PASSPORT`, `externalValidation.required = false` y `method = NOT_APPLICABLE`.
- La fecha visible de vigencia del INE no sustituye la validación manual en Lista Nominal.
- Generar alerta si falta nombre, fecha de nacimiento, número de identificación o vigencia visible.
- Generar alerta si el documento está vencido por fecha visible.
- Generar alerta si el INE está pendiente de validación manual.

## Ejemplo simulado

```json
{
  "schemaVersion": "1.0",
  "documentType": "OFFICIAL_ID",
  "extractionMetadata": {
    "sourceDocumentId": "doc_ine_001",
    "mortgageCaseId": "case_001",
    "ocrProcessedAt": "2026-06-22T10:30:00Z",
    "extractedAt": "2026-06-22T10:31:00Z",
    "model": "gemini-2.5-pro",
    "confidence": 0.91
  },
  "documentRequirementContext": {
    "incomeBehavior": "NOT_APPLICABLE",
    "requiredPayrollReceiptMonths": null,
    "requiredBankStatementMonths": null,
    "detectedDocumentMonths": null,
    "isRequirementSatisfied": null,
    "requirementNotes": null
  },
  "identity": {
    "idType": "INE",
    "fullName": "MARIA JOSE PEREZ LOPEZ",
    "birthDate": "1992-04-12",
    "curp": "PELJ920412MYNRPS09",
    "voterKey": "PRLPMA92041231M100",
    "idNumber": null,
    "visibleExpirationDate": "2032-12-31",
    "isExpiredByVisibleDate": false,
    "hasSignature": true,
    "hasPhoto": true
  },
  "externalValidation": {
    "required": true,
    "status": "NOT_VALIDATED",
    "method": "MANUAL_INE_PAGE",
    "validatedAt": null,
    "validatedBy": null,
    "notes": "La asesora debe validar manualmente la vigencia en Lista Nominal."
  },
  "missingFields": [],
  "alerts": [
    {
      "code": "INE_MANUAL_VALIDATION_REQUIRED",
      "severity": "WARNING",
      "category": "MANUAL_VALIDATION",
      "message": "El INE requiere validación manual en Lista Nominal.",
      "field": "externalValidation.status",
      "requiresManualReview": true
    }
  ]
}
```
