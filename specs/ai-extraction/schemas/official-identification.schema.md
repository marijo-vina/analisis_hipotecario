# 3. Esquema JSON — Identificación oficial

## Propósito

Extraer datos de identidad necesarios para validar nombre, edad, CURP y documento oficial del cliente. Para INE, la vigencia real en Lista Nominal será validada manualmente por la asesora usando CIC e Identificador del Ciudadano extraídos del reverso de la credencial.

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
  "ineValidation": {
    "issueDate": "YYYY-MM-DD | null",
    "issueYear": "string | null",
    "isPost2014Credential": "boolean | null",
    "cic": "string | null",
    "citizenIdentifier": "string | null",
    "validationMethod": "CIC_CITIZEN_IDENTIFIER | MANUAL_REVIEW | null",
    "requiresManualValidation": true,
    "notes": []
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

## Reglas y alertas

### Identidad
- Si `idType = INE`, `externalValidation.required = true`.
- Si `idType = PASSPORT`, `externalValidation.required = false` y `method = NOT_APPLICABLE`.
- La fecha visible de vigencia del INE no sustituye la validación manual en Lista Nominal.
- Generar alerta CRITICAL si falta nombre, fecha de nacimiento, CURP o número de identificación.
- Generar alerta WARNING si el documento está vencido por fecha visible.

### Validación manual INE (`ineValidation`)
- Solo aplica cuando `idType = INE`. Para pasaporte usar `null`.
- `isPost2014Credential`: `true` si la fecha/año de emisión indica julio 2014 o posterior. `false` si es claramente anterior. `null` si no se puede determinar.
- Para credenciales emitidas a partir de julio 2014, buscar en el reverso:
  - **CIC**: número que aparece después de `IDMEX` en el reverso.
  - **Identificador del Ciudadano**: bloque alfanumérico después de separadores `<<`.
- `validationMethod`:
  - `"CIC_CITIZEN_IDENTIFIER"` si se detectaron CIC e Identificador del Ciudadano.
  - `"MANUAL_REVIEW"` si no hay datos suficientes.
- No se requiere clasificar el modelo exacto de INE (E, F, G, H, I, J).
- Los valores deben conservarse como string para no perder ceros iniciales.
- NO inventar datos. Si el patrón IDMEX no es claro, usar `null`.

### Alertas de validación manual
- Si `idType = INE`, generar alerta WARNING `INE_MANUAL_VALIDATION_REQUIRED`.
- Si no se detecta CIC, generar alerta WARNING `INE_MISSING_CIC`.
- Si no se detecta citizenIdentifier, generar alerta WARNING `INE_MISSING_CITIZEN_ID`.

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
  "ineValidation": {
    "issueDate": "2020-03-15",
    "issueYear": "2020",
    "isPost2014Credential": true,
    "cic": "123456789",
    "citizenIdentifier": "IDMEX123456789<<0<<1234<<5678<<9",
    "validationMethod": "CIC_CITIZEN_IDENTIFIER",
    "requiresManualValidation": true,
    "notes": []
  },
  "externalValidation": {
    "required": true,
    "status": "NOT_VALIDATED",
    "method": "MANUAL_INE_PAGE",
    "validatedAt": null,
    "validatedBy": null,
    "notes": "La asesora debe validar manualmente en Lista Nominal usando CIC e Identificador del Ciudadano."
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
