import datetime
from sqlalchemy.orm import Session
from app.config import settings
from app.database import ChatMessage, PromptLog, ChatSession, User

def reset_all_daily_tokens(db: Session, target_date: datetime.date = None) -> int:
    today = target_date or datetime.date.today()
    updated = db.query(User).filter(User.last_token_reset_date < today).update({
        "tokens_used": 0,
        "last_token_reset_date": today
    }, synchronize_session=False)
    db.commit()
    return updated

def cleanup_old_records(db: Session, retention_days: int = settings.RETENTION_DAYS) -> dict:
    """
    Deletes messages, prompt logs, and orphaned sessions older than `retention_days`,
    and resets daily token quotas for the new day.
    """
    cutoff_date = datetime.datetime.utcnow() - datetime.timedelta(days=retention_days)
    
    # 1. Delete old messages
    del_messages = db.query(ChatMessage).filter(ChatMessage.created_at < cutoff_date).delete(synchronize_session=False)
    
    # 2. Delete old prompt logs
    del_logs = db.query(PromptLog).filter(PromptLog.created_at < cutoff_date).delete(synchronize_session=False)
    
    # 3. Clean up sessions that have no messages and were created before cutoff
    del_sessions = db.query(ChatSession).filter(
        ChatSession.updated_at < cutoff_date,
        ~ChatSession.messages.any()
    ).delete(synchronize_session=False)

    # 4. Reset daily tokens for all users
    reset_users = reset_all_daily_tokens(db)

    db.commit()

    return {
        "cutoff_date": cutoff_date.isoformat(),
        "deleted_messages": del_messages,
        "deleted_logs": del_logs,
        "deleted_empty_sessions": del_sessions,
        "reset_daily_tokens_users": reset_users
    }
