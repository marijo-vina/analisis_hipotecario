import json
import re
import sys
from collections import Counter

ui_path, pdf_path = sys.argv[1], sys.argv[2]
label = sys.argv[3] if len(sys.argv) > 3 else "buro"
ui = json.load(open(ui_path, encoding="utf-8"))
pdf = json.load(open(pdf_path, encoding="utf-8"))


def digits(value):
    return re.sub(r"\D", "", str(value or ""))


def inst_key(name):
    return re.sub(r"[^0-9A-Z]", "", str(name or "").upper())


def related(left, right):
    a, b = inst_key(left), inst_key(right)
    if not a or not b:
        return False
    head = 8
    return a.startswith(b[:head]) or b.startswith(a[:head])


def account_of(credit):
    direct = digits(credit.get("accountNumber"))
    if len(direct) >= 6:
        return direct
    found = re.findall(r"\d{6,}", credit.get("rawTextReference") or "")
    glued = re.findall(r"\d{10,}\s+\d{3,6}(?!\d)", credit.get("rawTextReference") or "")
    glued = [re.sub(r"\s+", "", g) for g in glued]
    candidates = ([direct] if len(direct) >= 6 else []) + glued + found
    return max(candidates, key=len) if candidates else ""


def same_account(left, right):
    if not left or not right:
        return False
    if left == right:
        return True
    if len(left) >= 4 and len(right) >= 4 and left[-4:] == right[-4:]:
        return True
    short, long_ = (left, right) if len(left) <= len(right) else (right, left)
    extra = len(long_) - len(short)
    return len(short) >= 10 and 3 <= extra <= 6 and long_.startswith(short)


def face(codes):
    nums = [int(c) for c in codes or [] if str(c).isdigit()]
    if not nums:
        return "sin-clave"
    worst = max(nums)
    if worst <= 1:
        return "verde"
    if worst <= 4:
        return "amarillo"
    return "rojo"


def num(value):
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def pay(credit):
    if credit.get("paymentDueAmountEffective") is not None:
        return credit.get("paymentDueAmountEffective")
    return credit.get("paymentDueAmount")


claimed = set()
pairs = []
for credit in ui.get("credits") or []:
    account = account_of(credit)
    institution = credit.get("institution") or ""
    match = -1
    if account:
        for index, row in enumerate(pdf["credits"]):
            if index in claimed:
                continue
            if same_account(account, digits(row.get("accountNumber"))) and related(
                institution, row.get("institution")
            ):
                match = index
                break
        if match == -1:
            for index, row in enumerate(pdf["credits"]):
                if index in claimed:
                    continue
                if digits(row.get("accountNumber")) == account:
                    match = index
                    break
    if match == -1 and institution:
        for index, row in enumerate(pdf["credits"]):
            if index in claimed:
                continue
            if not digits(row.get("accountNumber")) and related(
                institution, row.get("institution")
            ):
                match = index
                break
    if match == -1:
        pairs.append((credit, None, account))
        continue
    claimed.add(match)
    pairs.append((credit, pdf["credits"][match], account))

for index, (credit, row, account) in enumerate(pairs):
    if row is not None:
        continue
    institution = credit.get("institution") or ""
    leftover = next(
        (
            pdf_index
            for pdf_index, prow in enumerate(pdf["credits"])
            if pdf_index not in claimed
            and related(institution, prow.get("institution") or "")
        ),
        -1,
    )
    if leftover == -1:
        continue
    claimed.add(leftover)
    pairs[index] = (credit, pdf["credits"][leftover], account)

stats = {name: Counter() for name in ["limite", "pago", "saldo", "carita"]}
ok_fields = 0
comparable = 0
mismatches = []
unmatched = 0

for credit, row, account in pairs:
    tail = account[-4:] if account else "----"
    name = f"{(credit.get('institution') or '?')[:22]} …{tail}"
    if row is None:
        unmatched += 1
        mismatches.append(f"sin-par {name}")
        continue
    checks = [
        ("limite", credit.get("creditLimit"), row.get("creditLimit")),
        ("pago", pay(credit), row.get("paymentDueAmount")),
        ("saldo", credit.get("currentBalance"), row.get("currentBalance")),
    ]
    for field, left, right in checks:
        a, b = num(left), num(right)
        if a is None and b is None:
            stats[field]["ambos_vacios"] += 1
            continue
        if b is None:
            stats[field]["pdf_vacio"] += 1
            continue
        comparable += 1
        if a == b:
            stats[field]["ok"] += 1
            ok_fields += 1
        else:
            stats[field]["distinto"] += 1
            mismatches.append(f"{field:6} {name}: ui={a} pdf={b}")
    ui_face, pdf_face = face(credit.get("mopCodes")), face(row.get("mopCodes"))
    comparable += 1
    if ui_face == pdf_face:
        stats["carita"]["ok"] += 1
        ok_fields += 1
    else:
        stats["carita"]["distinto"] += 1
        mismatches.append(f"carita {name}: ui={ui_face} pdf={pdf_face}")

ui_n = len(ui.get("credits") or [])
pdf_n = len(pdf.get("credits") or [])
paired = ui_n - unmatched
pct = round(100 * ok_fields / comparable, 1) if comparable else 0.0
print(f"=== {label} ===")
print(f"ui={ui_n} pdf={pdf_n} emparejadas={paired} sin_par={unmatched}")
print(f"campos ok={ok_fields}/{comparable} asertividad={pct}%")
print(json.dumps(stats, default=dict))
if mismatches:
    print("-- desajustes --")
    for line in mismatches[:40]:
        print(line)
    if len(mismatches) > 40:
        print(f"... {len(mismatches) - 40} mas")
