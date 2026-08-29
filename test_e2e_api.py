import os
import sys
import unittest
from fastapi.testclient import TestClient

base = r"C:\Users\IME\.gemini\antigravity\scratch\ollama_chatbot"
sys.path.insert(0, base)

from app.main import app
from app.config import settings

class TestEndToEndChatbotAPI(unittest.TestCase):

    def test_full_pipeline(self):
        with TestClient(app) as client:
            # 1. Check Root Endpoint
            res = client.get("/")
            self.assertEqual(res.status_code, 200)
            self.assertIn("text/html", res.headers.get("content-type", ""))
            print("[PASS] GET / served HTML successfully")

            # 2. Login as Default Admin
            login_res = client.post("/api/auth/login", json={
                "username": settings.DEFAULT_ADMIN_USERNAME,
                "password": settings.DEFAULT_ADMIN_PASSWORD
            })
            self.assertEqual(login_res.status_code, 200)
            admin_data = login_res.json()
            admin_token = admin_data["access_token"]
            admin_headers = {"Authorization": f"Bearer {admin_token}"}
            print("[PASS] POST /api/auth/login authenticated default admin")

            # 3. Admin creates a new User
            uname = f"staff_{os.urandom(3).hex()}"
            upass = "StaffPassword123!"
            create_res = client.post("/api/admin/users", headers=admin_headers, json={
                "username": uname,
                "password": upass,
                "token_quota": 50000,
                "role": "user"
            })
            self.assertEqual(create_res.status_code, 200)
            user_data = create_res.json()
            creds = user_data["credentials"]
            self.assertEqual(creds["username"], uname)
            print(f"[PASS] Admin created user '{uname}' successfully")

            # 4. User logs in with the credentials provided by admin
            user_login = client.post("/api/auth/login", json={
                "username": uname,
                "password": upass
            })
            self.assertEqual(user_login.status_code, 200)
            user_token = user_login.json()["access_token"]
            user_headers = {"Authorization": f"Bearer {user_token}"}
            print(f"[PASS] User '{uname}' logged in successfully")

            # 5. Create a Chat Session for User
            session_res = client.post("/api/chat/sessions", headers=user_headers, json={
                "title": "گفتگوی جدید"
            })
            self.assertEqual(session_res.status_code, 200)
            session_id = session_res.json()["id"]

            # 6. List Sessions
            sessions_list_res = client.get("/api/chat/sessions", headers=user_headers)
            self.assertEqual(sessions_list_res.status_code, 200)
            self.assertTrue(any(s["id"] == session_id for s in sessions_list_res.json()))

            # 7. Rename Session
            rename_res = client.patch(f"/api/chat/sessions/{session_id}?title=Custom+Topic", headers=user_headers)
            self.assertEqual(rename_res.status_code, 200)
            print("[PASS] User session created, listed, and renamed")

            # 8. Check Admin Logs and Stats
            logs_res = client.get("/api/admin/logs", headers=admin_headers)
            self.assertEqual(logs_res.status_code, 200)
            logs_data = logs_res.json()
            print(f"[PASS] Admin Logs count: {logs_data['total']}")

            stats_res = client.get("/api/admin/stats", headers=admin_headers)
            self.assertEqual(stats_res.status_code, 200)
            stats = stats_res.json()
            self.assertIn("total_users", stats)
            self.assertIn("total_messages", stats)
            print(f"[PASS] Admin Stats verified: {stats}")

if __name__ == "__main__":
    unittest.main()