import asyncio
import time
import uuid
from typing import AsyncGenerator, Dict, Any

class RequestQueueManager:
    """
    Asynchronous FIFO queue for Ollama generation requests to prevent GPU/CPU saturation.
    Supports real-time queue position tracking and notification callbacks.
    """
    def __init__(self, max_concurrent: int = 1):
        self.max_concurrent = max_concurrent
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.queue = []  # List of waiting ticket dicts: [{'id': str, 'user_id': int, 'username': str, 'created_at': float}]
        self.active_requests = {}  # ticket_id -> request info
        self._lock = asyncio.Lock()

    async def get_queue_stats(self) -> Dict[str, Any]:
        async with self._lock:
            return {
                "active_count": len(self.active_requests),
                "queued_count": len(self.queue),
                "max_concurrent": self.max_concurrent
            }

    async def enter_queue(self, user_id: int, username: str) -> str:
        ticket_id = str(uuid.uuid4())
        async with self._lock:
            self.queue.append({
                "id": ticket_id,
                "user_id": user_id,
                "username": username,
                "created_at": time.time()
            })
        return ticket_id

    async def get_position(self, ticket_id: str) -> int:
        async with self._lock:
            for idx, item in enumerate(self.queue):
                if item["id"] == ticket_id:
                    return idx + 1
        return 0

    async def leave_queue_early(self, ticket_id: str):
        async with self._lock:
            self.queue = [item for item in self.queue if item["id"] != ticket_id]

    async def acquire_slot(self, ticket_id: str) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Yields status updates while waiting in queue, then acquires execution slot.
        """
        try:
            while True:
                # Check if we can acquire immediately
                if not self.semaphore.locked() and (len(self.queue) > 0 and self.queue[0]["id"] == ticket_id):
                    # We are first in queue and slot is open
                    await self.semaphore.acquire()
                    async with self._lock:
                        if self.queue and self.queue[0]["id"] == ticket_id:
                            self.queue.pop(0)
                        self.active_requests[ticket_id] = time.time()
                    yield {"status": "active", "position": 0, "message": "نوبت شما شد! در حال ارسال به هوش مصنوعی..."}
                    break
                else:
                    pos = await self.get_position(ticket_id)
                    total_waiting = len(self.queue)
                    yield {
                        "status": "waiting",
                        "position": pos,
                        "total_queued": total_waiting,
                        "message": f"درخواست شما در صف قرار گرفت. نوبت شما: نفر {pos} از {total_waiting}..."
                    }
                    await asyncio.sleep(0.8)
        except asyncio.CancelledError:
            await self.leave_queue_early(ticket_id)
            raise

    async def release_slot(self, ticket_id: str):
        async with self._lock:
            if ticket_id in self.active_requests:
                del self.active_requests[ticket_id]
            self.queue = [item for item in self.queue if item["id"] != ticket_id]
        
        try:
            self.semaphore.release()
        except ValueError:
            pass

request_queue = RequestQueueManager(max_concurrent=1)
