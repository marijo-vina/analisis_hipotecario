# 7. Esquema JSON — Estados de cuenta bancarios

## Propósito

Extraer datos del titular, banco, periodo y movimientos relevantes para identificar depósitos de nómina y preparar la conciliación contra recibos de nómina.

Los estados de cuenta sirven para corroborar la bancarización. No sustituyen al recibo de nómina.

## Esquema

```json
{
  "schemaVersion": "1.0",
  "documentType": "BANK_STATEMENT",
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
  "accountHolder": {
    "fullName": "string | null"
  },
  "bank": {
    "institutionName": "string | null",
    "accountNumber": "string | null",
    "clabe": "string | null"
  },
  "statementPeriod": {
    "periodStartDate": "YYYY-MM-DD | null",
    "periodEndDate": "YYYY-MM-DD | null",
    "cutoffDate": "YYYY-MM-DD | null",
    "isClosedMonth": "boolean | null",
    "isCurrentIncompleteMonth": "boolean | null"
  },
  "payrollDeposits": [
    {
      "date": "YYYY-MM-DD | null",
      "amount": "number | null",
      "currency": "MXN",
      "originalConcept": "string | null",
      "detectedEmployerOrPayerName": "string | null",
      "isPayrollConcept": "boolean | null",
      "containsPayrollKeyword": "boolean | null",
      "possiblePayrollProvider": "boolean | null",
      "matchCandidateForPayrollReceipt": {
        "expectedPayrollReceiptId": "string | null",
        "amountMatchesPayrollNetIncome": "boolean | null",
        "dateMatchesPayrollPaymentDate": "boolean | null",
        "conceptMatchesEmployer": "boolean | null",
        "matchConfidence": "number | null"
      }
    }
  ],
  "possiblePayrollProviders": [
    {
      "payerName": "string | null",
      "depositDate": "YYYY-MM-DD | null",
      "amount": "number | null",
      "originalConcept": "string | null",
      "receivingBank": "string | null",
      "receivingAccount": "string | null",
      "estimatedRecurrence": "WEEKLY | BIWEEKLY | MONTHLY | IRREGULAR | UNKNOWN",
      "containsPayrollKeyword": "boolean | null"
    }
  ],
  "otherRelevantMovements": [
  {
    "date": "YYYY-MM-DD | null",
    "amount": "number | null",
    "movementType": "DEPOSIT | WITHDRAWAL | TRANSFER | CHARGE | UNKNOWN",
    "originalConcept": "string | null",
    "trashDepositAnalysis": {
      "isDiscardableTrashDeposit": "boolean | null",
      "confidence": "number | null",
      "reason": "string | null",
      "evidenceText": "string | null"
    },
    "relevanceReason": "string | null"
  }
  ],
  "bankarizationValidationPreparation": {
    "purpose": "MATCH_PAYROLL_NET_INCOME_WITH_BANK_DEPOSIT",
    "requiresPayrollReceiptComparison": true,
    "notes": "Los depósitos detectados deben compararse contra el ingreso neto, fecha de pago y empleador de los recibos de nómina."
  },
  "missingFields": [],
  "alerts": []
}
```

## Reglas de requerimiento documental

### Ingreso fijo

```json
{
  "incomeBehavior": "FIXED",
  "requiredBankStatementMonths": 3,
  "minimumOperationalMonths": 3,
  "requirementNotes": "Para ingresos fijos se solicitan normalmente 3 meses de estados de cuenta para corroborar bancarización."
}
```

### Ingreso variable

```json
{
  "incomeBehavior": "VARIABLE",
  "requiredBankStatementMonths": 6,
  "minimumOperationalMonths": 6,
  "requirementNotes": "Para ingresos variables se requieren 6 meses completos de estados de cuenta para hacer match contra los recibos de nómina variables."
}
```

## Reglas y alertas sugeridas

- Alertar si no se detectan depósitos de nómina.
- Alertar si el estado de cuenta corresponde al mes en curso incompleto.
- Alertar si el estado de cuenta no corresponde a un mes cerrado.
- Alertar si falta periodo o fecha de corte.
- Alertar si el titular no coincide con el cliente.
- Alertar si se detectan depósitos de pagadoras.
- Alertar si el concepto no contiene la palabra “nómina” cuando podría ser relevante para políticas bancarias.
- Alertar si hay menos meses de estados de cuenta que los requeridos por el comportamiento del ingreso.
- Alertar si los depósitos no coinciden en monto o fecha con la nómina esperada.

## Ejemplo simulado

```json
{
  "schemaVersion": "1.0",
  "documentType": "BANK_STATEMENT",
  "extractionMetadata": {
    "sourceDocumentId": "doc_statement_001",
    "mortgageCaseId": "case_001",
    "ocrProcessedAt": "2026-06-22T10:40:00Z",
    "extractedAt": "2026-06-22T10:41:00Z",
    "model": "gemini-2.5-pro",
    "confidence": 0.86
  },
  "documentRequirementContext": {
    "incomeBehavior": "FIXED",
    "requiredPayrollReceiptMonths": 3,
    "requiredBankStatementMonths": 3,
    "detectedDocumentMonths": 3,
    "isRequirementSatisfied": true,
    "requirementNotes": "Se detectaron 3 meses de estados de cuenta para ingreso fijo."
  },
  "accountHolder": {
    "fullName": "MARIA JOSE PEREZ LOPEZ"
  },
  "bank": {
    "institutionName": "BBVA",
    "accountNumber": "1234567890",
    "clabe": "012180001234567890"
  },
  "statementPeriod": {
    "periodStartDate": "2026-05-01",
    "periodEndDate": "2026-05-31",
    "cutoffDate": "2026-05-31",
    "isClosedMonth": true,
    "isCurrentIncompleteMonth": false
  },
  "payrollDeposits": [
    {
      "date": "2026-05-15",
      "amount": 15500.0,
      "currency": "MXN",
      "originalConcept": "ABONO NOMINA EMPRESA EJEMPLO SA DE CV",
      "detectedEmployerOrPayerName": "EMPRESA EJEMPLO SA DE CV",
      "isPayrollConcept": true,
      "containsPayrollKeyword": true,
      "possiblePayrollProvider": false,
      "matchCandidateForPayrollReceipt": {
        "expectedPayrollReceiptId": "doc_payroll_001",
        "amountMatchesPayrollNetIncome": true,
        "dateMatchesPayrollPaymentDate": true,
        "conceptMatchesEmployer": true,
        "matchConfidence": 0.95
      }
    }
  ],
  "possiblePayrollProviders": [],
  "otherRelevantMovements": [
  {
    "date": "2026-05-20",
    "amount": 1500.0,
    "movementType": "DEPOSIT",
    "originalConcept": "PAGO CHELAS Y PIZZA",
    "trashDepositAnalysis": {
      "isDiscardableTrashDeposit": true,
      "confidence": 0.95,
      "reason": "Depósito entre particulares con concepto informal no apto para comprobación de ingresos según políticas bancarias.",
      "evidenceText": "PAGO CHELAS Y PIZZA"
    },
    "relevanceReason": "Movimiento marcado como relevante porque es un depósito que podría alterar el análisis de ingresos si no se descarta."
  }
],
  "bankarizationValidationPreparation": {
    "purpose": "MATCH_PAYROLL_NET_INCOME_WITH_BANK_DEPOSIT",
    "requiresPayrollReceiptComparison": true,
    "notes": "Los depósitos detectados deben compararse contra el ingreso neto, fecha de pago y empleador de los recibos de nómina."
  },
  "missingFields": [],
  "alerts": []
}---