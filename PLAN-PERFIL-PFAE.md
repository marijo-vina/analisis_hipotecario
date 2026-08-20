# Plan de desarrollo — Perfil PFAE (Independiente / PFAE)

> Documento de planificación pre-SDD. Cada HU de este plan pasará por su propio ciclo SDD (proposal → spec → design → tasks → apply → verify).
> Leer y ajustar cada HU **antes** de lanzar su ciclo.
> Rama de trabajo base: `feature/perfil-pfae`.

---

## 1. Objetivo y alcance

Agregar el segundo tipo de perfil **PFAE** (Persona Física con Actividad
Empresarial / profesionista independiente) al sistema de análisis hipotecario.

Cuando la asesora crea un expediente y selecciona el perfil **PFAE**, el sistema
activa la lógica propia de este perfil: más documentos a procesar y reglas de
cálculo/extracción distintas a las de asalariado. El flujo general se mantiene
similar al de asalariado (mismo pipeline de análisis), cambiando los puntos que
varían por perfil.

**No se busca complejizar el sistema**: se reutiliza la arquitectura actual y se
extiende solo donde el perfil lo exige.

**Fuera de alcance (MVP)**: comprobante de domicilio como documento a procesar
(solo captura manual si acaso), cruce fiscal-financiero automático, y
coacreditado / sociedad conyugal.

---

## 2. Contexto del sistema actual

Monorepo: `apps/api` (NestJS + Prisma) y `apps/web` (Next.js App Router).

- **Perfil**: enum Prisma `PersonType` con un solo valor `SALARIED` (default
  `SALARIED`), validado en `CreateMortgageCaseDto` con `@IsIn(['SALARIED'])`.
  Campo `personType` en `MortgageCase`. → Habilitar PFAE = extender este enum +
  DTO + UI de creación.
- **Pipeline de análisis** (`CaseAnalysisService`):
  - Fase A: reglas de validación documental (identity-match,
    bankarization-validation).
  - Fase B: cálculo de ingresos + pasivos.
  - Fase C: viabilidad bancaria (`BankViabilityRule`).
- **Extracción por documento**: patrón estrategia (`isXxxDocument()`), Gemini +
  OCR: `official-id`, `payroll`, `bank-statement`, `credit-bureau`.
- **`IncomeCalculationService`**: hoy acoplado a `PAYROLL_RECEIPT` (promedia
  bruto/neto de nóminas).
- **Bancos**: `Bank` (`incomeCriterion` NET/GROSS, `debtCommitmentFactor` CE,
  `minimumBureauScore`) + `BankPolicy` por destino. La comparativa calcula
  `máximo = ingreso × CE` y `capacidad = máximo − deuda`.

**Hallazgo clave**: la clasificación NETO/BRUTO y los factores CE ya cargados en
el catálogo bancario coinciden 1:1 con la matriz PFAE (NETO: Banorte/HSBC/
Santander; BRUTO: Scotiabank/Banamex/BX+/Mifel/Banregio/Afirme; CE Banorte/
Afirme 0.60, Scotiabank 0.55, resto 0.50). → La sección de bancos **se
extiende**, no se recalibra.

---

## 3. Decisiones de negocio (manual + asesora + Excel)

### 3.1 Modo de comprobación de ingresos
- **La asesora elige** (no auto-selección). El sistema calcula **ambas bases**
  (estados de cuenta y declaración anual) para comparación; la asesora decide
  cuál se envía al banco. Solo se envía una al banco. 
- Viabilidad de la declaración depende de política por banco: **Santander**
  acepta, **Scotiabank** exige 100% estados de cuenta, **Banorte** la permite
  pero queda "no preferida".
- **Knockout por pérdida fiscal**: si la declaración registra pérdida fiscal, se
  inhabilita ese documento y se alerta "cambie a estados de cuenta".

### 3.2 Reglas de cálculo
- **Promedio suavizado**: SIEMPRE se quita el mes más alto y el más bajo.
  - 6 meses → se promedian los 4 restantes.
  - 12 meses → se promedian los 10 restantes.
- **12 vs 6 meses**: SOLO por giro (actividades primarias / restaurantero), no
  por banco.
