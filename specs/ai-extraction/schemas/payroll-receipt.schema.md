 6. Esquema JSON — Recibos de nómina

## Propósito

Extraer datos del empleado, empleador, periodo, timbrado fiscal, ingresos brutos, ingresos netos, deducciones y percepciones variables. También debe permitir determinar si la documentación de nómina es suficiente según el comportamiento del ingreso.

## Esquema

```json
{
  "schemaVersion": "1.0",
  "documentType": "PAYROLL_RECEIPT",
  "extractionMetadata": {
    "sourceDocumentId": null,
    "mortgageCaseId": null,
    "ocrProcessedAt": null,
    "extractedAt": null,
    "model": null,
    "confidence": 0.0
  },
  "documentRequirementContext": {
    "incomeBehavior": "FIXED | VARIABLE | UNKNOWN",
    "requiredPayrollReceiptMonths": "number | null",
    "requiredBankStatementMonths": "number | null",
    "detectedDocumentMonths": "number | null",
    "isRequirementSatisfied": "boolean | null",
    "requirementNotes": "string | null"
  },
  "employee": {
    "fullName": "string | null",
    "rfc": "string | null",
    "curp": "string | null",
    "employmentStartDate": "YYYY-MM-DD | null",
    "employmentSeniorityText": "string | null",
    "contributesToImss": "boolean | null"
  },
  "employer": {
    "legalName": "string | null",
    "rfc": "string | null",
    "possiblePayrollProvider": "boolean | null"
  },
  "payrollPeriod": {
    "periodStartDate": "YYYY-MM-DD | null",
    "periodEndDate": "YYYY-MM-DD | null",
    "paymentDate": "YYYY-MM-DD | null",
    "periodicity": "WEEKLY | BIWEEKLY | MONTHLY | OTHER | UNKNOWN",
    "isClosedPeriod": "boolean | null"
  },
  "income": {
    "grossIncome": "number | null",
    "totalDeductions": "number | null",
    "netIncome": "number | null",
    "currency": "MXN",
    "incomeBehaviorDetected": "FIXED | VARIABLE | UNKNOWN",
    "variablePerceptions": [
      {
        "type": "BONUS | COMMISSION | COMPENSATION | OVERTIME | PTU | OTHER",
        "description": "string | null",
        "amount": "number | null"
      }
    ]
  },
  "deductions": [
    {
      "type": "TAX | IMSS | INFONAVIT | FONACOT | MORTGAGE_LOAN | ALIMONY | EMPLOYEE_LOAN | OTHER | UNKNOWN",
      "description": "string | null",
      "amount": "number | null",
      "requiresAlert": "boolean"
    }
  ],
  "fiscalStamp": {
    "hasQrCode": "boolean | null",
    "hasSatDigitalSeal": "boolean | null",
    "uuid": "string | null",
    "stampDate": "datetime | null"
  },
  "crossCheckPreparation": {
    "expectedBankDepositAmount": "number | null",
    "expectedBankDepositDate": "YYYY-MM-DD | null",
    "expectedEmployerName": "string | null",
    "requiresBankStatementMatch": true
  },
  "missingFields": [],
  "alerts": []
}
```

## Reglas de requerimiento documental

### Ingreso fijo

Si el ingreso es fijo y constante:

```json
{
  "incomeBehavior": "FIXED",
  "requiredPayrollReceiptMonths": 3,
  "minimumOperationalMonths": 1,
  "requirementNotes": "Si el ingreso es exactamente igual cada periodo, 1 mes puede ser matemáticamente suficiente, pero operativamente suelen solicitarse los últimos 3 meses."
}
```

### Ingreso variable

Si hay comisiones, bonos, compensaciones, horas extra o variación relevante:

```json
{
  "incomeBehavior": "VARIABLE",
  "requiredPayrollReceiptMonths": 6,
  "minimumOperationalMonths": 6,
  "requirementNotes": "Para ingresos variables se requieren estrictamente los últimos 6 meses completos para calcular promedio simple."
}
```

## Reglas y alertas sugeridas

- Alertar si falta ingreso neto.
- Alertar si falta RFC del empleado.
- Alertar si falta nombre del empleado.
- Alertar si falta periodo de pago.
- Alertar si falta fecha exacta de pago.
- Alertar si no hay QR o timbrado fiscal detectable.
- Alertar si aparecen deducciones por crédito hipotecario, pensión alimenticia, INFONAVIT, FONACOT o préstamos relevantes.
- Alertar si no se detecta fecha de ingreso ni antigüedad.
- Si no se puede comprobar antigüedad, sugerir solicitar una nómina antigua de al menos 7 meses.
- Alertar si se detectan ingresos variables y hay menos de 6 meses de recibos.
- Alertar si se detecta ingreso fijo pero hay menos de 1 mes completo de nómina.
- Alertar si hay posible pagadora por razón social distinta o depósitos relacionados que no coinciden con el empleador principal.

## Ejemplo simulado — ingreso fijo

