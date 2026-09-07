// Admin Dashboard & User History Controller
const Admin = {
    logs: [],
    users: [],
    skills: [],
    currentEditingSkillId: null,
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
        const tabs = ['users', 'skills', 'model', 'logs', 'maintenance'];
        tabs.forEach(tab => {
            const btn = document.getElementById(`admin-tab-${tab}`);
            if (btn) {
                btn.addEventListener('click', () => this.switchTab(tab));
            }
        });

        // Skills Setup
        this.setupSkills();

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
        const tabs = ['users', 'skills', 'model', 'logs', 'maintenance'];
        tabs.forEach(tab => {
            const btn = document.getElementById(`admin-tab-${tab}`);
            const panel = document.getElementById(`admin-panel-${tab}`);
            if (tab === activeTab) {
                if (btn) {
                    btn.className = 'admin-tab-btn px-4 py-3 border-b-2 border-emerald-500 text-emerald-500 font-semibold flex items-center gap-2 flex-shrink-0';
                }
                if (panel) panel.classList.remove('hidden');
            } else {
                if (btn) {
                    btn.className = 'admin-tab-btn px-4 py-3 border-b-2 border-transparent text-gray-500 hover:text-gray-300 flex items-center gap-2 flex-shrink-0';
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
            this.loadSkills(),
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
                const totalUsersEl = document.getElementById('stat-total-users');
                if (totalUsersEl) totalUsersEl.textContent = s.total_users;
                const totalSessEl = document.getElementById('stat-total-sessions');
                if (totalSessEl) totalSessEl.textContent = s.total_sessions;
                const totalMsgEl = document.getElementById('stat-total-messages');
                if (totalMsgEl) totalMsgEl.textContent = s.total_messages;
                const totalLogsEl = document.getElementById('stat-total-logs');
                if (totalLogsEl) totalLogsEl.textContent = s.total_logs;

                const skillsEl = document.getElementById('stat-total-skills');
                if (skillsEl && s.total_skills !== undefined) {
                    skillsEl.textContent = `${s.active_skills || 0} / ${s.total_skills || 0}`;
                }
                const badgeSkills = document.getElementById('badge-skills-count');
                if (badgeSkills) badgeSkills.textContent = s.active_skills || 0;
                const headerSkills = document.getElementById('active-skills-count-display');
                if (headerSkills) headerSkills.textContent = `${s.active_skills || 0} مهارت فعال`;

                const latencyEl = document.getElementById('stat-avg-latency');
                if (latencyEl) latencyEl.textContent = `${s.avg_latency_ms} ms`;
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
    },

    // --- Skills Management Controller ---

    setupSkills() {
        // Single File Input
        const btnSingle = document.getElementById('btn-skills-upload-single');
        const inputSingle = document.getElementById('skills-single-file-input');
        if (btnSingle && inputSingle) {
            btnSingle.addEventListener('click', () => inputSingle.click());
            inputSingle.addEventListener('change', () => {
                if (inputSingle.files && inputSingle.files.length > 0) {
                    this.uploadSkillFiles(inputSingle.files);
                    inputSingle.value = '';
                }
            });
        }

        // Folder Input (webkitdirectory)
        const btnFolder = document.getElementById('btn-skills-upload-folder');
        const inputFolder = document.getElementById('skills-folder-input');
        if (btnFolder && inputFolder) {
            btnFolder.addEventListener('click', () => inputFolder.click());
            inputFolder.addEventListener('change', () => {
                if (inputFolder.files && inputFolder.files.length > 0) {
                    this.uploadSkillFiles(inputFolder.files, true);
                    inputFolder.value = '';
                }
            });
        }

        // Zip Input
        const btnZip = document.getElementById('btn-skills-upload-zip');
        const inputZip = document.getElementById('skills-zip-input');
        if (btnZip && inputZip) {
            btnZip.addEventListener('click', () => inputZip.click());
            inputZip.addEventListener('change', () => {
                if (inputZip.files && inputZip.files.length > 0) {
                    this.uploadSkillZip(inputZip.files[0]);
                    inputZip.value = '';
                }
            });
        }

        // Toggle Scan Path Box
        const btnToggleScan = document.getElementById('btn-skills-toggle-scan-box');
        const scanContainer = document.getElementById('skills-scan-path-container');
        if (btnToggleScan && scanContainer) {
            btnToggleScan.addEventListener('click', () => {
                scanContainer.classList.toggle('hidden');
                if (!scanContainer.classList.contains('hidden')) {
                    const input = document.getElementById('skills-scan-path-input');
                    if (input) input.focus();
                }
            });
        }

        // Submit Scan Path
        const btnSubmitScan = document.getElementById('btn-submit-scan-path');
        const inputScanPath = document.getElementById('skills-scan-path-input');
        if (btnSubmitScan && inputScanPath) {
            btnSubmitScan.addEventListener('click', () => this.scanServerPath());
            inputScanPath.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.scanServerPath();
                }
            });
        }

        // Drag & Drop Zone
        const dropZone = document.getElementById('skills-drop-zone');
        if (dropZone) {
            ['dragenter', 'dragover'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropZone.classList.add('border-emerald-500', 'bg-emerald-500/10');
                });
            });
            ['dragleave', 'drop'].forEach(eventName => {
                dropZone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropZone.classList.remove('border-emerald-500', 'bg-emerald-500/10');
                });
            });
            dropZone.addEventListener('drop', async (e) => {
                const dt = e.dataTransfer;
                if (!dt) return;

                // Handle folder scanning via DataTransferItems if available
                if (dt.items && dt.items.length > 0 && dt.items[0].webkitGetAsEntry) {
                    const filesWithPaths = [];
                    const readEntry = async (entry, currentPath = "") => {
                        if (entry.isFile) {
                            await new Promise(resolve => {
                                entry.file(file => {
                                    file.customRelativePath = currentPath + file.name;
                                    filesWithPaths.push(file);
                                    resolve();
                                });
                            });
                        } else if (entry.isDirectory) {
                            const dirReader = entry.createReader();
                            const entries = await new Promise(resolve => {
                                dirReader.readEntries(entries => resolve(entries));
                            });
                            for (const child of entries) {
                                await readEntry(child, currentPath + entry.name + "/");
                            }
                        }
                    };

                    for (let i = 0; i < dt.items.length; i++) {
                        const entry = dt.items[i].webkitGetAsEntry();
                        if (entry) await readEntry(entry);
                    }

                    if (filesWithPaths.length > 0) {
                        this.uploadSkillFiles(filesWithPaths, true);
                        return;
                    }
                }

                if (dt.files && dt.files.length > 0) {
                    this.uploadSkillFiles(dt.files);
                }
            });
        }

        // Search & Filter
        const searchInput = document.getElementById('skills-search-input');
        const filterStatus = document.getElementById('skills-filter-status');
        const btnRefresh = document.getElementById('btn-refresh-skills');

        if (searchInput) {
            let timeout = null;
            searchInput.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => this.loadSkills(), 400);
            });
        }
        if (filterStatus) filterStatus.addEventListener('change', () => this.loadSkills());
        if (btnRefresh) btnRefresh.addEventListener('click', () => this.loadSkills());

        // Bulk Actions
        const btnActivateAll = document.getElementById('btn-skills-activate-all');
        const btnDeactivateAll = document.getElementById('btn-skills-deactivate-all');
        if (btnActivateAll) btnActivateAll.addEventListener('click', () => this.toggleAllSkills(true));
        if (btnDeactivateAll) btnDeactivateAll.addEventListener('click', () => this.toggleAllSkills(false));

        // Skill Modal Actions
        const modal = document.getElementById('skill-modal');
        const btnClose = document.getElementById('btn-close-skill-modal');
        const btnCancel = document.getElementById('btn-cancel-skill-edit');
        const btnSave = document.getElementById('btn-save-skill-changes');
        const btnDelete = document.getElementById('btn-delete-current-skill');

        if (btnClose && modal) btnClose.addEventListener('click', () => modal.classList.add('hidden'));
        if (btnCancel && modal) btnCancel.addEventListener('click', () => modal.classList.add('hidden'));
        if (btnSave) btnSave.addEventListener('click', () => this.saveSkillChanges());
        if (btnDelete) btnDelete.addEventListener('click', () => this.deleteSkill(this.currentEditingSkillId));

        // Skill Modal Edit / Preview Tabs
        const btnTabEdit = document.getElementById('btn-skill-tab-edit');
        const btnTabPreview = document.getElementById('btn-skill-tab-preview');
        const editContainer = document.getElementById('skill-edit-tab-container');
        const previewContainer = document.getElementById('skill-preview-tab-container');
        const contentTextarea = document.getElementById('skill-edit-content');

        if (btnTabEdit && btnTabPreview && editContainer && previewContainer) {
            btnTabEdit.addEventListener('click', () => {
                btnTabEdit.className = 'px-3 py-2 text-xs font-bold text-emerald-500 border-b-2 border-emerald-500 flex items-center gap-1.5 cursor-pointer';
                btnTabPreview.className = 'px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-200 border-b-2 border-transparent flex items-center gap-1.5 cursor-pointer';
                editContainer.classList.remove('hidden');
                previewContainer.classList.add('hidden');
            });
            btnTabPreview.addEventListener('click', () => {
                btnTabPreview.className = 'px-3 py-2 text-xs font-bold text-emerald-500 border-b-2 border-emerald-500 flex items-center gap-1.5 cursor-pointer';
                btnTabEdit.className = 'px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-200 border-b-2 border-transparent flex items-center gap-1.5 cursor-pointer';
                const mdContent = contentTextarea ? contentTextarea.value : '';
                previewContainer.innerHTML = window.marked ? marked.parse(mdContent) : `<pre>${mdContent}</pre>`;
                editContainer.classList.add('hidden');
                previewContainer.classList.remove('hidden');
            });
        }

        // Active Checkbox Label Update
        const activeCheck = document.getElementById('skill-edit-active');
        const activeLabel = document.getElementById('skill-edit-active-label');
        if (activeCheck && activeLabel) {
            activeCheck.addEventListener('change', () => {
                activeLabel.textContent = activeCheck.checked ? 'فعال' : 'غیرفعال';
                activeLabel.className = activeCheck.checked 
                    ? 'mr-2 text-xs font-semibold text-emerald-500' 
                    : 'mr-2 text-xs font-medium text-gray-400';
            });
        }
    },

    async loadSkills() {
        const searchInput = document.getElementById('skills-search-input');
        const filterStatus = document.getElementById('skills-filter-status');
        const queryParams = new URLSearchParams();

        if (searchInput && searchInput.value.trim()) queryParams.append('search', searchInput.value.trim());
        if (filterStatus && filterStatus.value) queryParams.append('status', filterStatus.value);

        try {
            const res = await fetch(`/api/admin/skills?${queryParams.toString()}`, {
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                this.skills = data.items || [];
                
                // Update badge and stats
                const badge = document.getElementById('badge-skills-count');
                if (badge) badge.textContent = data.active_count || 0;

                const skillsStat = document.getElementById('stat-total-skills');
                if (skillsStat) skillsStat.textContent = `${data.active_count || 0} / ${data.total || 0}`;

                const headerSkills = document.getElementById('active-skills-count-display');
                if (headerSkills) headerSkills.textContent = `${data.active_count || 0} مهارت فعال`;

                this.renderSkillsTable();
            }
        } catch (e) {
            console.error('Error loading skills:', e);
        }
    },

    renderSkillsTable() {
        const tbody = document.getElementById('skills-table-body');
        if (!tbody) return;

        if (this.skills.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="p-8 text-center text-gray-400">
                        <i data-lucide="folder-code" class="w-8 h-8 text-gray-500 mx-auto mb-2 opacity-60"></i>
                        <p class="font-medium text-xs">هیچ مهارتی یافت نشد.</p>
                        <p class="text-[11px] text-gray-500 mt-1">با استفاده از دکمه‌های بالا، فایل .md تکی یا پوشه مهارت‌ها را بارگذاری نمایید.</p>
                    </td>
                </tr>
            `;
            if (window.lucide) lucide.createIcons();
            return;
        }

        tbody.innerHTML = this.skills.map(sk => `
            <tr class="hover:bg-gray-50/60 dark:hover:bg-[#262626]/60 transition-colors">
                <td class="p-3 font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <i data-lucide="file-text" class="w-4 h-4 text-amber-500 flex-shrink-0"></i>
                    <span>${sk.name}</span>
                </td>
                <td class="p-3 font-mono text-[11px] text-gray-500 dark:text-gray-400 max-w-[180px] truncate" dir="ltr" title="${sk.filename || '-'}">
                    ${sk.filename || '-'}
                </td>
                <td class="p-3 text-gray-600 dark:text-gray-300 max-w-[280px] truncate" title="${sk.description || ''}">
                    ${sk.description || '-'}
                </td>
                <td class="p-3 text-center font-mono text-gray-500 text-[11px]">
                    ${(sk.char_count || 0).toLocaleString()} کاراکتر
                </td>
                <td class="p-3 text-center">
                    <button type="button" onclick="Admin.toggleSkill(${sk.id})" class="px-2.5 py-1 rounded-full text-[11px] font-semibold transition cursor-pointer ${sk.is_active ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/30' : 'bg-gray-200 dark:bg-[#333] text-gray-500 hover:bg-gray-300 dark:hover:bg-[#444]'}">
                        ${sk.is_active ? '● فعال' : '○ غیرفعال'}
                    </button>
                </td>
                <td class="p-3 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                        <button type="button" onclick="Admin.openSkillModal(${sk.id})" class="p-1.5 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition cursor-pointer" title="مشاهده و ویرایش">
                            <i data-lucide="edit-3" class="w-4 h-4"></i>
                        </button>
                        <button type="button" onclick="Admin.deleteSkill(${sk.id})" class="p-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 transition cursor-pointer" title="حذف مهارت">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        if (window.lucide) lucide.createIcons();
    },

    async uploadSkillFiles(files, isFolder = false) {
        if (!files || files.length === 0) return;

        const spinner = document.getElementById('skills-upload-spinner');
        const spinnerText = document.getElementById('skills-upload-status-text');
        if (spinner) {
            spinner.classList.remove('hidden');
            if (spinnerText) spinnerText.textContent = `در حال بارگذاری ${files.length} فایل...`;
        }

        const formData = new FormData();
        const relPaths = [];

        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            formData.append('files', f);
            const path = f.customRelativePath || f.webkitRelativePath || f.name;
            relPaths.push(path);
        }
        formData.append('relative_paths', JSON.stringify(relPaths));

        try {
            const res = await fetch('/api/admin/skills/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${App.token}` },
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                App.toast(data.message || 'فایل‌های مهارت با موفقیت بارگذاری شدند.', 'success');
                await this.loadSkills();
                await this.loadStats();
            } else {
                App.toast(data.detail || 'خطا در بارگذاری فایل‌ها', 'error');
            }
        } catch (e) {
            App.toast('خطای شبکه در بارگذاری مهارت‌ها', 'error');
        } finally {
            if (spinner) spinner.classList.add('hidden');
        }
    },

    async uploadSkillZip(file) {
        if (!file) return;

        const spinner = document.getElementById('skills-upload-spinner');
        const spinnerText = document.getElementById('skills-upload-status-text');
        if (spinner) {
            spinner.classList.remove('hidden');
            if (spinnerText) spinnerText.textContent = 'در حال استخراج و بارگذاری فایل فشرده zip...';
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('/api/admin/skills/upload-zip', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${App.token}` },
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                App.toast(data.message || 'فایل زیپ مهارت‌ها با موفقیت درون‌ریزی شد.', 'success');
                await this.loadSkills();
                await this.loadStats();
            } else {
                App.toast(data.detail || 'خطا در استخراج فایل زیپ', 'error');
            }
        } catch (e) {
            App.toast('خطای سرور در استخراج فایل زیپ', 'error');
        } finally {
            if (spinner) spinner.classList.add('hidden');
        }
    },

    async scanServerPath() {
        const input = document.getElementById('skills-scan-path-input');
        const pathVal = input ? input.value.trim() : '';
        if (!pathVal) {
            App.toast('لطفاً مسیر پوشه روی سرور/سیستم را وارد کنید.', 'error');
            return;
        }

        const btn = document.getElementById('btn-submit-scan-path');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i><span>در حال اسکن...</span>';
        }

        try {
            const res = await fetch('/api/admin/skills/scan-folder', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${App.token}`
                },
                body: JSON.stringify({ folder_path: pathVal })
            });
            const data = await res.json();
            if (res.ok) {
                App.toast(data.message || 'اسکن پوشه پایان یافت.', 'success');
                await this.loadSkills();
                await this.loadStats();
            } else {
                App.toast(data.detail || 'خطا در اسکن پوشه', 'error');
            }
        } catch (e) {
            App.toast('خطا در ارتباط با سرور جهت اسکن پوشه', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="search" class="w-3.5 h-3.5"></i><span>اسکن و درون‌ریزی</span>';
                if (window.lucide) lucide.createIcons();
            }
        }
    },

    async toggleSkill(skillId) {
        try {
            const res = await fetch(`/api/admin/skills/${skillId}/toggle`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            const data = await res.json();
            if (res.ok) {
                App.toast(data.message, 'info');
                await this.loadSkills();
                await this.loadStats();
            } else {
                App.toast(data.detail || 'خطا در تغییر وضعیت مهارت', 'error');
            }
        } catch (e) {
            App.toast('خطا در برقراری ارتباط با سرور', 'error');
        }
    },

    async toggleAllSkills(active) {
        try {
            const res = await fetch('/api/admin/skills/toggle-all', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${App.token}`
                },
                body: JSON.stringify({ is_active: active })
            });
            const data = await res.json();
            if (res.ok) {
                App.toast(data.message, 'success');
                await this.loadSkills();
                await this.loadStats();
            } else {
                App.toast(data.detail || 'خطا در اعمال تغییرات دسته‌جمعی', 'error');
            }
        } catch (e) {
            App.toast('خطای ارتباط با سرور', 'error');
        }
    },

    async openSkillModal(skillId) {
        try {
            const res = await fetch(`/api/admin/skills/${skillId}`, {
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            if (!res.ok) {
                App.toast('خطا در دریافت اطلاعات مهارت', 'error');
                return;
            }
            const sk = await res.json();
            this.currentEditingSkillId = sk.id;

            const modal = document.getElementById('skill-modal');
            const titleEl = document.getElementById('skill-modal-title');
            const fileEl = document.getElementById('skill-modal-filename');
            const idInput = document.getElementById('skill-edit-id');
            const nameInput = document.getElementById('skill-edit-name');
            const activeCheck = document.getElementById('skill-edit-active');
            const activeLabel = document.getElementById('skill-edit-active-label');
            const descInput = document.getElementById('skill-edit-description');
            const contentInput = document.getElementById('skill-edit-content');

            if (titleEl) titleEl.textContent = sk.name;
            if (fileEl) fileEl.textContent = sk.filename || 'skill.md';
            if (idInput) idInput.value = sk.id;
            if (nameInput) nameInput.value = sk.name;
            if (activeCheck) {
                activeCheck.checked = sk.is_active;
                if (activeLabel) {
                    activeLabel.textContent = sk.is_active ? 'فعال' : 'غیرفعال';
                    activeLabel.className = sk.is_active ? 'mr-2 text-xs font-semibold text-emerald-500' : 'mr-2 text-xs font-medium text-gray-400';
                }
            }
            if (descInput) descInput.value = sk.description || '';
            if (contentInput) contentInput.value = sk.content || '';

            // Reset to Edit tab
            const btnTabEdit = document.getElementById('btn-skill-tab-edit');
            const btnTabPreview = document.getElementById('btn-skill-tab-preview');
            const editContainer = document.getElementById('skill-edit-tab-container');
            const previewContainer = document.getElementById('skill-preview-tab-container');

            if (btnTabEdit) btnTabEdit.className = 'px-3 py-2 text-xs font-bold text-emerald-500 border-b-2 border-emerald-500 flex items-center gap-1.5 cursor-pointer';
            if (btnTabPreview) btnTabPreview.className = 'px-3 py-2 text-xs font-medium text-gray-400 hover:text-gray-200 border-b-2 border-transparent flex items-center gap-1.5 cursor-pointer';
            if (editContainer) editContainer.classList.remove('hidden');
            if (previewContainer) previewContainer.classList.add('hidden');

            if (modal) modal.classList.remove('hidden');
            if (window.lucide) lucide.createIcons();
        } catch (e) {
            App.toast('خطا در باز کردن مهارت', 'error');
        }
    },

    async saveSkillChanges() {
        if (!this.currentEditingSkillId) return;

        const nameInput = document.getElementById('skill-edit-name');
        const descInput = document.getElementById('skill-edit-description');
        const activeCheck = document.getElementById('skill-edit-active');
        const contentInput = document.getElementById('skill-edit-content');

        const payload = {
            name: nameInput ? nameInput.value.trim() : undefined,
            description: descInput ? descInput.value.trim() : undefined,
            is_active: activeCheck ? activeCheck.checked : undefined,
            content: contentInput ? contentInput.value : undefined
        };

        const btnSave = document.getElementById('btn-save-skill-changes');
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i><span>در حال ذخیره...</span>';
        }

        try {
            const res = await fetch(`/api/admin/skills/${this.currentEditingSkillId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${App.token}`
                },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                App.toast('تغییرات مهارت با موفقیت ذخیره شد.', 'success');
                const modal = document.getElementById('skill-modal');
                if (modal) modal.classList.add('hidden');
                await this.loadSkills();
                await this.loadStats();
            } else {
                App.toast(data.detail || 'خطا در ذخیره تغییرات مهارت', 'error');
            }
        } catch (e) {
            App.toast('خطای شبکه در ذخیره مهارت', 'error');
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i><span>ذخیره تغییرات</span>';
                if (window.lucide) lucide.createIcons();
            }
        }
    },

    async deleteSkill(skillId) {
        if (!skillId) return;
        if (!confirm('آیا از حذف این مهارت اطمینان دارید؟ این عمل قابل بازگشت نیست.')) return;

        try {
            const res = await fetch(`/api/admin/skills/${skillId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            const data = await res.json();
            if (res.ok) {
                App.toast(data.message || 'مهارت با موفقیت حذف شد.', 'success');
                const modal = document.getElementById('skill-modal');
                if (modal) modal.classList.add('hidden');
                await this.loadSkills();
                await this.loadStats();
            } else {
                App.toast(data.detail || 'خطا در حذف مهارت', 'error');
            }
        } catch (e) {
            App.toast('خطا در ارتباط با سرور هنگام حذف', 'error');
        }
    }
};

window.Admin = Admin;
