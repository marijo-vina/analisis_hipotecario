"""Score the bureau grid against the phase-0 cases."""

from __future__ import annotations

import sys
from pathlib import Path

from grid import Credit, extract_pdf, fold


def money(value: float | None) -> str:
    if value is None:
        return "-"
    if value == int(value):
        return f"{int(value):,}"
    return f"{value:,.2f}"


def main() -> int:
    paths = [Path(arg) for arg in sys.argv[1:]]
    if not paths:
        print("Uso: python score_columns.py <buro.pdf> [...]", file=sys.stderr)
        return 2

    checks = [
        ("CM17022026", "SANTANDER", "12001071541", 8775, 8475),
        ("CM17022026", "TELCEL", "82953660", 0, 229),
        ("DIAZ", "AMEX", "376722482104002", 1875, None),
        ("CM17022026", "GRIBMA", "379180763643320", 3119, 600),
        ("CM17022026", "NU MEXICO", "5267774396475185", 17740, 3000),
    ]
    forbidden_payment = {
        ("DIAZ", "376662329074002"): {49800, 41600},
        ("DIAZ", "376702569371005"): {49800, 41600},
    }

    all_rows: list[tuple[Path, Credit]] = []
    for path in paths:
        for credit in extract_pdf(path):
            all_rows.append((path, credit))
            print(
                f"{path.name} p{credit.page} {credit.marker:<4} "
                f"{credit.institution[:28]:<28} {credit.account[-4:]:>4}  "
                f"pagar={money(credit.payment):>10}  "
                f"ultimo={money(credit.last_payment):>10}  "
                f"saldo={money(credit.balance):>10}  "
                f"limite={money(credit.limit):>10}  "
                f"max={money(credit.maximum):>10}"
            )

    print("\n=== casos conocidos ===")
    failures = 0
    for file_bit, institution, account, payment, last_payment in checks:
        match = next(
            (
                credit
                for path, credit in all_rows
                if file_bit in path.name.upper()
                and account == credit.account
                and institution in fold(credit.institution)
            ),
            None,
        )
        if match is None:
            failures += 1
            print(f"FALTA  {institution} …{account[-4:]}")
            continue
        ok_payment = match.payment == payment
        ok_last = last_payment is None or match.last_payment == last_payment
        if not (ok_payment and ok_last):
            failures += 1
            print(f"FALLO {institution} …{account[-4:]} pagar={money(match.payment)}")
        else:
            print(f"OK    {institution} …{account[-4:]}")

    for (file_bit, account), banned in forbidden_payment.items():
        match = next(
            (
                credit
                for path, credit in all_rows
                if file_bit in path.name.upper() and account == credit.account
            ),
            None,
        )
        if match is None or match.payment in banned:
            failures += 1
            print(f"FALLO AMEX COMPANY …{account[-4:]}")
        else:
            print(f"OK    AMEX COMPANY …{account[-4:]}")

    sep_santander = next(
        (
            credit
            for path, credit in all_rows
            if "SEP2026" in path.name.upper()
            and credit.account.endswith("1887")
            and "SANTANDER" in fold(credit.institution)
        ),
        None,
    )
    if sep_santander is None:
        failures += 1
        print("FALTA  SANTANDER …1887")
    else:
        mop_digits = [int(code) for code in sep_santander.mop_codes if code.isdigit()]
        worst = max(mop_digits) if mop_digits else 0
        if worst >= 5:
            failures += 1
            print(f"FALLO SANTANDER …1887 mop={''.join(sep_santander.mop_codes)}")
        else:
            print("OK    SANTANDER …1887 (CC no pinta atraso)")

    print(f"\ncréditos: {len(all_rows)}  fallos conocidos: {failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
