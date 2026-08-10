# Schemas de Extracción Documental

Esquemas JSON que definen el contrato de datos que Gemini debe extraer del
texto OCR de cada tipo de documento. Estos schemas se pasan como parte del
prompt en cada llamada a Vertex AI.

## Documentos cubiertos

| Schema | Documento |
|---|---|
| `credit-bureau.schema.md` | Reporte de Buró de Crédito Especial (México) |
| `payroll-receipt.schema.md` | Recibos de nómina (CFDI) |
| `bank-statement.schema.md` | Estados de cuenta bancarios |
| `official-identification.schema.md` | INE o pasaporte |
| `proof-of-address.schema.md` | Comprobante de domicilio |
| `common.schema.md` | Metadatos, alertas y reglas transversales |

## Cómo se usan en producción

Estos schemas son consumidos por los servicios de extracción en
`apps/api/src/documents/`. Cada servicio (`CreditBureauExtractionService`,
`PayrollExtractionService`, etc.) pasa el schema correspondiente a
`GeminiService.extractStructuredData()` junto con el texto OCR y las
instrucciones específicas del tipo de documento.

## Nota para PFAE

Los documentos del perfil PFAE comparten la mayoría de schemas con asalariado.
El documento adicional — Constancia de Situación Fiscal del SAT — requerirá
un nuevo schema cuando se implemente ese perfil.
