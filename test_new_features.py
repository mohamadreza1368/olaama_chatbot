import os
import sys
import unittest
import asyncio
from fastapi.testclient import TestClient

base = os.path.dirname(os.path.abspath(__file__))
if base not in sys.path:
    sys.path.insert(0, base)

from app.main import app
from app.routers.chat_router import generate_smart_title
from app.queue_service import request_queue
from app.config import settings

class TestAdvancedFeaturesAndQueue(unittest.TestCase):

    def test_01_smart_title_summarizer(self):
        title1 = generate_smart_title("سلام، لطفاً یک کد پایتون برای ساخت وب‌سرور بنویس")
        self.assertNotIn("سلام", title1)
        self.assertNotIn("لطفاً", title1)
        self.assertTrue(len(title1) > 0)
        print("[PASS] Smart title summarizer:", title1)

    def test_02_global_system_prompt_management(self):
        with TestClient(app) as client:
            login_res = client.post("/api/auth/login", json={
                "username": settings.DEFAULT_ADMIN_USERNAME,
                "password": settings.DEFAULT_ADMIN_PASSWORD
            })
            admin_token = login_res.json()["access_token"]
            admin_headers = {"Authorization": f"Bearer {admin_token}"}

            # Update Global System Prompt
            new_prompt = "شما یک دستیار فنی خبره در برنامه‌نویسی پایتون و هوش مصنوعی هستید."
            set_res = client.post("/api/admin/system-settings/prompt", headers=admin_headers, json={
                "system_prompt": new_prompt
            })
            self.assertEqual(set_res.status_code, 200)

            # Check GET /system-settings
            get_res = client.get("/api/admin/system-settings", headers=admin_headers)
            self.assertEqual(get_res.status_code, 200)
            data = get_res.json()
            self.assertEqual(data["system_prompt"], new_prompt)
            print("[PASS] Global System Prompt configured and verified:", data["system_prompt"])

    def test_03_request_queue_manager_flow(self):
        async def run_queue_test():
            ticket1 = await request_queue.enter_queue(1, "user1")
            ticket2 = await request_queue.enter_queue(2, "user2")

            pos1 = await request_queue.get_position(ticket1)
            pos2 = await request_queue.get_position(ticket2)

            self.assertEqual(pos1, 1)
            self.assertEqual(pos2, 2)

            stats = await request_queue.get_queue_stats()
            self.assertEqual(stats["queued_count"], 2)

            # Cleanup
            await request_queue.leave_queue_early(ticket1)
            await request_queue.leave_queue_early(ticket2)

        asyncio.run(run_queue_test())
        print("[PASS] Request Queue FIFO ordering and position tracking verified")

    def test_04_send_file_only_without_prompt(self):
        with TestClient(app) as client:
            login_res = client.post("/api/auth/login", json={
                "username": settings.DEFAULT_ADMIN_USERNAME,
                "password": settings.DEFAULT_ADMIN_PASSWORD
            })
            token = login_res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # Create a session
            sess_res = client.post("/api/chat/sessions", headers=headers, json={"title": "Test File Only"})
            sess_id = sess_res.json()["id"]

            # Send file only without prompt
            files = {
                "file": ("notes.txt", b"Project Goals:\n1. Increase performance.\n2. Fix UI bugs.", "text/plain")
            }
            data = {
                "session_id": sess_id,
                "prompt": ""
            }

            res = client.post("/api/chat/send", headers=headers, data=data, files=files)
            self.assertEqual(res.status_code, 200)
            self.assertIn("text/event-stream", res.headers.get("content-type", ""))
            print("[PASS] File-only submission without prompt successfully processed with 200 OK SSE stream")

    def test_05_reference_prompts_crud(self):
        with TestClient(app) as client:
            login_res = client.post("/api/auth/login", json={
                "username": settings.DEFAULT_ADMIN_USERNAME,
                "password": settings.DEFAULT_ADMIN_PASSWORD
            })
            token = login_res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Update all reference prompts
            payload = {
                "system_prompt": "Custom system prompt test",
                "file_summary_prompt": "Custom summary instruction for {filename}",
                "file_question_prompt": "Custom question template for {filename}: {prompt}"
            }
            post_res = client.post("/api/admin/prompts", headers=headers, json=payload)
            self.assertEqual(post_res.status_code, 200)

            # 2. Get and verify
            get_res = client.get("/api/admin/prompts", headers=headers)
            self.assertEqual(get_res.status_code, 200)
            data = get_res.json()
            self.assertEqual(data["system_prompt"], "Custom system prompt test")
            self.assertEqual(data["file_summary_prompt"], "Custom summary instruction for {filename}")
            self.assertEqual(data["file_question_prompt"], "Custom question template for {filename}: {prompt}")

            # 3. Reset to default
            reset_res = client.post("/api/admin/prompts/reset", headers=headers)
            self.assertEqual(reset_res.status_code, 200)
            reset_data = reset_res.json()["prompts"]
            self.assertIn("بخش اداری", reset_data["system_prompt"])
            print("[PASS] Reference Prompts CRUD & Reset verified successfully")

    def test_06_soft_delete_session(self):
        from app.database import SessionLocal, ChatSession
        with TestClient(app) as client:
            login_res = client.post("/api/auth/login", json={
                "username": settings.DEFAULT_ADMIN_USERNAME,
                "password": settings.DEFAULT_ADMIN_PASSWORD
            })
            token = login_res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Create a session
            create_res = client.post("/api/chat/sessions", headers=headers, json={"title": "Session to Soft Delete"})
            self.assertEqual(create_res.status_code, 200)
            sess_id = create_res.json()["id"]

            # 2. Verify it shows in GET /sessions
            list_res = client.get("/api/chat/sessions", headers=headers)
            self.assertTrue(any(s["id"] == sess_id for s in list_res.json()))

            # 3. Soft delete the session
            del_res = client.delete(f"/api/chat/sessions/{sess_id}", headers=headers)
            self.assertEqual(del_res.status_code, 200)

            # 4. Verify it no longer appears in GET /sessions
            list_res_after = client.get("/api/chat/sessions", headers=headers)
            self.assertFalse(any(s["id"] == sess_id for s in list_res_after.json()))

            # 5. Verify direct details GET returns 404
            get_detail = client.get(f"/api/chat/sessions/{sess_id}", headers=headers)
            self.assertEqual(get_detail.status_code, 404)

            # 6. Verify in the database that the record STILL EXISTS with is_deleted=True
            db = SessionLocal()
            try:
                db_sess = db.query(ChatSession).filter(ChatSession.id == sess_id).first()
                self.assertIsNotNone(db_sess)
                self.assertTrue(db_sess.is_deleted)
                print("[PASS] Session Soft Delete verified: hidden from UI, preserved in DB")
            finally:
                db.close()

    def test_07_pin_session_ordering(self):
        from app.database import SessionLocal, ChatSession
        with TestClient(app) as client:
            login_res = client.post("/api/auth/login", json={
                "username": settings.DEFAULT_ADMIN_USERNAME,
                "password": settings.DEFAULT_ADMIN_PASSWORD
            })
            token = login_res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            # 1. Create two sessions: Sess 1 and Sess 2
            res1 = client.post("/api/chat/sessions", headers=headers, json={"title": "Session Older"})
            self.assertEqual(res1.status_code, 200)
            id1 = res1.json()["id"]

            res2 = client.post("/api/chat/sessions", headers=headers, json={"title": "Session Newer"})
            self.assertEqual(res2.status_code, 200)
            id2 = res2.json()["id"]

            # 2. Pin the older session
            pin_res = client.post(f"/api/chat/sessions/{id1}/pin", headers=headers)
            self.assertEqual(pin_res.status_code, 200)
            self.assertTrue(pin_res.json()["is_pinned"])

            # 3. Check GET /sessions - pinned session MUST be first in list
            list_res = client.get("/api/chat/sessions", headers=headers)
            sessions = list_res.json()
            self.assertEqual(sessions[0]["id"], id1)
            self.assertTrue(sessions[0]["is_pinned"])

            # 4. Unpin the session
            unpin_res = client.post(f"/api/chat/sessions/{id1}/pin", headers=headers)
            self.assertEqual(unpin_res.status_code, 200)
            self.assertFalse(unpin_res.json()["is_pinned"])

            # 5. Clean up test sessions
            client.delete(f"/api/chat/sessions/{id1}", headers=headers)
            client.delete(f"/api/chat/sessions/{id2}", headers=headers)
            print("[PASS] Pinning session and top ordering verified successfully")

if __name__ == "__main__":
    unittest.main()