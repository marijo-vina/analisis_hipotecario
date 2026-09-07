# Matriz de políticas bancarias (ingesta)

Inventario de trabajo para el módulo Bancos. No es seed todavía: hay que
confirmar desfaces antes de migrar.

Capas: (1) tarjeta banco, (2) CMA por destino, (3) factores por giro.
No se duplica la grilla por perfil.

Fuentes de esta entrega:

- Mifel: 2 capturas (perfil del cliente + ingresos no asalariados).
- Citibanamex: `TALLER_INDEPENDIENTES_CITIBANAMEX_-_WEBINAR_MAYO2024_1.pdf`
  (interno, no versionar el PDF) + captura de factores Factor/Nuevo (es Banamex,
  no Mifel).
- Santander: capturas de cálculo no asalariado + chuleta Riesgos marzo 2026
  (`Hipotecario_Chuleta_PoliticasRiesgos_MAR2026.pdf`). El taller 2024 casi no
  extrae texto; no versionar PDFs.
- Afirme: 5 capturas (política, economías, cálculo asalariado, cálculo
  independiente, castigos por actividad).
- Banregio: 2 capturas (políticas generales + comprobación de ingresos por giro).
  Arraigo PFAE = 24 meses (asumido; editable en módulo Bancos).
- BX+: 4 capturas (políticas generales PF, extranjeros, persona moral, factores
  por actividad con % distinto declaración vs estados).
- Scotiabank: 4 capturas (estados PF, ingresos por actividad, estados PM,
  requisitos web) + `Comprobacion_de_ingresos_PM.pdf` (referencia persona moral;
  no versionar).
- Banorte: `Calculo_de_ingresos_broker_2024_2_1.pdf`,
  `ANTIGUEDAD_LABORAL_BROKER_BANORTE.pdf` (vigencia dic-2025),
  `ANAQUEL_BROKER_ENERO_2026-_BANORTE.pdf` (solo CMA; sin tasas/productos).
- HSBC: `Perfilamiento_y_Requisitos_Minimos__MAYO26 HSBC (1).pdf`
  (mayo 2026; interno, no versionar el PDF).

Ingesta de fuentes: **completa** (9 bancos).

---

## Mifel

### Capa 1 — Banco

| Campo | Hoy en seed | De la captura | Acción |
|-------|-------------|---------------|--------|
| CE | 0.50 | no aparece | Excel decía 0.42; **asesora confirma 0.50** — seed OK |
| Ingreso | GROSS | no aparece | sin cambio |
| Score mín. | null | no aparece | sin cambio |
| Edad mín. | 21 años (252 m) | 21 años (FPT 25) | seed OK; FPT fuera de alcance |
| Edad máx. | 80 años al término (960 m) | edad + plazo ≤ 80 | seed OK |

### Capa 2 — CMA por destino

Seed hoy: Adquisición / Liquidez / Sustitución activos; Terreno / Construcción /
Remodelación inactivos. Captura no lista destinos → no se toca.

| Destino | Activo | Ingreso mín. | Inmueble mín. | Meses asalariado | Meses PFAE |
|---------|--------|--------------|---------------|------------------|------------|
| Adquisición | sí | (vacío) | (vacío) | 12 * | **24** |
| Liquidez | sí | (vacío) | (vacío) | 12 * | **24** |
| Sustitución | sí | (vacío) | (vacío) | 12 * | **24** |
| Terreno / Construcción / Remodelación | no | — | — | — | — |

\* Asalariado en la captura **no es un solo número**: riesgo 1–3 = 12 meses;
riesgo 4–5 = 24 meses; además ≥ 3 meses en el empleo actual y laguna ≤ 90 días.
El seed guarda 12. Sin motor de nivel de riesgo no modelamos 4–5 ni la laguna.
PFAE es limpio: **24 meses en la misma actividad**.

### Capa 3 — Factores (captura “Ingresos no asalariados”)

El 150% de salud **es intencional** (la otra captura lo dice: “hasta un 150%
para personal médico”).

| Actividad (etiqueta Mifel) | Ejemplos | Factor | vs Excel previo |
|----------------------------|----------|--------|-----------------|
| Establecimientos y PI de salud | hospitales, consultorios, médicos, dentistas, terapeutas, enfermeros, psicólogos, nutriólogos, veterinarios | **1.50** | igual (1.5) |
| PI otras — grupo A | abogados, contadores, consultores | **0.80** | Excel tenía un solo “PI otras” a 0.75 |
| PI otras — grupo B | agentes de seguros, arquitectos, ingenieros, valuadores, brókers, computación, biólogos, químicos | **0.75** | ver arriba |
| Esparcimiento cultural/deportivo | actores, maestros, músicos, diseñadores, comunicadores, fotógrafos, deportistas | **0.75** | igual |
| Servicios financieros y de seguros | utilidades, inversiones, intereses | **0.50** | igual |
| Agropecuarias, pesca, forestales | agronegocios, ganadería, pesca | **0.10** | igual |
| Construcción y mantenimiento | construcción, agua, gas, electricidad, minería | **0.35** | igual |
| Comercio, alojamiento, alimentos y bebidas | comercio, hoteles, bares, restaurantes | **0.35** | Excel tenía **0.20** — manda la captura |
| Gasolina y diésel | gasolinero | **0.10** | igual |
| Arrendadoras / arrendadores | arrendadores | **0.50** | igual |
| Industria manufacturera | muebles, calzado, papel, aluminio, cómputo | **0.25** | igual |
| Servicios en general | transporte, educación, limpieza, mensajería | **0.35** | igual |
| Otras actividades | otros | **0.35** | igual |

---

## Citibanamex

### Capa 1 — Banco