- **Factor de castigo por giro**: aplica SOLO al camino de estados de cuenta
  (no al de declaración anual).
  - Estados de cuenta: `ingresoAdmisible = baseSuavizada × factorGiro(banco)`.
  - Declaración: `ingresoAdmisible = utilidadFiscal ÷ 12` (NETO) o
    `ingresosAcumulables ÷ 12` (BRUTO), sin factor.

### 3.3 Depuración de depósitos (peinado)
- **Depósitos válidos**: los que coinciden con el giro de la persona (clientes,
  SPEI, efectivo, etc.).
- **Descartar (basura)**: disposición de créditos; disposición de tarjeta de
  crédito (TDC/TC); transferencias entre cuentas propias; devoluciones (cheques
  sin fondos, compras, impuestos); depósitos entre familiares; depósitos por
  inversiones; préstamos recibidos; ahorro para enganche; venta de acciones;
  traspasos entre cuentas del cliente.
- **Modo (decidido)**: el sistema clasifica los depósitos de forma **100%
  automática** (sin paso obligatorio). La asesora tiene **revisión opcional no
  bloqueante** + override si ve algo raro, y el desglose queda **auditable** (qué
  se descartó y por qué — requisito para justificar el ingreso ante el banco).
  Requiere **detalle de movimientos** (transacción por transacción), no solo
  totales mensuales.

### 3.4 CSF (Constancia de Situación Fiscal)
- **Vigencia**: alerta si la fecha es mayor a 3 meses — solo advertencia, no
  descarta.
- **Antigüedad / arraigo**: mínimo **2 años** en la actividad (general);
  **Banorte 1 año** (12 meses, política dic-2025). Se computa desde el inicio de
  la actividad **actual**, no la fecha más antigua (ej. asalariado 2007 →
  consultor 2022 = desde 2022).
- **Régimen (gate)**: si la CSF solo trae **sueldos y salarios**, el camino PFAE
  queda **bloqueado** y obliga a comprobar como asalariado (nóminas).
- **Coherencia**: debe hacer match la actividad CSF con los depósitos (ej. rentas
  sin régimen de arrendamiento → se cuestiona).
- **Estatus fiscal (ACTIVO/NO ACTIVO)**: NO es el foco de bloqueo principal; lo
  que bloquea es régimen + actividad + antigüedad.

### 3.5 Giro / actividad
- La asesora clasifica **libre** (sin lista fija); el match banco→etiqueta lo
  hace manual por criterio.
- Se adopta **catálogo canónico + mapeo por banco** (decidido), considerando
  **granularidad heterogénea**: unos bancos con giros finos (Banamex 44), otros
  con categorías amplias que engloban varios giros (Banregio 4). → Ver ítem
  abierto §7.1.

### 3.6 Matriz de configuración (de `Config. por banco.xlsx`)
Guardada íntegra en Engram (ver §8). Resumen:

**CE por banco**: Banorte 0.6, HSBC 0.5, Santander 0.5, Scotiabank 0.55,
Citibanamex 0.5, BX+ 0.5, **Mifel 0.42**, Banregio 0.5, Afirme 0.6.

**Factor flat (aplica a todos los giros del banco)**:
- Banorte = 0.6 (único flat; no usa matriz por giro).
- HSBC = N/A (sin castigo → reconoce 100%).
- Resto (Santander, Scotiabank, Citibanamex, BX+, Mifel, Banregio, Afirme): usan
  matriz por giro.

**Fórmula pasivo revolvente**: `MAYOR(SaldoActual × 0.07, MontoAPagar)` (7%).

**Matriz giro→factor** (96 entradas, 7 bancos): Banamex 44, Scotiabank 19, BX+ 7,
Mifel 12, Banregio 4, Afirme 6, Santander 4. Banorte y HSBC NO están en la matriz.

---

## 4. Arquitectura de integración

**Principio rector: `personType` como discriminador único.** No duplicar
pipelines; solo ramificar los puntos de variación.

1. **Checklist documental por perfil**: mapa `personType → [DocumentType
   requeridos/opcionales]`. PFAE: INE/Pasaporte, CSF, Declaración Anual, Estados
   de Cuenta (6/12), Buró. Salariado: su checklist actual.
2. **Nuevos servicios de extracción** (mismo patrón `isXxxDocument()`):
   - `csf-extraction.service.ts`
   - `tax-return-extraction.service.ts` (Declaración Anual)
   - Extender `bank-statement-extraction.service.ts` a nivel transacción.
