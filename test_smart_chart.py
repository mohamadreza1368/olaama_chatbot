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

def test_vis_network_vendor_file_exists():
    vendor_path = os.path.join('app', 'static', 'vendor', 'vis-network.min.js')
    assert os.path.exists(vendor_path), 'vis-network.min.js must exist'
    assert os.path.getsize(vendor_path) > 100000, 'vis-network.min.js file size valid'

def test_index_loads_vis_network_js():
    with open(os.path.join('app', 'templates', 'index.html'), 'r', encoding='utf-8') as f:
        html = f.read()
    assert '/static/vendor/vis-network.min.js' in html

def test_system_prompt_graphify_guidelines():
    assert 'Graphify' in DEFAULT_SYSTEM_PROMPT
    assert 'nodes' in DEFAULT_SYSTEM_PROMPT
    assert 'edges' in DEFAULT_SYSTEM_PROMPT
    assert 'community' in DEFAULT_SYSTEM_PROMPT

def test_graphify_skill_file_exists():
    skill_path = os.path.join('skills', 'graphify.md')
    assert os.path.exists(skill_path), 'skills/graphify.md must exist'
    with open(skill_path, 'r', encoding='utf-8') as f:
        content = f.read()
    assert 'Graphify' in content
    assert 'nodes' in content

def test_chat_js_has_graphify_engine():
    with open(os.path.join('app', 'static', 'js', 'chat.js'), 'r', encoding='utf-8') as f:
        js = f.read()
    assert 'isGraphBlock' in js
    assert 'renderGraphifyCard' in js
    assert 'initGraphify' in js
    assert 'forceAtlas2Based' in js
    assert 'updateGraphInspector' in js