| Campo | Hoy en seed (asalariado) | Independientes (PDF mayo 2024) |
|-------|--------------------------|--------------------------------|
| CE | 0.50 | no aparece en el taller |
| Ingreso | GROSS | no aparece |
| Edad mín. | 23 años (276 m) | **28 años** (30 si vivienda > $10M; 28 con aprobación especial) |
| Edad + plazo máx. pagos fijos | 74 años 11 meses (899 m) en seed | Adquisición: 74a11m; Cambia tu hipoteca: 84a11m |
| Edad + plazo máx. pagos crecientes | — | 59a11m / 79a11m según producto |

Hallazgo: **la edad mínima sí cambia por perfil** en Banamex (23 asalariado vs
28 independiente). Eso rompe “CMA idéntico salvo arraigo” para este banco.
No duplicamos la grilla: o una columna extra de edad PFAE, o se documenta
como excepción Banamex. Decidir cuando haya más bancos.

No se aceptan ingresos en USD para independientes.

### Capa 2 — CMA por destino

| Destino | Activo | Ingreso mín. (PDF) | Inmueble | Meses asalariado (seed) | Meses PFAE (PDF) |
|---------|--------|--------------------|----------|-------------------------|------------------|
| Adquisición | sí | $15,000 (1 part.) / $20,000 (2 part.) | aforos, no CMA de valor mín. en esta fuente | 12 | **24** (actividad, régimen o CSF anterior) |
| Sustitución (Cambia tu hipoteca) | sí | $15,000 | — | 12 | **24** |
| Liquidez / Mejora+Liquidez | sí | **$35,000** | solo vivienda principal | 12 | **24** |
| Terreno / Construcción / Remodelación | no (seed) | — | — | — | — |
| Persona moral (no es destino) | — | — | — | — | **48** meses de operación de la empresa |

Arraigo PFAE: se valida **inicio de actividad económica e inicio de régimen**
en la CSF. Si no alcanza 2 años, CSF anterior o facturas.

Comprobación: CSF + 6 estados (o último edo. si la cuenta es Banamex).
Inversiones y persona moral tienen expediente distinto — fuera de MVP PFAE
persona física.

### Capa 3 — Factores (usar columna **Nuevo**, mayo 2024)

El Excel `Config. por banco.xlsx` tiene los factores **viejos**. El taller
subió profesionales a 100% y comercio/servicios/manufactura a 50%.

| Grupo | Etiquetas Banamex | Factor viejo (Excel) | **Nuevo (usar)** |
|-------|-------------------|----------------------|------------------|
| Médico, dentista | Médico, Dentista | 1.00 | **1.00** |
| Resto servicios profesionales | abogado, administrador, agente de seguros, comunicador, contador, enfermera, informático, maestro, periodista, psicólogo, terapeuta, arquitecto, consultor, diseñador gráfico, ingeniero, piloto, ingeniero civil, otros | 0.80 | **1.00** |
| Comercio / servicios / manufactura | comercio, alimentos/bebidas, restaurantero, servicios, representante de ventas, diseño gráfico, agencias de viajes, turísticos, manufactura, manufactura-construcción | 0.30 | **0.50** |
| Comercio-comisionista | *nota: se trata como servicio profesional | 0.30 | **1.00** |
| Actividades primarias | pecuarios, pesqueros, cultivos | 0.15 | **0.15** |
| Gasolinero | comercio-gasolinero | 0.06 | **0.06** |
| Inversiones | banca patrimonial/privada, otros bancos | 0.06 | **0.06** |
| Dividendos | dividendo | 0.50 | **0.50** |
| Arrendamiento | arrendamiento | 0.80 | **0.80** |
| Persona moral — compañía | compañía | 0.15 | **0.30** |
| Persona moral — profesionistas asociados (SC) | sociedad civil | 0.50 | **0.50** |

Promedio en el ejemplo del taller: **6 meses, sin quitar max/min**. Nuestro
motor PFAE suaviza (quita alto y bajo). Es una diferencia de producto: no
cambiar el suavizado global por Banamex; se puede anotar como observación
en comparativa.

---

## Santander

Fuentes previas: chuleta Riesgos **marzo 2026** + capturas cálculo no
asalariado. **Nueva entrega (sep-2026):** 6 capturas CMA general + score/
reglas limitativas + mixto/PM + cálculo asalariado + factor de afectación +
cálculo no asalariado. No se versionan los PDFs/capturas.

### Comparación rápida (nueva entrega vs matriz previa)

| Tema | Antes | Nueva captura | Acción |
|------|-------|---------------|--------|
| Edad mín. | 21 | ≥ 21 | OK |
| Edad + plazo | 80 (960 m) / taller 80a6m | **&lt; 80 años 6 meses** | **subir máx. a 966 m** |
| Score | seed 541; matriz pedía 542 | **542** (corte) | **seed → 542** |
| Ingreso asalariado / PFAE | $7.5k / $15k; construcción $20k / $67k | igual | OK |
| Inmueble / terreno / obra | $250k; terreno máx $20M; obra $700k | igual (+ terreno ≥25% del proyecto en construcción) | anotar 25% |
| Endeudamiento entrada | ≤ 50% | ≤ 50% | OK |
| Arraigo PFAE | 24 m | 2 años actividad actual | OK |
| Arraigo asalariado | 6 m (con matices) | &lt;6 m empleo actual → declina; &lt;12 m total con laguna &gt;2 m → declina | OK / refinar nota |
| Knockouts giro | construcción + compraventa | igual | OK |
| Factores (manda) | castigos PI 90 / serv-com 50 | **factor de afectación** PI 80%, médico 100%, PFAE serv/com **60%**, arrend 80%, inv 90% | **usar afectación** (asesora) |
| Mixto / persona moral | fuera MVP | reglas nuevas | Engram futuro |
| Códigos bloqueo TDC, monto mín., cashout, Frontera USA | parcial / no | detalle nuevo | notas; fuera de CMA grid |