3. **Motor de ingresos como estrategia**: SALARIED (actual, intacto) y PFAE
   (nuevo). Persistir en el mismo modelo `IncomeCalculation` con discriminador
   `source` (`PAYROLL | BANK_STATEMENTS | TAX_RETURN`) para no duplicar
   snapshot/confirmación/UI.
4. **Nueva config**: catálogo `ActivityType` (giros) + `BankActivityFactor`
   (banco × giro → factor) + flag por banco `taxReturnPolicy`.
5. **Comparativa**: branch por `personType` en `BankViabilityRule` para el origen
   del ingreso; aplicar factor por giro (estados de cuenta) y las fórmulas CE
   existentes.
6. **Validaciones**: nuevas reglas en Fase A/C (régimen gate, arraigo, vigencia,
   coherencia, edad+plazo). BC score / claves de prevención ya existen.

---

## 5. Estrategia de ramas

- **Rama base**: `feature/perfil-pfae` (ya creada y publicada).
- **Cada HU** se desarrolla en una rama hija desde `feature/perfil-pfae`
  (`feature/hu-XX-...`), siguiendo `feature-branch-chain` (igual que
  `catalogo-bancario-cma`). Cada PR de HU apunta a la rama anterior / a la base.
- Solo `feature/perfil-pfae` se mergea a `main` al final (o por slices).

---

## 6. División en fases y HUs

> Ajustar el alcance de cada HU **antes** de lanzar su ciclo SDD. Los números
> continúan la numeración del repo (actual: HU-14).

### FASE A — Fundación

#### HU-15 — Habilitación del perfil PFAE + checklist documental
- **Objetivo**: que el sistema acepte y persista el perfil PFAE y muestre el
  checklist documental correcto según el perfil elegido.
- **Incluye**:
  - Migración Prisma: extender enum `PersonType` → `PFAE`.
  - `CreateMortgageCaseDto`: aceptar `PFAE`.
  - Seed nuevos `DocumentType`: `CSF`, `TAX_RETURN` (Declaración Anual).
  - Config de checklist documental por perfil (`personType → required docs`).
  - UI creación de expediente: selector de perfil + checklist PFAE.
- **No incluye**: extracción de los nuevos docs, motor de cálculo, giro.
- **Dependencias**: ninguna (punto de arranque).
- **Criterios de aceptación**: crear un expediente con perfil PFAE persiste
  `personType=PFAE` y la UI muestra los documentos requeridos de PFAE; el perfil
  asalariado sigue funcionando igual.

### FASE B — Extracción de documentos

#### HU-16 — Extracción CSF + Declaración Anual
- **Objetivo**: extraer los campos estructurados de la CSF y de la Declaración
  Anual.
- **Incluye**:
  - `csf-extraction.service.ts`: RFC/CURP/nombre, régimen fiscal, fecha de inicio
    de actividades, estatus, domicilio fiscal.
  - `tax-return-extraction.service.ts`: ejercicio fiscal, ingresos acumulables,
    utilidad/pérdida fiscal, acuse SAT.
  - Endpoints `extract-csf`, `extract-tax-return` (patrón existente).
  - Alertas: CSF vigencia >3 meses (warning); régimen sueldos-y-salarios (flag);
    pérdida fiscal (flag para knockout).
- **No incluye**: la lógica de validación/knockout (eso es HU-19), el cálculo de
  ingreso (HU-18).
- **Dependencias**: HU-15 (doc types).
- **Criterios de aceptación**: procesar una CSF y una Declaración reales produce
  `extractedData` con los campos listados y las alertas correspondientes.

#### HU-17 — Extracción de estados de cuenta (nivel transacción) + depuración determinística
- **Objetivo**: extraer el detalle de movimientos de los estados de cuenta y
  clasificar depósitos válidos vs basura financiera mediante un motor híbrido
  (extracción fiel vía Gemini + depuración y validación determinística en TypeScript).
