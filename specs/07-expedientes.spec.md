# 07. Expedientes Hipotecarios — HU-03

## Propósito

Definir el MVP para crear, consultar y listar expedientes hipotecarios ligados a clientes existentes.

## Requisitos

### Requirement: Crear expediente hipotecario

El sistema MUST permitir que una asesora autenticada cree un expediente asociado a un `Client` existente y a un `CreditType` válido.

Reglas obligatorias del MVP:
- `clientId` y `creditTypeId` MUST ser obligatorios y MUST existir.
- `advisorId` MUST obtenerse del JWT autenticado y MUST NOT aceptarse desde el body.
- El contrato actual de `specs/04-api-contracts.md` que expone `advisorId` en el body MUST considerarse desactualizado y MUST ajustarse por seguridad.
- El estatus inicial MUST ser `PENDING_DOCUMENTS` y MUST asignarse automáticamente.
- `personType` MAY omitirse; si no viene, el sistema MUST usar `SALARIED`; si viene informado, MUST aceptar solo `SALARIED` en este MVP.
- `propertyLocation`, `requestedAmount`, `propertyValue` y `estimatedTermMonths` MAY omitirse durante el alta inicial.
- Si `requestedAmount`, `propertyValue` o `estimatedTermMonths` vienen informados, MUST ser mayores a `0`.
- Como evolución deseable, la ubicación SHOULD migrar de `propertyLocation` a `propertyState?`, `propertyCity?` y `propertyAddress?`.

#### Scenario: Crear expediente exitosamente con datos completos

- GIVEN una asesora autenticada, un cliente existente y catálogos sembrados
- WHEN envía `clientId`, `creditTypeId`, `personType=SALARIED`, `requestedAmount`, `propertyValue`, `propertyLocation` y `estimatedTermMonths` válidos
- THEN el sistema crea el expediente con `advisorId` del JWT y `status=PENDING_DOCUMENTS`
- AND devuelve el detalle persistido con todos los campos informados

#### Scenario: Crear expediente exitosamente sin `propertyLocation`

- GIVEN una asesora autenticada, un cliente existente y un tipo de crédito válido
- WHEN crea el expediente sin informar `propertyLocation`
- THEN el sistema crea el expediente sin bloquear el alta

#### Scenario: Crear expediente exitosamente sin `requestedAmount`, `propertyValue` o `estimatedTermMonths`

- GIVEN una asesora autenticada, un cliente existente y un tipo de crédito válido
- WHEN crea el expediente omitiendo uno o más de esos campos
- THEN el sistema crea el expediente y deja esos datos para completarse después

#### Scenario: Rechazar `requestedAmount` si se envía <= 0

- GIVEN una asesora autenticada
- WHEN intenta crear un expediente con `requestedAmount` menor o igual a `0`
- THEN el sistema MUST rechazar la solicitud con error de validación

#### Scenario: Rechazar `propertyValue` si se envía <= 0

- GIVEN una asesora autenticada
- WHEN intenta crear un expediente con `propertyValue` menor o igual a `0`
- THEN el sistema MUST rechazar la solicitud con error de validación

#### Scenario: Rechazar `estimatedTermMonths` si se envía <= 0

- GIVEN una asesora autenticada
- WHEN intenta crear un expediente con `estimatedTermMonths` menor o igual a `0`
- THEN el sistema MUST rechazar la solicitud con error de validación

#### Scenario: Rechazar `advisorId` en body

- GIVEN una asesora autenticada
- WHEN envía `advisorId` dentro del body del alta
- THEN el sistema MUST rechazar la solicitud por contrato inválido o campo no permitido

#### Scenario: Rechazar `personType` distinto de `SALARIED`

- GIVEN una asesora autenticada
- WHEN intenta crear un expediente con `personType` distinto de `SALARIED`
- THEN el sistema MUST rechazar la solicitud con error de validación

#### Scenario: Rechazar `clientId` inexistente

- GIVEN una asesora autenticada
- WHEN usa un `clientId` inexistente
- THEN el sistema MUST rechazar la creación sin persistir el expediente

#### Scenario: Rechazar `creditTypeId` inexistente

- GIVEN una asesora autenticada
- WHEN usa un `creditTypeId` inexistente
- THEN el sistema MUST rechazar la creación sin persistir el expediente

### Requirement: Consultar expediente creado

El sistema MUST permitir consultar un expediente por id y devolver como mínimo `id`, cliente, asesora asignada, `creditType`, `status`, `personType`, `createdAt`, `updatedAt` y los campos de preperfilamiento informados.

#### Scenario: Consulta exitosa

- GIVEN un expediente existente
- WHEN la asesora consulta su detalle
- THEN el sistema devuelve el expediente con relaciones y estatus legibles

#### Scenario: Expediente inexistente

- GIVEN un id no registrado
- WHEN se consulta el expediente
- THEN el sistema MUST responder que el recurso no existe

### Requirement: Listar expedientes

El sistema MUST listar expedientes creados con al menos `id`, nombre del cliente, tipo de crédito, estatus, `personType`, fecha de creación y `requestedAmount` cuando haya sido informado.

#### Scenario: Listado con resultados

- GIVEN expedientes registrados
- WHEN la asesora solicita el listado
- THEN el sistema devuelve una colección con el resumen mínimo definido

#### Scenario: Listado vacío

- GIVEN que no existen expedientes
- WHEN la asesora solicita el listado
- THEN el sistema devuelve una colección vacía sin error

### Requirement: Catálogos mínimos y datos iniciales

El sistema MUST contar con seeds/datos iniciales previos a HU-03.

`CreditType` mínimo esperado: `COMPRA`, `MEJORA_HIPOTECA`, `LIQUIDEZ`, `TERRENO`, `REMODELACION`, `CONSTRUCCION`.

`CaseStatus` mínimo esperado: `PENDING_DOCUMENTS`, `INTEGRATION`, `ANALYSIS`, `COMPLETED`; `REJECTED` SHOULD existir como estado recomendado.

#### Scenario: Catálogos disponibles para alta

- GIVEN la base inicial del sistema
- WHEN la asesora consulta tipos de crédito y estados
- THEN el sistema devuelve al menos los valores mínimos definidos para HU-03
