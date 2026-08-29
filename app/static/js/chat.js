// Chat & Session Controller
// Configure Marked with native Code Block Header & Copy Button
if (window.marked) {
    const customCodeRenderer = {
        code(tokenOrCode, infostring, escaped) {
            let code = '';
            let lang = 'code';

            if (typeof tokenOrCode === 'object' && tokenOrCode !== null) {
                code = tokenOrCode.text || '';
                lang = tokenOrCode.lang || 'code';
            } else {
                code = tokenOrCode || '';
                lang = infostring || 'code';
            }

            lang = lang.trim().toLowerCase().split(/\s+/)[0] || 'code';

            const safeCode = code
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

            return `
                <div class="code-block-wrapper my-3 rounded-xl overflow-hidden border border-gray-700/60 bg-[#161616] shadow-lg text-left" dir="ltr">
                    <div class="code-block-header flex items-center justify-between px-3.5 py-1.5 bg-[#252525] border-b border-gray-700/60 select-none text-xs font-mono">
                        <span class="lang-tag text-emerald-400 font-bold flex items-center gap-1.5">
                            <span>💻 ${lang}</span>
                        </span>
                        <button type="button" class="copy-code-btn px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-gray-200 hover:text-white transition text-[11px] font-sans flex items-center gap-1 font-medium shadow-sm" onclick="Chat.copyCodeBlock(this)">
                            <span>کپی کد</span>
                        </button>
                    </div>
                    <pre class="p-3.5 m-0 bg-[#161616] overflow-x-auto text-[13px] font-mono leading-relaxed"><code class="language-${lang}">${safeCode}</code></pre>
                </div>
            `;
        }
    };
    marked.use({ renderer: customCodeRenderer });
}

