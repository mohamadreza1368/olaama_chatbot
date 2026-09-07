import io
import os
import zipfile
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal, Skill, User
from app.auth import create_access_token
from app.skill_service import skill_service

client = TestClient(app)

@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture
def admin_token(db):
    admin = db.query(User).filter(User.username == "admin").first()
    if not admin:
        from app.auth import hash_password
        admin = User(username="admin", password_hash=hash_password("admin123"), role="admin", is_active=True)
        db.add(admin)
        db.commit()
    return create_access_token({"sub": admin.username, "role": admin.role, "id": admin.id})

@pytest.fixture
def user_token(db):
    user = db.query(User).filter(User.username == "test_skill_user").first()
    if not user:
        from app.auth import hash_password
        user = User(username="test_skill_user", password_hash=hash_password("pass123"), role="user", is_active=True)
        db.add(user)
        db.commit()
    return create_access_token({"sub": user.username, "role": user.role, "id": user.id})

def test_parse_skill_frontmatter():
    md = """---
name: تحلیل‌گر بازار مالی
description: تحلیل بنیادی و تکنیکال نمادهای بورسی
---
# دستورالعمل
پاسخ‌ها باید با استناد به گزارش‌های مالی ارائه شوند.
"""
    res = skill_service.parse_skill_markdown(md, "financial.md")
    assert res["name"] == "تحلیل‌گر بازار مالی"
    assert "بنیادی" in res["description"]
    assert "استناد به گزارش‌های مالی" in res["content"]

def test_parse_skill_heading_fallback():
    md = """# مشاور هوشمند معاملات کالا
این مهارت برای مشاوره در حوزه رینگ فیزیکی و مشتقه بورس کالا استفاده می‌شود.
"""
    res = skill_service.parse_skill_markdown(md, "commodity.md")
    assert res["name"] == "مشاور هوشمند معاملات کالا"
    assert "رینگ فیزیکی" in res["description"]

def test_parse_skill_filename_fallback():
    md = """پاسخ‌ها باید رسمی، کوتاه و دقیق باشند."""
    res = skill_service.parse_skill_markdown(md, "formal_tone.md")
    assert res["name"] == "Formal Tone"
    assert "رسمی، کوتاه و دقیق" in res["description"]

def test_admin_upload_single_skill(admin_token):
    md_content = """---
name: کدنویس پایتون
description: استانداردهای کدنویسی PEP8
---
همیشه کدها را به صورت تمیز و با کامنت فارسی بنویس.
"""
    files = [("files", ("python_guide.md", md_content.encode("utf-8"), "text/markdown"))]
    res = client.post(
        "/api/admin/skills/upload",
        headers={"Authorization": f"Bearer {admin_token}"},
        files=files
    )
    assert res.status_code == 200
    data = res.json()
    assert data["imported_count"] == 1
    assert data["skills"][0]["name"] == "کدنویس پایتون"

def test_admin_upload_folder_skills(admin_token):
    file1 = ("files", ("analysis.md", "# مهارت تحلیل داده\nتحلیل دیتا با پانداز.".encode("utf-8"), "text/markdown"))
    file2 = ("files", ("reporting.md", "# مهارت گزارش‌نویسی\nفرمت خروجی گزارش‌ها.".encode("utf-8"), "text/markdown"))
    
    import json
    rel_paths = json.dumps(["data_team/analysis.md", "data_team/reporting.md"])

    res = client.post(
        "/api/admin/skills/upload",
        headers={"Authorization": f"Bearer {admin_token}"},
        files=[file1, file2],
        data={"relative_paths": rel_paths}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["imported_count"] == 2

def test_admin_upload_zip_skills(admin_token):
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zf:
        zf.writestr("skills/security/SKILL.md", "# امنیت اطلاعات\nرعایت محرمانگی داده‌ها.")
        zf.writestr("skills/sql/query.md", "# بهینه‌سازی SQL\nایندکس‌ها و کوئری‌ها.")

    zip_buffer.seek(0)
    files = {"file": ("skills.zip", zip_buffer.read(), "application/zip")}

    res = client.post(
        "/api/admin/skills/upload-zip",
        headers={"Authorization": f"Bearer {admin_token}"},
        files=files
    )
    assert res.status_code == 200
    data = res.json()
    assert data["imported_count"] == 2

def test_admin_scan_local_folder(admin_token, tmp_path):
    sub = tmp_path / "imported_skills"
    sub.mkdir()
    (sub / "skill1.md").write_text("# مهارت تستی یک\nتوضیحات تست ۱", encoding="utf-8")
    (sub / "skill2.md").write_text("# مهارت تستی دو\nتوضیحات تست ۲", encoding="utf-8")

    res = client.post(
        "/api/admin/skills/scan-folder",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"folder_path": str(sub)}
    )
    assert res.status_code == 200
    data = res.json()
    assert data["imported_count"] == 2

def test_admin_skills_crud_and_toggle(admin_token, db):
    # List skills
    res = client.get("/api/admin/skills", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert len(data["items"]) > 0

    first_id = data["items"][0]["id"]

    # Toggle active
    toggle_res = client.patch(f"/api/admin/skills/{first_id}/toggle", headers={"Authorization": f"Bearer {admin_token}"})
    assert toggle_res.status_code == 200
    
    # Update skill
    update_res = client.put(
        f"/api/admin/skills/{first_id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"name": "نام ویرایش‌شده مهارت", "description": "توضیحات جدید"}
    )
    assert update_res.status_code == 200
    assert update_res.json()["skill"]["name"] == "نام ویرایش‌شده مهارت"

    # Toggle all active
    toggle_all_res = client.post(
        "/api/admin/skills/toggle-all",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"is_active": True}
    )
    assert toggle_all_res.status_code == 200

    # User active skills list in chat
    user = db.query(User).filter(User.username == "admin").first()
    chat_skills_res = client.get("/api/chat/skills", headers={"Authorization": f"Bearer {admin_token}"})
    assert chat_skills_res.status_code == 200
    assert len(chat_skills_res.json()) > 0

    # Delete skill
    del_res = client.delete(f"/api/admin/skills/{first_id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert del_res.status_code == 200

