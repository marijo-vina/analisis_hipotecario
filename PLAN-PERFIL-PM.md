# Plan de desarrollo — Perfil Persona Moral (socio accionista)

Documento de producto. Cada HU se implementa con **ODD** (Organic Driven
Development): trabajo directo o delegado con evidencia acotada, commits por
unidad de trabajo, y review RDD antes de cada commit. No hay ciclo SDD ni
change OpenSpec nuevo por HU. Ajustar el alcance **antes** de implementarla.

HU-22 ya está en `feature/perfil-pm` (misma punta que
`feature/hu-22-perfil-pm-foundation`). HU-23 a HU-30 siguen este plan con ODD.

**Entrega usable:** 28 de noviembre de 2026 (buffer 5 de diciembre).
**Rama de integración:** `feature/perfil-pm`. Cada HU se desarrolla en su rama
y, al cerrarla, se mergea ahí. No se mergea a `main` hasta que el perfil
persona moral esté completo y el usuario lo pida.
**Fixture de aceptación:** caso real del Excel `PM-ejemplo` (números abajo; sin PII).

**Control (GitHub):**
- Tablero: [#20 Perfil PM — HU-22 a HU-30](https://github.com/marijo-vina/analisis_hipotecario/issues/20)
- Milestone: [Perfil PM](https://github.com/marijo-vina/analisis_hipotecario/milestone/1) (vence 28 nov)
- Al mergear: el PR lleva `Closes #<n>` y la casilla del #20 se tacha sola.

---

## Quick path

1. Crear expediente con perfil PM y checklist dual (socio / empresa).
2. Extraer documentos (reusar PFAE + acta + buró empresa).
3. Calcular ingreso de las **cuentas de la empresa** × factor × % acciones.
4. Restar deuda PM (prorrateada) y deuda PF según el banco.
5. Comparativa y UI en las pestañas actuales.

**Acreditado:** persona física socio. **Ingreso:** depósitos de la empresa, no de sus cuentas personales.

Se entra por persona moral cuando el cliente no puede comprobar ingresos a su nombre (nómina o depósitos personales). La CSF personal tiene que traer régimen de socio o accionista activo.

Fuera de este MVP: dividendos (depósitos en cuentas del socio con régimen de dividendos; ese caso se queda en persona física), empresa como acreditada, SC como camino aparte, coacreditado.

---

## Decisiones cerradas (caso lleno + PDFs)

El Word de proceso documenta a la asesora. Si choca con un PDF de banco, manda el PDF. Si choca con el Excel **lleno**, manda el Excel lleno. La plantilla vacía del libro grande tiene vínculos rotos: no usarla como fuente de fórmulas.

| Tema | Decisión |
|------|----------|
| Promedio Santander / camino estados | 6 meses de depósitos válidos; quitar mayor y menor; promedio de 4. Varias cuentas se suman al mismo mes. |
| 12 meses | Primario / restaurante / alta estacionalidad (igual que PFAE). |
| Factor Santander | El caso de ejemplo usó servicios 0.50. El 22 oct 2026 llegó la lámina nueva de no asalariados: socios accionistas 90%, servicios y comercio 50%, profesionistas 90%, resto de sectores 30%, gasolineros 10%. No está aplicada: el 90% de socio cambiaría la capacidad de ejemplo 1,231,490.59. |
| Declaración Santander | `(ingresos acumulables / 12) × factor × % PA`. Ventas es columna auxiliar. Pérdida fiscal tumba **solo** este camino. |
| Orden Santander / mayoría | `Ingreso = promedio × factor × %PA` → `A considerar = Ingreso − DeudaPM` → `Máx = A considerar × CE` → `Capacidad = Máx − DeudaPF`. |
| CE Santander | 0.50 |
| Scotiabank ingreso | `promedio depósitos × %PA × 0.40`. **No** aplica factor de giro 50% ni CE 0.55 encima. El 40% vive en la celda CE del Excel. |
| Scotiabank deuda | **No** resta pasivos de la empresa. Solo deuda PF. |
| Scotiabank candado | `< 51%` → no viable. El caso 50% queda bloqueado. |
| HSBC candado | `< 25%` o `< 2 años` con esas acciones → no viable. |
| Pasivos PM simple | `(monto original / (plazo días / 30)) × %PA` |
| Pasivos PM revolvente | `MAX(monto original, monto vigente) × 10% × %PA` |
| Pasivos PF (socio) | Revolvente: `MAX(saldo × 6%, pago mínimo)`. Fijo: pago reportado. **6%, no el 7% de PFAE.** |
| Acta / % | Capital fijo + variable de los socios. El caso es 50 / 50. |
| CSF socio | Debe incluir régimen socio / accionista activo. Sin ese régimen el expediente no entra por persona moral. En el caso venía mezclado con asalariado y **sí** se perfiló PM. Bloquear solo si es **únicamente** sueldos y salarios. |
| Paquete del socio | INE, CSF personal y buró personal. Estados de cuenta y declaración del socio no son obligatorios. |
| Paquete de la empresa | CSF, estados 6/12, declaración anual con acuse, buró y acta (más asambleas si hay). Banorte exige el buró de la empresa; el checklist ya lo pide a todos. |
| Antigüedad de la empresa | De 2 a 4 años según el banco. Banorte: mínimo 2. Scotiabank: 4. Banamex: 4 (PDF de taller). |
| Antigüedad del socio | Distinta de la de la empresa. Santander: más de 2 años como accionista. Empresa de 20 años con socio de menos de 1 año: no viable. La fecha de ingreso sale del acta: constitución si ya era socio, asamblea de admisión si el cuadro constitutivo no lo trae, o la fecha explícita de cesión. Los meses se calculan de esa fecha al día de la consulta y no se capturan. Si solo hay una modificación, la fecha queda vacía y no hay antigüedad. |
| % Santander | No pide mínimo de acciones. Viable con más de 1%. El candado es la antigüedad como accionista. |
| % Banorte | Mínimo 10%. |
| Pasivos HSBC | No resta pasivos de la empresa. Solo deuda de la persona física, igual que Scotiabank. |
| Banorte ingreso | Promedio simple de 6 meses × 50% (ya es cliente) o 40% (no cliente). Se restan pasivos PM y después se multiplica por % PA. CE 0.60. Al final se resta la deuda del socio. Declaración: utilidad neta × 85% × % PA. |
| HSBC ingreso | `(ventas o flujos × factor de giro) × % PA`, luego × CE 0.50. Solo se resta la deuda del socio. |
| Identidad empresa | Razón social + RFC iguales en acta, CSF, estados y declaración. Socio: INE, buró, acta. |
| Banamex (PDF taller) | 4 años de operación; acta `> 50%` del solicitante **o familia directa**; estados financieros SAT sin pérdidas ni capital negativo; factor PDF 15% compañía / 50% profesionistas asociados. |

### Fixture numérico (Santander, caso lleno)

Depósitos mensuales empresa (ya peinados): 11.94M, 12.71M, **7.80M (min)**, 9.48M, **14.78M (max)**, 10.61M.

| Paso | Valor |
|------|--------|
| Promedio 4 meses | 11,183,203.42 |
| Factor servicios × 50% acciones | 2,795,800.85 |
| Deuda PM mensual (ya × 50%) | 17,971.92 |
| Ingreso a considerar | 2,777,828.94 |
| Máx × CE 0.50 | 1,388,914.47 |
| Deuda PF | 157,423.88 |
| **Capacidad estados** | **1,231,490.59** |
| Declaración (acumulables/12 × 0.50 × 0.50) | 2,078,986.42 |
| **Capacidad declaración** | **873,083.37** |

Pasivos PM del fixture: simple 445,000 / 1,460 días × 50% = 4,571.92; otro simple 24,000 / 30 × 50% = 12,000; revolvente MAX(28k, 28k) × 10% × 50% = 1,400. Total 17,971.92.

---

## Aún abierto (no bloquea HU-22…26)

| Tema | Qué hacer |
|------|-----------|
| Banorte PM ingreso | Cerrado el 22 oct 2026. Estados: promedio simple de 6 meses × 50% si la empresa ya es cliente Banorte, o 40% si no lo es. A eso se le restan los pasivos PM y el remanente se multiplica por % PA. CE 0.60. La capacidad final resta solo la deuda del socio. Declaración: utilidad neta × 85% × % PA. Falta capturar si la empresa ya es cliente Banorte, y la utilidad neta en la declaración. |
| Scotiabank 50% vs 51% | Cerrado el 22 oct 2026: `< 51%` no es viable. 50.00% queda fuera. |
| HSBC y 2 años de acciones | Cerrado el 22 oct 2026: `< 25%` o `< 2 años` con esas acciones no es viable. |
| HSBC ingreso | Cerrado el 22 oct 2026. No hay tabla pública. Con Visor Financiero el factor es 30% sobre flujos o ventas. Sin Visor, manual: servicios 20% de depósitos válidos, comercio 15%. Luego × % PA y × CE 0.50. Solo se resta la deuda del socio. La proyección por defecto usa el Visor al 30%. Liquidez de HSBC no está disponible para PFAE ni para PM. |
| Scotiabank 6 vs 4 meses | PDF: promedio 6 meses. Santander en el mismo archivo suaviza 4. Default de producto: **suavizado 4** salvo que la asesora pida 6 para Scotia. |
| Factor Banamex 15% vs 30% | PDF taller = 15% compañía. La matriz interna decía 30%. **Manda el PDF** hasta nueva captura. |
| Estados financieros SAT | Extra Banamex; no está en el checklist GF. HU-23 puede dejarlo opcional / warning, no bloquea el MVP. |
| Santander ≥ 5 depósitos/mes | En el Word; el Excel no lo valida. Incluir en HU-25 como gate. |

---

## Correcciones de la prueba Alimentos Rápidos (23 oct 2026)

Caso real, solo documentos de la empresa: CSF, buró PM y seis estados BBVA (abril–septiembre 2026). La carátula, la CSF, el peinado de abonos y la lista de créditos ya cuadran. El motor se detuvo por restaurante con 6 meses y por falta de % de acciones; esos dos frenos están bien y no se tocan.

Orden acordado: corregir el peinado BBVA y el buró de la empresa antes de HU-29. La comparativa y la UI leen esas cifras. Lo demás no frena la siguiente historia.

| # | Corrección | Por qué | Cuándo |
|---|------------|---------|--------|
| 1 | Peinado BBVA. El servicio de Python lee la columna ABONOS del PDF. Los seis estados de Alimentos Rápidos cuadran con la carátula al centavo. Si esa suma no cuadra, el mes no entra al promedio. | HU-25 / HU-27. Base del ingreso. | Hecho. Commits `c89a94a` y `33f7eae`. Reproceso 6/6 en MATCHED |
| 2 | Buró PM: una fila por crédito, con cuenta, otorgado, saldo, vencido y plazo. El contrato con letras (`MPM00080`) ya cuenta como cuenta. Si Gemini ya trae el crédito, no se agrega otra fila. El vencido que cayó en el pago se regresa a vencido. | HU-26 | Hecho. Commit `29e9034`. Reproceso: 10 créditos, los del PDF |
| 3 | Un crédito comercial (Soriana) no deja incompleto el pasivo de los créditos financieros. Se informa aparte y suma cero en la fórmula. | HU-26 | Hecho. Commit `29e9034`. Soriana y Telcel en cero |
| 4 | Fecha de consulta del buró PM. En este reporte la fecha está antes de la etiqueta y el lector la busca después. Consultas de 12 meses: 18 en el PDF, 17 guardadas. | Extracción de buró | Después de 1–3. No frena HU-29 |
| 5 | Guardar el cuadro de accionistas que trae el buró de la empresa. El % oficial sigue saliendo del acta. En la prueba era el único cuadro (51% / 49%) y no se guardó. | HU-26, sin cambiar la fuente del % | Después. No frena HU-29 |
| 6 | Unir denominación y régimen de capital de la CSF (S.A. de C.V.) antes de comparar la razón social con buró y estados. | HU-23 / HU-28 | Después. No frenó esta prueba |
| 7 | `emptyGates` no existía y la API no arrancaba. La función ya está definida y los expedientes que no son persona moral siguen en PASS. | HU-28 | Incluido en el commit previo al peinado |

---

## Arquitectura

Mismo principio que PFAE: `personType` como discriminador. No hay segundo pipeline.

1. Extender `PersonType` → `PM`.
2. Documento con **dueño** `SHAREHOLDER | COMPANY` (mismo `DocumentType`: CSF, TAX_RETURN, BANK_STATEMENT, CREDIT_BUREAU_REPORT). Nuevo tipo: `ARTICLES_OF_INCORPORATION`.
3. Campos de caso: `% PA`, fecha de constitución, antigüedad de las acciones, razón social, RFC empresa.
4. Motor de ingreso: tercera estrategia junto a SALARIED y PFAE. Reusa peinado de estados.
5. Pasivos: dos bolsas (PF 6% y PM 10% × %PA). Scotiabank ignora la bolsa PM en capacidad.
6. Comparativa: rama PM en `BankViabilityRule` (candados % / antigüedad de acciones, CE, factor).

---

## Historias

Numeración sigue a PFAE (HU-21). Una HU a la vez, rama hija de `feature/perfil-pm`.
Este archivo es el documento de feature ODD; cada HU cierra con commits de unidad
de trabajo en su rama, no con `sdd-*` ni `openspec/changes/`.

### Fase A — Fundación

#### HU-22 — Perfil PM + checklist dual + datos corporativos

- Persistir `personType=PM`.
- Checklist: socio (INE, buró, CSF) y empresa (buró, CSF, estados 6/12, declaración, acta). Estados y declaración del socio no son obligatorios.
- Captura: % acciones, fecha de constitución, antigüedad de las acciones, razón social, RFC.
- Asalariado y PFAE no cambian.

**Hecho cuando:** se crea un expediente PM y se ve el checklist partido. Sin extracción.

### Fase B — Extracción

#### HU-23 — CSF y declaración por entidad

Reusar extractores PFAE con dueño socio/empresa. Gate: CSF socio sin régimen socio/accionista → no es camino PM. Pérdida fiscal empresa → knockout solo de declaración.

#### HU-24 — Acta constitutiva y modificaciones

Acta constitutiva (`ARTICLES_OF_INCORPORATION`, obligatoria) y acta de modificación de poderes o asamblea (`CORPORATE_AMENDMENT`, solo si se sube). Campos: razón social, RFC si viene (si no, vacío con aviso), fecha de constitución, escritura, cuadro accionario con series como vengan rotuladas, % del solicitante, órgano de administración, apoderados y facultades, inscripción RPP. El % vigente es el de la última acta inscrita que traiga cuadro. La fecha de ingreso del solicitante se resuelve aparte de ese cuadro. Familia directa solo como dato. Asociación sin fines de lucro: aviso rojo de descarte, sin bloquear la extracción. Candados de banco en HU-28/29.

#### HU-25 — Estados de la empresa + peinado

Mismo cleaner PFAE sobre cuentas de la empresa. 6 o 12 meses. Varias cuentas. Gate Santander: &lt; 5 depósitos válidos en un mes → ese camino no viable.

#### HU-26 — Buró empresa + pasivos PM

Extraer créditos de la empresa. Aplicar fórmulas simple / revolvente × %PA. Buró del socio sigue como hoy con factor 6%. Santander resta la bolsa PM. Scotiabank y HSBC no la restan: solo deuda de la persona física. Banorte queda abierto hasta la junta de ingreso.

### Fase C — Motor

#### HU-27 — Ingreso y capacidad PM

Implementar el fixture Santander (estados y declaración) al peso. Scotiabank: × % × 0.40, sin deuda PM. El corte de 50% o 51% queda en HU-28, hasta confirmarlo. Banorte e HSBC: según lo que cierre la asesora esa HU; si no cierra, `REQUIRES_REVIEW` con motivo explícito. HSBC no resta deuda de la empresa.

**Hecho cuando:** el fixture reproduce 1,231,490.59 (estados) y 873,083.37 (declaración) en Santander.

### Fase D — Validaciones

#### HU-28 — Gates PM

Identidad dual. Antigüedad de la empresa por banco (Banorte 2, Scotiabank 4, Banamex 4). Antigüedad del socio (Santander más de 2 años, calculada desde la fecha de ingreso del acta; si la fecha queda vacía, no hay antigüedad). Edad + plazo ≤ 80a6m. CSF socio con régimen socio/accionista. Candados % (Scotiabank menor de 51%, HSBC menor de 25% o menos de 2 años con esas acciones, Banorte menor de 10%, Santander solo más de 1%). Liquidez de HSBC no se ofrece. Giros prohibidos (casino, joyería) se leen de la CSF de la empresa. Pérdida fiscal solo tumba declaración. Si falta el buró de la empresa, Banorte no es viable.

### Fase E — Comparativa

#### HU-29 — Políticas bancarias PM

Factores y CE por banco. Banamex 15%/50% del PDF. Locks de % y antigüedad en la comparativa. Reusar CMA; columna/umbral de arraigo empresa donde el PDF lo pida.

### Fase F — UI

#### HU-30 — Expediente PM

Las 3 pestañas de hoy. Checklist dual, acta, bases de ingreso, pasivos PM vs PF, comparativa. Sin wizard nuevo.

---

## Calendario (1 HU / tramo, lun–vie)

| Semana | Fechas | HU | Issue |
|--------|--------|----|-------|
| 1 | 13–17 oct | 22 Fundación | [#11](https://github.com/marijo-vina/analisis_hipotecario/issues/11) |
| 2 | 20–24 oct | 23 CSF / declaración | [#12](https://github.com/marijo-vina/analisis_hipotecario/issues/12) |
| 3 | 27–31 oct | 24 Acta | [#13](https://github.com/marijo-vina/analisis_hipotecario/issues/13) |
| 4 | 3–7 nov | 25 Estados empresa | [#14](https://github.com/marijo-vina/analisis_hipotecario/issues/14) |
| 5 | 10–14 nov | 26 Buró / pasivos PM | [#15](https://github.com/marijo-vina/analisis_hipotecario/issues/15) |
| 6 | 17–21 nov | 27 Motor (fixture) | [#16](https://github.com/marijo-vina/analisis_hipotecario/issues/16) |
| 7 | 24–28 nov | 28 Validaciones + 29 Comparativa | [#17](https://github.com/marijo-vina/analisis_hipotecario/issues/17) · [#18](https://github.com/marijo-vina/analisis_hipotecario/issues/18) |
| Buffer | 1–5 dic | 30 UI + holgura Banorte/HSBC | [#19](https://github.com/marijo-vina/analisis_hipotecario/issues/19) |

**Fecha que puedes comunicar:** 28 de noviembre de 2026, expediente PM analizable de punta a punta. UI pulida si hace falta en la semana del 1 de diciembre.

---

## Dependencias

```
22 → 23 → 25 → 27 → 29 → 30
22 → 24 ─────────────↗
22 → 26 → 27 → 28 → 30
```

HU-27 es la que fija la fecha. Banorte/HSBC no deben retrasar el fixture Santander.
