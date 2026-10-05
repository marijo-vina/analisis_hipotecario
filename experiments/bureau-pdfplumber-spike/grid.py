"""Read a Buró de Crédito PDF into one row per credit.

Money columns have no borders, so line-based tables drop them. Word
coordinates are assigned to the header x of each column.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path

import pdfplumber

MONEY_RE = re.compile(r"^\$?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$")
MARKER_RE = re.compile(r"^\d{1,2}\.$")
MOP_RE = re.compile(r"^[0-9Uu\-]$")
YEAR_RE = re.compile(r"^(19|20)\d{2}$")
MAX_DIST = 18.0
MOP_MIN_X = 640.0
MOP_YEAR_Y = 8.0


def fold(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).upper()


@dataclass
class Token:
    text: str
    x: float
    y: float

    @property
    def amount(self) -> float | None:
        if not MONEY_RE.match(self.text):
            return None
        return float(self.text.replace(",", "").replace("$", ""))


@dataclass
class Credit:
    page: int
    marker: str
    institution: str
    account: str
    payment: float | None = None
    last_payment: float | None = None
    balance: float | None = None
    limit: float | None = None
    maximum: float | None = None
    overdue: float | None = None
    mop_codes: list[str] = field(default_factory=list)
    tokens: list[Token] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "page": self.page,
            "marker": self.marker,
            "institution": self.institution,
            "accountNumber": self.account or None,
            "paymentDueAmount": whole(self.payment),
            "lastPaymentAmount": whole(self.last_payment),
            "currentBalance": whole(self.balance),
            "creditLimit": whole(self.limit),
            "maxCredit": whole(self.maximum),
            "overdueAmount": whole(self.overdue),
            "mopCodes": self.mop_codes,
        }


def whole(value: float | None) -> int | float | None:
    if value is None:
        return None
    if value == int(value):
        return int(value)
    return value


def header_centers(words: list[dict]) -> dict[str, float] | None:
    centers: dict[str, float] = {}
    for word in words:
        label = fold(word["text"])
        x = float(word["x0"])
        if label == "PAGAR":
            centers["payment"] = x
        elif label == "ACTUAL" and x > 350:
            centers["balance"] = x
        elif label == "MAXIMO" and x > 300:
            centers["maximum"] = x
        elif label == "LIMITE" and 250 < x < 360:
            centers["limit"] = x
        elif label.startswith("ULTIMO") and x > 400:
            centers["last_payment"] = x
        elif label.startswith("MONTO") and 420 < x < 480:
            centers["overdue"] = x
    if "payment" not in centers:
        return None
    return centers


def collect_mop_codes(tokens: list[Token]) -> list[str]:
    """Single-character history cells aligned with a calendar year row.

    The last credit on a page otherwise swallows the footer ('6 DE14')
    and a closed-account legend (CC=CUENTA CANCELADA), which are not MOP.
    """
    year_ys = [
        token.y
        for token in tokens
        if YEAR_RE.match(token.text) and token.x >= 600
    ]
    codes: list[str] = []
    for token in sorted(tokens, key=lambda item: (item.y, item.x)):
        if token.x < MOP_MIN_X or not MOP_RE.match(token.text):
            continue
        if year_ys and not any(abs(token.y - year_y) <= MOP_YEAR_Y for year_y in year_ys):
            continue
        codes.append(token.text.upper())
    return codes


def nearest(tokens: list[Token], center: float) -> float | None:
    candidates = [
        token
        for token in tokens
        if token.amount is not None and abs(token.x - center) <= MAX_DIST and token.x > 140
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda token: (abs(token.x - center), token.y))
    return candidates[0].amount


def credits_on_page(page_no: int, words: list[dict], centers: dict[str, float]) -> list[Credit]:
    tokens = [Token(word["text"], float(word["x0"]), float(word["top"])) for word in words]
    tokens.sort(key=lambda token: (token.y, token.x))
    markers = [
        index
        for index, token in enumerate(tokens)
        if MARKER_RE.match(token.text) and token.x < 35
    ]
    found: list[Credit] = []
    for nth, start in enumerate(markers):
        end = markers[nth + 1] if nth + 1 < len(markers) else len(tokens)
        marker_y = tokens[start].y
        next_y = tokens[markers[nth + 1]].y if nth + 1 < len(markers) else None
        # The payment figure is often printed a couple of points above the
        # "1." marker. Keep it with this credit.
        preface = [
            token
            for token in tokens
            if token.amount is not None
            and token.x > 140
            and marker_y - 8 <= token.y < marker_y
        ]
        block = preface + [
            token
            for token in tokens[start:end]
            if not (
                next_y is not None
                and token.amount is not None
                and token.x > 140
                and token.y >= next_y - 8
            )
        ]
        name_parts: list[str] = []
        account = ""
        for token in block:
            if MARKER_RE.match(token.text) or token.x > 150:
                continue
            if token.text.isdigit() and len(token.text) >= 6 and token.y <= marker_y + 36:
                account = token.text
                continue
            if token.y > marker_y + 16 or MONEY_RE.match(token.text):
                continue
            name_parts.append(token.text)
        credit = Credit(
            page=page_no,
            marker=tokens[start].text,
            institution=" ".join(name_parts),
            account=account,
            tokens=block,
        )
        credit.payment = nearest(block, centers["payment"])
        if "last_payment" in centers:
            credit.last_payment = nearest(block, centers["last_payment"])
        if "balance" in centers:
            credit.balance = nearest(block, centers["balance"])
        if "limit" in centers:
            credit.limit = nearest(block, centers["limit"])
        if "maximum" in centers:
            credit.maximum = nearest(block, centers["maximum"])
        if "overdue" in centers:
            credit.overdue = nearest(block, centers["overdue"])
        credit.mop_codes = collect_mop_codes(block)
        found.append(credit)
    return found


def extract_pdf(source: str | Path | BytesIO) -> list[Credit]:
    rows: list[Credit] = []
    carried: dict[str, float] | None = None
    with pdfplumber.open(source) as pdf:
        for index, page in enumerate(pdf.pages, start=1):
            words = page.extract_words() or []
            centers = header_centers(words) or carried
            if centers is None:
                continue
            carried = centers
            rows.extend(credits_on_page(index, words, centers))
    return rows


def extract_bytes(data: bytes) -> list[Credit]:
    return extract_pdf(BytesIO(data))


def grid_payload(credits: list[Credit]) -> dict:
    return {"creditCount": len(credits), "credits": [credit.as_dict() for credit in credits]}