### Capa 1 — Banco

| Campo | Hoy en seed | De las capturas | Acción |
|-------|-------------|-----------------|--------|
| CE | 0.50 | DTI no asalariado 30–60% por nivel de riesgo (R1–R5) | seed 0.50; cubo DTI/LTV = producto |
| Ingreso | NET | ingreso neto | OK |
| Score mín. | **542** | **542** (si &lt; 542 → declina) | OK |
| Edad mín. | 21 (252 m) | ≥ 21 | OK |
| Edad + plazo máx. | **966 m** (80a6m) | **&lt; 80a6m** | OK |

Rangos de score (informativos; no son umbral único): R1 400–550, R2 551–578,
R3 579–601, R4 602–623, R5 624–700. El corte duro es **542**.

Knockouts / reglas limitativas (comparativa, no grilla CMA):

- Impago Santander (TDC/auto/hipotecario/efectivo/nómina) **&gt; 500 UDIS**.
- Códigos de bloqueo TDC Santander: **10, 11, 13, 32, 57**.
- Buró: ≥2 PV actual &gt; 500 UDIS, o ≥3 PV cualquier monto.
- Castigo interno neto fallido &gt; 500 UDIS **o** antigüedad del castigo &lt; 6 meses; reestructura local → rechazo.
- Actividad **compraventa de inmuebles** (cualquier destino).
- Actividad **construcción de vivienda** si el destino es Construcción, Remodelación o Adq. Terreno.
- Sustitución / mejora: ≥ **6 meses** de antigüedad + impecabilidad de pago **12 meses**.
- Monto mínimo aprobado: **$100,000** (construcción **$700,000**) — producto.
- Dinero adicional / cashout y Frontera (buró USA score &lt; 700, atraso &gt; 0): fuera de MVP perfilamiento.

### Capa 2 — CMA por destino

Ingreso mínimo **sí cambia por perfil**. Columna `ingresoMinPfae` cuando se siembre.

| Destino | Activo | Ingreso mín. asalariado | Ingreso mín. PFAE | Inmueble mín. | Meses asalariado | Meses PFAE |
|---------|--------|-------------------------|-------------------|---------------|------------------|------------|
| Adquisición | sí | $7,500 | **$15,000** | $250,000 | 6 * | **24** |
| Sustitución | sí | $7,500 | **$15,000** | (vacío en seed) | 6 * | **24** |
| Liquidez | sí | $7,500 | **$15,000** | — | 6 * | **24** |
| Terreno | sí | $7,500 | **$15,000** | terreno $250k (máx. $20M) | 6 * | **24** |
| Construcción | sí | **$20,000** | **$67,000** | terreno $250k + obra $700k; terreno ≥ **25%** del proyecto | 6 * | **24** |
| Remodelación | sí | $7,500 | **$15,000** | — | 6 * | **24** |

FRONTERA (no es destino nuestro): asalariado $35,000 / no asalariado $67,000.
Hipoteca Integral: $6,500 ambos — fuera de alcance.

\* Asalariado: empleo actual ≥ 6 meses; si no, total actual+anterior ≥ 12 meses
con laguna ≤ 2 meses (captura dice &gt; 2 meses → declina). Seed con 6 = piso
del empleo actual. PFAE: **2 años en la actividad actual**.

Endeudamiento de entrada ≤ 50% (titular + cotitulares que comprueban).

### Capa 3 — Factores y cómo se calcula el ingreso (no asalariado)

Santander aplica factor de giro a estados **y** a declaración. Eso ya no es
excepción: la regla de producto (HU-20, 2026-09-04) es
`ingresoAdmisible = baseElegida × factor` para todos los bancos.
`ingresoAdmisible = (base/12 o suavizado) × factor`.

**Estados de cuenta** (slide “Cálculo de Ingresos — No Asalariados”):

| Perfil | Meses | ¿Quita max/min? | Extra |
|--------|-------|-----------------|-------|
| Profesionista y actividad empresarial | 6 | sí (promedio de 4) | × factor |
| Actividades primarias | 12 | **no** (promedio simple) | × factor |
| Socio / dueño de empresa | 6 | sí | × factor × % acciones; mín. 5 depósitos al mes |

Hasta **6 cuentas** distintas; excluir traspasos entre las cuentas presentadas.

**Declaración:** `(ingreso anual / 12) × factor`. Dueño: × % acciones.

**Factor de afectación (manda — confirmado asesora sep-2026):**

Aplica a flujos de estados / base no asalariada (y a declaración en
Santander). No aplica a nómina asalariada pura.

| Actividad | Factor | Notas |
|-----------|--------|-------|
| PI (profesionista independiente) | **0.80** | |
| PI sector médico | **1.00** | |
| Consultorías TOP | **1.00** | sin haircut |
| PFAE Servicio | **0.60** | |
| PFAE Comercio | **0.60** | |
| Arrendamiento | **0.80** | |
| Inversiones | **0.90** | sobre rendimiento neto |
| Persona moral Servicio / Comercio | 0.20 / 0.15 | futuro (no MVP PF) |

**Slide “Castigos” (90 / 50 / 30 / 10) — descartada** para originación;
queda solo como histórico de la misma entrega. Actividad primaria /
gasolineras no aparecen en afectación: si llega un caso, flag manual hasta
definir mapeo.

**Asalariado:** los factores de giro **no cambian** el perfil nómina. Ver
§abajo (impacto CMA compartido vs cálculo).

### Impacto en perfil asalariado (misma entrega)

