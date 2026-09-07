import os
import re
import zipfile
import io
from pathlib import Path
from typing import Dict, Any, List, Optional
import yaml
from sqlalchemy.orm import Session
from app.database import Skill

SKILLS_DIR = Path("./skills")

class SkillService:
    def __init__(self, storage_dir: Path = SKILLS_DIR):
        self.storage_dir = storage_dir
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def parse_skill_markdown(self, text: str, filename: str = "") -> Dict[str, Any]:
        text_clean = text.strip()
        name = ""
        description = ""
        body_content = text_clean

        # Check for YAML frontmatter
        if text_clean.startswith("---"):
            parts = text_clean.split("---", 2)
            if len(parts) >= 3:
                frontmatter_str = parts[1]
                body_content = parts[2].strip()
                try:
                    data = yaml.safe_load(frontmatter_str)
                    if isinstance(data, dict):
                        name = str(data.get("name") or data.get("title") or "").strip()
                        description = str(data.get("description") or data.get("summary") or "").strip()
                except Exception:
                    pass

        # If name not in frontmatter, find first H1 header
        if not name:
            h1_match = re.search(r'^\s*#\s+(.+)$', body_content, flags=re.MULTILINE)
            if h1_match:
                name = h1_match.group(1).strip()

        # If still no name, deduce from filename or folder path
        if not name and filename:
            p = Path(filename)
            stem = p.stem
            if stem.lower() in ["skill", "skills", "readme", "index"] and p.parent.name:
                name = p.parent.name.replace("_", " ").replace("-", " ").title()
            else:
                name = stem.replace("_", " ").replace("-", " ").title()

        if not name:
            name = "مهارت نام‌گذاری‌نشده"

        # If description not found, extract first paragraph under heading
        if not description:
            lines = [line.strip() for line in body_content.splitlines() if line.strip()]
            for line in lines:
                if not line.startswith("#") and len(line) > 10:
                    description = line[:200]
                    if len(line) > 200:
                        description += "..."
                    break

        return {
            "name": name,
            "description": description or "دستورالعمل و راهنمای تخصصی",
            "content": text_clean
        }

    def save_file_to_disk(self, rel_path: str, content: str) -> str:
        # Sanitize rel_path
        clean_rel = rel_path.replace("\\", "/").strip("/.")
        if not clean_rel:
            clean_rel = "skill.md"
        dest_path = self.storage_dir / clean_rel
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        dest_path.write_text(content, encoding="utf-8")
        return str(clean_rel)

    def import_single_skill(self, db: Session, content: str, filename: str, is_active: bool = True) -> Skill:
        parsed = self.parse_skill_markdown(content, filename)
        name = parsed["name"]
        description = parsed["description"]

        saved_path = self.save_file_to_disk(filename, content)

        # Check existing by name
        existing = db.query(Skill).filter(Skill.name == name).first()
        if existing:
            existing.description = description
            existing.content = content
            existing.filename = saved_path
            existing.is_active = is_active
            db.commit()
            db.refresh(existing)
            return existing
        else:
            new_skill = Skill(
                name=name,
                description=description,
                content=content,
                filename=saved_path,
                is_active=is_active
            )
            db.add(new_skill)
            db.commit()
            db.refresh(new_skill)
            return new_skill

    def scan_directory(self, dir_path_str: str, db: Session) -> Dict[str, Any]:
        p = Path(dir_path_str).resolve()
        if not p.exists():
            raise FileNotFoundError(f"مسیر مورد نظر یافت نشد: {dir_path_str}")
        if not p.is_dir():
            raise NotADirectoryError(f"مسیر مشخص شده یک پوشه نیست: {dir_path_str}")

        imported_count = 0
        skipped_count = 0
        skills_added = []
        errors = []

        # Find all .md files recursively
        for file_path in p.rglob("*"):
            if file_path.is_file() and file_path.suffix.lower() in [".md", ".markdown"]:
                try:
                    rel_name = file_path.relative_to(p).as_posix()
                    content = file_path.read_text(encoding="utf-8", errors="replace")
                    if content.strip():
                        skill = self.import_single_skill(db, content, rel_name, is_active=True)
                        skills_added.append({
                            "id": skill.id,
                            "name": skill.name,
                            "filename": rel_name
                        })
                        imported_count += 1
                    else:
                        skipped_count += 1
                except Exception as e:
                    errors.append(f"خطا در پردازش {file_path.name}: {str(e)}")

        return {
            "total_found": imported_count + skipped_count,
            "imported": imported_count,
            "skipped": skipped_count,
            "skills": skills_added,
            "errors": errors
        }

    def import_zip_archive(self, zip_bytes: bytes, db: Session) -> Dict[str, Any]:
        imported_count = 0
        skills_added = []
        errors = []

        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for item in zf.infolist():
                if not item.is_dir() and item.filename.lower().endswith((".md", ".markdown")):
                    try:
                        with zf.open(item) as f:
                            raw = f.read()
                            content = raw.decode("utf-8", errors="replace")
                            if content.strip():
                                skill = self.import_single_skill(db, content, item.filename, is_active=True)
                                skills_added.append({
                                    "id": skill.id,
                                    "name": skill.name,
                                    "filename": item.filename
                                })
                                imported_count += 1
                    except Exception as e:
                        errors.append(f"خطا در فایل زیپ {item.filename}: {str(e)}")

        return {
            "imported": imported_count,
            "skills": skills_added,
            "errors": errors
        }

skill_service = SkillService()

