# Tarea 2.5 — Esquemas JSON para extracción con IA

## Contexto

Este documento define la estructura esperada de los datos que Gemini deberá extraer a partir del texto OCR de los documentos iniciales del expediente hipotecario para **persona asalariada**.

La tarea se limita a la definición de esquemas JSON y documentación técnica. No incluye todavía llamadas a Gemini, cálculos financieros, validaciones automáticas completas ni integración con servicios externos.

## Documentos incluidos

1. Identificación oficial: INE o pasaporte.
2. Comprobante de domicilio.
3. Reporte de Buró de Crédito Especial.
4. Recibos de nómina.
5. Estados de cuenta bancarios donde se deposita la nómina.

## Insight operativo incorporado

Para una persona asalariada, la cantidad de documentos solicitados depende de la estabilidad y comportamiento de sus ingresos.

### Recibos de nómina

- Si el ingreso es fijo y constante, se solicitan de **1 a 3 meses completos**.
- Si el cliente recibe exactamente la misma cantidad cada periodo, matemáticamente un mes puede ser suficiente para calcular capacidad, aunque operativamente suele pedirse el paquete de los últimos 3 meses.
- Si el ingreso es variable por comisiones, bonos, compensaciones, horas extra o percepciones no constantes, se solicitan estrictamente los **últimos 6 meses completos**.
- Para ingresos variables, el cálculo posterior deberá usar un promedio simple del periodo para estabilizar el ingreso.

### Estados de cuenta bancarios

- Se solicitan de **3 a 6 meses** de estados de cuenta de la cuenta donde se deposita el sueldo.
- Los estados de cuenta no sustituyen al recibo de nómina.
- Su función principal es corroborar la bancarización: hacer match entre el ingreso neto timbrado en nómina y el depósito real recibido en banco.
- La comparación debe considerar monto, fecha y concepto original del movimiento.

## Uso esperado

Estos esquemas serán utilizados en la Tarea 2.6 para construir el servicio de extracción estructurada con Gemini.

Cada prompt especializado debe tomar como referencia el esquema correspondiente y devolver únicamente JSON válido.

## Índice de archivos

- `common.schema.md`: convenciones generales, metadatos, alertas y reglas transversales.
- `official-identification.schema.md`: INE o pasaporte.
- `proof-of-address.schema.md`: comprobante de domicilio.
- `credit-bureau.schema.md`: reporte de Buró de Crédito Especial.
- `payroll-receipt.schema.md`: recibos de nómina.
- `bank-statement.schema.md`: estados de cuenta bancarios.
---