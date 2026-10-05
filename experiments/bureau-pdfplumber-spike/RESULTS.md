# Resultados de la grilla del buró

El procesamiento actual (Gemini + servicio Python en `127.0.0.1:8077`) se
midió contra las columnas del PDF. La nota cuenta límite, pago, saldo y
carita solo cuando el PDF trae ese dato.

## Nota

| PDF | Cuentas | Campos | Asertividad | Fecha |
|---|---|---|---|---|
| bureau-fixture-a.pdf | 60 / 60 | 225 / 225 | 100% | 2026-10-02 |
| bureau-fixture-b.pdf | 20 / 20 | 79 / 79 | 100% | 2026-10-02 |
| 7. BC - JUAN PEREZ - 2024.01.15.pdf | 16 / 16 | 55 / 55 | 100% | 2026-10-05 |
| **Conjunto** | **96** | **359 / 359** | **100%** | |

Los PDFs viven en esta carpeta y no se versionan (`*.pdf` en `.gitignore`).

## Cómo repetir la medición

1. Servicio Python: `.\.venv\Scripts\python.exe -m uvicorn app:app --host 127.0.0.1 --port 8077`
2. Extraer el buró desde la plataforma (el API debe haber arrancado después del último cambio de código).
3. Cruzar JSON guardado con la grilla:

```text
.venv\Scripts\python.exe score_columns.py "bureau-fixture-a.pdf" "bureau-fixture-b.pdf" "7. BC - JUAN PEREZ - 2024.01.15.pdf"
.venv\Scripts\python.exe compare_pair.py <extract-ui.json> <pdf-grid.json> <etiqueta>
```

`score_columns.py` cubre los casos de fase 0: Santander 8775, Telcel 0,
Gribma 3119, NU 17740, Amex 1875, Amex Company sin 49800/41600, y Santander
…1887 sin que CC pinte atraso grave.

## Qué quedó fuera de la nota

- Sky / Amex Company sin columna de límite: la UI puede mostrar el máximo.
  No entra al denominador.
- CC (cuenta cancelada o cerrada) no es atraso. El pie de página
  (`6 DE14`) no debe colarse en las claves de pago.

## Siguiente paso

El procesamiento de buró cierra en esta rama. Persona moral espera a
definir flujo. Para ver Pérez en la UI hay que reiniciar el API y
reextraer el expediente; esta medición no se persistió.