```json
{
  "schemaVersion": "1.0",
  "documentType": "PAYROLL_RECEIPT",
  "extractionMetadata": {
    "sourceDocumentId": "doc_payroll_001",
    "mortgageCaseId": "case_001",
    "ocrProcessedAt": "2026-06-22T10:36:00Z",
    "extractedAt": "2026-06-22T10:37:00Z",
    "model": "gemini-2.5-pro",
    "confidence": 0.9
  },
  "documentRequirementContext": {
    "incomeBehavior": "FIXED",
    "requiredPayrollReceiptMonths": 3,
    "requiredBankStatementMonths": 3,
    "detectedDocumentMonths": 1,
    "isRequirementSatisfied": true,
    "requirementNotes": "Ingreso fijo detectado. Un mes puede ser suficiente para cálculo matemático, aunque operativamente se recomienda contar con tres meses."
  },
  "employee": {
    "fullName": "MARIA JOSE PEREZ LOPEZ",
    "rfc": "PELJ920412AB1",
    "curp": "PELJ920412MYNRPS09",
    "employmentStartDate": "2024-01-15",
    "employmentSeniorityText": "2 AÑOS 5 MESES",
    "contributesToImss": true 
  },
  "employer": {
    "legalName": "EMPRESA EJEMPLO SA DE CV",
    "rfc": "EEJ010101AA1",
    "possiblePayrollProvider": false
  },
  "payrollPeriod": {
    "periodStartDate": "2026-05-01",
    "periodEndDate": "2026-05-15",
    "paymentDate": "2026-05-15",
    "periodicity": "BIWEEKLY",
    "isClosedPeriod": true
  },
  "income": {
    "grossIncome": 20000.0,
    "totalDeductions": 4500.0,
    "netIncome": 15500.0,
    "currency": "MXN",
    "incomeBehaviorDetected": "FIXED",
    "variablePerceptions": []
  },
  "deductions": [
    {
      "type": "TAX",
      "description": "ISR",
      "amount": 3500.0,
      "requiresAlert": false
    },
    {
      "type": "IMSS",
      "description": "IMSS",
      "amount": 1000.0,
      "requiresAlert": false
    }
  ],
  "fiscalStamp": {
    "hasQrCode": true,
    "hasSatDigitalSeal": true,
    "uuid": "123e4567-e89b-12d3-a456-426614174000",
    "stampDate": "2026-05-15T12:00:00Z"
  },
  "crossCheckPreparation": {
    "expectedBankDepositAmount": 15500.0,
    "expectedBankDepositDate": "2026-05-15",
    "expectedEmployerName": "EMPRESA EJEMPLO SA DE CV",
    "requiresBankStatementMatch": true
  },
  "missingFields": [],
  "alerts": []
}
```

## Ejemplo simulado — ingreso variable con documentación insuficiente

```json
{
  "schemaVersion": "1.0",
  "documentType": "PAYROLL_RECEIPT",
  "extractionMetadata": {
    "sourceDocumentId": "doc_payroll_002",
    "mortgageCaseId": "case_002",
    "ocrProcessedAt": "2026-06-22T10:38:00Z",
    "extractedAt": "2026-06-22T10:39:00Z",
    "model": "gemini-2.5-pro",
    "confidence": 0.88
  },
  "documentRequirementContext": {
    "incomeBehavior": "VARIABLE",
    "requiredPayrollReceiptMonths": 6,
    "requiredBankStatementMonths": 6,
    "detectedDocumentMonths": 3,
    "isRequirementSatisfied": false,
    "requirementNotes": "Ingreso variable detectado. Se requieren estrictamente 6 meses completos de recibos de nómina y estados de cuenta."
  },
  "employee": {
    "fullName": "JUAN CARLOS RAMIREZ GOMEZ",
    "rfc": "RAGJ900101BC2",
    "curp": "RAGJ900101HYNMMM05",
    "employmentStartDate": null,
    "employmentSeniorityText": null,
    "contributesToImss": false 
  },
  "employer": {
    "legalName": "VENTAS DEL SURESTE SA DE CV",
    "rfc": "VSU010101AA1",
    "possiblePayrollProvider": false
  },
  "payrollPeriod": {
    "periodStartDate": "2026-05-01",
    "periodEndDate": "2026-05-31",
    "paymentDate": "2026-05-31",
    "periodicity": "MONTHLY",
    "isClosedPeriod": true
  },
  "income": {
    "grossIncome": 32000.0,
    "totalDeductions": 7000.0,
    "netIncome": 25000.0,
    "currency": "MXN",
    "incomeBehaviorDetected": "VARIABLE",
    "variablePerceptions": [
      {
        "type": "COMMISSION",
        "description": "COMISIONES POR VENTA",
        "amount": 8000.0
      }
    ]
  },
  "incomeDeductions": [],
  "fiscalStamp": {
    "hasQrCode": true,
    "hasSatDigitalSeal": true,
    "uuid": null,
    "stampDate": null
  },
  "crossCheckPreparation": {
    "expectedBankDepositAmount": 25000.0,
    "expectedBankDepositDate": "2026-05-31",
    "expectedEmployerName": "VENTAS DEL SURESTE SA DE CV",
    "requiresBankStatementMatch": true
  },
  "missingFields": ["employee.employmentStartDate"],
  "alerts": [
    {
      "code": "VARIABLE_INCOME_REQUIRES_6_MONTHS",
      "severity": "CRITICAL",
      "category": "REQUIREMENT",
      "message": "Se detectó ingreso variable y solo hay 3 meses de nómina. Se requieren 6 meses completos.",
      "field": "documentRequirementContext.detectedDocumentMonths",
      "requiresManualReview": true
    },
    {
      "code": "EMPLOYMENT_START_DATE_NOT_FOUND",
      "severity": "WARNING",
      "category": "INCOME",
      "message": "No se detectó fecha de ingreso ni antigüedad laboral. Solicitar nómina antigua de al menos 7 meses si se requiere comprobar antigüedad.",
      "field": "employee.employmentStartDate",
      "requiresManualReview": true
    }
  ]
}