const Chat = {
    currentSessionId: null,
    sessions: [],
    selectedFile: null,
    isStreaming: false,

    init() {
        this.loadActiveModel();
        this.loadSessions();
        this.setupEvents();
        this.setupAutoDirection();
    },

    isRTLText(text) {
        if (!text) return true;
        const farsiArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
        const match = text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z]/);
        if (!match) return true;
        return farsiArabic.test(match[0]);
    },

    setupAutoDirection() {
        const input = document.getElementById('chat-input');
        if (!input) return;

        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 180) + 'px';

            const val = input.value.trim();
            if (val) {
                const rtl = this.isRTLText(val);
                input.setAttribute('dir', rtl ? 'rtl' : 'ltr');
                input.style.textAlign = rtl ? 'right' : 'left';
            } else {
                input.setAttribute('dir', 'auto');
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    },

    setupEvents() {
        const newChatBtn = document.getElementById('btn-new-chat');
        if (newChatBtn) newChatBtn.addEventListener('click', () => this.createNewSession());

        const sendBtn = document.getElementById('btn-send-message');
        if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());

        const attachBtn = document.getElementById('btn-attach-file');
        const fileInput = document.getElementById('file-upload-input');
        const removeFileBtn = document.getElementById('btn-remove-attachment');

        if (attachBtn && fileInput) {
            attachBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    this.setAttachedFile(e.target.files[0]);
                }
            });
        }

        if (removeFileBtn) {
            removeFileBtn.addEventListener('click', () => this.removeAttachedFile());
        }

        document.querySelectorAll('.quick-prompt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = btn.getAttribute('data-prompt') || btn.innerText.replace(/^[💡💻📄]/, '').trim();
                const input = document.getElementById('chat-input');
                if (input) {
                    input.value = p;
                    input.dispatchEvent(new Event('input'));
                    this.sendMessage();
                }
            });
        });

        // Sidebar Toggles
        const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
        const btnDesktopToggle = document.getElementById('btn-desktop-sidebar-toggle');
        const mobileToggle = document.getElementById('btn-mobile-sidebar-toggle');

        if (btnToggleSidebar) {
            btnToggleSidebar.addEventListener('click', () => this.toggleSidebar(true));
        }
        if (btnDesktopToggle) {
            btnDesktopToggle.addEventListener('click', () => this.toggleSidebar());
        }
        if (mobileToggle) {
            mobileToggle.addEventListener('click', () => {
                const sidebar = document.getElementById('sidebar');
                if (sidebar) {
                    sidebar.classList.toggle('hidden');
                    sidebar.classList.remove('sidebar-collapsed');
                }
            });
        }

        // Global Shortcut: Ctrl + B / Cmd + B to toggle sidebar
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
                e.preventDefault();
                this.toggleSidebar();
            }
        });

        this.initSidebarState();
    },

    toggleSidebar(forceState = null) {
        const now = Date.now();
        if (this._lastToggleTime && (now - this._lastToggleTime < 200)) {
            return;
        }
        this._lastToggleTime = now;

        const sidebar = document.getElementById('sidebar');
        const desktopBtn = document.getElementById('btn-desktop-sidebar-toggle');
        if (!sidebar) return;

        const isCurrentlyCollapsed = sidebar.classList.contains('sidebar-collapsed');
        const shouldCollapse = forceState !== null ? forceState : !isCurrentlyCollapsed;

        if (shouldCollapse) {
            sidebar.classList.add('sidebar-collapsed');
            localStorage.setItem('ollama_sidebar_collapsed', 'true');
            if (desktopBtn) {
                desktopBtn.classList.add('text-emerald-500', 'bg-emerald-500/10', 'border-emerald-500/30');
                desktopBtn.setAttribute('title', 'باز کردن منوی گفتگوها (Ctrl + B)');
                desktopBtn.innerHTML = '<i data-lucide="panel-right-open" class="w-4 h-4 text-emerald-500"></i>';
            }
        } else {
            sidebar.classList.remove('sidebar-collapsed');
            localStorage.setItem('ollama_sidebar_collapsed', 'false');
            if (desktopBtn) {
                desktopBtn.classList.remove('text-emerald-500', 'bg-emerald-500/10', 'border-emerald-500/30');
                desktopBtn.setAttribute('title', 'بستن منوی گفتگوها (Ctrl + B)');
                desktopBtn.innerHTML = '<i data-lucide="panel-right" class="w-4 h-4"></i>';
            }
        }

        if (window.lucide) lucide.createIcons();
    },

    initSidebarState() {
        const savedState = localStorage.getItem('ollama_sidebar_collapsed');
        if (savedState === 'true') {
            this.toggleSidebar(true);
        }
    },

    setAttachedFile(file) {
        this.selectedFile = file;
        const chip = document.getElementById('file-attachment-chip');
        const nameEl = document.getElementById('attached-file-name');
        if (chip && nameEl) {
            nameEl.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            chip.classList.remove('hidden');
            chip.classList.add('flex');
        }
    },

    removeAttachedFile() {
        this.selectedFile = null;
        const fileInput = document.getElementById('file-upload-input');
        if (fileInput) fileInput.value = '';
        const chip = document.getElementById('file-attachment-chip');
        if (chip) {
            chip.classList.add('hidden');
            chip.classList.remove('flex');
        }
    },

    async loadActiveModel() {
        try {
            const res = await fetch('/api/chat/models', {
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            const indicator = document.getElementById('ollama-status-indicator');
            const modelDisplay = document.getElementById('active-model-display');

            if (res.ok) {
                const data = await res.json();
                if (modelDisplay && data.active_model) {
                    modelDisplay.textContent = data.active_model;
                }
                if (indicator) {
                    indicator.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
                    indicator.title = 'Ollama آنلاین است';
                }
            } else {
                if (indicator) {
                    indicator.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
                    indicator.title = 'Ollama در دسترس نیست';
                }
            }
        } catch (e) {
            const indicator = document.getElementById('ollama-status-indicator');
            if (indicator) {
                indicator.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
            }
        }
    },

    async loadSessions() {
        try {
            const res = await fetch('/api/chat/sessions', {
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            if (res.ok) {
                this.sessions = await res.json();
                this.renderSessionsList();
                if (this.sessions.length > 0 && !this.currentSessionId) {
                    this.switchSession(this.sessions[0].id);
                } else if (this.sessions.length === 0) {
                    this.createNewSession();
                }
            }
        } catch (e) {
            console.error('Error loading sessions:', e);
        }
    },

    renderSessionsList() {
        const listEl = document.getElementById('sessions-list');
        if (!listEl) return;

        if (this.sessions.length === 0) {
            listEl.innerHTML = '<div class="text-center text-xs text-gray-400 py-6">گفتگویی یافت نشد</div>';
            return;
        }

        listEl.innerHTML = this.sessions.map(s => {
            const isActive = s.id === this.currentSessionId;
            const activeClasses = isActive 
                ? 'bg-gray-200 dark:bg-[#282828] text-gray-900 dark:text-white font-medium' 
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#202020]';
            
            return `
                <div class="session-item group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-all ${activeClasses}" data-id="${s.id}">
                    <div class="flex items-center gap-2 overflow-hidden flex-1" onclick="Chat.switchSession('${s.id}')">
                        <i data-lucide="message-square" class="w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-emerald-500' : 'text-gray-400'}"></i>
                        <span class="truncate session-title">${s.title || 'گفتگوی بدون نام'}</span>
                    </div>
                    <div class="items-center gap-1 hidden group-hover:flex">
                        <button class="p-1 hover:text-blue-400" onclick="Chat.promptRenameSession('${s.id}', '${s.title}', event)" title="تغییر نام">
                            <i data-lucide="edit-2" class="w-3 h-3"></i>
                        </button>
                        <button class="p-1 hover:text-red-400" onclick="Chat.deleteSession('${s.id}', event)" title="حذف">
                            <i data-lucide="trash" class="w-3 h-3"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    },

    async createNewSession() {
        try {
            const res = await fetch('/api/chat/sessions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${App.token}`
                },
                body: JSON.stringify({ title: 'گفتگوی جدید' })
            });
            if (res.ok) {
                const newSess = await res.json();
                this.sessions.unshift({ ...newSess, message_count: 0 });
                this.switchSession(newSess.id);
            }
        } catch (e) {
            App.toast('خطا در ایجاد گفتگوی جدید', 'error');
        }
    },

    async switchSession(sessionId) {
        this.currentSessionId = sessionId;
        this.renderSessionsList();

        const titleHeader = document.getElementById('current-chat-title-header');
        const activeSess = this.sessions.find(s => s.id === sessionId);
        if (titleHeader && activeSess) {
            titleHeader.textContent = activeSess.title;
        }

        const streamContainer = document.getElementById('chat-stream');
        const welcomeScreen = document.getElementById('welcome-screen');
        if (streamContainer) streamContainer.innerHTML = '';

        try {
            const res = await fetch(`/api/chat/sessions/${sessionId}`, {
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                if (data.messages && data.messages.length > 0) {
                    if (welcomeScreen) welcomeScreen.classList.add('hidden');
                    data.messages.forEach(msg => {
                        this.appendMessage(msg.role, msg.content, msg.has_attachment, msg.attachment_name);
                    });
                    this.scrollToBottom();
                } else {
                    if (welcomeScreen) welcomeScreen.classList.remove('hidden');
                }
            }
        } catch (e) {
            console.error('Error switching session:', e);
        }
    },

    async promptRenameSession(sessionId, oldTitle, event) {
        if (event) event.stopPropagation();
        const newTitle = prompt('نام جدید گفتگو را وارد کنید:', oldTitle);
        if (newTitle && newTitle.trim() && newTitle.trim() !== oldTitle) {
            try {
                const res = await fetch(`/api/chat/sessions/${sessionId}?title=${encodeURIComponent(newTitle.trim())}`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${App.token}` }
                });
                if (res.ok) {
                    const sess = this.sessions.find(s => s.id === sessionId);
                    if (sess) sess.title = newTitle.trim();
                    this.renderSessionsList();
                    const titleHeader = document.getElementById('current-chat-title-header');
                    if (titleHeader && this.currentSessionId === sessionId) {
                        titleHeader.textContent = newTitle.trim();
                    }
                    App.toast('نام گفتگو با موفقیت تغییر یافت', 'success');
                }
            } catch (e) {
                App.toast('خطا در تغییر نام گفتگو', 'error');
            }
        }
    },

    async deleteSession(sessionId, event) {
        if (event) event.stopPropagation();
        if (!confirm('آیا از حذف این گفتگو اطمینان دارید؟')) return;

        try {
            const res = await fetch(`/api/chat/sessions/${sessionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            if (res.ok) {
                this.sessions = this.sessions.filter(s => s.id !== sessionId);
                if (this.currentSessionId === sessionId) {
                    if (this.sessions.length > 0) {
                        this.switchSession(this.sessions[0].id);
                    } else {
                        this.createNewSession();
                    }
                } else {
                    this.renderSessionsList();
                }
                App.toast('گفتگو با موفقیت حذف شد', 'info');
            }
        } catch (e) {
            App.toast('خطا در حذف گفتگو', 'error');
        }
    },

    appendMessage(role, content, hasAttachment = false, attachmentName = '') {
        const streamContainer = document.getElementById('chat-stream');
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) welcomeScreen.classList.add('hidden');
        if (!streamContainer) return;

        const isUser = role === 'user';
        const rtl = this.isRTLText(content);
        const dirAttr = rtl ? 'rtl' : 'ltr';

        const msgDiv = document.createElement('div');
        msgDiv.className = `flex gap-3 animate-fade-in ${isUser ? 'justify-end' : 'justify-start'}`;

        let renderedContent = '';
        if (isUser) {
            let attachBadge = '';
            if (hasAttachment && attachmentName) {
                attachBadge = `<div class="text-[11px] mb-1.5 flex items-center gap-1 text-emerald-400 font-mono"><i data-lucide="file-text" class="w-3 h-3"></i><span>${attachmentName}</span></div>`;
            }
            renderedContent = `
                <div class="max-w-[85%] md:max-w-[75%] rounded-2xl p-3.5 bg-gray-200 dark:bg-[#2f2f2f] text-gray-900 dark:text-gray-100 text-sm shadow-sm" dir="${dirAttr}">
                    ${attachBadge}
                    <div class="whitespace-pre-wrap">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                </div>
            `;
        } else {
            const parsedHtml = marked.parse(content || '');
            renderedContent = `
                <div class="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
                    AI
                </div>
                <div class="flex-1 max-w-[90%] space-y-1">
                    <div class="prose-custom text-gray-800 dark:text-gray-200" dir="${dirAttr}">
                        ${parsedHtml}
                    </div>
                </div>
            `;
        }

        msgDiv.innerHTML = renderedContent;
        streamContainer.appendChild(msgDiv);

        this.highlightCode(msgDiv);
        return msgDiv;
    },

    highlightCode(container) {
        if (!container) return;
        container.querySelectorAll('pre code').forEach(block => {
            if (!block.dataset.highlighted) {
                hljs.highlightElement(block);
                block.dataset.highlighted = "true";
            }
        });
        if (window.lucide) lucide.createIcons();
    },

    copyCodeBlock(btn) {
        const wrapper = btn.closest('.code-block-wrapper');
        if (!wrapper) return;
        const codeEl = wrapper.querySelector('code');
        const text = codeEl ? codeEl.innerText : '';
        navigator.clipboard.writeText(text);

        const span = btn.querySelector('span');
        if (span) span.textContent = '✓ کپی شد!';
        btn.classList.add('bg-emerald-600', 'text-white');

        setTimeout(() => {
            if (span) span.textContent = 'کپی کد';
            btn.classList.remove('bg-emerald-600', 'text-white');
        }, 2000);
    },

    scrollToBottom() {
        const container = document.getElementById('messages-container');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    },

    renderErrorCard(contentEl, errorMessage) {
        contentEl.innerHTML = `
            <div class="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-400 text-xs space-y-2 animate-fade-in" dir="rtl">
                <div class="flex items-center gap-2 font-bold text-sm text-rose-500">
                    <i data-lucide="alert-octagon" class="w-4 h-4"></i>
                    <span>خطا در پردازش هوش مصنوعی</span>
                </div>
                <p class="leading-relaxed">${errorMessage}</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
    },

    showQueuePopup(position, total) {
        const popup = document.getElementById('queue-notification-popup');
        const badge = document.getElementById('queue-popup-badge');
        const msg = document.getElementById('queue-popup-message');
        if (popup && badge && msg) {
            badge.textContent = `نفر ${position} در صف`;
            msg.textContent = `درخواست شما در صف انتظار پردازش هوش مصنوعی قرار دارد (نوبت: نفر ${position} از ${total || 1}). به محض خالی شدن پردازشگر، پاسخ شما آغاز خواهد شد.`;
            popup.classList.remove('hidden');
            if (window.lucide) lucide.createIcons();
        }
    },

    hideQueuePopup(instant = false) {
        const popup = document.getElementById('queue-notification-popup');
        if (!popup) return;
        if (instant) {
            popup.classList.add('hidden');
        } else {
            const msg = document.getElementById('queue-popup-message');
            if (msg) msg.textContent = '✓ نوبت شما فرا رسید! در حال دریافت پاسخ از هوش مصنوعی...';
            setTimeout(() => {
                popup.classList.add('hidden');
            }, 1200);
        }
    },

    async sendMessage() {
        if (this.isStreaming) return;

        const input = document.getElementById('chat-input');
        const promptText = input ? input.value.trim() : '';
        if (!promptText && !this.selectedFile) return;

        if (!this.currentSessionId) {
            await this.createNewSession();
        }

        // Display user message
        const currentFile = this.selectedFile;
        const displayPrompt = promptText || (currentFile ? 'بررسی و خلاصه‌سازی فایل' : '');
        this.appendMessage('user', displayPrompt, bool(currentFile), currentFile ? currentFile.name : '');
        this.scrollToBottom();

        // Clear input and attachment
        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }
        this.removeAttachedFile();

        // Prepare Assistant Stream Bubble
        const streamContainer = document.getElementById('chat-stream');
        const asstBubbleWrapper = document.createElement('div');
        asstBubbleWrapper.className = 'flex gap-3 animate-fade-in justify-start';
        asstBubbleWrapper.innerHTML = `
            <div class="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
                AI
            </div>
            <div class="flex-1 max-w-[90%] space-y-1">
                <div class="prose-custom text-gray-800 dark:text-gray-200 streaming-content" dir="auto">
                    <span class="inline-flex items-center gap-1.5 text-xs text-gray-400 animate-pulse">
                        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                        در حال نگارش پاسخ...
                    </span>
                </div>
            </div>
        `;
        streamContainer.appendChild(asstBubbleWrapper);
        this.scrollToBottom();

        const contentEl = asstBubbleWrapper.querySelector('.streaming-content');

        // Build FormData
        const formData = new FormData();
        formData.append('session_id', this.currentSessionId);
        formData.append('prompt', promptText);
        if (currentFile) {
            formData.append('file', currentFile);
        }

        this.isStreaming = true;
        let accumulatedResponse = '';

        try {
            const response = await fetch('/api/chat/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${App.token}`
                },
                body: formData
            });

            if (response.status === 401) {
                this.renderErrorCard(contentEl, 'نشست کاربری شما منقضی شده است. لطفاً مجدداً وارد حساب کاربری شوید.');
                App.logout();
                return;
            }

            if (response.status === 403) {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData.detail || 'اعتبار توکن شما به پایان رسیده است.';
                this.renderErrorCard(contentEl, errMsg);
                App.toast(errMsg, 'error');
                return;
            }

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                const errMsg = errData.detail || 'خطا در ارسال پیام به مدل هوش مصنوعی';
                this.renderErrorCard(contentEl, errMsg);
                App.toast(errMsg, 'error');
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('data: ')) {
                        const jsonStr = trimmed.substring(6);
                        try {
                            const parsed = JSON.parse(jsonStr);
                            
                            // 1. Handle Queue Updates
                            if (parsed.queue_status === 'waiting') {
                                this.showQueuePopup(parsed.position, parsed.total_queued);
                                contentEl.innerHTML = `
                                    <div class="flex items-center gap-2 text-amber-500 font-medium text-xs animate-pulse p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                        <i data-lucide="hourglass" class="w-4 h-4 text-amber-500"></i>
                                        <span>در صف انتظار هوش مصنوعی (نوبت شما: نفر ${parsed.position} از ${parsed.total_queued || 1})...</span>
                                    </div>
                                `;
                                if (window.lucide) lucide.createIcons();
                                this.scrollToBottom();
                                continue;
                            } else if (parsed.queue_status === 'active') {
                                this.hideQueuePopup(false);
                                contentEl.innerHTML = `
                                    <span class="inline-flex items-center gap-1.5 text-xs text-gray-400 animate-pulse">
                                        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                                        در حال نگارش پاسخ...
                                    </span>
                                `;
                                this.scrollToBottom();
                                continue;
                            }

                            // 2. Handle Errors
                            if (parsed.error) {
                                this.hideQueuePopup(true);
                                this.renderErrorCard(contentEl, parsed.error);
                                App.toast(parsed.error, 'error');
                                return;
                            }

                            // 3. Handle Title Updates
                            if (parsed.title) {
                                const currentSess = this.sessions.find(s => s.id === this.currentSessionId);
                                if (currentSess && currentSess.title !== parsed.title) {
                                    currentSess.title = parsed.title;
                                    this.renderSessionsList();
                                    const titleHeader = document.getElementById('current-chat-title-header');
                                    if (titleHeader) titleHeader.textContent = parsed.title;
                                }
                            }

                            // 4. Handle Token Quota Display
                            if (parsed.tokens_used !== undefined && parsed.token_quota !== undefined) {
                                App.updateTokenDisplay(parsed.tokens_used, parsed.token_quota);
                            }

                            // 5. Handle Token Stream
                            if (parsed.token) {
                                accumulatedResponse += parsed.token;
                                const rtl = this.isRTLText(accumulatedResponse);
                                contentEl.setAttribute('dir', rtl ? 'rtl' : 'ltr');
                                contentEl.innerHTML = marked.parse(accumulatedResponse);
                                this.highlightCode(contentEl);
                                this.scrollToBottom();
                            }
                        } catch (e) {
                            console.error('SSE parse error:', e);
                        }
                    }
                }
            }

            if (accumulatedResponse.trim()) {
                const rtl = this.isRTLText(accumulatedResponse);
                contentEl.setAttribute('dir', rtl ? 'rtl' : 'ltr');
                contentEl.innerHTML = marked.parse(accumulatedResponse);
                this.highlightCode(contentEl);
            }

        } catch (err) {
            this.hideQueuePopup(true);
            this.renderErrorCard(contentEl, `ارتباط با سرور قطع شد: ${err.message}`);
            App.toast('خطا در ارتباط با سرور', 'error');
        } finally {
            this.hideQueuePopup(true);
            this.isStreaming = false;
            this.scrollToBottom();
            if (window.lucide) lucide.createIcons();
        }
    }
};

function bool(val) {
    return !!val;
}

window.Chat = Chat;
