import io
import re
import csv
from typing import Optional
from pypdf import PdfReader

try:
    import docx
except ImportError:
    docx = None

try:
    import openpyxl
except ImportError:
    openpyxl = None

def extract_text_from_pdf(content: bytes) -> str:
    """Extracts plain text with page markers from a PDF file."""
    try:
        reader = PdfReader(io.BytesIO(content))
        extracted_pages = []
        for idx, page in enumerate(reader.pages):
            text = page.extract_text() or ""
            clean_text = text.strip()
            if clean_text:
                extracted_pages.append(f"--- [صفحه {idx + 1}] ---\n{clean_text}")
        if not extracted_pages:
            return "[توجه: فایل PDF فاقد متن قابل خواندن متنی است (احتمالاً شامل تصاویر اسکن‌شده می‌باشد).]"
        return "\n\n".join(extracted_pages)
    except Exception as e:
        return f"[خطا در استخراج متن PDF: {str(e)}]"

def extract_text_from_docx(content: bytes) -> str:
    """Extracts structured paragraphs and tables from a Word (.docx) document."""
    if docx is None:
        return "[کتابخانه python-docx نصب نیست.]"
    try:
        doc = docx.Document(io.BytesIO(content))
        elements = []

        # 1. Paragraphs
        for p in doc.paragraphs:
            text = p.text.strip()
            if text:
                if p.style.name.startswith("Heading"):
                    elements.append(f"### {text}")
                else:
                    elements.append(text)

        # 2. Tables
        for t_idx, table in enumerate(doc.tables):
            table_lines = [f"\n[جدول شماره {t_idx + 1}]"]
            headers_done = False
            for row in table.rows:
                cells = [c.text.strip().replace("\n", " ") for c in row.cells]
                # Avoid completely empty rows
                if any(cells):
                    table_lines.append("| " + " | ".join(cells) + " |")
                    if not headers_done:
                        table_lines.append("| " + " | ".join(["---"] * len(cells)) + " |")
                        headers_done = True
            if len(table_lines) > 1:
                elements.append("\n".join(table_lines))

        if not elements:
            return "[فایل Word خالی است یا متنی در آن یافت نشد.]"
        return "\n\n".join(elements)
    except Exception as e:
        return f"[خطا در استخراج متن فایل Word: {str(e)}]"

def extract_text_from_xlsx(content: bytes) -> str:
    """Extracts all sheets and tabular rows from an Excel (.xlsx / .xlsm) file."""
    if openpyxl is None:
        return "[کتابخانه openpyxl نصب نیست.]"
    try:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        sheet_outputs = []

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            sheet_lines = [f"### برگه اکسل: {sheet_name}"]
            row_count = 0
            
            for row in ws.iter_rows(values_only=True):
                # Filter out None and strip strings
                formatted_cells = []
                for cell in row:
                    if cell is None:
                        formatted_cells.append("")
                    else:
                        formatted_cells.append(str(cell).strip().replace("\n", " "))
                
                # If row has any non-empty cell
                if any(formatted_cells):
                    sheet_lines.append("| " + " | ".join(formatted_cells) + " |")
                    if row_count == 0:
                        sheet_lines.append("| " + " | ".join(["---"] * len(formatted_cells)) + " |")
                    row_count += 1
                    
                    # Limit very large sheets to 500 rows to prevent context blowing
                    if row_count > 500:
                        sheet_lines.append(f"\n[... ادامه دارد: نمایش تا سطر ۵۰۰ برگه {sheet_name}]")
                        break

            if row_count > 0:
                sheet_outputs.append("\n".join(sheet_lines))

        if not sheet_outputs:
            return "[فایل اکسل فاقد داده یا خالی است.]"
        return "\n\n".join(sheet_outputs)
    except Exception as e:
        return f"[خطا در استخراج متن فایل اکسل: {str(e)}]"

def extract_text_from_csv(content: bytes) -> str:
    """Extracts and formats CSV data into a Markdown table."""
    decoded_text = decode_raw_text(content)
    try:
        reader = csv.reader(io.StringIO(decoded_text))
        lines = []
        headers_done = False
        for idx, row in enumerate(reader):
            if any(row):
                clean_row = [c.strip().replace("\n", " ") for c in row]
                lines.append("| " + " | ".join(clean_row) + " |")
                if not headers_done:
                    lines.append("| " + " | ".join(["---"] * len(clean_row)) + " |")
                    headers_done = True
                if idx > 500:
                    lines.append("\n[... ادامه دارد: نمایش تا سطر ۵۰۰ فایل CSV]")
                    break
        if lines:
            return "\n".join(lines)
    except Exception:
        pass
    return decoded_text

def decode_raw_text(content: bytes) -> str:
    """Tries multiple common encodings to decode text bytes."""
    for enc in ["utf-8", "utf-8-sig", "windows-1256", "cp1252", "latin-1"]:
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")

def extract_text_from_file(filename: str, content: bytes) -> str:
    """
    Unified extractor for PDF, Word (DOCX/DOC), Excel (XLSX/XLS/CSV), and plain text/code files.
    """
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    CODE_EXTENSIONS = {"py", "js", "ts", "jsx", "tsx", "html", "css", "sh", "bat", "sql", "cpp", "c", "h", "java", "go", "rs", "php", "rb"}
    if ext in CODE_EXTENSIONS:
        return "[توجه: این سامانه منحصراً برای امور اداری طراحی شده و فایل‌های کدهای برنامه‌نویسی یا اسکریپت پشتیبانی نمی‌شوند. لطفاً اسناد اداری نظیر PDF، Word، Excel یا متنی ارسال فرمایید.]"

    if ext == "pdf":
        return extract_text_from_pdf(content)
    elif ext in ["docx", "doc"]:
        return extract_text_from_docx(content)
    elif ext in ["xlsx", "xlsm", "xls"]:
        return extract_text_from_xlsx(content)
    elif ext in ["csv", "tsv"]:
        return extract_text_from_csv(content)
    elif ext in ["txt", "md", "json", "log", "yaml", "yml", "xml"]:
        return decode_raw_text(content)
    else:
        # Fallback raw decode
        return decode_raw_text(content)
