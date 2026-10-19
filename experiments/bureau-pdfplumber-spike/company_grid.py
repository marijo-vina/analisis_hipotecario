"""Column reader for a Personas Morales credit report.

Amounts on this report are printed in thousands of pesos. This reader
returns pesos. The shareholder report stays in grid.py.
"""

from __future__ import annotations

import re
from typing import BinaryIO

import pdfplumber

from grid import MARKER_RE, Token, collect_mop_codes, fold, nearest

DATE_RE = re.compile(r"^[A-Z]{3}-\d{2}$", re.IGNORECASE)


def is_company_report(text: str) -> bool:
    folded = fold(text)
    return "PERSONAS MORALES" in folded and "MILES DE PESOS" in folded


def active_header_centers(words: list[dict]) -> dict[str, float] | None:
    """Topmost header. The liquidated table repeats Actual and Vencido lower on the page."""
    chosen: dict[str, tuple[float, float]] = {}

    def consider(key: str, x: float, y: float) -> None:
        current = chosen.get(key)
        if current is None or y < current[0]:
            chosen[key] = (y, x)

    for word in words:
        label = fold(word["text"])
        x = float(word["x0"])
        y = float(word["top"])
        if label == "OTORGADO" and x > 300:
            consider("granted", x, y)
        elif label == "PLAZO" and 250 < x < 400:
            consider("term", x, y)
        elif label == "ACTUAL" and x > 400:
            consider("balance", x, y)
        elif label == "VENCIDO" and x > 450:
            consider("overdue", x, y)
    if "granted" not in chosen or "balance" not in chosen:
        return None
    return {key: value[1] for key, value in chosen.items()}


def pesos_from_thousands(value: float | None) -> int | None:
    if value is None:
        return None
    return int(round(value * 1000))


def classification_for(credit_type: str | None) -> str:
    # This report's font yields "?" where the accented I should be ("L?NEA").
    folded = fold(credit_type or "").replace("?", "")
    if any(token in folded for token in ("REVOLV", "LINEA", "LNEA", "TARJETA", "T. CRED", "T CRED")):
        return "REVOLVING"
    if "SIMPLE" in folded or "ARREND" in folded:
        return "FIXED_PAYMENT"
    return "UNKNOWN"


def _section_words(words: list[dict]) -> list[dict]:
    """Keep the active detail. The liquidated table below has no granted amount."""
    cutoff = None
    for word in words:
        if fold(word["text"]) == "LIQUIDADOS":
            cutoff = float(word["top"])
            break
    if cutoff is None:
        return words
    return [word for word in words if float(word["top"]) < cutoff - 4]


def _credits_on_page(
    words: list[dict],
    centers: dict[str, float],
) -> list[dict]:
    tokens = [
        Token(word["text"], float(word["x0"]), float(word["top"]))
        for word in _section_words(words)
    ]
    markers = [
        token
        for token in tokens
        if token.x < 36 and MARKER_RE.match(token.text)
    ]
    rows: list[dict] = []
    for index, marker in enumerate(markers):
        bottom = markers[index + 1].y if index + 1 < len(markers) else marker.y + 80
        block = [token for token in tokens if marker.y - 2 <= token.y < bottom - 1]
        left = [token for token in block if token.x < 160 and token is not marker]
        account = next(
            (token for token in left if token.text.isdigit() and len(token.text) >= 5),
            None,
        )
        if account is None:
            continue
        name_tokens = [token for token in left if token.y < account.y - 1]
        type_tokens = [
            token
            for token in left
            if token.y > account.y + 1
            and not token.text.isdigit()
            and DATE_RE.match(token.text) is None
            and token.amount is None
        ]
        institution = " ".join(token.text for token in name_tokens).strip()
        credit_type = " ".join(token.text for token in type_tokens).strip() or None
        granted = nearest(block, centers["granted"])
        balance = nearest(block, centers["balance"])
        overdue = nearest(block, centers["overdue"]) if "overdue" in centers else None
        term = nearest(block, centers["term"]) if "term" in centers else None
        rows.append(
            {
                "institution": institution,
                "accountNumber": account.text,
                "creditType": credit_type,
                "classification": classification_for(credit_type),
                "originalAmount": pesos_from_thousands(granted),
                "currentBalance": pesos_from_thousands(balance),
                "pastDueAmount": pesos_from_thousands(overdue),
                "termDays": int(round(term)) if term is not None else None,
                "mopCodes": collect_mop_codes(block),
            }
        )
    return rows


def extract_company_pdf(source: str | BinaryIO) -> list[dict]:
    pages: list[list[dict]] = []
    texts: list[str] = []
    with pdfplumber.open(source) as pdf:
        for page in pdf.pages:
            words = page.extract_words(keep_blank_chars=False) or []
            pages.append(words)
            texts.append(" ".join(word["text"] for word in words))
    if not is_company_report(" ".join(texts)):
        return []

    rows: list[dict] = []
    for words in pages:
        centers = active_header_centers(words)
        if centers is None:
            continue
        rows.extend(_credits_on_page(words, centers))
    return rows


def company_payload(source: str | BinaryIO) -> dict:
    rows = extract_company_pdf(source)
    return {
        "reportKind": "PERSONAS_MORALES",
        "amountsInThousands": True,
        "credits": rows,
    }