- **Incluye**:
  - Extender `bank-statement-extraction.service.ts` para extraer todas las transacciones
    (fecha, concepto original, monto, tipo abono/cargo, emisor/ordenante, RFC emisor si disponible)
    además del resumen de carátula (`totalDepositsAmount`, `totalDepositsCount`, `averageBalance`, `endingBalance`).
  - Motor de depuración determinística (`bank-statement-cleaner.service.ts`):
    - **Conciliación matemática**: valida suma de transacciones extraídas vs total de abonos reportado por el banco (`MATCHED`, `MINOR_DIFFERENCE`, `CRITICAL_DISCREPANCY`).
    - **Enriquecimiento con contexto CSF previo**: obtiene RFC, nombre fiscal, régimen de Arrendamiento (606) y actividad económica / sector del solicitante si la CSF ya fue procesada en el expediente.
    - **Regla Cero (Traspasos propios)**: descarte automático de transferencias del mismo titular/RFC o entre cuentas propias del expediente.
    - **Lista Negra Determinística**: descarte de créditos/préstamos, devoluciones SAT, baja de inversiones, depósitos informales/familiares, ahorro para enganche.
    - **Lista Blanca Determinística**: liquidaciones TPV (Clip, MercadoPago, Stripe, terminales), cobros de facturas, honorarios y efectivo recurrente.
    - **Regla de Arrendamiento condicional**: valida conceptos de renta solo si la CSF cuenta con régimen de arrendamiento activo; de lo contrario se descartan o marcan para revisión.
    - **Diccionarios especializados por rubro/sector**: sector médico/salud (incluyendo aseguradoras GMM: GNP, AXA, MetLife, etc.), servicios profesionales, restaurantes/alimentos, etc.
    - **Detección de atípicos/outliers**: alerta de depósitos individuales no recurrentes que concentren ≥25% del ingreso mensual o montos desproporcionados sin emisor comercial.
    - **Resumen financiero depurado**: `totalGrossDeposits`, `totalTrashDeposits`, `totalValidIncome`, con desglose auditable por categoría de descarte y estado de integridad.
- **No incluye**: el promedio suavizado (HU-18), la UI de revisión (HU-21).
- **Dependencias**: HU-15, HU-16 (para enriquecimiento óptimo con CSF).
- **Criterios de aceptación**:
  1. Extraer transacciones completas y resumen de carátula de estados de cuenta reales.
  2. Depurar automáticamente y con precisión determinística los depósitos (válido/basura/revisión) con motivo y confianza.
  3. Aplicar validación condicional de arrendamiento y diccionarios de rubro si existe CSF.
  4. Realizar la conciliación matemática con alerta clara si hay discrepancias graves.
  5. Entregar resumen numérico (`totalGrossDeposits`, `totalTrashDeposits`, `totalValidIncome`) y pruebas unitarias exhaustivas.

### FASE C — Motor de cálculo

#### HU-18 — Motor de ingresos PFAE
- **Objetivo**: calcular la base de ingreso PFAE por ambos caminos para
  comparación.
- **Incluye**:
  - Promedio suavizado: 6 meses (quita mayor+menor, promedia 4) / 12 meses
    (quita mayor+menor, promedia 10) según giro primario/restaurantero.
  - Base estados de cuenta (tras depuración confirmada).
  - Base declaración anual: `utilidad ÷ 12` (NETO) / `acumulables ÷ 12` (BRUTO).
  - Knockout por pérdida fiscal (inhabilita declaración + alerta).
  - Computar AMBAS bases; marcar cuál se elige para enviar.
  - Persistir en `IncomeCalculation` con `source`.
- **No incluye**: aplicar factor de castigo por banco (HU-20), comparativa.
- **Dependencias**: HU-16 (declaración), HU-17 (depuración).
- **Criterios de aceptación**: con 6/12 estados depurados y/o declaración, el
  snapshot devuelve ambas bases calculadas y el flag de pérdida fiscal funciona.

### FASE D — Validaciones

#### HU-19 — Reglas de validación PFAE
- **Objetivo**: agregar las reglas de validación/knockout propias del perfil.
- **Incluye**:
  - Gate de régimen CSF (sueldos y salarios → PFAE bloqueado).
  - Arraigo: 2 años general, 1 año Banorte; desde inicio de actividad actual;
    campo/ajuste manual de la asesora si la CSF solo trae fecha global.
  - CSF vigencia >3 meses (warning).
  - Coherencia actividad CSF ↔ depósitos.
  - Edad + Plazo ≤ 80 años 6 meses (verificar si ya existe; si no, agregar).
  - Integración en `CaseAnalysisService` (Fase A/C) + alertas.
