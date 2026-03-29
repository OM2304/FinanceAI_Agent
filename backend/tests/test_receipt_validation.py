import unittest
from datetime import date, timedelta

from backend.tools.receipt_validation import process_receipt_ocr


class TestReceiptValidation(unittest.TestCase):
    def test_invalid_image_type(self):
        result = process_receipt_ocr("random.jpg", ocr_text="A beautiful sunset at the beach", ocr_confidence=0.9)
        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "INVALID_IMAGE_TYPE")

    def test_invalid_file_type(self):
        result = process_receipt_ocr("receipt.txt", ocr_text="Total Amount: 10\nDate: 2026-03-29\n", ocr_confidence=0.9)
        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "INVALID_FILE")

    def test_low_confidence(self):
        result = process_receipt_ocr("receipt.jpg", ocr_text="Total Amount: 10\nDate: 2026-03-29\n", ocr_confidence=0.2)
        self.assertTrue(result["success"])
        self.assertTrue(result["is_manual_fix_required"])

    def test_missing_fields(self):
        result = process_receipt_ocr("receipt.png", ocr_text="Merchant: Demo\nDate: 2026-03-29\n", ocr_confidence=0.9)
        self.assertTrue(result["success"])
        self.assertTrue(result["is_manual_fix_required"])
        self.assertIsNone(result["extracted_data"]["amount"])

    def test_success(self):
        result = process_receipt_ocr(
            "receipt.pdf",
            ocr_text="Merchant: Demo Cafe\nDate: 2026-03-29\nTime: 13:05\nTotal Amount: INR 450.50\n",
            ocr_confidence=0.95,
            category="Food",
        )
        self.assertTrue(result["success"])
        self.assertFalse(result["is_manual_fix_required"])
        self.assertEqual(result["expense"]["amount"], "450.50")
        self.assertEqual(result["expense"]["date"], "2026-03-29")
        self.assertEqual(result["expense"]["category"], "Food")

    def test_future_date_rejected(self):
        tomorrow = (date.today() + timedelta(days=1)).isoformat()
        result = process_receipt_ocr(
            "receipt.png",
            ocr_text=f"Date: {tomorrow}\nTotal Amount: 100\n",
            ocr_confidence=0.9,
        )
        self.assertFalse(result["success"])
        self.assertEqual(result["error"], "VALIDATION_ERROR")


if __name__ == "__main__":
    unittest.main()
