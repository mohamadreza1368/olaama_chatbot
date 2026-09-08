import os
import sys
import pytest
import io
import docx
import openpyxl

base = os.path.dirname(os.path.abspath(__file__))
if base not in sys.path:
    sys.path.insert(0, base)
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal, User, ChatSession, ChatMessage
from app.auth import create_access_token, hash_password
from app.export_service import export_to_docx, export_to_xlsx, detect_export_intent, parse_markdown_tables

client = TestClient(app)

@pytest.fixture
def auth_headers():
    db = SessionLocal()
    user = db.query(User).filter(User.username == "export_test_user").first()
    if not user:
        user = User(
            username="export_test_user",
            password_hash=hash_password("Pass1234!"),
            role="user",
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    token = create_access_token({"sub": user.username, "role": user.role})
    db.close()
    return {"Authorization": f"Bearer {token}"}

def test_detect_export_intent():
    assert detect_export_intent("این تحلیل را در قالب فایل ورد بده") == "docx"
    assert detect_export_intent("لطفا یک فایل اکسل از جدول بساز") == "xlsx"
    assert detect_export_intent("خروجی ورد و اکسل هر دو را می‌خواهم") == "both"
    assert detect_export_intent("دانلود گزارش در قالب docx") == "docx"
    assert detect_export_intent("فایل شیت اکسل بده") == "xlsx"
    assert detect_export_intent("امروز هوای تهران چطور است؟") is None

def test_parse_markdown_tables():
    md = """
    متن قبل از جدول
    | کالا | حجم (تن) | ارزش | وضعیت |
    |---|---|---|---|
    | مس | ۱۰۰ | ۱۰۰۰ | نرمال |
    | روی | ۵۰ | ۵۰۰ | مرزی |
    متن بعد از جدول
    """
    tables = parse_markdown_tables(md)
    assert len(tables) == 1
    assert tables[0]["headers"] == ["کالا", "حجم (تن)", "ارزش", "وضعیت"]
    assert len(tables[0]["rows"]) == 2
    assert tables[0]["rows"][0][0] == "مس"

def test_export_to_docx():
    md = """# گزارش معاملات بورس کالا
## جدول آماری
| کالا | قیمت پایه | حجم عرضه | وضعیت |
|---|---|---|---|
| فولاد | ۲۰,۰۰۰ | ۵,۰۰۰ | تایید |
| سیمان | ۱,۲۰۰ | ۱۰,۰۰۰ | نرمال |

### نکات پایانی
- رشد هفتگی مطلوب
- کنترل نوسانات
    """
    docx_bytes = export_to_docx(md, title="گزارش هفتگی بورس کالا")
    assert isinstance(docx_bytes, bytes)
    assert len(docx_bytes) > 2000
    
    # Read back with docx
    doc = docx.Document(io.BytesIO(docx_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text]
    assert any("گزارش هفتگی بورس کالا" in p for p in paragraphs)
    assert len(doc.tables) >= 1

def test_export_to_xlsx():
    md = """# آمار تالار پتروشیمی
| محصول | تناژ | نرخ | وضعیت |
|---|---|---|---|
| پلی‌اتیلن | ۵۰۰ | ۳۵,۰۰۰ | نرمال |
| متانول | ۱,۰۰۰ | ۱۸,۰۰۰ | مرزی |
    """
    xlsx_bytes = export_to_xlsx(md, title="آمار تالار پتروشیمی")
    assert isinstance(xlsx_bytes, bytes)
    assert len(xlsx_bytes) > 1000
    
    # Read back with openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes))
    assert len(wb.sheetnames) >= 1
    ws = wb.active
    assert ws.views.sheetView[0].rightToLeft is True

def test_api_export_post_docx(auth_headers):
    payload = {
        "format": "docx",
        "content": "# گزارش تستی\n\nاین یک تست برای خروجی ورد است.\n\n| ستون ۱ | ستون ۲ |\n|---|---|\n| مقدار ۱ | مقدار ۲ |",
        "title": "گزارش تست خودکار"
    }
    res = client.post("/api/chat/export", json=payload, headers=auth_headers)
    assert res.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in res.headers["content-type"]
    assert len(res.content) > 1000

def test_api_export_post_xlsx(auth_headers):
    payload = {
        "format": "xlsx",
        "content": "| نماد | معامله | تغییر |\n|---|---|---|\n| فولاد | ۱,۰۰۰ | +۲٪ |",
        "title": "اکسل تست خودکار"
    }
    res = client.post("/api/chat/export", json=payload, headers=auth_headers)
    assert res.status_code == 200
    assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in res.headers["content-type"]
    assert len(res.content) > 1000

def test_api_export_get(auth_headers):
    res = client.get("/api/chat/export?format=docx&content=تست%20محتوا&title=تست", headers=auth_headers)
    assert res.status_code == 200
    assert len(res.content) > 1000

def test_api_export_unauthorized():
    res = client.get("/api/chat/export?format=docx")
    assert res.status_code == 401