- **No incluye**: comparativa (HU-20).
- **Dependencias**: HU-16 (CSF), HU-18 (ingreso).
- **Criterios de aceptación**: cada regla produce la alerta/knockout esperado en
  el `AnalysisRun` para casos PFAE de prueba.

### FASE E — Comparativa

#### HU-20 — Comparativa bancaria PFAE (factor de castigo + branch)
- **Objetivo**: que la comparativa bancaria calcule el ingreso admisible por
  banco aplicando el factor de castigo por giro.
- **Incluye**:
  - Modelo + seed `ActivityType` (catálogo canónico) y `BankActivityFactor`
    (banco × giro → factor) desde el Excel.
  - Flag por banco `taxReturnPolicy` (Santander acepta, Scotiabank rechaza,
    Banorte no preferida, etc.).
  - Branch por `personType` en `BankViabilityRule` (origen del ingreso).
  - Aplicar factor por giro al camino de estados de cuenta; declaración sin
    factor (neto/bruto).
  - Actualizar CE: **Mifel 0.42** (verificar §7.2).
  - Cálculo por banco: `ingresoAdmisible`, `máximo = ×CE`, `capacidad = −deuda`.
- **No incluye**: UI (HU-21).
- **Dependencias**: HU-17, HU-18 + **catálogo canónico definido (§7.1)**.
- **Criterios de aceptación**: para un caso PFAE con giro dado, la comparativa
  muestra por banco el ingreso admisible y la capacidad de pago correctas.

### FASE F — UI

#### HU-21 — Expediente PFAE end-to-end
- **Objetivo**: exponer todo el flujo PFAE en la UI del expediente.
- **Incluye**:
  - Tabs/paneles de documentos PFAE (subida, estados).
  - UI de revisión opcional de depuración (desglose auditable + ajuste manual si
    se detecta algo raro; no bloquea el flujo).
  - Panel de ingresos PFAE (ambas bases, comparación, elegir cuál enviar).
  - Panel de validaciones y comparativa (ingreso admisible por banco).
  - Integración con el estado del expediente.
- **Dependencias**: HU-16 … HU-20.
- **Criterios de aceptación**: la asesora completa un expediente PFAE de punta a
  punta en la UI.

---

## 7. Ítems abiertos / pendientes (resolver antes o durante su HU)

### 7.1 Catálogo canónico de giros + mapeo por banco  ⚠ bloquea HU-20
- Definir con la asesora el catálogo canónico (unión normalizada de las
  etiquetas) y la tabla de mapeo `giro canónico → factor por banco`, considerando
  la granularidad heterogénea (giros finos vs categorías amplias que engloban).
- Es trabajo de datos/normalización; se hace con la asesora antes/durante HU-20.

### 7.2 Discrepancias de datos a confirmar
- **Mifel CE = 0.42** en el Excel vs **0.5** en el seed actual → confirmar cuál
  manda (asumo Excel).
- **Mifel "Establecimientos y PI de Salud → 1.5"** (factor >100%) → confirmar si
  es intencional o typo.
- **Banorte factor flat 0.6** y **HSBC sin factor** → tomados como válidos del
  Excel.

### 7.3 Condicionado vs Rechazado (Q10)
- El usuario entregará más tarde cómo se marca "condicionado" vs "rechazado" en
  la práctica. Mientras tanto se reutilizan los estados existentes
  (PASS/PARTIAL/FAIL del análisis). Ajustar en HU-19/HU-21.

### 7.4 Pérdida fiscal en declaración
- Knockout definido (§3.1). Confirmar en HU-18 si además del knockout debe
  bloquear todo el expediente o solo migrar el camino a estados de cuenta.

---

## 8. Referencias (Engram)

Datos y decisiones guardados para recuperación entre sesiones (proyecto
`analisis_hipotecario`):

- `architecture/pfae-profile` — plan de arquitectura e integración.
- `config/pfae-banco-ce` — CE por banco, factor flat, fórmula revolvente 7%,
  discrepancias.
- `config/pfae-banco-matriz-giros` — matriz completa giro→factor (96 entradas).
- `domain/pfae-reglas-operativas` — giro/cálculo/declaración (entrevista).
- `domain/pfae-depuracion-depositos` — reglas de peinado + auto/manual.
- `domain/pfae-csf-reglas` — validaciones CSF (vigencia, arraigo, régimen).

Fuente de datos: `Config. por banco.xlsx` (raíz del repo).