| Tema | ¿Cambia vs seed/motor actual? |
|------|-------------------------------|
| Score 542, edad+plazo 966 m | **Sí** — ya aplicado (compartido todos los perfiles) |
| Ingreso mín. $7.5k / construcción $20k | No — igual |
| Arraigo empleo ≥6 m (+ total 12 m / laguna ≤2 m) | No — ya documentado; seed sigue en 6 m piso |
| Endeudamiento ≤50%, buró/MOP, knockouts | No material — mismo espíritu |
| Factor de afectación / giro | **No aplica** a asalariado puro (solo no asalariado / mixtos) |
| Fórmulas nómina (prima/aguinaldo, pagadoras ±30%, bonos, fondo ahorro) | Detalle nuevo en capturas — **no es CMA de grilla**; refinar motor HU-12 si hace falta (Engram) |
| Frontera / Hipoteca Integral | Fuera de destinos del producto |

Conclusión: para **asalariado** el único cambio de producto ya sembrado es el
compartido (542 + 80a6m). El resto de CMA asalariado confirma lo existente;
las fórmulas finas de comprobación quedan para un pase del motor de ingreso
si la asesora quiere alinearlas literalmente.

### Referencia futura (Engram; no MVP PFAE persona física)

- **Ingresos mixtos:** el participante se trata como asalariado o no asalariado
  según el ingreso **mayor**; el menor no necesita cumplir la regla de
  comprobación, pero sí se puede sumar. Considerar todas las actividades
  verificables en CSF + recibos de nómina.
- **Persona moral:** factor sobre ventas anuales (servicio 20% / comercio 15%);
  utilidad neta positiva; socio: estados 6→4 × factor × % acciones (≥5
  depósitos/mes) o declaración `/12 × factor × %`.
- **Asalariado — fórmulas nómina/estados/declaración** (prima/aguinaldo,
  pagadoras ±30%, fondos, bonos): ver Engram `config/santander-future-profiles`
  cuando se refine el motor asalariado.

---

## Afirme

Hoy en seed: banco activo (CE 0.60, GROSS) **sin políticas por destino**.
Las capturas cubren CMA a nivel banco + factores; no listan destinos.

### Capa 1 — Banco

| Campo | Hoy en seed | De las capturas | Acción |
|-------|-------------|-----------------|--------|
| CE | 0.60 | ver fórmula abajo | no copiar 0.60/0.65 a ciegas |
| Ingreso | GROSS | nómina al 100% bruto; PFAE sobre depósitos | GROSS OK para asalariado |
| Score mín. | null | no hay número; buró **cualitativo** | no inventar umbral |
| Edad mín. | (no hay policy) | **25 años** | 300 meses |
| Edad máx. admisión | — | **69 años 11 meses** | 839 meses |
| Edad + plazo | — | **≤ 84 años 11 meses** | 1019 meses |

Buró por perfil (no es un score):

- Asalariado: buró **no negativo**.
- Independiente / PFAE: buró **bueno o excelente**.

Economías aceptadas: asalariado formal o asimilados; PFAE; socio con info
propia; socio con info de la empresa; **mixtas**. Socio/empresa fuera de MVP.

### Capa 2 — CMA por destino

Las capturas **no** parten por adquisición/liquidez/etc. Hay que pedir destinos
en otra fuente. Mientras tanto, umbrales a nivel banco (se copian a cada
destino el día que existan filas):

| Campo | Asalariado | PFAE |
|-------|------------|------|
| Antigüedad | **12 meses** continuos | **24 meses** |
| Ingreso mín. | no aparece | no aparece |
| Inmueble mín. | no aparece | no aparece |

### Capa 3 — Factores (captura “Castigos x actividad”)

Cuadra 1:1 con el Excel. Manda la captura.

| Etiqueta Afirme | Incluye | Factor |
|-----------------|---------|--------|
| Accionistas | accionistas con información propia | **1.00** |
| Honorarios | profesionistas con carta laboral de una empresa | **1.00** |
| Servicios | abogados, doctores, contadores, asesores inmobiliarios e hipotecarios | **0.80** |
| Comercio | todo comercio, incluido restaurante | **0.50** |
| Manufactura | ganaderos, constructoras, industrias | **0.20** |
| Gasolineros | gasolineras y divisas | **0.10** |

PFAE — estados de cuenta (captura cálculo independientes):

1. Solo depósitos del giro (sin inversiones, préstamos ni traspasos propios).
   Eso ya lo hace el peinado.
2. Promedio de **6 meses**. El ejemplo **no** quita alto/bajo.
3. × factor de actividad.
4. − `max(deudas buró, gasto básico)` → ingreso disponible.
5. Capacidad hipoteca = ingreso disponible × **60%**.

Asalariado: (bruto − deducciones de nómina − deudas o gasto básico) × **60%**.

La ficha POLITICA dice capacidad hasta **65%** del ingreso disponible; los
dos ejemplos de cálculo usan **60%**. Confirmar cuál manda. El seed CE 0.60
coincide con los ejemplos, no con el 65% de la ficha.

**Ojo de fórmula:** Afirme hace `(ingreso × factor − deuda) × 0.60`.
Nuestro motor hace `ingreso × CE − deuda`. No son iguales. Si se usa el
motor actual con CE 0.60, Afirme queda más estricto de lo que la captura
calcula. Anotar como excepción de comparativa; no reescribir el motor ahora.

---

## Banregio

Seed hoy: CE 0.50, GROSS, score mín. 629. Destinos activos: Adquisición,
Liquidez, Sustitución. Terreno / Construcción / Remodelación inactivos.

### Capa 1 — Banco

| Campo | Hoy en seed | De la captura | Acción |
|-------|-------------|---------------|--------|
| CE | 0.50 | no aparece | sin cambio |
| Ingreso | GROSS | no aparece | sin cambio |
| Score mín. | **629** | BC ≤ **629** → rechazo | seed OK (umbral inclusivo) |
| Edad mín. | 22 años (264 m) | **22 años** | OK |
| Edad + plazo máx. | 76 años (912 m) | **76 años 11 meses** sin estudios médicos | seed ~OK; opcional 923 m |
| Ingreso mín. | $17,500 | **$17,500** | OK |

