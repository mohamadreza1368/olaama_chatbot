// Chat & Session Controller
// Configure Marked with Native Visual Dashboard, Meter/Chart Renderer, & Code Block Header
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

            lang = (lang || 'code').trim().toLowerCase().split(/\s+/)[0];

            const safeCode = code
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

            const trimmedCode = code.trim();

            // 1. Markdown Table mistakenly placed in code block
            if (trimmedCode.startsWith('|') && trimmedCode.includes('\n|') && trimmedCode.includes('---')) {
                return marked.parse(trimmedCode);
            }

            // 2. ASCII Meter / Progress Bar / Health / Performance Status
            if (window.Chat && Chat.isMeterOrChart(code, lang)) {
                return Chat.renderOfficeMeterCard(code, safeCode);
            }

            // 3. Key-Value Bar Chart
            if (window.Chat && Chat.isKeyValueChart(code, lang)) {
                return Chat.renderOfficeBarChart(code, safeCode);
            }

            // 4. Default Code Block with Copy Button
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
    selectedSkill: null,
    availableSkills: [],
    slashFilteredSkills: [],
    activeSlashIndex: 0,
    isSlashOpen: false,
    isStreaming: false,
    abortController: null,

    toPersianDigits(str) {
        if (str === null || str === undefined) return '';
        const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
        return String(str).replace(/[0-9]/g, w => persianDigits[+w]);
    },

    isMeterOrChart(code, lang) {
        if (['meter', 'progress', 'status', 'gauge', 'ascii'].includes(lang)) return true;
        const hasBlocks = /[█■#=]{2,}/.test(code) && /[░□\-_ ]{1,}/.test(code);
        const hasBracketMeter = /\[[█■#=░□\-_ ]{3,}\]/.test(code);
        const hasStatusWords = /(نرمال|مرزی|بحرانی|نیاز به درمان|هشدار|سالم|طبیعی|موفق|درمان)/.test(code);
        const hasPercent = /\d+(\.\d+)?%/.test(code);
        return (hasBlocks || hasBracketMeter) || (hasStatusWords && (hasPercent || code.includes(':')));
    },

    renderOfficeMeterCard(rawCode, safeCode) {
        const lines = rawCode.split('\n').map(l => l.trim()).filter(Boolean);
        let title = 'گزارش شاخص و وضعیت آماری';
        let percent = 0;
        let percentFound = false;
        const badges = [];

        for (const line of lines) {
            if (/وضعیت|شاخص|پیشرفت|سلامت|گزارش/.test(line) && !line.includes('[') && !line.includes('█')) {
                title = line.replace(/[:\-#*]/g, '').trim();
            } else if (line.includes(':') && (line.includes('[') || line.includes('█'))) {
                const parts = line.split(':');
                if (parts[0].trim()) {
                    title = parts[0].replace(/[:\-#*]/g, '').trim();
                }
            }

            const pctMatch = line.match(/(\d+(?:\.\d+)?)\s*%/);
            if (pctMatch && !percentFound) {
                percent = parseFloat(pctMatch[1]);
                percentFound = true;
            }

            const meterMatch = line.match(/\[([█■#=░□\-_ ]+)\]/);
            if (meterMatch && !percentFound) {
                const meterStr = meterMatch[1];
                const filled = (meterStr.match(/[█■#=]/g) || []).length;
                const total = meterStr.length;
                if (total > 0) {
                    percent = Math.round((filled / total) * 100);
                    percentFound = true;
                }
            }

            const tokens = line.split(/\s{2,}|(?<=\))\s+/);
            for (const t of tokens) {
                const cleanT = t.trim();
                if (/نرمال|طبیعی|سالم|تایید|موفق|عالی/.test(cleanT)) {
                    badges.push({ type: 'success', text: cleanT.replace(/^[!⚠️✅❌]+/, '').trim() });
                } else if (/مرزی|هشدار|در انتظار|متوسط/.test(cleanT)) {
                    badges.push({ type: 'warning', text: cleanT.replace(/^[!⚠️✅❌]+/, '').trim() });
                } else if (/بحرانی|خطر|نیاز به درمان|رد شده|ناموفق|هشدار شدید/.test(cleanT)) {
                    badges.push({ type: 'danger', text: cleanT.replace(/^[!⚠️✅❌]+/, '').trim() });
                }
            }
        }

        if (!percentFound) percent = 50;
        percent = Math.max(0, Math.min(100, percent));

        let fillClass = '';
        let icon = 'activity';
        if (badges.some(b => b.type === 'danger') || percent < 40) {
            fillClass = 'danger';
            icon = 'alert-triangle';
        } else if (badges.some(b => b.type === 'warning') || (percent >= 40 && percent < 70)) {
            fillClass = 'warning';
            icon = 'alert-circle';
        }

        const badgesHtml = badges.map(b => {
            let cls = 'status-badge-info';
            let iconName = 'info';
            if (b.type === 'success') { cls = 'status-badge-success'; iconName = 'check-circle'; }
            if (b.type === 'warning') { cls = 'status-badge-warning'; iconName = 'alert-circle'; }
            if (b.type === 'danger') { cls = 'status-badge-danger'; iconName = 'alert-triangle'; }
            return `<span class="status-badge ${cls}"><i data-lucide="${iconName}" class="w-3.5 h-3.5"></i><span>${b.text}</span></span>`;
        }).join(' ');

        const cardId = 'chart-card-' + Math.random().toString(36).substring(2, 9);

        return `
            <div class="office-meter-card my-3 select-none" id="${cardId}">
                <div class="flex items-center justify-between gap-3 mb-2.5">
                    <div class="flex items-center gap-2 font-bold text-sm text-gray-800 dark:text-gray-100">
                        <span class="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            <i data-lucide="${icon}" class="w-4 h-4"></i>
                        </span>
                        <span>${title}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            ${this.toPersianDigits(percent)}٪
                        </span>
                        <button type="button" class="text-[11px] text-gray-400 hover:text-gray-200 px-1.5 py-0.5 rounded hover:bg-white/10 transition cursor-pointer" onclick="Chat.toggleVisualCode('${cardId}')" title="تغییر نمایش متنی / گرافیکی">
                            📋
                        </button>
                    </div>
                </div>
                <div class="office-meter-bar-track my-2">
                    <div class="office-meter-bar-fill ${fillClass}" style="width: ${percent}%"></div>
                </div>
                ${badgesHtml ? `<div class="flex flex-wrap items-center gap-2 mt-3 pt-2.5 border-t border-gray-200/60 dark:border-gray-700/50">${badgesHtml}</div>` : ''}
                <div class="raw-code-view hidden mt-3 pt-2 border-t border-gray-700/60 text-left font-mono text-xs text-gray-300" dir="ltr">
                    <pre class="p-2 bg-black/40 rounded-lg overflow-x-auto">${safeCode}</pre>
                </div>
            </div>
        `;
    },

    isKeyValueChart(code, lang) {
        if (['chart', 'bar', 'graph', 'data'].includes(lang)) return true;
        const lines = code.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length < 2) return false;
        let numMatches = 0;
        for (const line of lines) {
            if (/^[^:\-=]+[:\-=\t]+\s*[\d,.]+%?$/.test(line)) {
                numMatches++;
            }
        }
        return numMatches >= 2 && (numMatches / lines.length) >= 0.7;
    },

    renderOfficeBarChart(rawCode, safeCode) {
        const lines = rawCode.split('\n').map(l => l.trim()).filter(Boolean);
        const items = [];
        let maxVal = 0;

        for (const line of lines) {
            const match = line.match(/^([^:\-=]+)[:\-=\t]+\s*([\d,.]+)(%?)$/);
            if (match) {
                const label = match[1].replace(/^[\*\-#\d.]+\s*/, '').trim();
                const rawNum = parseFloat(match[2].replace(/,/g, ''));
                const isPercent = match[3] === '%' || rawNum <= 100;
                if (!isNaN(rawNum)) {
                    if (rawNum > maxVal) maxVal = rawNum;
                    items.push({ label, val: rawNum, isPercent });
                }
            }
        }

        if (items.length === 0) {
            return `
                <div class="code-block-wrapper my-3 rounded-xl overflow-hidden border border-gray-700/60 bg-[#161616] shadow-lg text-left" dir="ltr">
                    <pre class="p-3.5 m-0 bg-[#161616] overflow-x-auto text-[13px] font-mono leading-relaxed"><code>${safeCode}</code></pre>
                </div>
            `;
        }

        if (maxVal === 0) maxVal = 100;

        const colors = [
            'from-emerald-500 to-teal-400',
            'from-cyan-500 to-blue-400',
            'from-indigo-500 to-sky-400',
            'from-amber-500 to-yellow-400',
            'from-violet-500 to-purple-400'
        ];

        const barsHtml = items.map((it, idx) => {
            const pct = Math.min(100, Math.round((it.val / maxVal) * 100));
            const col = colors[idx % colors.length];
            const displayVal = it.isPercent ? `${this.toPersianDigits(it.val)}٪` : this.toPersianDigits(it.val);
            return `
                <div class="space-y-1 my-2">
                    <div class="flex items-center justify-between text-xs font-semibold text-gray-700 dark:text-gray-200">
                        <span class="truncate max-w-[70%]">${it.label}</span>
                        <span class="font-mono text-emerald-600 dark:text-emerald-400">${displayVal}</span>
                    </div>
                    <div class="w-full bg-gray-200 dark:bg-gray-700/60 rounded-full h-2.5 overflow-hidden p-0.5">
                        <div class="h-full rounded-full bg-gradient-to-r ${col} transition-all duration-700" style="width: ${pct}%"></div>
                    </div>
                </div>
            `;
        }).join('');

        const cardId = 'barchart-' + Math.random().toString(36).substring(2, 9);

        return `
            <div class="office-meter-card my-3 select-none" id="${cardId}">
                <div class="flex items-center justify-between gap-3 mb-3 border-b border-gray-200/60 dark:border-gray-700/50 pb-2">
                    <div class="flex items-center gap-2 font-bold text-sm text-gray-800 dark:text-gray-100">
                        <span class="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            <i data-lucide="bar-chart-3" class="w-4 h-4"></i>
                        </span>
                        <span>نمودار تحلیلی شاخص‌ها</span>
                    </div>
                    <button type="button" class="text-[11px] text-gray-400 hover:text-gray-200 px-1.5 py-0.5 rounded hover:bg-white/10 transition cursor-pointer" onclick="Chat.toggleVisualCode('${cardId}')" title="تغییر نمایش متنی / گرافیکی">
                        📋
                    </button>
                </div>
                <div class="space-y-1">
                    ${barsHtml}
                </div>
                <div class="raw-code-view hidden mt-3 pt-2 border-t border-gray-700/60 text-left font-mono text-xs text-gray-300" dir="ltr">
                    <pre class="p-2 bg-black/40 rounded-lg overflow-x-auto">${safeCode}</pre>
                </div>
            </div>
        `;
    },

    toggleVisualCode(cardId) {
        const card = document.getElementById(cardId);
        if (!card) return;
        const rawView = card.querySelector('.raw-code-view');
        if (rawView) {
            rawView.classList.toggle('hidden');
        }
    },

    formatVisualElements(html) {
        if (!html) return '';
        // Format inline ASCII progress bars [████░░░░] 80% in regular text
        return html.replace(/\[([█■#=]{2,}[░□\-_ ]{1,})\]\s*(\(?(\d+(?:\.\d+)?%)\)?)?/g, (match, bar, p2, pct) => {
            const filled = (bar.match(/[█■#=]/g) || []).length;
            const total = bar.length;
            const calcPct = pct ? parseFloat(pct) : Math.round((filled / total) * 100);
            let colorClass = 'bg-emerald-500';
            if (calcPct < 40) colorClass = 'bg-rose-500';
            else if (calcPct < 70) colorClass = 'bg-amber-500';

            return `
                <span class="inline-flex items-center gap-2 px-2 py-0.5 my-0.5 rounded-lg bg-gray-100 dark:bg-[#2c2c2c] border border-gray-200 dark:border-gray-700 text-xs align-middle">
                    <span class="w-24 h-2.5 bg-gray-300 dark:bg-gray-700 rounded-full overflow-hidden inline-block align-middle p-0.5">
                        <span class="h-full rounded-full ${colorClass} block transition-all" style="width: ${calcPct}%"></span>
                    </span>
                    <span class="font-mono text-[11px] font-bold text-gray-700 dark:text-gray-300">${Chat.toPersianDigits(calcPct)}٪</span>
                </span>
            `;
        });
    },

    enhanceTablesAndMeters(container) {
        if (!container) return;
        const tables = container.querySelectorAll('table');
        tables.forEach(table => {
            if (table.dataset.enhanced) return;
            table.dataset.enhanced = 'true';

            const cells = table.querySelectorAll('td');
            cells.forEach(td => {
                const text = td.textContent.trim();
                if (/^(✅\s*)?(نرمال|طبیعی|سالم|تایید شده|تایید|موفق|فعال|پایان یافته|عالی)$/.test(text)) {
                    td.innerHTML = `<span class="status-badge status-badge-success"><i data-lucide="check" class="w-3 h-3"></i><span>${text.replace('✅', '').trim()}</span></span>`;
                } else if (/^(⚠️\s*)?(مرزی|هشدار|در انتظار|متوسط|پیگیری)$/.test(text)) {
                    td.innerHTML = `<span class="status-badge status-badge-warning"><i data-lucide="alert-circle" class="w-3 h-3"></i><span>${text.replace('⚠️', '').trim()}</span></span>`;
                } else if (/^(❗\s*|❌\s*)?(بحرانی|خطر|نیاز به درمان|رد شده|ناموفق|متوقف|غیرفعال)$/.test(text)) {
                    td.innerHTML = `<span class="status-badge status-badge-danger"><i data-lucide="alert-triangle" class="w-3 h-3"></i><span>${text.replace(/[❗❌]/g, '').trim()}</span></span>`;
                }
            });
        });

        if (window.lucide) lucide.createIcons();
    },

    init() {
        this.loadActiveModel();
        this.loadSessions();
        this.loadSkillsForSlash();
        this.setupEvents();
        this.setupAutoDirection();
    },

    async loadSkillsForSlash() {
        try {
            const res = await fetch('/api/chat/skills', {
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            if (res.ok) {
                this.availableSkills = await res.json();
            }
        } catch (e) {
            console.error('Failed to load chat skills:', e);
        }
    },

    selectSkill(skill) {
        this.selectedSkill = skill;
        const chip = document.getElementById('selected-skill-chip');
        const nameEl = document.getElementById('selected-skill-name');
        if (chip && nameEl) {
            nameEl.textContent = skill.name;
            chip.classList.remove('hidden');
            chip.classList.add('flex');
        }
        this.closeSlashPopup();

        const input = document.getElementById('chat-input');
        if (input) {
            if (input.value.startsWith('/')) {
                input.value = '';
                input.style.height = 'auto';
            }
            input.focus();
        }
        if (window.lucide) lucide.createIcons();
        App.toast(`مهارت "${skill.name}" فعال شد`, 'success');
    },

    removeSelectedSkill() {
        this.selectedSkill = null;
        const chip = document.getElementById('selected-skill-chip');
        if (chip) {
            chip.classList.add('hidden');
            chip.classList.remove('flex');
        }
        App.toast('مهارت انتخابی حذف شد', 'info');
    },

    openSlashPopup(query = '') {
        const cleanQuery = query.toLowerCase().trim();
        if (!cleanQuery) {
            this.slashFilteredSkills = [...this.availableSkills];
        } else {
            this.slashFilteredSkills = this.availableSkills.filter(s =>
                (s.name && s.name.toLowerCase().includes(cleanQuery)) ||
                (s.description && s.description.toLowerCase().includes(cleanQuery))
            );
        }

        this.activeSlashIndex = 0;
        this.renderSlashList();

        const popup = document.getElementById('skills-slash-popup');
        if (popup) {
            popup.classList.remove('hidden');
            this.isSlashOpen = true;
            this.updateSlashActiveItem();
            if (window.lucide) lucide.createIcons();
        }
    },

    closeSlashPopup() {
        const popup = document.getElementById('skills-slash-popup');
        if (popup) {
            popup.classList.add('hidden');
        }
        this.isSlashOpen = false;
        this.slashFilteredSkills = [];
    },

    renderSlashList() {
        const listEl = document.getElementById('skills-slash-list');
        if (!listEl) return;

        if (this.slashFilteredSkills.length === 0) {
            listEl.innerHTML = `
                <div class="px-4 py-3 text-center text-xs text-gray-400">
                    مهارتی منطبق با این عبارت یافت نشد.
                </div>
            `;
            return;
        }

        listEl.innerHTML = this.slashFilteredSkills.map((skill, idx) => `
            <button type="button" class="w-full text-right px-3 py-2 rounded-xl transition flex items-start gap-2.5 cursor-pointer slash-item ${idx === this.activeSlashIndex ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'hover:bg-gray-100 dark:hover:bg-[#282828] text-gray-700 dark:text-gray-200'}" data-index="${idx}">
                <div class="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-bold text-xs truncate">${skill.name}</span>
                    </div>
                    <p class="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">${skill.description || 'بدون توضیح'}</p>
                </div>
            </button>
        `).join('');

        listEl.querySelectorAll('.slash-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                if (!isNaN(idx) && this.slashFilteredSkills[idx]) {
                    this.selectSkill(this.slashFilteredSkills[idx]);
                }
            });
        });
    },

    updateSlashActiveItem() {
        const listEl = document.getElementById('skills-slash-list');
        if (!listEl) return;
        const items = listEl.querySelectorAll('.slash-item');
        items.forEach((item, idx) => {
            if (idx === this.activeSlashIndex) {
                item.className = 'w-full text-right px-3 py-2 rounded-xl transition flex items-start gap-2.5 cursor-pointer slash-item bg-amber-500/15 text-amber-300 border border-amber-500/30';
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.className = 'w-full text-right px-3 py-2 rounded-xl transition flex items-start gap-2.5 cursor-pointer slash-item hover:bg-gray-100 dark:hover:bg-[#282828] text-gray-700 dark:text-gray-200';
            }
        });
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

            const rawVal = input.value;
            const val = rawVal.trim();
            if (val) {
                const rtl = this.isRTLText(val);
                input.setAttribute('dir', rtl ? 'rtl' : 'ltr');
                input.style.textAlign = rtl ? 'right' : 'left';
            } else {
                input.setAttribute('dir', 'auto');
            }

            // Slash popup trigger check
            if (rawVal.startsWith('/')) {
                const query = rawVal.substring(1);
                this.openSlashPopup(query);
            } else {
                if (this.isSlashOpen) {
                    this.closeSlashPopup();
                }
            }
        });

        input.addEventListener('keydown', (e) => {
            if (this.isSlashOpen) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (this.slashFilteredSkills.length > 0) {
                        this.activeSlashIndex = (this.activeSlashIndex + 1) % this.slashFilteredSkills.length;
                        this.updateSlashActiveItem();
                    }
                    return;
                }
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (this.slashFilteredSkills.length > 0) {
                        this.activeSlashIndex = (this.activeSlashIndex - 1 + this.slashFilteredSkills.length) % this.slashFilteredSkills.length;
                        this.updateSlashActiveItem();
                    }
                    return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                    if (this.slashFilteredSkills.length > 0) {
                        e.preventDefault();
                        this.selectSkill(this.slashFilteredSkills[this.activeSlashIndex]);
                        return;
                    }
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.closeSlashPopup();
                    return;
                }
            }

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

        const stopBtn = document.getElementById('btn-stop-message');
        if (stopBtn) stopBtn.addEventListener('click', () => this.stopStreaming());

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

        const removeSkillBtn = document.getElementById('btn-remove-selected-skill');
        if (removeSkillBtn) {
            removeSkillBtn.addEventListener('click', () => this.removeSelectedSkill());
        }

        // Close slash popup when clicking outside
        document.addEventListener('click', (e) => {
            const popup = document.getElementById('skills-slash-popup');
            const input = document.getElementById('chat-input');
            if (this.isSlashOpen && popup && !popup.contains(e.target) && e.target !== input) {
                this.closeSlashPopup();
            }
        });

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

        // Session Export Dropdown
        const exportDropdownBtn = document.getElementById('btn-export-dropdown');
        const exportDropdownMenu = document.getElementById('export-dropdown-menu');
        const exportSessionDocx = document.getElementById('btn-export-session-docx');
        const exportSessionXlsx = document.getElementById('btn-export-session-xlsx');

        if (exportDropdownBtn && exportDropdownMenu) {
            exportDropdownBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                exportDropdownMenu.classList.toggle('hidden');
            });

            document.addEventListener('click', () => {
                if (!exportDropdownMenu.classList.contains('hidden')) {
                    exportDropdownMenu.classList.add('hidden');
                }
            });
        }

        if (exportSessionDocx) {
            exportSessionDocx.addEventListener('click', () => {
                if (exportDropdownMenu) exportDropdownMenu.classList.add('hidden');
                this.downloadExport({ format: 'docx', sessionId: this.currentSessionId });
            });
        }

        if (exportSessionXlsx) {
            exportSessionXlsx.addEventListener('click', () => {
                if (exportDropdownMenu) exportDropdownMenu.classList.add('hidden');
                this.downloadExport({ format: 'xlsx', sessionId: this.currentSessionId });
            });
        }

        // Global Delegation for Code Block Copy Button
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('.copy-code-btn');
            if (btn) {
                e.preventDefault();
                e.stopPropagation();
                this.copyCodeBlock(btn);
                return;
            }

            // Message Copy Button
            const copyMsgBtn = e.target.closest('.copy-msg-btn');
            if (copyMsgBtn) {
                e.preventDefault();
                e.stopPropagation();
                this.copyMessageContent(copyMsgBtn);
                return;
            }

            // Message Export DOCX
            const exportDocxBtn = e.target.closest('.export-docx-btn, .btn-direct-download-docx');
            if (exportDocxBtn) {
                e.preventDefault();
                e.stopPropagation();
                const content = this.getMessageRawContent(exportDocxBtn);
                this.downloadExport({ format: 'docx', content });
                return;
            }

            // Message Export XLSX
            const exportXlsxBtn = e.target.closest('.export-xlsx-btn, .btn-direct-download-xlsx');
            if (exportXlsxBtn) {
                e.preventDefault();
                e.stopPropagation();
                const content = this.getMessageRawContent(exportXlsxBtn);
                this.downloadExport({ format: 'xlsx', content });
                return;
            }
        });

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
            const hasTables = /\|(?:\s*:?-+:?\s*\|)+/.test(content || '');
            const actionsHtml = this.buildMessageActionToolbar(content, null, hasTables);
            const parsedHtml = marked.parse(this.formatVisualElements(content || ''));
            renderedContent = `
                <div class="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
                    AI
                </div>
                <div class="flex-1 max-w-[90%] space-y-1">
                    <div class="prose-custom text-gray-800 dark:text-gray-200" dir="${dirAttr}">
                        ${parsedHtml}
                    </div>
                    <div class="msg-actions-container w-full">
                        ${actionsHtml}
                    </div>
                </div>
            `;
        }

        msgDiv.dataset.rawContent = content || '';
        msgDiv.innerHTML = renderedContent;
        streamContainer.appendChild(msgDiv);

        this.highlightCode(msgDiv);
        this.enhanceTablesAndMeters(msgDiv);
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
        if (!btn) return;
        const wrapper = btn.closest('.code-block-wrapper');
        if (!wrapper) return;
        const codeEl = wrapper.querySelector('code');
        const text = codeEl ? (codeEl.textContent || codeEl.innerText) : '';
        if (!text) return;

        App.copyToClipboard(text, 'کد در کلیپ‌بورد کپی شد!');

        const span = btn.querySelector('span');
        if (span) span.textContent = '✓ کپی شد!';
        btn.classList.add('bg-emerald-600', 'text-white');
        btn.classList.remove('bg-white/10', 'text-gray-200');

        setTimeout(() => {
            if (span) span.textContent = 'کپی کد';
            btn.classList.remove('bg-emerald-600', 'text-white');
            btn.classList.add('bg-white/10', 'text-gray-200');
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

    stopStreaming() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.isStreaming = false;
        this.setStreamingUI(false);
        App.toast('تولید پاسخ متوقف شد', 'info');
    },

    setStreamingUI(isStreaming) {
        const sendBtn = document.getElementById('btn-send-message');
        const stopBtn = document.getElementById('btn-stop-message');
        if (stopBtn) {
            if (isStreaming) {
                stopBtn.classList.remove('hidden');
                stopBtn.classList.add('flex');
            } else {
                stopBtn.classList.add('hidden');
                stopBtn.classList.remove('flex');
            }
        }
        if (sendBtn) {
            sendBtn.disabled = isStreaming;
            if (isStreaming) {
                sendBtn.classList.add('opacity-40', 'cursor-not-allowed');
            } else {
                sendBtn.classList.remove('opacity-40', 'cursor-not-allowed');
            }
        }
        if (window.lucide) lucide.createIcons();
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
        if (this.selectedSkill && this.selectedSkill.id) {
            formData.append('skill_id', this.selectedSkill.id);
        }
        if (currentFile) {
            formData.append('file', currentFile);
        }

        this.isStreaming = true;
        this.setStreamingUI(true);
        this.abortController = new AbortController();
        let accumulatedResponse = '';
        let receivedExportIntent = null;

        try {
            const response = await fetch('/api/chat/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${App.token}`
                },
                body: formData,
                signal: this.abortController.signal
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

                            // 5. Handle Export Intent Flag
                            if (parsed.export_intent) {
                                receivedExportIntent = parsed.export_intent;
                            }

                            // 6. Handle Token Stream
                            if (parsed.token) {
                                accumulatedResponse += parsed.token;
                                const rtl = this.isRTLText(accumulatedResponse);
                                contentEl.setAttribute('dir', rtl ? 'rtl' : 'ltr');
                                contentEl.innerHTML = marked.parse(this.formatVisualElements(accumulatedResponse));
                                this.highlightCode(contentEl);
                                this.enhanceTablesAndMeters(contentEl);
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
                contentEl.innerHTML = marked.parse(this.formatVisualElements(accumulatedResponse));
                
                const hasTables = /\|(?:\s*:?-+:?\s*\|)+/.test(accumulatedResponse);
                let actionsContainer = asstBubbleWrapper.querySelector('.msg-actions-container');
                if (!actionsContainer) {
                    actionsContainer = document.createElement('div');
                    actionsContainer.className = 'msg-actions-container w-full';
                    contentEl.parentNode.appendChild(actionsContainer);
                }
                actionsContainer.innerHTML = this.buildMessageActionToolbar(accumulatedResponse, receivedExportIntent, hasTables);
                asstBubbleWrapper.dataset.rawContent = accumulatedResponse;

                this.highlightCode(contentEl);
                this.enhanceTablesAndMeters(contentEl);
            }

        } catch (err) {
            this.hideQueuePopup(true);
            if (err.name === 'AbortError') {
                if (accumulatedResponse.trim()) {
                    const rtl = this.isRTLText(accumulatedResponse);
                    contentEl.setAttribute('dir', rtl ? 'rtl' : 'ltr');
                    contentEl.innerHTML = marked.parse(this.formatVisualElements(accumulatedResponse));
                    
                    const hasTables = /\|(?:\s*:?-+:?\s*\|)+/.test(accumulatedResponse);
                    let actionsContainer = asstBubbleWrapper.querySelector('.msg-actions-container');
                    if (!actionsContainer) {
                        actionsContainer = document.createElement('div');
                        actionsContainer.className = 'msg-actions-container w-full';
                        contentEl.parentNode.appendChild(actionsContainer);
                    }
                    actionsContainer.innerHTML = this.buildMessageActionToolbar(accumulatedResponse, receivedExportIntent, hasTables);
                    asstBubbleWrapper.dataset.rawContent = accumulatedResponse;

                    this.highlightCode(contentEl);
                    this.enhanceTablesAndMeters(contentEl);
                }
                return;
            }
            this.renderErrorCard(contentEl, `ارتباط با سرور قطع شد: ${err.message}`);
            App.toast('خطا در ارتباط با سرور', 'error');
        } finally {
            this.hideQueuePopup(true);
            this.isStreaming = false;
            this.setStreamingUI(false);
            this.abortController = null;
            if (contentEl) {
                this.enhanceTablesAndMeters(contentEl);
            }
            this.scrollToBottom();
            if (window.lucide) lucide.createIcons();
        }
    },

    buildMessageActionToolbar(content, exportIntent = null, hasTables = false) {
        let downloadCardHtml = '';
        if (exportIntent || hasTables) {
            const subtitle = exportIntent === 'xlsx' 
                ? 'فایل اکسل آماده دانلود و استفاده در نرم‌افزار Excel است.'
                : (exportIntent === 'docx' 
                    ? 'فایل ورد با فرمت‌بندی رسمی و تایپوگرافی سازمانی آماده دانلود است.'
                    : 'فایل رسمی این گزارش با فرمت Word یا Excel آماده دانلود است.');
            downloadCardHtml = `
                <div class="office-download-card my-3 p-3 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 select-none">
                    <div class="flex items-center gap-2.5">
                        <span class="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <i data-lucide="file-down" class="w-4 h-4"></i>
                        </span>
                        <div>
                            <div class="text-xs font-bold text-gray-800 dark:text-gray-100">فایل تحلیلی آماده دانلود است</div>
                            <div class="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">${subtitle}</div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 w-full sm:w-auto">
                        <button type="button" class="btn-direct-download-docx flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-sm transition cursor-pointer">
                            <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
                            <span>دانلود Word</span>
                        </button>
                        <button type="button" class="btn-direct-download-xlsx flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-sm transition cursor-pointer">
                            <i data-lucide="sheet" class="w-3.5 h-3.5"></i>
                            <span>دانلود Excel</span>
                        </button>
                    </div>
                </div>
            `;
        }

        return `
            ${downloadCardHtml}
            <div class="msg-action-bar">
                <button type="button" class="msg-action-btn msg-action-btn-copy copy-msg-btn" title="کپی متن کامل">
                    <i data-lucide="copy" class="w-3.5 h-3.5"></i>
                    <span>کپی</span>
                </button>
                <button type="button" class="msg-action-btn msg-action-btn-docx export-docx-btn" title="دریافت فایل Word (.docx)">
                    <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
                    <span>خروجی Word</span>
                </button>
                <button type="button" class="msg-action-btn msg-action-btn-xlsx export-xlsx-btn" title="دریافت فایل Excel (.xlsx)">
                    <i data-lucide="sheet" class="w-3.5 h-3.5"></i>
                    <span>خروجی Excel</span>
                </button>
            </div>
        `;
    },

    async downloadExport({ format, content = null, sessionId = null, messageId = null, title = null }) {
        const formatTitle = format === 'xlsx' ? 'Excel' : 'Word';
        App.toast(`در حال تولید فایل ${formatTitle}...`, 'info');
        try {
            const payload = {
                format: format,
                content: content,
                session_id: sessionId || this.currentSessionId,
                message_id: messageId,
                title: title || (this.sessions.find(s => s.id === this.currentSessionId)?.title || 'گزارش تحلیلی بورس کالا')
            };

            const res = await fetch('/api/chat/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${App.token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || 'خطا در تولید فایل خروجی');
            }

            let filename = `گزارش_بورس_کالا.${format}`;
            const disposition = res.headers.get('Content-Disposition');
            if (disposition) {
                const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
                if (utf8Match) {
                    filename = decodeURIComponent(utf8Match[1]);
                } else {
                    const regularMatch = disposition.match(/filename="?([^";]+)"?/i);
                    if (regularMatch) {
                        filename = regularMatch[1];
                    }
                }
            }

            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(blobUrl);

            App.toast(`فایل ${filename} با موفقیت دانلود شد.`, 'success');
        } catch (e) {
            console.error('Export download error:', e);
            App.toast(`خطا در دانلود فایل: ${e.message}`, 'error');
        }
    },

    getMessageRawContent(btn) {
        if (!btn) return '';
        const wrapper = btn.closest('.animate-fade-in');
        if (!wrapper) return '';
        if (wrapper.dataset.rawContent) return wrapper.dataset.rawContent;
        const proseEl = wrapper.querySelector('.prose-custom');
        return proseEl ? (proseEl.innerText || proseEl.textContent || '') : '';
    },

    copyMessageContent(btn) {
        const raw = this.getMessageRawContent(btn);
        if (!raw) return;
        App.copyToClipboard(raw, 'متن گزارش با موفقیت کپی شد!');
        const span = btn.querySelector('span');
        if (span) {
            const originalText = span.textContent;
            span.textContent = '✓ کپی شد!';
            setTimeout(() => {
                span.textContent = originalText;
            }, 2000);
        }
    }
};

function bool(val) {
    return !!val;
}

window.Chat = Chat;
