"""BBVA ABONOS column against the Alimentos Rápidos covers, when the PDFs are present."""

import os
import unittest

from bbva_statement import deposits_from_pages, extract_bbva_pdf

CASE = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "casos", "alimentos-rapidos")
)
COVERS = {
    "04": (57, 6500476.45),
    "05": (52, 6920719.57),
    "06": (74, 3284670.19),
    "07": (98, 3840491.48),
    "08": (108, 3878523.89),
    "09": (145, 3503421.84),
}


def _word(text, x0, top, x1=None):
    return {"text": text, "x0": x0, "x1": x1 if x1 is not None else x0 + 20, "top": top}


class BbvaColumnTest(unittest.TestCase):
    def test_keeps_the_abono_and_drops_the_cargo_and_the_saldo(self):
        header = [
            _word("CARGOS", 377, 100, 413),
            _word("ABONOS", 434, 100, 470),
            _word("SALDO", 522, 100, 550),
        ]
        charge = [
            _word("01/ABR", 10, 140),
            _word("T17", 86, 140),
            _word("SPEI", 102, 140),
            _word("ENVIADO", 123, 140),
            _word("13,424.28", 371, 140),
            _word("93,674.17", 498, 140),
        ]
        deposit = [
            _word("02/ABR", 10, 180),
            _word("T20", 86, 180),
            _word("SPEI", 102, 180),
            _word("RECIBIDOBANAMEX", 123, 180),
            _word("182,000.00", 428, 180),
        ]
        continuation = [_word("0020426TRASPASOENTRECUENTASPROPIASRef.", 86, 192)]
        pages = [header + charge + deposit + continuation]
        rows = deposits_from_pages(pages)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["amount"], 182000.00)
        self.assertIn("TRASPASO ENTRE CUENTAS PROPIAS", rows[0]["concept"])
        self.assertNotIn("93,674.17", rows[0]["concept"])

    def test_ignores_the_cover_summary_labels(self):
        summary = [
            _word("Cargos", 349, 40, 376),
            _word("Abonos", 359, 40, 387),
        ]
        rows = deposits_from_pages([summary])
        self.assertEqual(rows, [])


@unittest.skipUnless(os.path.isdir(CASE), "Alimentos Rapidos PDFs are not on this machine")
class BbvaCoverAcceptanceTest(unittest.TestCase):
    def test_six_statements_match_the_cover(self):
        april = None
        for name in sorted(os.listdir(CASE)):
            key = name[:2]
            if key not in COVERS or not name.lower().endswith(".pdf"):
                continue
            rows = extract_bbva_pdf(os.path.join(CASE, name))
            count, total = COVERS[key]
            got = round(sum(row["amount"] for row in rows), 2)
            self.assertEqual(len(rows), count, name)
            self.assertEqual(got, total, name)
            if key == "04":
                april = rows
        self.assertIsNotNone(april)
        loan = next(row for row in april if row["amount"] == 570000)
        own = next(row for row in april if row["amount"] == 182000)
        self.assertIn("PRESTAMO", loan["concept"])
        self.assertIn("TRASPASO ENTRE CUENTAS PROPIAS", own["concept"])
