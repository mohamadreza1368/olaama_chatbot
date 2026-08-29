# 🤖 Ollama AI Assistant & Enterprise Admin Hub

A production-ready, full-stack, local AI Assistant powered by **Ollama** and **FastAPI**, featuring a modern ChatGPT-style web interface, document intelligence (PDF, Word, Excel, TXT), fair-usage request queuing, configurable reference prompts, daily token quota management, and a comprehensive admin monitoring dashboard.

---

## ✨ Key Features

### 1. 💬 Modern ChatGPT-Style Web Interface
- **Streaming Responses**: Real-time server-sent events (SSE) token streaming with smooth auto-scrolling.
- **Session Management**: Create, rename, delete, and switch between multiple chat conversations with persistent history.
- **Smart Title Generation**: Automatically summarizes the first user prompt into a concise, meaningful title.
- **Markdown & Code Highlighting**: Full Markdown rendering with syntax highlighting and dedicated code block copy buttons.
- **Auto RTL / LTR Detection**: Automatic text direction and alignment for Persian/Arabic (RTL) and English/Code (LTR).
- **Collapsible Sidebar**: Smooth transition sidebar with keyboard shortcut (`Ctrl + B` / `Cmd + B`) and persistent state.
- **Theme Support**: Seamless Dark Mode and Light Mode switching.

### 2. 📄 Document Intelligence (Multi-Format File Support)
- **PDF Documents (`.pdf`)**: Text extraction via `pypdf`.
- **Microsoft Word (`.docx`)**: Structured extraction of headings, paragraphs, and tables via `python-docx`.
- **Microsoft Excel (`.xlsx`, `.xls`)**: Tabular parsing across sheets with formatted rows via `openpyxl`.
- **Plain Text & Code Files (`.txt`, `.py`, `.json`, `.csv`, etc.)**: Direct UTF-8 extraction.
- **Zero-Prompt Auto-Summary**: If a user uploads a document without typing a question, the AI automatically analyzes the document and provides a comprehensive structured summary (purpose, key points, data tables, and conclusion).

### 3. ⚙️ Admin Control Panel (Admin Hub)
- **Model Switcher**: Auto-discovers all locally installed Ollama models and switches the system-wide active model in real time.
- **Reference Prompts Customizer**: Configure and update global system prompts, file auto-summary prompts, and file Q&A prompts directly from the UI, with one-click reset to defaults.
- **User Management**: Create users with custom daily token quotas, built-in secure password generator, and universal one-click credential copy.
- **Session & History Inspector**: Administrators can inspect any user's past chat sessions, conversation history, and usage details.
- **Real-Time Request & Latency Logs**: Inspect complete prompt logs including user, model, full prompt, full response, latency (ms), IP address, and status.
- **Live Stats Dashboard**: Overview of total users, sessions, messages, prompt logs, and active AI processing queue.

### 4. 🚦 Fair-Usage Request Queue (FIFO)
- Single-worker queue processing to prevent local GPU/CPU overload when multiple users query the model concurrently.
- Floating live queue notification popup showing user position (`Waiting in queue: #1`).

### 5. ⚡ Token Quota & Daily Auto-Reset
- Configurable daily token quotas per user (e.g. 50,000 to 500,000+ tokens).
- Visual token progress meter in the user sidebar (turns green -> yellow -> red as quota is consumed).
- Daily automated midnight reset of token counters.

### 6. 🧹 10-Day Retention Policy
- Automatic purge of messages and prompt logs older than 10 days upon server startup and via manual trigger in Admin panel to maintain optimal database and disk performance.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technology |
|---|---|
| **Backend Framework** | FastAPI (Python 3.10+) |
| **AI Runtime** | Ollama Local LLM (`qwen:0.5b`, `llama3`, `deepseek-r1`, `mistral`, etc.) |
| **Database & ORM** | SQLite + SQLAlchemy 2.0 |
| **Security & Auth** | JWT Tokens + BCrypt password hashing |
| **Document Processing** | `pypdf`, `python-docx`, `openpyxl` |
| **Frontend UI** | HTML5, Tailwind CSS, Vanilla JS, Lucide Icons, Marked.js, Highlight.js |

---

## 🚀 Quick Start

### Prerequisites
1. **Python 3.10+** installed on your system.
2. **Ollama** installed and running locally:
   ```bash
   ollama run qwen:0.5b
   ```

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/mohamadreza1368/olaama_chatbot.git
   cd olaama_chatbot
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Run the server**:
   - **Windows Batch**: Double-click `run.bat` or execute:
     ```cmd
     run.bat
     ```
   - **PowerShell**:
     ```powershell
     .\run.ps1
     ```
   - **Direct Command**:
     ```bash
     python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
     ```

4. **Access the application**:
   Open your browser and navigate to:
   👉 **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

---

## 🔑 Default Credentials

| Role | Username | Password |
|---|---|---|
| **Administrator** | `admin` | `admin123` |

*(New standard user accounts can be created by the Administrator inside the Admin Hub).*

---

## 📁 Project Structure

```text
olaama_chatbot/
├── app/
│   ├── main.py                 # FastAPI application entry point & lifecycle
│   ├── config.py               # Environment configuration & settings
│   ├── database.py             # SQLAlchemy models, initialization & migrations
│   ├── auth.py                 # JWT token creation, decoding & BCrypt hashing
│   ├── ollama_service.py       # Ollama API streaming client & model discovery
│   ├── queue_service.py        # FIFO Request Queue with position tracking
│   ├── document_parser.py      # PDF, DOCX, XLSX, and TXT parsers
│   ├── cleanup_service.py      # 10-day retention cleanup routine
│   ├── routers/
│   │   ├── auth_router.py      # Login, registration, and user profile endpoints
│   │   ├── chat_router.py      # Chat sessions, streaming messages & file upload
│   │   └── admin_router.py     # Admin stats, user management & system settings
│   ├── static/
│   │   ├── css/style.css       # Custom scrollbars, code wrappers & transitions
│   │   └── js/
│   │       ├── app.js          # Auth manager, toasts, and clipboard helpers
│   │       ├── chat.js         # Chat UI, streaming SSE, markdown & sidebar controller
│   │       └── admin.js        # Admin dashboard, user CRUD, prompts & logs
│   └── templates/
│       └── index.html          # Unified single-page application interface
├── requirements.txt            # Python dependencies
├── run.bat                     # Windows launch script
├── run.ps1                     # PowerShell launch script
├── test_suite.py               # Unit test suite
├── test_new_features.py        # Feature verification tests
└── test_e2e_api.py             # End-to-end API integration tests
```

---

## 🧪 Testing

Run the automated test suites to verify backend health, document parsers, and API endpoints:

```bash
python test_suite.py
python test_new_features.py
python test_e2e_api.py
```

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