Estudios médicos (fuera de CMA de perfilamiento; nota de producto):

- Edad + plazo ≤ 76a11m → no se requieren.
- Edad + plazo 77a–79a11m → **obligatorios**.
- Monto de crédito > **$12 MDP** → también obligatorios.

Créditos ≥ $10 MDP: aforo máx. 70% y tasa +50 bps (producto / LTV, no CMA).

Compra en ciudad distinta a la de residencia: perfil A/AA/AAA, aforo 70%,
inmueble a < 60 km. Fuera de alcance del motor actual (no modelamos ciudad).

Certificado de asesor / carta de autorización: requisito de broker, no CMA.

### Capa 2 — CMA por destino

La captura de políticas generales habla de **empleo** (arraigo laboral), no
parte asalariado vs PFAE. Seed ya tiene 24 meses en todos los destinos activos.

| Destino | Activo | Ingreso mín. | Inmueble | Meses asalariado | Meses PFAE |
|---------|--------|--------------|----------|------------------|------------|
| Adquisición | sí | $17,500 | (vacío) | **24** * | **24** (default editable) |
| Liquidez | sí | $17,500 | (vacío) | **24** * | **24** |
| Sustitución | sí | $17,500 | (vacío) | **24** * | **24** |
| Terreno / Construcción / Remodelación | no | — | — | — | — |

\* Asalariado en la captura: mínimo **2 años** en el empleo actual. Si el
actual tiene < 6 meses, se puede tomar el anterior con ≥ 2 años (perfiles
A/AA/AAA: 1 año en el anterior). Sin motor de “perfil A/AA/AAA” ni lagunas:
el seed con 24 meses es la lectura simple.

PFAE: **24 meses** como default (mismo patrón que el resto; editable en el
módulo Bancos). No hay ficha aparte de independientes en esta entrega.

### Capa 3 — Factores (captura “Comprobación de ingresos”)

Factores idénticos para perfiles internos A, B y C. Cuadra 1:1 con el Excel.

| Giro (etiqueta Banregio) | Factor |
|--------------------------|--------|
| Servicios | **0.70** |
| Otros | **0.60** |
| Informal | **0.15** |
| Accionistas | **1.00** |

Taxonomía más gruesa del catálogo (4 etiquetas). El mapeo CSF → Servicios /
Otros / Informal es el trabajo de alias; Accionistas suele ser persona moral /
participación (fuera de MVP persona física, o flag manual).

No hay en estas capturas: meses de estados (6 vs 12), suavizado, ni si el
factor aplica también a declaración.

---

## BX+

Hoy en seed: banco activo (CE 0.50, GROSS) **sin políticas por destino**
(igual que Afirme).

### Capa 1 — Banco

| Campo | Hoy en seed | De las capturas | Acción |
|-------|-------------|-----------------|--------|
| CE | 0.50 | no aparece | sin cambio |
| Ingreso | GROSS | factores sobre “ingreso neto” | confirmar NET vs GROSS |
| Score mín. | null | no aparece | sin cambio |
| Edad mín. | (no hay policy) | **25 años** | 300 meses |
| Edad + plazo máx. | — | **74 años 11 meses** | 899 meses |
| Ingreso mín. | — | **$19,000** (1 part.) / $15,000 c/u si 2 | crear al sembrar destinos |

Otras reglas generales (PF México):

- Solo personas físicas; participantes en línea directa (padres, hijos, cónyuge).
- Ingreso de participantes que no sean cónyuge: se toma al **50%**.
- Historial en cuentas bancarias ≥ 1 año.
- Antigüedad en domicilio ≥ 1 año.
- Nacionalidad mexicana o extranjera con forma migratoria.

Comprobación aceptada: asalariado, asimilado, independientes, arrendamiento,
RESICO, dividendos, **PFAE**, RIF, persona moral.

### Capa 2 — CMA por destino

Las capturas **no** parten por destino. Umbrales a nivel banco (copiar a cada
fila el día que existan destinos):

| Campo | Asalariado | No asalariado / PFAE |
|-------|------------|----------------------|
| Antigüedad | **12 meses** | **24 meses** |
| Ingreso mín. | $19,000 | $19,000 (misma ficha) |
| Inmueble mín. | no aparece | no aparece |

Fuera de MVP (fichas aparte):

- Extranjeros / mexicanos que trabajan en el extranjero: asalariado 12m,
  obligado solidario en México, aforo &lt; 70%, plazo máx. 15 años, 6 estados.
- Persona moral: ≥ 50% acciones, 2 declaraciones, 6 estados de la empresa,
  arraigo laboral 24m, aforo máx. 80%.

### Capa 3 — Factores (captura “Determinación de ingresos”)

**Hallazgo:** BX+ tiene factor distinto según la **base elegida** (declaración
vs estados). El Excel solo guardaba el % de declaración (o un solo número).
Hay que modelar `factorDeclaracion` y `factorEstados` por etiqueta, o dos filas.

| Etiqueta BX+ | % declaración | % estados | vs Excel |
|--------------|---------------|-----------|----------|
| Socio o dueño (comprobación personal / dividendos) | **0.90** | **0.90** (6 meses) | Excel 0.90 |
| Socio o dueño (vía empresa) | **0.90** × % acciones | — | Excel 0.90 (sin % acciones) |
| Arrendamiento | **0.80** | **0.80** | igual |
| Servicios profesionales | **0.80** | **0.80** | igual |
| PFAE Servicios | **0.60** | **0.50** | Excel solo 0.60 |
| PFAE Comercio | **0.50** | **0.40** | Excel solo 0.50 |
| Pequeños contribuyentes | **0.30** | **0.25** | Excel solo 0.30 |
| Gasolinero | **0.05** de ventas | **0.05** de ventas | igual |

