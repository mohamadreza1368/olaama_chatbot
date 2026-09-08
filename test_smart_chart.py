import os
from app.database import DEFAULT_SYSTEM_PROMPT

def test_chart_vendor_file_exists():
    vendor_path = os.path.join('app', 'static', 'vendor', 'chart.umd.min.js')
    assert os.path.exists(vendor_path), 'chart.umd.min.js must exist'
    assert os.path.getsize(vendor_path) > 50000, 'file size valid'

def test_system_prompt_chart_guidelines():
    assert 'line' in DEFAULT_SYSTEM_PROMPT
    assert 'doughnut' in DEFAULT_SYSTEM_PROMPT
    assert 'bar' in DEFAULT_SYSTEM_PROMPT

def test_index_loads_chart_js():
    with open(os.path.join('app', 'templates', 'index.html'), 'r', encoding='utf-8') as f:
        html = f.read()
    assert '/static/vendor/chart.umd.min.js' in html
