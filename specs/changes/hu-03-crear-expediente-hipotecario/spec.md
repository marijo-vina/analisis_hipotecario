# Spec Artifact — HU-03 Crear Expediente Hipotecario

## Fuente canónica

La especificación funcional local de HU-03 quedó persistida en `specs/07-expedientes.spec.md`.

## Deltas obligatorios cerrados en esta fase

- `advisorId` MUST salir del JWT y MUST NOT recibirse desde el body.
- El contrato vigente en `specs/04-api-contracts.md` requiere ajuste por seguridad porque hoy expone `advisorId` en el body de `POST /mortgage-cases`.
- El estatus inicial MUST ser `PENDING_DOCUMENTS`.
- `personType` MAY omitirse; si se omite, el sistema MUST usar `SALARIED`; si se informa, el único valor soportado por el MVP MUST ser `SALARIED`.
- Deben existir seeds mínimos para `CreditType` y `CaseStatus` antes de implementar HU-03.
- `propertyLocation` MUST ser opcional en el alta inicial.
- `requestedAmount`, `propertyValue` y `estimatedTermMonths` MUST ser opcionales en el alta inicial; si se informan, MUST ser mayores a `0`.

## Cobertura funcional

- Crear expediente asociado a cliente existente
- Consultar expediente creado
- Listar expedientes
- Seleccionar tipo de crédito válido y cliente existente
- Registrar tipo de persona con default interno `SALARIED`
- Permitir alta sin `propertyLocation`
- Permitir alta sin `requestedAmount`, `propertyValue` o `estimatedTermMonths`
- Validar rechazo de numéricos menores o iguales a `0`
- Rechazar `advisorId` en body, `personType` no soportado, `clientId` inexistente y `creditTypeId` inexistente
- Asignar estatus inicial automático `PENDING_DOCUMENTS`

## Escenarios obligatorios actualizados

- Crear expediente exitosamente con datos completos.
- Crear expediente exitosamente sin `propertyLocation`.
- Crear expediente exitosamente sin `requestedAmount`, `propertyValue` o `estimatedTermMonths`.
- Rechazar `requestedAmount` si se envía `<= 0`.
- Rechazar `propertyValue` si se envía `<= 0`.
- Rechazar `estimatedTermMonths` si se envía `<= 0`.
- Rechazar `advisorId` en body.
- Rechazar `personType` distinto de `SALARIED`.
- Rechazar `clientId` inexistente.
- Rechazar `creditTypeId` inexistente.