MVP persona física PFAE: usar filas Servicios / Comercio / Arrendamiento /
Servicios profesionales / Pequeños contribuyentes / Gasolinero. Socio/dueño
vía empresa y persona moral: fuera o flag manual.

Esto refuerza la idea del plan: la asesora elige base (estados vs declaración)
y la comparativa aplica el factor **de esa base** por banco.

---

## Scotiabank

Seed hoy: CE 0.55, GROSS. Destinos activos: Adquisición, Liquidez, Sustitución,
Construcción, Remodelación (sin Terreno).

### Capa 1 — Banco

| Campo | Hoy en seed | De las capturas / web | Acción |
|-------|-------------|----------------------|--------|
| CE | 0.55 | no aparece | sin cambio |
| Ingreso | GROSS | estados de cuenta | GROSS OK |
| Score mín. | null | “buenas referencias” (cualitativo) | sin umbral numérico |
| Edad mín. | 25 (300 m) | **25 años** | OK |
| Edad + plazo | 74 años (888 m) | **edad + plazo ≤ 80** y edad &lt; 75 | corregir máx. a **960 m** (80); regla aparte edad &lt; 75 |
| Ingreso mín. | $10,000 | $10,000 sin Infonavit; $7,500 con Apoyo Infonavit | seed OK para sin Infonavit |
| taxReturnPolicy | (plan: REJECTED) | comprobación por **estados**; sin CSF aforo ≤ 65% | confirma: camino principal = estados |

Notas de aforo (producto, no CMA de perfilamiento):

- Sin constancia de situación fiscal: aforo máx. **65%**.
- Cliente Scotiabank ≥ 6 meses: aforo hasta **90%**.

Comprobación PF independientes: **últimos 6 meses** de estados a nombre del
solicitante (sin límite de cuentas). Dueños de empresa vía PF: mismos 6 meses
+ acta constitutiva para tomar el **100%** de lo reflejado en estados personales.

### Capa 2 — CMA por destino

| Destino | Activo | Ingreso mín. | Inmueble | Meses asalariado | Meses PFAE |
|---------|--------|--------------|----------|------------------|------------|
| Adquisición | sí | $10,000 * | $400,000 (seed) | 6 ** | **24** |
| Liquidez | sí | $10,000 | (vacío) | 6 ** | **24** |
| Sustitución | sí | $10,000 | (vacío) | 6 ** | **24** |
| Construcción | sí | $10,000 | (vacío) | 6 ** | **24** |
| Remodelación | sí | $10,000 | (vacío) | 6 ** | **24** |
| Terreno | no | — | — | — | — |

\* Con Apoyo Infonavit: $7,500 (fuera de MVP si no modelamos Infonavit).

\*\* Web asalariado sin Infonavit: 2 años entre empleo actual + anterior, con
mínimo **6 meses** en el actual (con Infonavit: mín. 3 meses en el actual).
El seed guarda 6 = piso del empleo actual. Independiente / dueño de negocio:
**2 años consecutivos** en la misma actividad actual → columna PFAE **24**.

### Capa 3 — Factores (captura “Ingresos por actividad”)

Cuadra 1:1 con el Excel (19 etiquetas).

| % | Etiquetas Scotiabank |
|---|----------------------|
| **1.00** | Comisionistas (con/sin sueldo fijo), abogados no litigantes, médicos con licencia para recetar, arquitectos e ingenieros que no se dediquen a la construcción |
| **0.80** | Contadores, consultores, agentes aduanales, asesores, artistas, músicos, valuadores, arrendadores, profesores |
| **0.50** | Dueños de negocio, comerciantes, constructores |
| **0.10** | Gasolineros, agropecuario, ganadero |

### Persona moral (referencia futura — no MVP)

Fuente: capturas PM + `Comprobacion_de_ingresos_PM.pdf` (Scotiabank, no
versionar en el repo).

- Acta constitutiva; participación accionaria mín. **50%**.
- Alta de Hacienda PM; 6 meses de estados a nombre de la empresa.
- Cálculo: depósitos promedio 6 meses × % accionario × **40%**.
- Buró Dun & Bradstreet solo IR4 / montos fuera de política.
- No aplica IR5/R, consolidación con otra figura, actividades restringidas.
- Actividades condicionadas (transporte, gasolineras, escuelas/hospitales,
  comercializadoras de cómputo, AC/SC): mín. **4 años** de constitución.

Guardar para el perfil persona moral; no mezclar con PFAE persona física.

---

## Banorte

Fuentes: cálculo de ingresos broker 2024 (metodología), antigüedad laboral
broker (vigencia **16-dic-2025**), anaquel enero 2026 (solo edad / valor mín. /
destinos — sin tasas ni productos).

### Capa 1 — Banco

| Campo | Hoy en seed | De las fuentes | Acción |
|-------|-------------|----------------|--------|
| CE | 0.60 | Excel PFAE 0.60 | OK |
| Ingreso | NET | nómina/honorarios en neto | OK |
| Score mín. | null | no aparece | sin cambio |
| Edad mín. | 25 (300 m) | anaquel: **25 años** | OK |
| Edad máx. admisión | 69a11m (839 m) | anaquel: **69 años 11 meses** | OK |
| Edad + plazo | (usa máx. admisión) | anaquel: **≤ 80 años** | regla aparte 960 m si hace falta |
| Inmueble mín. | $350,000 | anaquel: **$350,000** | OK |

