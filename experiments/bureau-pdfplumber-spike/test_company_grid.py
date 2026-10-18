"""Checks the Personas Morales reader against a local sample PDF."""

import os
import unittest

from company_grid import extract_company_pdf

SAMPLE = os.environ.get(
    "PM_BUREAU_SAMPLE",
    r"c:\Users\mvina\OneDrive - Universidad Tecnológica Metropolitana\Documentos\Proyecto GF\PM\BURO DE CREDITO MODIEBO  30-08-2023.pdf",
)


@unittest.skipUnless(os.path.exists(SAMPLE), "sample company bureau PDF is not on this machine")
class CompanyGridTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = extract_company_pdf(SAMPLE)
        cls.by_account = {row["accountNumber"]: row for row in cls.rows}

    def test_reads_the_nine_active_credits(self):
        self.assertEqual(len(self.rows), 9)

    def test_arrendamiento_keeps_granted_balance_and_term(self):
        row = self.by_account["165928"]
        self.assertEqual(row["originalAmount"], 283_000)
        self.assertEqual(row["currentBalance"], 93_000)
        self.assertEqual(row["pastDueAmount"], 0)
        self.assertEqual(row["termDays"], 1581)
        self.assertEqual(row["classification"], "FIXED_PAYMENT")
        self.assertIn("ARREND", row["creditType"])

    def test_simple_credit(self):
        row = self.by_account["957038170026001"]
        self.assertEqual(row["originalAmount"], 2_000_000)
        self.assertEqual(row["currentBalance"], 1_700_000)
        self.assertEqual(row["termDays"], 1794)
        self.assertEqual(row["classification"], "FIXED_PAYMENT")

    def test_revolving_lines_keep_the_granted_amount(self):
        cemex = self.by_account["0050017615"]
        self.assertEqual(cemex["originalAmount"], 3_850_000)
        self.assertEqual(cemex["currentBalance"], 0)
        self.assertEqual(cemex["termDays"], 30)
        self.assertEqual(cemex["classification"], "REVOLVING")

        for account in ("777111002180", "776080405497"):
            row = self.by_account[account]
            self.assertEqual(row["originalAmount"], 3_000)
            self.assertEqual(row["currentBalance"], 0)
            self.assertEqual(row["classification"], "REVOLVING")

        card = self.by_account["4931663700612121"]
        self.assertEqual(card["originalAmount"], 2_500_000)
        self.assertEqual(card["currentBalance"], 2_400_000)
        self.assertEqual(card["termDays"], 0)
        self.assertEqual(card["classification"], "REVOLVING")


if __name__ == "__main__":
    unittest.main()
