import unittest
from datetime import date, timedelta

from backend.tools.transaction_validation import TransactionConfirmModel


class TestTransactionValidation(unittest.TestCase):
    def test_valid_payload_normalizes_time(self):
        tx = TransactionConfirmModel.parse_obj(
            {
                "amount": "12.50",
                "receiver": "Demo Store",
                "sender": "Self",
                "date": "2026-03-29",
                "time": "1:05 PM",
                "category": "Food",
                "transaction_id": "ABCD1234",
                "ai_confidence": 0.75,
                "corrected": False,
            }
        )
        self.assertEqual(tx.time, "13:05")
        self.assertEqual(tx.date.isoformat(), "2026-03-29")

    def test_rejects_future_date(self):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        with self.assertRaises(Exception):
            TransactionConfirmModel.parse_obj(
                {
                    "amount": "10.00",
                    "receiver": "X",
                    "sender": "Self",
                    "date": tomorrow,
                    "time": "10:00",
                    "category": "Other",
                }
            )

    def test_rejects_invalid_time(self):
        with self.assertRaises(Exception):
            TransactionConfirmModel.parse_obj(
                {
                    "amount": "10.00",
                    "receiver": "Demo Store",
                    "sender": "Self",
                    "date": "2026-03-29",
                    "time": "99:99",
                    "category": "Other",
                }
            )

    def test_rejects_invalid_category(self):
        with self.assertRaises(Exception):
            TransactionConfirmModel.parse_obj(
                {
                    "amount": "10.00",
                    "receiver": "Demo Store",
                    "sender": "Self",
                    "date": "2026-03-29",
                    "time": "10:00",
                    "category": "Gambling",
                }
            )

    def test_rejects_negative_amount(self):
        with self.assertRaises(Exception):
            TransactionConfirmModel.parse_obj(
                {
                    "amount": "-1",
                    "receiver": "Demo Store",
                    "sender": "Self",
                    "date": "2026-03-29",
                    "time": "10:00",
                    "category": "Other",
                }
            )


if __name__ == "__main__":
    unittest.main()