Sin matriz por giro. El factor sobre el **promedio suavizado de estados**
(6 meses → quitar max/min → promedio de 4) aplica solo a **PFAE / RIF / RESICO**
y depende de si es **cliente Banorte**. **No** aplica al camino asalariado
por recibos de nómina.

| Perfil / camino | Factor |
|-----------------|--------|
| PFAE / RIF / RESICO — estados (cliente Banorte) | **0.70** |
| PFAE / RIF / RESICO — estados (no cliente) | **0.60** |
| Honorarios (facturas + estados, 6 meses) | **0.85** |
| Arrendamiento (contrato + estados, 6 meses) | **0.85** |
| Asalariado (nómina CFDI) | no usa este factor |

El Excel tenía flat **0.60** para todos. El PDF distingue 70% cliente / 60%
resto. Cerrado (asesora):

- **Hecho del expediente**, no de la tarjeta del banco. La tarjeta guarda
  `factorClienteBanorte = 0.70` y `factorNoCliente = 0.60`.
- **Híbrido:** si hay al menos un estado con `institutionName` Banorte →
  premarcar “Es cliente Banorte” (70%). Si no hay → default **no cliente**
  (60%). La asesora **siempre puede** cambiar el checkbox.
- **Aviso en UI** cuando el expediente es PFAE/RIF/RESICO y aún no se ha
  confirmado el flag (o cuando la inferencia y el checkbox divergen): banner
  visible junto al checkbox para que no se olvide revisar antes de analizar /
  enviar a comparativa.

### Capa 2 — CMA por destino

Seed: 6 destinos activos. Anaquel confirma adquisición y varios destinos;
no cambiamos la lista activa por el anaquel de productos.

| Destino | Activo (seed) | Ingreso mín. | Inmueble | Meses asalariado | Meses PFAE |
|---------|---------------|--------------|----------|------------------|------------|
| Adquisición | sí | (vacío) | $350,000 | **6** * | **24** ** |
| Liquidez | sí | (vacío) | $350,000 | **6** | **24** |
| Sustitución | sí | (vacío) | $350,000 | **6** | **24** |
| Terreno | sí | (vacío) | $350,000 | **6** | **24** |
| Construcción | sí | (vacío) | $350,000 | **6** | **24** |
| Remodelación | sí | (vacío) | $350,000 | **6** | **24** |

\* Antigüedad laboral (PDF dic-2025): empleados **6 meses**. Seed hoy tiene
**12** → bajar asalariado a 6.

\*\* Misma ficha: PFAE / RIF / RESICO = **2 años**. Honorarios / arrendamiento
= **1 año** (si se modelan como caminos aparte). Socio PM = 1 año (fuera MVP).

Nota: el PDF de cálculo 2024 pedía CSF con antigüedad mínima de **6 meses**
(facultable). La norma de antigüedad **dic-2025** manda **24 meses** PFAE y
prevalece para originaciones desde esa fecha. Validar en CSF.

### Capa 3 — Cálculo de ingreso PFAE (estados)

Metodología (PDF cálculo 2024) — **igual a nuestro motor suavizado**. Solo
PFAE / RIF / RESICO (no asalariado por nómina):

1. CSF + 6 meses de estados (uno o más bancos).
2. Solo depósitos de la actividad (mismo peinado: sin créditos, TDC, traspasos
   propios, devoluciones, depósitos familiares).
3. Quitar mes más alto y más bajo; promedio de los 4 restantes.
4. × **0.70** si checkbox “cliente Banorte” (premarcado si hay estado Banorte),
   o × **0.60** si no.

Declaración anual PF/PFAE: permitida para actividad empresarial o mixto
asalariado+empresarial; **no** si solo trae sueldos y salarios; no pagos
provisionales RIF/RESICO por ahora en ese PDF. Pérdidas en PM no elegibles.

Persona moral / economía americana: fuera de MVP (anotado en el PDF).

---

## HSBC

Fuente: `Perfilamiento_y_Requisitos_Minimos__MAYO26 HSBC (1).pdf` (mayo 2026).
Deck de diapositivas (casi sin texto extraíble). No se versiona el PDF.

Seed hoy (tras confirmación asesora): CE 0.50, **NET**, score `null`.
Adquisición activa. **Liquidez activa para asalariado**; cerrada para PFAE /
independientes / persona moral. Sustitución sigue inactiva hasta confirmar.
Ingreso mín. del seed: **vacío**. Edad máx.: **70a11m (851 m)**.

### Capa 1 — Banco

| Campo | Hoy en seed | Del PDF mayo-2026 | Acción |
|-------|-------------|-------------------|--------|
| CE | 0.50 | no aparece (Excel PFAE 0.50) | sin cambio |
| Ingreso | **NET** | “ingreso mensual **neto**” | OK |
| Score mín. | null | no hay número; historial ≥ **6 meses** (cualitativo) | no inventar umbral |
| Edad mín. titular | 25 (300 m) | **25 años** | OK |
| Edad máx. admisión | 69a11m (839 m) | **70 años 11 meses** * | **cerrado: 851 m** |
| Edad + plazo | (usa máx. admisión) | **< 80 años** | regla aparte 960 m si hace falta |

\* Productos Infonavit (COFINAVIT, Apoyo Infonavit, Hipoteca + cuenta Infonavit):
edad máx. **69a11m** y, en +cuenta Infonavit, edad+plazo también 69a11m. Fuera
de MVP si no modelamos Infonavit. Coacreditado: edad mín. **21** (el seed
evalúa al titular).

Destinos que el PDF lista (oferta, no tasas): **Adquisición**, **Pago de
Hipoteca** (sustitución), **Liquidez**. Terreno / Construcción / Remodelación
no aparecen. Tasas, aforos, perfiles A/B, Hipoteca Verde, Top Up: producto;
no se copian al CMA.

