"""BBVA movement table: keep the amount that sits in the ABONOS column.

The OCR line reader merges cargo, abono and saldo. These PDFs already
place each amount on its own x. A deposit is the number under ABONOS.
"""

from __future__ import annotations

import re
from io import BytesIO

import pdfplumber

MONTHS = {
    "ENE": "01",
    "FEB": "02",
    "MAR": "03",
    "ABR": "04",
    "MAY": "05",
    "JUN": "06",
    "JUL": "07",
    "AGO": "08",
    "SEP": "09",
    "OCT": "10",
    "NOV": "11",
    "DIC": "12",
}
DATE_TOKEN = re.compile(
    r"^(\d{1,2})/(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)$",
    re.IGNORECASE,
)
AMOUNT_TOKEN = re.compile(r"^[\d,]+\.\d{2}$")
YEAR_TOKEN = re.compile(r"^20[12]\d$")
HEADER_GAP = 30
Y_TOLERANCE = 2.5
GLUED_PHRASES = (
    ("TRASPASOENTRECUENTASPROPIAS", "TRASPASO ENTRE CUENTAS PROPIAS"),
    ("SPEIRECIBIDO", "SPEI RECIBIDO"),
    ("SPEIENVIADO", "SPEI ENVIADO"),
)


def extract_bbva_bytes(data: bytes) -> list[dict]:
    return extract_bbva_pdf(BytesIO(data))


def extract_bbva_pdf(source) -> list[dict]:
    with pdfplumber.open(source) as pdf:
        pages = [page.extract_words() or [] for page in pdf.pages]
    return deposits_from_pages(pages)


def deposits_from_pages(pages: list[list[dict]]) -> list[dict]:
    band: tuple[float, float] | None = None
    year = _find_year(pages)
    deposits: list[dict] = []
    for words in pages:
        lines = _lines(words)
        header = _header_band(lines)
        if header:
            band = (header[0], header[1])
        if not band:
            continue
        left, right = band
        header_top = header[2] if header else None
        block: list[list[dict]] = []

        def flush() -> None:
            if not block:
                return
            amounts = [
                word
                for line in block
                for word in line
                if AMOUNT_TOKEN.match(word["text"])
                and left <= word["x0"] <= right
            ]
            if len(amounts) == 1:
                deposits.append(
                    {
                        "date": _movement_date(block, year),
                        "amount": round(_amount(amounts[0]["text"]), 2),
                        "concept": _concept(block),
                    }
                )
            block.clear()

        for line in lines:
            if header_top is not None and line[0]["top"] <= header_top + 2:
                continue
            if _is_movement_start(line):
                flush()
                block = [line]
            elif block:
                block.append(line)
        flush()
    return deposits


def _lines(words: list[dict]) -> list[list[dict]]:
    ordered = sorted(words, key=lambda word: (word["top"], word["x0"]))
    lines: list[list[dict]] = []
    for word in ordered:
        if not lines or abs(word["top"] - lines[-1][0]["top"]) > Y_TOLERANCE:
            lines.append([word])
        else:
            lines[-1].append(word)
    for line in lines:
        line.sort(key=lambda word: word["x0"])
    return lines


def _header_band(lines: list[list[dict]]) -> tuple[float, float, float] | None:
    found: tuple[float, float, float] | None = None
    for line in lines:
        cargos = next(
            (word for word in line if word["text"].upper() == "CARGOS"),
            None,
        )
        abonos = next(
            (word for word in line if word["text"].upper() == "ABONOS"),
            None,
        )
        if not cargos or not abonos:
            continue
        if abonos["x0"] - cargos["x0"] < HEADER_GAP:
            continue
        saldo = next(
            (
                word
                for word in line
                if word["text"].upper() == "SALDO" and word["x0"] > abonos["x0"]
            ),
            None,
        )
        left = abonos["x0"] - 24
        right = abonos["x1"] + 20
        if saldo:
            right = min(right, saldo["x0"] - 8)
        if right <= left:
            continue
        found = (left, right, line[0]["top"])
    return found


def _is_movement_start(line: list[dict]) -> bool:
    return any(
        DATE_TOKEN.match(word["text"]) and word["x0"] < 30 for word in line
    )


def _movement_date(block: list[list[dict]], year: str | None) -> str | None:
    if not year:
        return None
    for line in block:
        for word in line:
            match = DATE_TOKEN.match(word["text"])
            if match and word["x0"] < 30:
                day = match.group(1).zfill(2)
                month = MONTHS[match.group(2).upper()]
                return f"{year}-{month}-{day}"
    return None


def _concept(block: list[list[dict]]) -> str:
    parts: list[str] = []
    for line in block:
        for word in line:
            if AMOUNT_TOKEN.match(word["text"]) or DATE_TOKEN.match(word["text"]):
                continue
            parts.append(word["text"])
    text = " ".join(parts)
    for glued, spaced in GLUED_PHRASES:
        text = re.sub(glued, spaced, text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()


def _amount(text: str) -> float:
    return float(text.replace(",", ""))


def _find_year(pages: list[list[dict]]) -> str | None:
    for words in pages[:2]:
        for word in words:
            if YEAR_TOKEN.match(word["text"]):
                return word["text"]
    return None
