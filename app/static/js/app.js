// Application State & Auth Controller
const App = {
    currentUser: null,
    token: localStorage.getItem('token') || null,

    init() {
        this.setupTheme();
        this.setupAuthUI();
        this.checkAuth();
    },

    setupTheme() {
        const savedTheme = localStorage.getItem('theme') || 'dark';
        this.setTheme(savedTheme === 'dark');

        const btnTheme = document.getElementById('btn-toggle-theme');
        if (btnTheme) {
            btnTheme.addEventListener('click', () => {
                const isCurrentlyDark = document.documentElement.classList.contains('dark');
                this.setTheme(!isCurrentlyDark);
            });
        }
    },

    setTheme(isDark) {
        const btnTheme = document.getElementById('btn-toggle-theme');
        if (isDark) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
            if (btnTheme) {
                btnTheme.innerHTML = '<i data-lucide="sun" class="w-4 h-4 text-amber-400"></i>';
                btnTheme.setAttribute('title', 'تغییر به حالت روز (روشن)');
            }
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
            if (btnTheme) {
                btnTheme.innerHTML = '<i data-lucide="moon" class="w-4 h-4 text-gray-700"></i>';
                btnTheme.setAttribute('title', 'تغییر به حالت شب (تاریک)');
            }
        }
        if (window.lucide) lucide.createIcons();
    },

    toast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const colors = {
            success: 'bg-emerald-600 text-white',
            error: 'bg-rose-600 text-white',
            warning: 'bg-amber-600 text-white',
            info: 'bg-gray-800 text-white border border-gray-700'
        };

        const toast = document.createElement('div');
        toast.className = `${colors[type] || colors.info} px-4 py-2.5 rounded-xl text-xs font-medium shadow-lg transition-all duration-300 pointer-events-auto transform translate-y-2 opacity-0 flex items-center gap-2`;
        toast.innerHTML = `<span>${message}</span>`;

        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.remove('translate-y-2', 'opacity-0');
        }, 10);

        setTimeout(() => {
            toast.classList.add('opacity-0', '-translate-y-2');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    },

    copyToClipboard(text, customSuccessMsg = 'متن با موفقیت کپی شد!') {
        if (!text) return;
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                if (customSuccessMsg) this.toast(customSuccessMsg, 'success');
            }).catch(() => {
                this.fallbackCopyText(text, customSuccessMsg);
            });
        } else {
            this.fallbackCopyText(text, customSuccessMsg);
        }
    },

    fallbackCopyText(text, customSuccessMsg = 'متن با موفقیت کپی شد!') {
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.top = '-9999px';
            textarea.style.left = '-9999px';
            textarea.style.opacity = '0';
            textarea.setAttribute('readonly', '');
            document.body.appendChild(textarea);
            textarea.select();
            textarea.setSelectionRange(0, 999999);
            const successful = document.execCommand('copy');
            document.body.removeChild(textarea);
            if (successful && customSuccessMsg) {
                this.toast(customSuccessMsg, 'success');
            }
        } catch (err) {
            console.error('Fallback copy error:', err);
        }
    },

    showAuthError(msg) {
        const alertBox = document.getElementById('auth-error-alert');
        const textEl = document.getElementById('auth-error-text');
        if (alertBox && textEl) {
            textEl.textContent = msg;
            alertBox.classList.remove('hidden');
        }
    },

    clearAuthError() {
        const alertBox = document.getElementById('auth-error-alert');
        if (alertBox) alertBox.classList.add('hidden');
    },

    async checkAuth() {
        if (!this.token) {
            this.showAuthModal();
            return;
        }

        try {
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (res.ok) {
                this.currentUser = await res.json();
                this.updateUserUI();
                this.hideAuthModal();
                if (window.Chat) window.Chat.init();
                if (window.Admin && this.currentUser.role === 'admin') window.Admin.init();
            } else {
                this.logout();
            }
        } catch (err) {
            console.error('Auth verification error:', err);
            this.showAuthModal();
        }
    },

    updateTokenDisplay(used, quota) {
        const countEl = document.getElementById('sidebar-token-count');
        const barEl = document.getElementById('sidebar-token-bar');
        if (!countEl || !barEl) return;

        const safeQuota = quota > 0 ? quota : 50000;
        const safeUsed = used || 0;
        const percent = Math.min(100, Math.round((safeUsed / safeQuota) * 100));

        countEl.textContent = `${safeUsed.toLocaleString('fa-IR')} / ${safeQuota.toLocaleString('fa-IR')}`;
        barEl.style.width = `${percent}%`;

        if (percent >= 90) {
            barEl.className = 'bg-rose-500 h-1.5 rounded-full transition-all duration-300';
            countEl.className = 'font-mono text-rose-400 font-bold';
        } else if (percent >= 70) {
            barEl.className = 'bg-amber-500 h-1.5 rounded-full transition-all duration-300';
            countEl.className = 'font-mono text-amber-400 font-bold';
        } else {
            barEl.className = 'bg-emerald-500 h-1.5 rounded-full transition-all duration-300';
            countEl.className = 'font-mono text-emerald-500 dark:text-emerald-400 font-semibold';
        }
    },

    updateUserUI() {
        if (!this.currentUser) return;
        const nameEl = document.getElementById('user-display-name');
        const roleEl = document.getElementById('user-role-badge');
        const avatarEl = document.getElementById('user-avatar');
        const adminBtn = document.getElementById('btn-open-admin');
        const modelEl = document.getElementById('active-model-display');

        if (nameEl) nameEl.textContent = this.currentUser.username;
        if (roleEl) {
            roleEl.textContent = this.currentUser.role === 'admin' ? 'مدیر سیستم' : 'کاربر';
            roleEl.className = this.currentUser.role === 'admin' 
                ? 'inline-block px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 font-semibold'
                : 'inline-block px-1.5 py-0.2 rounded text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
        }
        if (avatarEl) avatarEl.textContent = this.currentUser.username.substring(0, 1).toUpperCase();

        if (modelEl && this.currentUser.system_model) {
            modelEl.textContent = this.currentUser.system_model;
        }

        this.updateTokenDisplay(this.currentUser.tokens_used, this.currentUser.token_quota);

        if (adminBtn) {
            if (this.currentUser.role === 'admin') {
                adminBtn.classList.remove('hidden');
            } else {
                adminBtn.classList.add('hidden');
            }
        }
    },

    showAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) {
            modal.classList.remove('hidden');
            this.clearAuthError();
        }
    },

    hideAuthModal() {
        const modal = document.getElementById('auth-modal');
        if (modal) modal.classList.add('hidden');
    },

    setupAuthUI() {
        const submitBtn = document.getElementById('btn-auth-submit');
        const authForm = document.getElementById('auth-form');
        const usernameInput = document.getElementById('auth-username');
        const passwordInput = document.getElementById('auth-password');

        if (usernameInput) usernameInput.addEventListener('input', () => this.clearAuthError());
        if (passwordInput) passwordInput.addEventListener('input', () => this.clearAuthError());

        if (authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                this.clearAuthError();

                const username = usernameInput ? usernameInput.value.trim() : '';
                const password = passwordInput ? passwordInput.value : '';

                if (!username) {
                    this.showAuthError('لطفاً نام کاربری را وارد کنید.');
                    return;
                }
                if (!password) {
                    this.showAuthError('لطفاً رمز عبور را وارد کنید.');
                    return;
                }

                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="animate-spin inline-block mr-1">⏳</span> در حال ورود...';

                try {
                    const res = await fetch('/api/auth/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    const data = await res.json();
                    if (!res.ok) {
                        const errMsg = data.detail || 'نام کاربری یا رمز عبور اشتباه است.';
                        this.showAuthError(errMsg);
                        this.toast(errMsg, 'error');
                        return;
                    }

                    this.token = data.access_token;
                    localStorage.setItem('token', this.token);
                    this.currentUser = data.user;
                    this.toast('با موفقیت وارد شدید', 'success');
                    this.hideAuthModal();
                    this.checkAuth();
                } catch (err) {
                    const netErr = 'ارتباط با سرور برقرار نشد. لطفاً وضعیت شبکه را بررسی کنید.';
                    this.showAuthError(netErr);
                    this.toast(netErr, 'error');
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<span>ورود به حساب</span>';
                }
            });
        }

        const logoutBtn = document.getElementById('btn-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }

    },

    async logout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (e) {}
        this.token = null;
        this.currentUser = null;
        localStorage.removeItem('token');
        this.showAuthModal();
        this.toast('با موفقیت خارج شدید', 'info');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
