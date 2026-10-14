import io
import re
import datetime
from typing import List, Dict, Any, Optional
import docx
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# --- XML Helper Functions for python-docx (RTL & Shading) ---

def set_cell_shading(cell, color_hex: str):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), color_hex)
    tcPr.append(shd)

def set_cell_margins(cell, top=120, bottom=120, start=160, end=160):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for margin_name, val in [('top', top), ('bottom', bottom), ('left', start), ('right', end)]:
        node = OxmlElement(f'w:{margin_name}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_paragraph_rtl(paragraph):
    pPr = paragraph._p.get_or_add_pPr()
    bidi = OxmlElement('w:bidi')
    bidi.set(qn('w:val'), '1')
    pPr.append(bidi)

def set_run_font_persian(run, font_name="Tahoma", size_pt=10.5, color_rgb=(51, 51, 51), bold=False, italic=False):
    run.font.name = font_name
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = RGBColor(*color_rgb)
    
    rPr = run._r.get_or_add_rPr()
    rFonts = OxmlElement('w:rFonts')
    rFonts.set(qn('w:ascii'), font_name)
    rFonts.set(qn('w:hAnsi'), font_name)
    rFonts.set(qn('w:cs'), font_name)
    rPr.append(rFonts)

def set_table_rtl(table):
    tblPr = table._tbl.tblPr
    bidiVisual = OxmlElement('w:bidiVisual')
    tblPr.append(bidiVisual)

def set_cell_border(cell, **kwargs):
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        edge_data = kwargs.get(edge)
        if edge_data:
            tag = f'w:{edge}'
            element = OxmlElement(tag)
            element.set(qn('w:val'), edge_data.get('val', 'single'))
            element.set(qn('w:sz'), str(edge_data.get('sz', 4)))
            element.set(qn('w:space'), '0')
            element.set(qn('w:color'), edge_data.get('color', 'D1D5DB'))
            tcBorders.append(element)
    tcPr.append(tcBorders)

# --- Markdown Table Parser ---

def parse_markdown_tables(text: str) -> List[Dict[str, Any]]:
    tables = []
    lines = text.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line.startswith('|') and line.endswith('|'):
            table_lines = [line]
            j = i + 1
            while j < len(lines) and lines[j].strip().startswith('|') and lines[j].strip().endswith('|'):
                table_lines.append(lines[j].strip())
                j += 1
            
            if len(table_lines) >= 2:
                sep_idx = -1
                for idx, tline in enumerate(table_lines[1:], 1):
                    if re.match(r'^\|(?:\s*:?-+:?\s*\|)+$', tline):
                        sep_idx = idx
                        break
                
                if sep_idx != -1:
                    header_line = table_lines[0]
                    headers = [c.strip() for c in header_line.split('|')[1:-1]]
                    data_rows = []
                    for row_line in table_lines[sep_idx + 1:]:
                        cells = [c.strip() for c in row_line.split('|')[1:-1]]
                        if any(cells):
                            if len(cells) < len(headers):
                                cells += [''] * (len(headers) - len(cells))
                            else:
                                cells = cells[:len(headers)]
                            data_rows.append(cells)
                    
                    if headers:
                        tables.append({
                            'headers': headers,
                            'rows': data_rows,
                            'raw': '\n'.join(table_lines)
                        })
            i = j
        else:
            i += 1
    return tables

# --- DOCX Exporter ---

def export_to_docx(content: str, title: str = "گزارش تحلیلی اداری", subtitle: str = "") -> bytes:
    doc = docx.Document()
    
    for section in doc.sections:
        section.page_width = Inches(8.27)
        section.page_height = Inches(11.69)
        section.top_margin = Inches(0.9)
        section.bottom_margin = Inches(0.9)
        section.left_margin = Inches(0.9)
        section.right_margin = Inches(0.9)
        
        header = section.header
        hp = header.paragraphs[0]
        hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        set_paragraph_rtl(hp)
        hrun = hp.add_run("بورس کالای ایران (IME) | دستیار هوشمند سازمانی")
        set_run_font_persian(hrun, font_name="Tahoma", size_pt=8.5, color_rgb=(120, 120, 120))
        
        footer = section.footer
        fp = footer.paragraphs[0]
        fp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        set_paragraph_rtl(fp)
        frun = fp.add_run("سامانه اتوماسیون و دستیار هوشمند محلی بورس کالا - محرمانه و سازمانی")
        set_run_font_persian(frun, font_name="Tahoma", size_pt=8.5, color_rgb=(150, 150, 150))

    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    set_paragraph_rtl(title_p)
    trun = title_p.add_run(title)
    set_run_font_persian(trun, font_name="Tahoma", size_pt=18, color_rgb=(4, 120, 87), bold=True)

    now_str = datetime.datetime.now().strftime("%Y/%m/%d - %H:%M")
    sub_text = subtitle or f"تاریخ تولید گزارش: {now_str}"
    sub_p = doc.add_paragraph()
    sub_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    set_paragraph_rtl(sub_p)
    srun = sub_p.add_run(sub_text)
    set_run_font_persian(srun, font_name="Tahoma", size_pt=9.5, color_rgb=(107, 114, 128))

    div_p = doc.add_paragraph()
    div_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    set_paragraph_rtl(div_p)
    drun = div_p.add_run("─" * 55)
    set_run_font_persian(drun, font_name="Tahoma", size_pt=8, color_rgb=(209, 213, 219))

    extracted_tables = parse_markdown_tables(content)
    clean_content = content
    for idx, tbl in enumerate(extracted_tables):
        clean_content = clean_content.replace(tbl['raw'], f"\n[[TABLE_PLACEHOLDER_{idx}]]\n")

    lines = clean_content.split('\n')
    in_code_block = False
    code_lines = []

    for line in lines:
        stripped = line.strip()

        if stripped.startswith('```'):
            if in_code_block:
                if code_lines:
                    cp = doc.add_paragraph()
                    cp.alignment = WD_ALIGN_PARAGRAPH.LEFT
                    crun = cp.add_run('\n'.join(code_lines))
                    set_run_font_persian(crun, font_name="Courier New", size_pt=9, color_rgb=(30, 41, 59))
                code_lines = []
                in_code_block = False
            else:
                in_code_block = True
            continue

        if in_code_block:
            code_lines.append(line)
            continue

        tbl_match = re.match(r'^\[\[TABLE_PLACEHOLDER_(\d+)\]\]$', stripped)
        if tbl_match:
            tbl_idx = int(tbl_match.group(1))
            if tbl_idx < len(extracted_tables):
                tbl_data = extracted_tables[tbl_idx]
                headers = tbl_data['headers']
                rows = tbl_data['rows']
                
                table = doc.add_table(rows=len(rows) + 1, cols=len(headers))
                table.alignment = WD_TABLE_ALIGNMENT.RIGHT
                set_table_rtl(table)

                hdr_cells = table.rows[0].cells
                for col_idx, h_text in enumerate(headers):
                    cell = hdr_cells[col_idx]
                    set_cell_shading(cell, '047857')
                    set_cell_margins(cell, top=140, bottom=140, start=180, end=180)
                    set_cell_border(cell, bottom=dict(sz=12, color='065F46'))
                    p = cell.paragraphs[0]
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    set_paragraph_rtl(p)
                    run = p.add_run(h_text)
                    set_run_font_persian(run, font_name="Tahoma", size_pt=10, color_rgb=(255, 255, 255), bold=True)

                for row_idx, r_data in enumerate(rows):
                    row_cells = table.rows[row_idx + 1].cells
                    bg_color = 'F8FAFC' if row_idx % 2 == 1 else 'FFFFFF'
                    for col_idx, val in enumerate(r_data):
                        cell = row_cells[col_idx]
                        set_cell_shading(cell, bg_color)
                        set_cell_margins(cell, top=120, bottom=120, start=160, end=160)
                        set_cell_border(cell, bottom=dict(sz=4, color='E5E7EB'), top=dict(sz=4, color='E5E7EB'))
                        p = cell.paragraphs[0]
                        p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                        set_paragraph_rtl(p)
                        
                        clean_val = re.sub(r'[*_`]', '', val).strip()
                        run = p.add_run(clean_val)
                        
                        if any(term in clean_val for term in ['نرمال', 'طبیعی', 'تایید', 'موفق']):
                            set_run_font_persian(run, font_name="Tahoma", size_pt=9.5, color_rgb=(5, 150, 105), bold=True)
                        elif any(term in clean_val for term in ['مرزی', 'هشدار', 'پیگیری']):
                            set_run_font_persian(run, font_name="Tahoma", size_pt=9.5, color_rgb=(217, 119, 6), bold=True)
                        elif any(term in clean_val for term in ['بحرانی', 'خطر', 'نیاز به درمان', 'رد']):
                            set_run_font_persian(run, font_name="Tahoma", size_pt=9.5, color_rgb=(225, 29, 72), bold=True)
                        else:
                            set_run_font_persian(run, font_name="Tahoma", size_pt=9.5, color_rgb=(55, 65, 81))
                
                sp = doc.add_paragraph()
                sp.paragraph_format.space_after = Pt(8)
            continue

        if not stripped:
            continue

        if stripped.startswith('# '):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            p.paragraph_format.space_before = Pt(12)
            p.paragraph_format.space_after = Pt(4)
            set_paragraph_rtl(p)
            run = p.add_run(stripped[2:].strip())
            set_run_font_persian(run, font_name="Tahoma", size_pt=14, color_rgb=(4, 120, 87), bold=True)
        elif stripped.startswith('## '):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(3)
            set_paragraph_rtl(p)
            run = p.add_run(stripped[3:].strip())
            set_run_font_persian(run, font_name="Tahoma", size_pt=12.5, color_rgb=(30, 41, 59), bold=True)
        elif stripped.startswith('### '):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(2)
            set_paragraph_rtl(p)
            run = p.add_run(stripped[4:].strip())
            set_run_font_persian(run, font_name="Tahoma", size_pt=11, color_rgb=(51, 65, 85), bold=True)
        elif stripped.startswith(('- ', '* ', '• ')):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            p.paragraph_format.space_after = Pt(2)
            set_paragraph_rtl(p)
            bullet_run = p.add_run("• ")
            set_run_font_persian(bullet_run, font_name="Tahoma", size_pt=10.5, color_rgb=(4, 120, 87), bold=True)
            _add_markdown_runs_to_paragraph(p, stripped[2:].strip())
        elif re.match(r'^\d+\.\s', stripped):
            num_match = re.match(r'^(\d+\.)\s*(.*)', stripped)
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            p.paragraph_format.space_after = Pt(2)
            set_paragraph_rtl(p)
            num_run = p.add_run(num_match.group(1) + " ")
            set_run_font_persian(num_run, font_name="Tahoma", size_pt=10.5, color_rgb=(4, 120, 87), bold=True)
            _add_markdown_runs_to_paragraph(p, num_match.group(2).strip())
        elif stripped.startswith('> '):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            p.paragraph_format.space_before = Pt(4)
            p.paragraph_format.space_after = Pt(4)
            set_paragraph_rtl(p)
            bar_run = p.add_run("▎ ")
            set_run_font_persian(bar_run, font_name="Tahoma", size_pt=10.5, color_rgb=(16, 185, 129), bold=True)
            _add_markdown_runs_to_paragraph(p, stripped[2:].strip(), italic=True)
        else:
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
            p.paragraph_format.space_after = Pt(4)
            set_paragraph_rtl(p)
            _add_markdown_runs_to_paragraph(p, stripped)

    output = io.BytesIO()
    doc.save(output)
    output.seek(0)
    return output.getvalue()

def _add_markdown_runs_to_paragraph(paragraph, text: str, italic: bool = False):
    parts = re.split(r'(\*\*.*?\*\*)', text)
    for part in parts:
        if not part:
            continue
        if part.startswith('**') and part.endswith('**') and len(part) >= 4:
            run = paragraph.add_run(part[2:-2])
            set_run_font_persian(run, font_name="Tahoma", size_pt=10.5, color_rgb=(17, 24, 39), bold=True, italic=italic)
        else:
            clean_text = part.replace('`', '')
            run = paragraph.add_run(clean_text)
            set_run_font_persian(run, font_name="Tahoma", size_pt=10.5, color_rgb=(55, 65, 81), bold=False, italic=italic)

# --- XLSX Exporter ---

def export_to_xlsx(content: str, title: str = "داده‌های آماری و تحلیلی") -> bytes:
    wb = openpyxl.Workbook()
    
    font_family = "Tahoma"
    header_fill = PatternFill(start_color="047857", end_color="047857", fill_type="solid")
    sub_header_fill = PatternFill(start_color="065F46", end_color="065F46", fill_type="solid")
    alt_row_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
    white_bold_font = Font(name=font_family, size=11, bold=True, color="FFFFFF")
    title_font = Font(name=font_family, size=14, bold=True, color="FFFFFF")
    sub_title_font = Font(name=font_family, size=9.5, italic=True, color="D1FAE5")
    cell_font = Font(name=font_family, size=10, color="1F2937")
    cell_bold_font = Font(name=font_family, size=10, bold=True, color="111827")
    status_normal_fill = PatternFill(start_color="DCFCE7", end_color="DCFCE7", fill_type="solid")
    status_warning_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
    status_danger_fill = PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid")
    
    thin_border_side = Side(style='thin', color="E2E8F0")
    header_border_side = Side(style='medium', color="064E3B")
    cell_border = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)
    header_border = Border(left=thin_border_side, right=thin_border_side, top=header_border_side, bottom=header_border_side)

    center_align = Alignment(horizontal='center', vertical='center', wrap_text=True)
    right_align = Alignment(horizontal='right', vertical='center', wrap_text=True)

    extracted_tables = parse_markdown_tables(content)
    
    if extracted_tables:
        for t_idx, tbl in enumerate(extracted_tables):
            sheet_title = f"جدول {t_idx + 1}" if len(extracted_tables) > 1 else "داده‌های تحلیلی"
            if t_idx == 0:
                ws = wb.active
                ws.title = sheet_title
            else:
                ws = wb.create_sheet(title=sheet_title)
            
            ws.views.sheetView[0].rightToLeft = True
            ws.views.sheetView[0].showGridLines = True

            headers = tbl['headers']
            rows = tbl['rows']
            num_cols = max(len(headers), 4)

            ws.merge_cells(start_row=1, start_column=1, end_row=2, end_column=num_cols)
            banner_cell = ws.cell(row=1, column=1, value=f"بورس کالای ایران (IME) | {title}")
            banner_cell.font = title_font
            banner_cell.fill = header_fill
            banner_cell.alignment = center_align

            ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=num_cols)
            now_str = datetime.datetime.now().strftime("%Y/%m/%d %H:%M")
            sub_cell = ws.cell(row=3, column=1, value=f"تاریخ گزارش: {now_str} | اتوماسیون دستیار هوشمند سازمانی")
            sub_cell.font = sub_title_font
            sub_cell.fill = sub_header_fill
            sub_cell.alignment = center_align

            ws.row_dimensions[4].height = 10

            ws.row_dimensions[5].height = 28
            for c_idx, h_text in enumerate(headers, 1):
                c = ws.cell(row=5, column=c_idx, value=h_text)
                c.font = white_bold_font
                c.fill = header_fill
                c.alignment = center_align
                c.border = header_border

            for r_idx, r_data in enumerate(rows, 6):
                ws.row_dimensions[r_idx].height = 24
                is_alt = (r_idx % 2 == 1)
                row_bg = alt_row_fill if is_alt else PatternFill(fill_type=None)
                
                for c_idx, val in enumerate(r_data, 1):
                    clean_val = re.sub(r'[*_`]', '', val).strip()
                    
                    cell_val = clean_val
                    num_match = re.match(r'^-?[\d,]+(?:\.\d+)?$', clean_val)
                    if num_match:
                        try:
                            cell_val = float(clean_val.replace(',', ''))
                            if cell_val.is_integer():
                                cell_val = int(cell_val)
                        except ValueError:
                            pass
                    
                    c = ws.cell(row=r_idx, column=c_idx, value=cell_val)
                    c.font = cell_font
                    c.border = cell_border
                    c.alignment = right_align

                    if any(term in clean_val for term in ['نرمال', 'طبیعی', 'تایید', 'موفق']):
                        c.fill = status_normal_fill
                        c.font = cell_bold_font
                    elif any(term in clean_val for term in ['مرزی', 'هشدار', 'پیگیری']):
                        c.fill = status_warning_fill
                        c.font = cell_bold_font
                    elif any(term in clean_val for term in ['بحرانی', 'خطر', 'نیاز به درمان', 'رد']):
                        c.fill = status_danger_fill
                        c.font = cell_bold_font
                    elif is_alt:
                        c.fill = alt_row_fill

            for col in ws.columns:
                max_len = 0
                col_letter = get_column_letter(col[0].column)
                for cell in col:
                    if cell.row in [1, 2, 3]:
                        continue
                    if cell.value:
                        v_str = str(cell.value)
                        max_len = max(max_len, len(v_str))
                ws.column_dimensions[col_letter].width = max(max_len + 4, 14)
    
    else:
        ws = wb.active
        ws.title = "خلاصه گزارش"
        ws.views.sheetView[0].rightToLeft = True
        ws.views.sheetView[0].showGridLines = True

        ws.merge_cells("A1:C2")
        b_cell = ws["A1"]
        b_cell.value = f"بورس کالای ایران (IME) | {title}"
        b_cell.font = title_font
        b_cell.fill = header_fill
        b_cell.alignment = center_align

        ws.merge_cells("A3:C3")
        now_str = datetime.datetime.now().strftime("%Y/%m/%d %H:%M")
        s_cell = ws["A3"]
        s_cell.value = f"تاریخ گزارش: {now_str}"
        s_cell.font = sub_title_font
        s_cell.fill = sub_header_fill
        s_cell.alignment = center_align

        ws["A5"] = "ردیف"
        ws["B5"] = "سرفصل / بخش"
        ws["C5"] = "شرح محتوا و تحلیل"
        for col_name in ["A5", "B5", "C5"]:
            ws[col_name].font = white_bold_font
            ws[col_name].fill = header_fill
            ws[col_name].alignment = center_align
            ws[col_name].border = header_border

        ws.column_dimensions["A"].width = 8
        ws.column_dimensions["B"].width = 25
        ws.column_dimensions["C"].width = 65

        lines = [l.strip() for l in content.split('\n') if l.strip()]
        cur_row = 6
        item_idx = 1
        current_section = "محتوای کلی"

        for line in lines:
            if line.startswith(('#', '##', '###')):
                current_section = line.lstrip('#').strip()
                continue
            
            clean_line = re.sub(r'[*_`]', '', line).strip()
            if not clean_line:
                continue

            ws.cell(row=cur_row, column=1, value=item_idx).alignment = center_align
            ws.cell(row=cur_row, column=2, value=current_section).alignment = right_align
            ws.cell(row=cur_row, column=3, value=clean_line).alignment = right_align

            is_alt = (cur_row % 2 == 1)
            row_fill = alt_row_fill if is_alt else PatternFill(fill_type=None)
            for c_idx in range(1, 4):
                c = ws.cell(row=cur_row, column=c_idx)
                c.font = cell_font
                c.border = cell_border
                if is_alt:
                    c.fill = row_fill

            cur_row += 1
            item_idx += 1

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    return output.getvalue()

def detect_export_intent(text: str) -> Optional[str]:
    if not text:
        return None
    
    clean_text = text.strip()
    
    has_word = bool(re.search(r'(?:ورد|وورد|word|docx)', clean_text, re.IGNORECASE))
    has_excel = bool(re.search(r'(?:اکسل|excel|xlsx|شیت)', clean_text, re.IGNORECASE))
    
    # Check if there is an explicit request for export/file/download/template
    is_export_request = bool(re.search(r'(?:فایل|خروجی|دانلود|نسخه|قالب|در\s*قالب|به\s*صورت\s*فایل|export|download)', clean_text, re.IGNORECASE)) or \
                         bool(re.search(r'(?:ورد|وورد|word|docx|اکسل|excel|xlsx)\s*(?:بده|بفرست|دانلود|خروجی|آماده\s*کن|تولید\s*کن|می‌خواهم|میخوام)', clean_text, re.IGNORECASE))

    if is_export_request:
        if has_word and has_excel:
            return 'both'
        if has_word:
            return 'docx'
        if has_excel:
            return 'xlsx'

    return None