Relación con HSBC (nómina, antigüedad como cliente, transaccionalidad) es
dato del expediente, no política editable de la tarjeta.

### Capa 2 — CMA por destino

El PDF **no** parte umbrales por destino. Confirmado por la asesora:

- **Liquidez:** abierta **solo asalariado**. Cerrada para independientes / PFAE
  y persona moral. No se duplica la grilla: `isActive` sirve al asalariado;
  en análisis PFAE es knockout (no se ofrece HSBC liquidez).
- **Adquisición:** abierta (asalariado y PFAE).
- **Sustitución:** el PDF la lista; seed **sigue inactiva** hasta confirmar.
- **Ingreso mín.:** las bandas $8.5k / $25k / $35k **sí están** en la ficha
  de requisitos, pero no son un CMA único (cambian por edad y nómina HSBC).
  No se siembra un número: `minimumIncome = null`. No cubo edad×ingreso.

| Destino | Activo asalariado | Activo PFAE | Ingreso mín. (seed) | Inmueble | Meses asalariado | Meses PFAE |
|---------|-------------------|-------------|---------------------|----------|------------------|------------|
| Adquisición | sí | sí | **vacío** | vacío | **6** * | **24** |
| Liquidez | **sí** | **no** (knockout) | **vacío** | vacío | **6** | n/a |
| Sustitución (Pago de Hipoteca) | no (seed) | no | — | — | — | — |
| Terreno / Construcción / Remodelación | no | no | — | — | — | — |

Bandas del PDF (referencia, no seed):

| Condición | Mínimo |
|-----------|--------|
| Nómina HSBC | $8,500 |
| Edad 25–35 (no nómina HSBC) | $25,000 |
| Edad ≥ 35 | $35,000 |
| Coacreditado | $5,000 |

\* Antigüedad laboral (titular):

- Asalariado: **6 meses** (seed ya tiene 6).
- Cliente nómina HSBC: **1 mes** (flag de expediente; no bajar el default).
- **No asalariado / PFAE: 2 años** → columna PFAE **24** (solo destinos PFAE).

Otras reglas de la misma ficha (no CMA de destino): historial crediticio ≥ 6
meses; antigüedad domiciliaria 1 año en el actual o 2 entre actual+anterior.
No las modelamos (no extraemos domicilio con esa profundidad).

### Capa 3 — Factores / comprobación PFAE

**No hay matriz por giro.** Confirma el Excel: HSBC = N/A (sin castigo →
reconoce **100%**). Modo de factor: `NONE` (factor 1.0). Banorte sigue siendo
el único `FLAT`.

Comprobación oficial PFAE / profesionista independiente (no se extrae Visor
en nuestro pipeline):

1. CSF con vigencia **≤ 6 meses**.
2. **Visor Financiero** (E-Visor / CIEC). El visor cruza domicilio fiscal,
   actividades y antigüedad; no es nuestro suavizado 6→4.

Persona moral: CSF empresa ≤ 6 meses + visor + acta con ≥ **25%** de acciones
(fuera de MVP). Economía americana: fuera de MVP.

Asalariado no-nómina HSBC pide Visor Laboral (&lt; $80k) o E-Visor Fiscal
(≥ $80k). No cambia PFAE.

**Match con lo que ya extraemos:** identidad + CSF (giro, arraigo, vigencia
6 meses) + edad + destino + buró. Ingreso admisible HSBC PFAE = base
(estados o declaración) × **1.0**. El visor no se simula; si hace falta, una
nota en comparativa de que HSBC autoriza con Visor, no con nuestro peinado.

---

## Qué esto implica para el módulo

1. Factores **no son un catálogo compartido**. Banorte es el caso **flat**
   (0.60 / 0.70). HSBC es **NONE** (factor 1.0); el PDF no trae giro. El resto
   es matriz nativa del banco.
2. Arraigo PFAE: **24 meses** en los 9 bancos (HSBC “no asalariado” = 2 años).
   Asalariado Banorte: **6 meses** (seed hoy 12 → corregir). HSBC asalariado
   ya está en 6.
3. CMA: columna extra solo donde cambia el campo (arraigo; a veces edad/
   ingreso). HSBC ingreso mín. se deja **vacío** (bandas del PDF no caben
   en un número). HSBC liquidez: activa asalariado, knockout PFAE.
4. Suavizado 6→4: Banorte y Santander lo documentan explícito. HSBC PFAE
   autoriza con **Visor Financiero**, no con peinado; el motor igual puede
   mostrar base × 1.0 como aproximación.
5. Banorte 70/60 solo **PFAE/RIF/RESICO** (estados). Señal cerrada: híbrido
   (inferir por estado Banorte + checkbox override + aviso UI). Asalariado
   no usa este factor.
6. Confirmado HSBC (asesora): liquidez solo asalariado; edad máx. **70a11m**;
   ingreso seed **vacío**. Confirmado Mifel CE **0.50**. Pendiente resto:
   - ¿Factores Banamex = columna Nuevo?
   - ¿Mifel comercio 0.35 vs Excel 0.20?
   - ¿Edad mín. Banamex PFAE = 28?
   - ¿Santander score 542 vs 541? → **cerrado: 542**; edad+plazo **966 m** (80a6m); factores = **afectación** (no castigos)
   - ¿Afirme 60% o 65%?
   - ¿BX+ NET o GROSS?
   - ¿Scotiabank edad+plazo 80 vs seed 74?
7. Fuera de MVP: persona moral, economía americana, Infonavit/aforos del
   anaquel, tasas/productos, directorio comercial, flujo E-Visor de Leones.

---

## Siguiente

Ingesta de PDFs **cerrada**. Sembrar / ajustar el módulo Bancos cuando se
cierren las confirmaciones de la lista 6 (no es seed todavía).
