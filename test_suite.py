import os
import sys
import unittest

base = os.path.dirname(os.path.abspath(__file__))
if base not in sys.path:
    sys.path.insert(0, base)

from app.database import init_db, SessionLocal, User, ChatSession, ChatMessage, PromptLog
from app.auth import hash_password, verify_password, create_access_token, decode_access_token
from app.document_parser import extract_text_from_file
from app.cleanup_service import cleanup_old_records

class TestOllamaChatbotSystem(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        init_db()

    def test_01_password_hashing(self):
        pw = "mySecret123"
        hashed = hash_password(pw)
        self.assertTrue(verify_password(pw, hashed))
        self.assertFalse(verify_password("wrongSecret", hashed))
        print("[PASS] Password hashing and verification")

    def test_02_jwt_token(self):
        data = {"sub": "testuser", "role": "user"}
        token = create_access_token(data)
        decoded = decode_access_token(token)
        self.assertEqual(decoded["sub"], "testuser")
        self.assertEqual(decoded["role"], "user")
        print("[PASS] JWT creation and decoding")

    def test_04_document_parser_txt(self):
        sample_txt = "This is a test text for file processing.\nLine 2.".encode("utf-8")
        extracted = extract_text_from_file("sample.txt", sample_txt)
        self.assertIn("This is a test text", extracted)
        print("[PASS] TXT document parsing")

    def test_05_document_parser_pdf(self):
        from pypdf import PdfWriter
        import io
        writer = PdfWriter()
        writer.add_blank_page(width=200, height=200)
        pdf_bytes = io.BytesIO()
        writer.write(pdf_bytes)
        extracted = extract_text_from_file("test.pdf", pdf_bytes.getvalue())
        self.assertIsInstance(extracted, str)
        print("[PASS] PDF document parsing")

    def test_06_database_entities(self):
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.username == "unittester").first()
            if not user:
                user = User(username="unittester", password_hash=hash_password("pass123"), role="user", is_active=True)
                db.add(user)
                db.commit()
                db.refresh(user)

            sess = ChatSession(id="test-session-uuid-1", user_id=user.id, title="Test Chat", model_name="qwen:0.5b")
            db.merge(sess)
            db.commit()

            m1 = ChatMessage(session_id="test-session-uuid-1", user_id=user.id, role="user", content="Hello test")
            m2 = ChatMessage(session_id="test-session-uuid-1", user_id=user.id, role="assistant", content="Hello! How can I help?")
            db.add_all([m1, m2])
            db.commit()

            log = PromptLog(
                user_id=user.id,
                username_display=user.username,
                auth_type="jwt",
                model="qwen:0.5b",
                prompt="Hello test",
                response="Hello! How can I help?",
                latency_ms=120,
                ip_address="127.0.0.1",
                status="success"
            )
            db.add(log)
            db.commit()

            fetched_user = db.query(User).filter(User.id == user.id).first()
            self.assertGreaterEqual(len(fetched_user.sessions), 1)
            self.assertGreaterEqual(len(fetched_user.prompt_logs), 1)
            print("[PASS] Database entities and relationships")
        finally:
            db.close()

    def test_08_document_parser_docx(self):
        import io
        import docx
        doc = docx.Document()
        doc.add_heading("گزارش فنی پروژه", level=1)
        doc.add_paragraph("این یک پاراگراف آزمایشی برای بررسی استخراج فایل ورد است.")
        table = doc.add_table(rows=2, cols=2)
        table.rows[0].cells[0].text = "ستون ۱"
        table.rows[0].cells[1].text = "ستون ۲"
        table.rows[1].cells[0].text = "داده الف"
        table.rows[1].cells[1].text = "داده ب"
        
        buf = io.BytesIO()
        doc.save(buf)
        extracted = extract_text_from_file("report.docx", buf.getvalue())
        self.assertIn("گزارش فنی پروژه", extracted)
        self.assertIn("داده الف", extracted)
        self.assertIn("| ستون ۱ | ستون ۲ |", extracted)
        print("[PASS] DOCX Word document parsing with tables and headings")

    def test_09_document_parser_xlsx(self):
        import io
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "فروش_فصلی"
        ws.append(["ردیف", "نام کالا", "قیمت"])
        ws.append([1, "لپ‌تاپ", 45000000])
        ws.append([2, "موس", 850000])
        
        buf = io.BytesIO()
        wb.save(buf)
        extracted = extract_text_from_file("sales.xlsx", buf.getvalue())
        self.assertIn("فروش_فصلی", extracted)
        self.assertIn("لپ‌تاپ", extracted)
        self.assertIn("45000000", extracted)
        print("[PASS] XLSX Excel workbook parsing with tabular data")

    def test_07_retention_cleanup(self):
        db = SessionLocal()
        try:
            res = cleanup_old_records(db, retention_days=10)
            self.assertIn("deleted_messages", res)
            self.assertIn("deleted_logs", res)
            print("[PASS] 10-Day Retention cleanup executed:", res)
        finally:
            db.close()

if __name__ == "__main__":
    unittest.main(verbosity=2)