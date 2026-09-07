import io
import sys
import unittest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

base = r"C:\Users\IME\.gemini\antigravity\scratch\ollama_chatbot"
sys.path.insert(0, base)

from app.main import app
from app.config import settings

class TestChatWithFile(unittest.TestCase):

    def test_file_upload_chat(self):
        with TestClient(app) as client:
            # Login
            res = client.post("/api/auth/login", json={"username": settings.DEFAULT_ADMIN_USERNAME, "password": settings.DEFAULT_ADMIN_PASSWORD})
            token = res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # Create sample PDF in memory
            writer = PdfWriter()
            page = writer.add_blank_page(width=300, height=300)
            pdf_stream = io.BytesIO()
            writer.write(pdf_stream)
            pdf_bytes = pdf_stream.getvalue()

            # Send chat with PDF attached
            files = {
                "file": ("sample_report.pdf", pdf_bytes, "application/pdf")
            }
            import uuid
            session_id = str(uuid.uuid4())
            data = {
                "session_id": session_id,
                "prompt": "لطفاً این فایل را بررسی کن",
                "model": "qwen:0.5b"
            }

            res = client.post("/api/chat/send", data=data, files=files, headers=headers)
            self.assertEqual(res.status_code, 200)
            self.assertIn("text/event-stream", res.headers.get("content-type", ""))
            print("[PASS] Multi-part PDF upload and chat streaming endpoint verified successfully!")

if __name__ == "__main__":
    unittest.main()