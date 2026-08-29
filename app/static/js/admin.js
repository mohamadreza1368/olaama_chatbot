// Admin Dashboard & User History Controller
const Admin = {
    logs: [],
    users: [],
    systemSettings: {},
    currentInspectedUserId: null,
    currentInspectedSessions: [],
    activeInspectedSessionId: null,

    init() {
        this.setupEvents();
    },

    setupEvents() {
        const btnOpenAdmin = document.getElementById('btn-open-admin');
        const btnCloseAdmin = document.getElementById('btn-close-admin');
        const adminModal = document.getElementById('admin-modal');

        if (btnOpenAdmin && adminModal) {
            btnOpenAdmin.addEventListener('click', () => {
                adminModal.classList.remove('hidden');
                this.loadAllData();
            });
        }
        if (btnCloseAdmin && adminModal) {
            btnCloseAdmin.addEventListener('click', () => {
                adminModal.classList.add('hidden');
            });
        }

        // Tabs
        const tabs = ['users', 'model', 'logs', 'maintenance'];
        tabs.forEach(tab => {
            const btn = document.getElementById(`admin-tab-${tab}`);
            if (btn) {
                btn.addEventListener('click', () => this.switchTab(tab));
            }
        });

        // Model Settings Save
        const btnSaveModel = document.getElementById('btn-save-system-model');
        if (btnSaveModel) {
            btnSaveModel.addEventListener('click', () => this.saveSystemModel());
        }

        // Reference Prompts Save & Reset
        const btnSaveAllPrompts = document.getElementById('btn-save-all-prompts');
        if (btnSaveAllPrompts) {
            btnSaveAllPrompts.addEventListener('click', () => this.saveReferencePrompts());
        }

        const btnResetPrompts = document.getElementById('btn-reset-reference-prompts');
        if (btnResetPrompts) {
            btnResetPrompts.addEventListener('click', () => this.resetReferencePrompts());
        }

        // Logs Search & Filter
        const searchInput = document.getElementById('logs-search-input');
        const filterType = document.getElementById('logs-filter-type');
        const btnRefreshLogs = document.getElementById('btn-refresh-logs');

        if (searchInput) {
            let timeout = null;
            searchInput.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => this.loadLogs(), 400);
            });
        }
        if (filterType) filterType.addEventListener('change', () => this.loadLogs());
        if (btnRefreshLogs) btnRefreshLogs.addEventListener('click', () => this.loadLogs());

        // Close User History Modal
        const btnCloseUH = document.getElementById('btn-close-user-history');
        const modalUH = document.getElementById('user-history-modal');
        if (btnCloseUH && modalUH) {
            btnCloseUH.addEventListener('click', () => {
                modalUH.classList.add('hidden');
            });
        }

        // Modals Setup
        this.setupUserModals();
        this.setupQuotaModal();
        this.setupMaintenance();
    },

    switchTab(activeTab) {
        const tabs = ['users', 'model', 'logs', 'maintenance'];
        tabs.forEach(tab => {
            const btn = document.getElementById(`admin-tab-${tab}`);
            const panel = document.getElementById(`admin-panel-${tab}`);
            if (tab === activeTab) {
                if (btn) {
                    btn.className = 'admin-tab-btn px-4 py-3 border-b-2 border-emerald-500 text-emerald-500 font-semibold flex items-center gap-2';
                }
                if (panel) panel.classList.remove('hidden');
            } else {
                if (btn) {
                    btn.className = 'admin-tab-btn px-4 py-3 border-b-2 border-transparent text-gray-500 hover:text-gray-300 flex items-center gap-2';
                }
                if (panel) panel.classList.add('hidden');
            }
        });
        if (window.lucide) lucide.createIcons();
    },

    async loadAllData() {
        await Promise.all([
            this.loadStats(),
            this.loadUsers(),
            this.loadSystemSettings(),
            this.loadLogs()
        ]);
    },

    async loadSystemSettings() {
        try {
            const [settingsRes, promptsRes] = await Promise.all([
                fetch('/api/admin/system-settings', { headers: { 'Authorization': `Bearer ${App.token}` } }),
                fetch('/api/admin/prompts', { headers: { 'Authorization': `Bearer ${App.token}` } })
            ]);

            if (settingsRes.ok) {
                this.systemSettings = await settingsRes.json();
                const selector = document.getElementById('admin-model-selector');
                if (selector && this.systemSettings.available_models) {
                    selector.innerHTML = this.systemSettings.available_models.map(m => 
                        `<option value="${m}" ${m === this.systemSettings.active_model ? 'selected' : ''}>${m}</option>`
                    ).join('');
                }
                if (this.systemSettings.queue_stats) {
                    const qEl = document.getElementById('stat-queue-count');
                    if (qEl) qEl.textContent = `${this.systemSettings.queue_stats.queued_count} منتظر`;
                }
            }

            if (promptsRes.ok) {
                const promptsData = await promptsRes.json();
                const sysInput = document.getElementById('admin-system-prompt-input');
                const summaryInput = document.getElementById('admin-file-summary-prompt-input');
                const questionInput = document.getElementById('admin-file-question-prompt-input');

                if (sysInput && promptsData.system_prompt) sysInput.value = promptsData.system_prompt;
                if (summaryInput && promptsData.file_summary_prompt) summaryInput.value = promptsData.file_summary_prompt;
                if (questionInput && promptsData.file_question_prompt) questionInput.value = promptsData.file_question_prompt;
            }
        } catch (e) {
            console.error('Error loading system settings and prompts:', e);
        }
    },

    async saveReferencePrompts() {
        const sysInput = document.getElementById('admin-system-prompt-input');
        const summaryInput = document.getElementById('admin-file-summary-prompt-input');
        const questionInput = document.getElementById('admin-file-question-prompt-input');
        const statusBox = document.getElementById('prompts-save-status');

        const payload = {
            system_prompt: sysInput ? sysInput.value.trim() : '',
            file_summary_prompt: summaryInput ? summaryInput.value.trim() : '',
            file_question_prompt: questionInput ? questionInput.value.trim() : ''
        };

        try {
            const res = await fetch('/api/admin/prompts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${App.token}`
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                App.toast('تمامی پرامپت‌های مرجع با موفقیت ذخیره شدند', 'success');
                if (statusBox) {
                    statusBox.textContent = '✓ پرامپت‌های مرجع با موفقیت به‌روزرسانی شدند.';
                    statusBox.classList.remove('hidden');
                    setTimeout(() => statusBox.classList.add('hidden'), 4000);
                }
            } else {
                const err = await res.json();
                App.toast(err.detail || 'خطا در ذخیره پرامپت‌ها', 'error');
            }
        } catch (e) {
            App.toast('خطا در ذخیره پرامپت‌های مرجع', 'error');
        }
    },

    async resetReferencePrompts() {
        if (!confirm('آیا از بازنشانی تمامی پرامپت‌ها به مقادیر پیش‌فرض سیستم اطمینان دارید؟')) return;

        try {
            const res = await fetch('/api/admin/prompts/reset', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const promptsData = data.prompts || {};
                
                const sysInput = document.getElementById('admin-system-prompt-input');
                const summaryInput = document.getElementById('admin-file-summary-prompt-input');
                const questionInput = document.getElementById('admin-file-question-prompt-input');

                if (sysInput && promptsData.system_prompt) sysInput.value = promptsData.system_prompt;
                if (summaryInput && promptsData.file_summary_prompt) summaryInput.value = promptsData.file_summary_prompt;
                if (questionInput && promptsData.file_question_prompt) questionInput.value = promptsData.file_question_prompt;

                App.toast('تمامی پرامپت‌ها به مقادیر پیش‌فرض بازنشانی شدند', 'info');
            }
        } catch (e) {
            App.toast('خطا در بازنشانی پرامپت‌ها', 'error');
        }
    },

    async saveSystemModel() {
        const selector = document.getElementById('admin-model-selector');
        const selectedModel = selector ? selector.value : 'qwen:0.5b';
        const statusBox = document.getElementById('model-save-status');

        try {
            const res = await fetch('/api/admin/system-settings/model', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${App.token}`
                },
                body: JSON.stringify({ model_name: selectedModel })
            });
            if (res.ok) {
                App.toast(`مدل فعال با موفقیت به ${selectedModel} تغییر یافت`, 'success');
                if (statusBox) {
                    statusBox.textContent = `✓ مدل فعال سیستم به ${selectedModel} به‌روزرسانی شد. تمام کاربران از این مدل استفاده خواهند کرد.`;
                    statusBox.classList.remove('hidden');
                }
                const modelDisplay = document.getElementById('active-model-display');
                if (modelDisplay) modelDisplay.textContent = selectedModel;
            }
        } catch (e) {
            App.toast('خطا در ذخیره مدل سیستم', 'error');
        }
    },

    async loadStats() {
        try {
            const res = await fetch('/api/admin/stats', {
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            if (res.ok) {
                const s = await res.json();
                document.getElementById('stat-total-users').textContent = s.total_users;
                document.getElementById('stat-total-sessions').textContent = s.total_sessions;
                document.getElementById('stat-total-messages').textContent = s.total_messages;
                document.getElementById('stat-total-logs').textContent = s.total_logs;
                document.getElementById('stat-avg-latency').textContent = `${s.avg_latency_ms} ms`;
            }
        } catch (e) {
            console.error('Error loading stats:', e);
        }
    },

    async loadUsers() {
        try {
            const res = await fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            if (res.ok) {
                this.users = await res.json();
                this.renderUsersTable();
            }
        } catch (e) {
            console.error('Error loading users:', e);
        }
    },

    renderUsersTable() {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;

        if (this.users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center py-6 text-gray-400">کاربری یافت نشد</td></tr>';
            return;
        }

        tbody.innerHTML = this.users.map(u => {
            const created = new Date(u.created_at).toLocaleDateString('fa-IR');
            const roleBadge = u.role === 'admin'
                ? '<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-semibold text-[10px]">Admin</span>'
                : '<span class="px-2 py-0.5 rounded bg-gray-500/20 text-gray-400 text-[10px]">User</span>';

            const quotaStr = u.token_quota > 0 ? u.token_quota.toLocaleString('fa-IR') : 'نامحدود';
            const usedStr = (u.tokens_used || 0).toLocaleString('fa-IR');
            const percent = u.token_quota > 0 ? Math.round((u.tokens_used / u.token_quota) * 100) : 0;
            const quotaBadgeColor = percent >= 90 ? 'text-rose-400' : (percent >= 70 ? 'text-amber-400' : 'text-emerald-400');

            return `
                <tr class="hover:bg-gray-50 dark:hover:bg-[#252525] transition">
                    <td class="p-3 font-mono text-gray-400">#${u.id}</td>
                    <td class="p-3 font-bold text-gray-200">${u.username}</td>
                    <td class="p-3">${roleBadge}</td>
                    <td class="p-3 text-center">
                        <div class="font-mono text-[11px] font-bold ${quotaBadgeColor}">${usedStr} / ${quotaStr}</div>
                        <button class="text-[10px] text-blue-400 hover:underline mt-0.5" onclick="Admin.openEditQuota(${u.id}, '${u.username}', ${u.token_quota})">تغییر سقف</button>
                    </td>
                    <td class="p-3 text-center font-bold text-blue-400 font-mono">${u.session_count || 0}</td>
                    <td class="p-3 text-center font-bold text-purple-400 font-mono">${u.message_count || 0}</td>
                    <td class="p-3 font-mono text-gray-400 text-[11px]">${created}</td>
                    <td class="p-3">
                        <span class="px-2 py-0.5 rounded text-[10px] ${u.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}">
                            ${u.is_active ? 'فعال' : 'غیرفعال'}
                        </span>
                    </td>
                    <td class="p-3 text-center flex items-center justify-center gap-1.5">
                        <button class="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white transition text-xs font-semibold flex items-center gap-1 shadow-sm" onclick="Admin.inspectUserHistory(${u.id})">
                            <i data-lucide="messages-square" class="w-3.5 h-3.5"></i>
                            <span>🔍 مشاهده سشن‌ها و پیام‌ها</span>
                        </button>
                        <button class="px-2 py-1.5 rounded-lg bg-gray-200 dark:bg-[#333] hover:bg-gray-300 dark:hover:bg-[#444] text-[11px]" onclick="Admin.toggleUserActive(${u.id}, ${!u.is_active})">
                            ${u.is_active ? 'غیرفعال' : 'فعال'}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    },

    async inspectUserHistory(userId) {
        this.currentInspectedUserId = userId;
        const modal = document.getElementById('user-history-modal');
        if (modal) modal.classList.remove('hidden');

        const sessionListEl = document.getElementById('uh-sessions-list');
        const messagesThreadEl = document.getElementById('uh-messages-thread');

        if (sessionListEl) sessionListEl.innerHTML = '<div class="text-center py-6 text-xs text-gray-400">در حال بارگذاری سشن‌های کاربر...</div>';
        if (messagesThreadEl) messagesThreadEl.innerHTML = '';

        try {
            const res = await fetch(`/api/admin/users/${userId}/details`, {
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            if (!res.ok) throw new Error('خطا در دریافت سشن‌های کاربر');

            const data = await res.json();
            const u = data.user;

            document.getElementById('uh-username').textContent = u.username;
            document.getElementById('uh-role').textContent = u.role === 'admin' ? 'مدیر سیستم' : 'کاربر عادی';
            document.getElementById('uh-avatar').textContent = u.username.substring(0, 1).toUpperCase();
            document.getElementById('uh-session-count').textContent = data.sessions.length;
            document.getElementById('uh-tokens').textContent = `توکن مصرفی: ${(u.tokens_used || 0).toLocaleString('fa-IR')} / ${(u.token_quota || 0).toLocaleString('fa-IR')}`;

            this.currentInspectedSessions = data.sessions || [];
            this.renderInspectedSessionsList();

            if (this.currentInspectedSessions.length > 0) {
                this.loadInspectedSessionMessages(this.currentInspectedSessions[0].id);
            } else {
                messagesThreadEl.innerHTML = `
                    <div class="h-full flex flex-col items-center justify-center text-center text-xs text-gray-400">
                        <i data-lucide="message-square-dashed" class="w-8 h-8 text-gray-500 mb-2"></i>
                        <span>این کاربر هنوز هیچ سشن گفتگویی ایجاد نکرده است.</span>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
            }

        } catch (e) {
            App.toast(e.message, 'error');
        }
    },

    renderInspectedSessionsList() {
        const listEl = document.getElementById('uh-sessions-list');
        if (!listEl) return;

        if (this.currentInspectedSessions.length === 0) {
            listEl.innerHTML = '<div class="text-center text-xs text-gray-400 py-6">هیچ سشنی یافت نشد</div>';
            return;
        }

        listEl.innerHTML = this.currentInspectedSessions.map(s => {
            const isActive = s.id === this.activeInspectedSessionId;
            const updated = new Date(s.updated_at).toLocaleDateString('fa-IR');
            const activeClasses = isActive 
                ? 'bg-emerald-600/25 border-emerald-500/60 text-white font-semibold' 
                : 'bg-gray-100 dark:bg-[#202020] text-gray-300 hover:bg-gray-200 dark:hover:bg-[#282828] border-transparent';

            return `
                <div class="p-3 rounded-xl border text-xs cursor-pointer transition shadow-sm ${activeClasses}" onclick="Admin.loadInspectedSessionMessages('${s.id}')">
                    <div class="flex items-center gap-1.5 mb-1.5">
                        <i data-lucide="message-square" class="w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-emerald-400' : 'text-gray-400'}"></i>
                        <span class="font-bold truncate text-gray-100">${s.title || 'گفتگوی بدون عنوان'}</span>
                    </div>
                    <div class="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                        <span class="bg-gray-200 dark:bg-[#2a2a2a] px-1.5 py-0.5 rounded text-emerald-400">${s.message_count} پیام</span>
                        <span>${updated}</span>
                    </div>
                </div>
            `;
        }).join('');

        if (window.lucide) lucide.createIcons();
    },

    async loadInspectedSessionMessages(sessionId) {
        this.activeInspectedSessionId = sessionId;
        this.renderInspectedSessionsList();

        const titleEl = document.getElementById('uh-active-session-title');
        const metaEl = document.getElementById('uh-active-session-meta');
        const threadEl = document.getElementById('uh-messages-thread');

        const activeSess = this.currentInspectedSessions.find(s => s.id === sessionId);
        if (titleEl && activeSess) titleEl.textContent = activeSess.title;
        if (metaEl && activeSess) metaEl.textContent = `مدل: ${activeSess.model_name}`;

        if (threadEl) threadEl.innerHTML = '<div class="text-center py-6 text-xs text-gray-400">در حال بارگذاری پیام‌های این سشن...</div>';

        try {
            const res = await fetch(`/api/admin/users/${this.currentInspectedUserId}/sessions/${sessionId}`, {
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            if (!res.ok) throw new Error('خطا در دریافت پیام‌های سشن');

            const data = await res.json();
            const msgs = data.messages || [];

            if (msgs.length === 0) {
                threadEl.innerHTML = '<div class="text-center py-6 text-xs text-gray-400">این سشن فاقد پیام است.</div>';
                return;
            }

            threadEl.innerHTML = msgs.map(m => {
                const isUser = m.role === 'user';
                const timeStr = new Date(m.created_at).toLocaleTimeString('fa-IR');
                const rtl = Chat.isRTLText ? Chat.isRTLText(m.content) : true;
                const dirAttr = rtl ? 'rtl' : 'ltr';

                let attachBadge = '';
                if (m.has_attachment && m.attachment_name) {
                    attachBadge = `<div class="text-[11px] mb-1.5 flex items-center gap-1 text-emerald-400 font-mono"><i data-lucide="file-text" class="w-3.5 h-3.5"></i><span>${m.attachment_name}</span></div>`;
                }

                if (isUser) {
                    return `
                        <div class="flex justify-end gap-2">
                            <div class="max-w-[85%] rounded-2xl p-3.5 bg-gray-200 dark:bg-[#2c2c2c] text-gray-900 dark:text-gray-100 text-xs shadow-sm" dir="${dirAttr}">
                                ${attachBadge}
                                <div class="whitespace-pre-wrap leading-relaxed">${m.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                                <div class="text-[10px] text-gray-400 text-left font-mono mt-1">${timeStr}</div>
                            </div>
                        </div>
                    `;
                } else {
                    const parsedHtml = marked.parse(m.content || '');
                    return `
                        <div class="flex justify-start gap-2.5">
                            <div class="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                                AI
                            </div>
                            <div class="flex-1 max-w-[90%] space-y-1">
                                <div class="prose-custom text-gray-800 dark:text-gray-200 text-xs bg-gray-50 dark:bg-[#181818] p-3.5 rounded-2xl border border-gray-200 dark:border-gray-800" dir="${dirAttr}">
                                    ${parsedHtml}
                                </div>
                                <div class="text-[10px] text-gray-400 font-mono text-right px-1">${timeStr}</div>
                            </div>
                        </div>
                    `;
                }
            }).join('');

            threadEl.querySelectorAll('pre code').forEach(block => {
                hljs.highlightElement(block);
                if (window.Chat && window.Chat.addCopyButtonToCode) {
                    window.Chat.addCopyButtonToCode(block.parentElement);
                }
            });

            if (window.lucide) lucide.createIcons();

        } catch (e) {
            threadEl.innerHTML = `<div class="text-center py-6 text-xs text-rose-400">${e.message}</div>`;
        }
    },

    openEditQuota(userId, username, currentQuota) {
        const modal = document.getElementById('edit-quota-modal');
        document.getElementById('edit-quota-user-id').value = userId;
        document.getElementById('edit-quota-username').textContent = username;
        const input = document.getElementById('edit-quota-input');
        const quotaVal = currentQuota || 50000;
        input.value = quotaVal;
        const preview = document.getElementById('edit-quota-preview');
        if (preview) preview.textContent = `${Number(quotaVal).toLocaleString('fa-IR')} توکن`;
        const resetCheckbox = document.getElementById('edit-quota-reset-used');
        if (resetCheckbox) resetCheckbox.checked = false;
        if (modal) modal.classList.remove('hidden');
    },

    setupQuotaModal() {
        const modal = document.getElementById('edit-quota-modal');
        const btnClose = document.getElementById('btn-close-edit-quota');
        const form = document.getElementById('edit-quota-form');
        const quotaInput = document.getElementById('edit-quota-input');
        const preview = document.getElementById('edit-quota-preview');

        if (quotaInput && preview) {
            quotaInput.addEventListener('input', () => {
                const val = parseInt(quotaInput.value) || 0;
                preview.textContent = `${val.toLocaleString('fa-IR')} توکن`;
            });
        }

        if (btnClose && modal) {
            btnClose.addEventListener('click', () => modal.classList.add('hidden'));
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const userId = document.getElementById('edit-quota-user-id').value;
                const newQuota = parseInt(document.getElementById('edit-quota-input').value) || 50000;
                const resetUsed = document.getElementById('edit-quota-reset-used')?.checked || false;

                const payload = { token_quota: newQuota };
                if (resetUsed) payload.tokens_used = 0;

                try {
                    const res = await fetch(`/api/admin/users/${userId}`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${App.token}`
                        },
                        body: JSON.stringify(payload)
                    });
                    if (res.ok) {
                        App.toast('سقف توکن کاربر با موفقیت تغییر یافت', 'success');
                        modal.classList.add('hidden');
                        this.loadUsers();
                    } else {
                        const err = await res.json();
                        App.toast(err.detail || 'خطا در به‌روزرسانی سقف توکن', 'error');
                    }
                } catch (err) {
                    App.toast('خطا در به‌روزرسانی سقف توکن', 'error');
                }
            });
        }
    },

    async loadLogs() {
        const search = document.getElementById('logs-search-input')?.value || '';
        const authType = document.getElementById('logs-filter-type')?.value || '';
        const tbody = document.getElementById('logs-table-body');
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-gray-400">در حال بارگذاری لاگ‌ها...</td></tr>';

        try {
            const res = await fetch(`/api/admin/logs?search=${encodeURIComponent(search)}&auth_type=${encodeURIComponent(authType)}`, {
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                this.logs = data.items || [];
                this.renderLogsTable();
            }
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-rose-400">خطا در بارگذاری لاگ‌ها</td></tr>';
        }
    },

    renderLogsTable() {
        const tbody = document.getElementById('logs-table-body');
        if (!tbody) return;

        if (this.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center py-6 text-gray-400">هیچ لاگی یافت نشد</td></tr>';
            return;
        }

        tbody.innerHTML = this.logs.map((log, idx) => {
            const timeStr = new Date(log.created_at).toLocaleString('fa-IR');
            const statusBadge = log.status === 'success'
                ? '<span class="text-emerald-400 font-semibold">موفق</span>'
                : '<span class="text-rose-400 font-semibold">خطا</span>';

            return `
                <tr class="hover:bg-gray-50 dark:hover:bg-[#252525] transition">
                    <td class="p-3 font-mono text-gray-400 text-[11px]">${timeStr}</td>
                    <td class="p-3 font-medium text-gray-200">${log.username}</td>
                    <td class="p-3 font-mono text-[11px] text-emerald-400">${log.model}</td>
                    <td class="p-3 max-w-xs truncate text-gray-300" title="${log.prompt_full.replace(/"/g, '&quot;')}">${log.prompt_preview}</td>
                    <td class="p-3 font-mono text-[11px]">${log.latency_ms} ms</td>
                    <td class="p-3">${statusBadge}</td>
                    <td class="p-3 text-center">
                        <button class="px-2.5 py-1 rounded-lg bg-gray-200 dark:bg-[#333] hover:bg-emerald-600 hover:text-white transition text-xs" onclick="Admin.inspectLog(${idx})">
                            مشاهده
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    },

    inspectLog(idx) {
        const log = this.logs[idx];
        if (!log) return;

        const modal = document.getElementById('log-detail-modal');
        document.getElementById('modal-log-user').textContent = log.username;
        document.getElementById('modal-log-model').textContent = log.model;
        document.getElementById('modal-log-latency').textContent = `${log.latency_ms} ms`;
        document.getElementById('modal-log-ip').textContent = log.ip_address;
        
        document.getElementById('modal-log-prompt').textContent = log.prompt_full;
        document.getElementById('modal-log-response').textContent = log.response_full || '(پاسخی ثبت نشده)';

        if (modal) modal.classList.remove('hidden');

        const btnClose = document.getElementById('btn-close-log-detail');
        if (btnClose) btnClose.onclick = () => modal.classList.add('hidden');
    },

    async toggleUserActive(userId, newStatus) {
        try {
            const res = await fetch(`/api/admin/users/${userId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${App.token}`
                },
                body: JSON.stringify({ is_active: newStatus })
            });
            if (res.ok) {
                App.toast('وضعیت کاربر به‌روزرسانی شد', 'success');
                this.loadUsers();
            }
        } catch (e) {
            App.toast('خطا در به‌روزرسانی وضعیت کاربر', 'error');
        }
    },

    setupUserModals() {
        const btnShow = document.getElementById('btn-show-create-user-modal');
        const modal = document.getElementById('create-user-modal');
        const btnClose = document.getElementById('btn-close-create-user');
        const form = document.getElementById('create-user-form');
        const credBox = document.getElementById('new-user-credentials-box');
        const btnCopyCreds = document.getElementById('btn-copy-all-credentials');
        const btnGenPass = document.getElementById('btn-generate-password');
        const quotaInput = document.getElementById('new-user-quota');
        const quotaPreview = document.getElementById('new-user-quota-preview');
        const errorAlert = document.getElementById('create-user-error-alert');
        const errorText = document.getElementById('create-user-error-text');

        // Setup Quick Quota Selectors across all modals
        document.querySelectorAll('.btn-quick-quota').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = btn.getAttribute('data-target');
                const val = btn.getAttribute('data-value');
                const targetInput = document.getElementById(targetId);
                if (targetInput) {
                    targetInput.value = val;
                    targetInput.dispatchEvent(new Event('input'));
                }
            });
        });

        // Setup Live Quota Preview for Create User
        if (quotaInput && quotaPreview) {
            quotaInput.addEventListener('input', () => {
                const val = parseInt(quotaInput.value) || 0;
                quotaPreview.textContent = `${val.toLocaleString('fa-IR')} توکن`;
            });
        }

        // Setup Password Generator
        if (btnGenPass) {
            btnGenPass.addEventListener('click', () => {
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
                let gen = '';
                for (let i = 0; i < 10; i++) {
                    gen += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                const passInput = document.getElementById('new-user-password');
                if (passInput) passInput.value = gen;
                App.toast('کلمه عبور تصادفی تولید شد', 'info');
            });
        }

        if (btnShow && modal) {
            btnShow.addEventListener('click', () => {
                modal.classList.remove('hidden');
                if (credBox) credBox.classList.add('hidden');
                if (errorAlert) errorAlert.classList.add('hidden');
                if (form) {
                    form.reset();
                    if (quotaInput) quotaInput.value = 50000;
                    if (quotaPreview) quotaPreview.textContent = '۵۰,۰۰۰ توکن';
                }
            });
        }
        if (btnClose && modal) {
            btnClose.addEventListener('click', () => modal.classList.add('hidden'));
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (errorAlert) errorAlert.classList.add('hidden');

                const username = document.getElementById('new-user-username').value.trim();
                const password = document.getElementById('new-user-password').value;
                const quota = parseInt(document.getElementById('new-user-quota').value) || 50000;
                const role = document.getElementById('new-user-role').value;
                const submitBtn = document.getElementById('btn-create-user-submit');

                if (!username || username.length < 3) {
                    if (errorAlert && errorText) {
                        errorText.textContent = 'نام کاربری باید حداقل ۳ کاراکتر باشد.';
                        errorAlert.classList.remove('hidden');
                    }
                    return;
                }
                if (!password || password.length < 4) {
                    if (errorAlert && errorText) {
                        errorText.textContent = 'کلمه عبور باید حداقل ۴ کاراکتر باشد.';
                        errorAlert.classList.remove('hidden');
                    }
                    return;
                }

                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<span class="animate-spin inline-block mr-1">⏳</span> در حال صدور مشخصات...';
                }

                try {
                    const res = await fetch('/api/admin/users', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${App.token}`
                        },
                        body: JSON.stringify({ username, password, role, token_quota: quota })
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        const errMsg = data.detail || 'خطا در تعریف کاربر';
                        if (errorAlert && errorText) {
                            errorText.textContent = errMsg;
                            errorAlert.classList.remove('hidden');
                        }
                        App.toast(errMsg, 'error');
                        return;
                    }

                    App.toast(`کاربر ${username} با موفقیت ساخته شد`, 'success');
                    
                    if (credBox && data.credentials) {
                        document.getElementById('cred-username').textContent = data.credentials.username;
                        document.getElementById('cred-password').textContent = data.credentials.password;
                        document.getElementById('cred-quota').textContent = `${data.credentials.token_quota.toLocaleString('fa-IR')} توکن در روز`;
                        credBox.classList.remove('hidden');
                        credBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                        if (btnCopyCreds) {
                            btnCopyCreds.onclick = () => {
                                const infoText = `اطلاعات ورود به سامانه هوش مصنوعی:
آدرس سامانه: http://127.0.0.1:8000
نام کاربری: ${data.credentials.username}
کلمه عبور: ${data.credentials.password}
سقف توکن روزانه: ${data.credentials.token_quota.toLocaleString('fa-IR')} توکن`;
                                App.copyToClipboard(infoText, 'مشخصات ورود کاربر با موفقیت کپی شد!');
                                btnCopyCreds.innerHTML = '<i data-lucide="check" class="w-4 h-4 text-white"></i><span>✓ مشخصات با موفقیت کپی شد!</span>';
                                btnCopyCreds.classList.add('bg-emerald-700');
                                setTimeout(() => {
                                    btnCopyCreds.innerHTML = '<i data-lucide="copy" class="w-4 h-4"></i><span>کپی تمام مشخصات برای ارسال به کاربر</span>';
                                    btnCopyCreds.classList.remove('bg-emerald-700');
                                    if (window.lucide) lucide.createIcons();
                                }, 2500);
                                if (window.lucide) lucide.createIcons();
                            };
                        }
                    }

                    this.loadUsers();
                    this.loadStats();
                } catch (err) {
                    if (errorAlert && errorText) {
                        errorText.textContent = err.message || 'خطا در برقراری ارتباط با سرور';
                        errorAlert.classList.remove('hidden');
                    }
                    App.toast(err.message, 'error');
                } finally {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = '<span>ساخت کاربر و صدور مشخصات</span>';
                    }
                }
            });
        }
    },

    setupMaintenance() {
        const btnCleanup = document.getElementById('btn-trigger-cleanup');
        const resultBox = document.getElementById('cleanup-result-box');

        if (btnCleanup) {
            btnCleanup.addEventListener('click', async () => {
                btnCleanup.disabled = true;
                btnCleanup.textContent = 'در حال پردازش پاکسازی...';

                try {
                    const res = await fetch('/api/admin/cleanup', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${App.token}` }
                    });
                    const data = await res.json();
                    if (res.ok) {
                        App.toast('عملیات پاکسازی با موفقیت انجام شد', 'success');
                        if (resultBox) {
                            resultBox.classList.remove('hidden');
                            resultBox.innerHTML = `
                                <div class="text-emerald-400 font-bold mb-1">نتیجه پاکسازی:</div>
                                <div>پیام‌های قدیمی حذف‌شده: ${data.details.deleted_messages}</div>
                                <div>لاگ‌های پرامپت حذف‌شده: ${data.details.deleted_logs}</div>
                                <div>سشن‌های خالی حذف‌شده: ${data.details.deleted_empty_sessions}</div>
                                <div class="text-gray-500 mt-1">تاریخ مبنا: ${data.details.cutoff_date}</div>
                            `;
                        }
                        this.loadStats();
                        this.loadLogs();
                    }
                } catch (err) {
                    App.toast('خطا در اجرای پاکسازی', 'error');
                } finally {
                    btnCleanup.disabled = false;
                    btnCleanup.innerHTML = '<i data-lucide="play" class="w-4 h-4"></i><span>اجرای فوری پاکسازی ۱۰ روزه</span>';
                    if (window.lucide) lucide.createIcons();
                }
            });
        }
    }
};

window.Admin = Admin;
