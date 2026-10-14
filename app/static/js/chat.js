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

            // 2. Smart Interactive Chart (Chart.js: Line, Bar, Doughnut, Pie, Radar)
            if (window.Chat && Chat.isChartBlock(code, lang)) {
                return Chat.renderSmartChartCard(code, safeCode, lang);
            }

            // 3. ASCII Meter / Progress Bar / Health / Performance Status
            if (window.Chat && Chat.isMeterOrChart(code, lang)) {
                return Chat.renderOfficeMeterCard(code, safeCode);
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
    activeReader: null,
    activeContentEl: null,
    activeBubbleWrapper: null,
    currentAccumulatedResponse: '',
    chartInstances: {},
    pendingDeleteSessionId: null,

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

    isChartBlock(code, lang) {
        if (['chart', 'line', 'bar', 'doughnut', 'pie', 'radar', 'graph', 'data'].includes(lang)) return true;
        const trimmed = (code || '').trim();
        // Check for JSON chart spec
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed.labels || parsed.data || parsed.datasets || parsed.type) return true;
            } catch (e) {}
        }
        // Check for YAML/Key-Value chart spec
        if (/^(?:type|نوع|chart):\s*(?:line|bar|doughnut|pie|radar|خطی|میله|ستونی|دونات|دایره)/im.test(trimmed)) {
            return true;
        }
        // Check for multi-line key-value numbers
        const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length >= 2) {
            let numMatches = 0;
            for (const line of lines) {
                if (/^[^:\-=]+[:\-=\t]+\s*[\d,.]+%?$/.test(line)) {
                    numMatches++;
                }
            }
            if (numMatches >= 2 && (numMatches / lines.length) >= 0.7) {
                return true;
            }
        }
        return false;
    },

    parseChartData(rawCode, lang) {
        const trimmed = (rawCode || '').trim();
        let chartType = ['line', 'bar', 'doughnut', 'pie', 'radar'].includes(lang) ? lang : null;
        let title = '';
        let unit = '';
        let labels = [];
        let data = [];
        let datasets = null;

        // Attempt 1: JSON Parsing
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            try {
                const obj = JSON.parse(trimmed);
                if (obj.type) chartType = obj.type.toLowerCase();
                if (obj.title) title = obj.title;
                if (obj.unit) unit = obj.unit;
                if (Array.isArray(obj.labels)) labels = obj.labels.map(l => String(l).trim());
                if (Array.isArray(obj.data)) {
                    data = obj.data.map(v => typeof v === 'number' ? v : parseFloat(String(v).replace(/[,%]/g, ''))).filter(v => !isNaN(v));
                }
                if (Array.isArray(obj.datasets)) {
                    datasets = obj.datasets;
                }
            } catch (e) {}
        }

        // Attempt 2: Line-by-line parsing (Key: Value or YAML syntax)
        if (labels.length === 0 && (!datasets || datasets.length === 0)) {
            const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
            for (const line of lines) {
                const metaMatch = line.match(/^(type|نوع|title|عنوان|unit|واحد)[:\-=\t]+\s*(.+)$/i);
                if (metaMatch) {
                    const k = metaMatch[1].toLowerCase();
                    const v = metaMatch[2].trim();
                    if (k === 'type' || k === 'نوع') {
                        const t = v.toLowerCase();
                        if (t.includes('line') || t.includes('خط')) chartType = 'line';
                        else if (t.includes('bar') || t.includes('ستونی') || t.includes('میله')) chartType = 'bar';
                        else if (t.includes('doughnut') || t.includes('دونات')) chartType = 'doughnut';
                        else if (t.includes('pie') || t.includes('دایره')) chartType = 'pie';
                        else if (t.includes('radar') || t.includes('رادار')) chartType = 'radar';
                    } else if (k === 'title' || k === 'عنوان') {
                        title = v.replace(/^["']|["']$/g, '');
                    } else if (k === 'unit' || k === 'واحد') {
                        unit = v.replace(/^["']|["']$/g, '');
                    }
                    continue;
                }

                const labelsMatch = line.match(/^(?:labels|برچسب‌ها)[:\-=\t]+\s*\[?([^\]]+)\]?$/i);
                if (labelsMatch) {
                    labels = labelsMatch[1].split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
                    continue;
                }
                const dataMatch = line.match(/^(?:data|داده‌ها|مقادیر)[:\-=\t]+\s*\[?([^\]]+)\]?$/i);
                if (dataMatch) {
                    data = dataMatch[1].split(',').map(s => parseFloat(s.trim().replace(/[,%]/g, ''))).filter(v => !isNaN(v));
                    continue;
                }

                const itemMatch = line.match(/^([^:\-=]+)[:\-=\t]+\s*([\d,.]+)(%?)$/);
                if (itemMatch) {
                    const lbl = itemMatch[1].replace(/^[\*\-#\d.]+\s*/, '').trim();
                    const val = parseFloat(itemMatch[2].replace(/,/g, ''));
                    if (!isNaN(val)) {
                        labels.push(lbl);
                        data.push(val);
                        if (itemMatch[3] === '%' && !unit) unit = 'درصد';
                    }
                }
            }
        }

        if (!datasets && data.length > 0) {
            datasets = [{
                label: title || 'شاخص عملکرد',
                data: data
            }];
        }

        return { chartType, title, unit, labels, datasets };
    },

    analyzeDataAndDetermineChart(parsed) {
        const labels = parsed.labels || [];
        const datasets = parsed.datasets || [];
        const dataVals = (datasets[0] && datasets[0].data) ? datasets[0].data : [];
        const count = dataVals.length;

        if (count === 0) {
            return {
                recommendedType: 'bar',
                activeType: 'bar',
                badgeText: '📊 تحلیل داده‌ها',
                badgeIcon: 'bar-chart-3',
                insightText: 'داده‌های آماری دریافت شد.',
                stats: { total: 0, avg: 0, max: 0, min: 0 }
            };
        }

        const total = dataVals.reduce((acc, v) => acc + (typeof v === 'number' ? v : 0), 0);
        const avg = parseFloat((total / count).toFixed(1));
        const max = Math.max(...dataVals);
        const min = Math.min(...dataVals);
        const maxIndex = dataVals.indexOf(max);
        const minIndex = dataVals.indexOf(min);
        const maxLabel = labels[maxIndex] || 'حداکثر';
        const minLabel = labels[minIndex] || 'حداقل';

        // 1. Check for Temporal / Time Series indicators
        const temporalTerms = [
            'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
            'شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'سه شنبه', 'چهارشنبه', 'پنج‌شنبه', 'پنجشنبه', 'جمعه',
            'هفته', 'ماه', 'سال', 'دوره', 'فصل', 'بهار', 'تابستان', 'پاییز', 'زمستان',
            'q1', 'q2', 'q3', 'q4', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'
        ];
        const yearOrDateRegex = /(?:13\d\d|14\d\d|20\d\d|\d{2,4}[/-]\d{1,2})/;
        
        let temporalScore = 0;
        labels.forEach(lbl => {
            const lower = lbl.toLowerCase();
            if (temporalTerms.some(t => lower.includes(t)) || yearOrDateRegex.test(lbl)) {
                temporalScore++;
            }
        });
        const isTemporal = (temporalScore / count) >= 0.4 || temporalScore >= 2;

        // 2. Check for Share / Composition indicators
        const titleAndLabelsStr = (parsed.title + ' ' + labels.join(' ')).toLowerCase();
        const shareTerms = ['سهم', 'درصد', 'ترکیب', 'توزیع', 'بودجه', 'سبد', 'تفکیک', 'مشارکت', 'نسبت'];
        const hasShareTerms = shareTerms.some(t => titleAndLabelsStr.includes(t));
        const isSumNear100 = (total >= 95 && total <= 105) || (parsed.unit === 'درصد');
        const isComposition = (isSumNear100 || hasShareTerms) && count >= 2 && count <= 8;

        // 3. Multi-criteria / Radar check
        const isRadarExplicit = parsed.chartType === 'radar';

        // 4. Determine Recommended Type & Insight
        let recommendedType = 'bar';
        let badgeText = '📊 مقایسه دسته‌ها و عملکرد';
        let badgeIcon = 'bar-chart-3';
        let insightText = '';

        if (isRadarExplicit) {
            recommendedType = 'radar';
            badgeText = '🎯 ارزیابی چندبعدی عملکرد';
            badgeIcon = 'target';
            insightText = `ارزیابی ${this.toPersianDigits(count)} شاخص عملکردی نشان‌دهنده برتری شاخص «${maxLabel}» است.`;
        } else if (isTemporal) {
            recommendedType = 'line';
            badgeText = '📈 تحلیل سری زمانی و روند';
            badgeIcon = 'trending-up';
            insightText = `روند زمانی داده‌ها حاکی از اوج در «${maxLabel}» (${this.toPersianDigits(max)}) و کمترین مقدار در «${minLabel}» (${this.toPersianDigits(min)}) است.`;
        } else if (isComposition) {
            recommendedType = 'doughnut';
            badgeText = '🍩 تحلیل ترکیب و سهم از کل';
            badgeIcon = 'pie-chart';
            const sharePct = total > 0 ? ((max / total) * 100).toFixed(1) : 0;
            insightText = `بخش «${maxLabel}» با سهم ${this.toPersianDigits(sharePct)}٪ (${this.toPersianDigits(max)}) بیشترین سهم را داراست.`;
        } else {
            recommendedType = 'bar';
            badgeText = '📊 مقایسه مقادیر و شاخص‌ها';
            badgeIcon = 'bar-chart-3';
            insightText = `مقایسه بین ${this.toPersianDigits(count)} شاخص نشان می‌دهد «${maxLabel}» بالاترین مقدار (${this.toPersianDigits(max)}) را ثبت کرده است.`;
        }

        let activeType = parsed.chartType;
        if (!activeType || !['line', 'bar', 'doughnut', 'pie', 'radar'].includes(activeType)) {
            activeType = recommendedType;
        }

        return {
            recommendedType,
            activeType,
            badgeText,
            badgeIcon,
            insightText,
            stats: { total, avg, max, min }
        };
    },

    renderSmartChartCard(rawCode, safeCode, lang) {
        const parsed = this.parseChartData(rawCode, lang);
        if (!parsed.labels.length && (!parsed.datasets || !parsed.datasets.length)) {
            return `
                <div class="code-block-wrapper my-3 rounded-xl overflow-hidden border border-gray-700/60 bg-[#161616] shadow-lg text-left" dir="ltr">
                    <pre class="p-3.5 m-0 bg-[#161616] overflow-x-auto text-[13px] font-mono leading-relaxed"><code>${safeCode}</code></pre>
                </div>
            `;
        }

        const analysis = this.analyzeDataAndDetermineChart(parsed);
        const cardId = 'smartchart-' + Math.random().toString(36).substring(2, 9);
        const title = parsed.title || 'نمودار تحلیلی شاخص‌ها';
        const unit = parsed.unit || '';
        const activeType = analysis.activeType;

        const configPayload = {
            cardId,
            title,
            unit,
            labels: parsed.labels,
            datasets: parsed.datasets,
            activeType,
            recommendedType: analysis.recommendedType,
            stats: analysis.stats
        };

        const encodedConfig = encodeURIComponent(JSON.stringify(configPayload));

        // Generate Collapsible Data Table HTML
        const tableRowsHtml = parsed.labels.map((lbl, idx) => {
            const val = parsed.datasets[0] ? parsed.datasets[0].data[idx] : '-';
            const formattedVal = typeof val === 'number' ? this.toPersianDigits(val) : val;
            return `
                <tr class="border-b border-gray-200/50 dark:border-gray-700/40 hover:bg-gray-100/50 dark:hover:bg-white/5 transition">
                    <td class="py-1.5 px-3 font-medium text-gray-700 dark:text-gray-300 text-right">${lbl}</td>
                    <td class="py-1.5 px-3 font-mono font-bold text-emerald-600 dark:text-emerald-400 text-left" dir="ltr">${formattedVal} ${unit}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="smart-chart-container my-4 rounded-2xl border border-gray-200 dark:border-gray-700/70 bg-white dark:bg-[#1a1a1a] shadow-lg overflow-hidden transition-all select-none" id="${cardId}" data-chart-config="${encodedConfig}">
                <!-- Header: Title, Analysis Badge, Controls -->
                <div class="chart-card-header flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-gray-50/90 dark:bg-[#232323] border-b border-gray-200 dark:border-gray-700/60">
                    <div class="flex items-center gap-3">
                        <span class="p-2 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                            <i data-lucide="${analysis.badgeIcon}" class="w-4 h-4"></i>
                        </span>
                        <div>
                            <h4 class="font-bold text-sm text-gray-800 dark:text-gray-100 flex items-center gap-2">
                                <span>${title}</span>
                            </h4>
                            <div class="flex items-center gap-2 mt-1">
                                <span class="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                    ${analysis.badgeText}
                                </span>
                                ${unit ? `<span class="text-[11px] text-gray-400">واحد: <strong>${unit}</strong></span>` : ''}
                            </div>
                        </div>
                    </div>

                    <!-- Toolbar Buttons: Type Switcher, Download PNG, View Table -->
                    <div class="flex items-center gap-2 flex-wrap">
                        <!-- Dynamic Type Switcher -->
                        <div class="inline-flex rounded-xl bg-gray-200/80 dark:bg-[#141414] p-1 gap-1 text-xs" role="group">
                            <button type="button" class="chart-type-btn px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${activeType === 'bar' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-white/10'}" data-type="bar" onclick="Chat.switchChartType('${cardId}', 'bar')" title="نمودار میله‌ای/ستونی (مقایسه دسته‌ها)">
                                ستونی
                            </button>
                            <button type="button" class="chart-type-btn px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${activeType === 'line' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-white/10'}" data-type="line" onclick="Chat.switchChartType('${cardId}', 'line')" title="نمودار خطی (روند زمانی)">
                                خطی
                            </button>
                            <button type="button" class="chart-type-btn px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${activeType === 'doughnut' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-white/10'}" data-type="doughnut" onclick="Chat.switchChartType('${cardId}', 'doughnut')" title="نمودار دونات (سهم و ترکیب)">
                                دونات
                            </button>
                            <button type="button" class="chart-type-btn px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${activeType === 'pie' ? 'bg-emerald-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-white/10'}" data-type="pie" onclick="Chat.switchChartType('${cardId}', 'pie')" title="نمودار دایره‌ای">
                                دایره
                            </button>
                        </div>

                        <!-- Download PNG -->
                        <button type="button" class="p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#202020] text-gray-600 hover:text-emerald-500 dark:text-gray-300 dark:hover:text-emerald-400 hover:border-emerald-500/40 transition cursor-pointer shadow-sm" onclick="Chat.downloadChartImage('${cardId}')" title="دانلود تصویر با کیفیت بالا (PNG)">
                            <i data-lucide="download" class="w-4 h-4"></i>
                        </button>

                        <!-- Toggle Data Table -->
                        <button type="button" class="p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#202020] text-gray-600 hover:text-blue-500 dark:text-gray-300 dark:hover:text-blue-400 hover:border-blue-500/40 transition cursor-pointer shadow-sm" onclick="Chat.toggleChartDataTable('${cardId}')" title="مشاهده جدول داده‌های خام">
                            <i data-lucide="table" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>

                <!-- Initial Analysis Insight Banner -->
                <div class="px-4 py-2.5 bg-emerald-500/5 dark:bg-emerald-500/10 border-b border-emerald-500/15 text-xs text-gray-700 dark:text-gray-200 flex flex-wrap items-center justify-between gap-2">
                    <div class="flex items-center gap-2">
                        <span class="text-emerald-500 flex-shrink-0">
                            <i data-lucide="sparkles" class="w-3.5 h-3.5"></i>
                        </span>
                        <span class="font-medium leading-relaxed">${analysis.insightText}</span>
                    </div>
                    <div class="flex items-center gap-3 text-[11px] font-mono text-gray-500 dark:text-gray-400 mr-auto">
                        <span>مجموع: <strong class="text-gray-800 dark:text-gray-200">${this.toPersianDigits(analysis.stats.total)}</strong></span>
                        <span>میانگین: <strong class="text-gray-800 dark:text-gray-200">${this.toPersianDigits(analysis.stats.avg)}</strong></span>
                        <span>بیشترین: <strong class="text-emerald-600 dark:text-emerald-400">${this.toPersianDigits(analysis.stats.max)}</strong></span>
                    </div>
                </div>

                <!-- Chart.js Canvas Area -->
                <div class="p-4 relative w-full h-[270px] md:h-[310px] flex items-center justify-center">
                    <canvas id="canvas-${cardId}" class="w-full h-full"></canvas>
                </div>

                <!-- Collapsible Raw Data Table -->
                <div id="table-${cardId}" class="hidden border-t border-gray-200 dark:border-gray-700/60 p-3 bg-gray-50/50 dark:bg-black/20 text-xs">
                    <div class="font-bold mb-2 text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                        <i data-lucide="database" class="w-3.5 h-3.5 text-emerald-500"></i>
                        <span>جدول داده‌های آماری نمودار:</span>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-xs text-right border-collapse">
                            <thead>
                                <tr class="bg-gray-100 dark:bg-white/5 border-b border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400">
                                    <th class="py-1.5 px-3">عنوان / برچسب</th>
                                    <th class="py-1.5 px-3 text-left">مقدار</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    initSmartChart(cardId) {
        const card = document.getElementById(cardId);
        if (!card) return;
        const canvas = document.getElementById('canvas-' + cardId);
        if (!canvas) return;

        if (card.dataset.chartInitialized === 'true' && this.chartInstances[cardId]) {
            return;
        }

        if (typeof window.Chart === 'undefined') {
            return;
        }

        let configData = null;
        try {
            configData = JSON.parse(decodeURIComponent(card.dataset.chartConfig));
        } catch (e) {
            console.error('Failed to parse chart config:', e);
            return;
        }

        const isDark = document.documentElement.classList.contains('dark');
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
        const textColor = isDark ? '#9ca3af' : '#4b5563';
        const activeType = configData.activeType || 'bar';

        const palette = [
            '#10b981', // emerald
            '#06b6d4', // cyan
            '#3b82f6', // blue
            '#6366f1', // indigo
            '#f59e0b', // amber
            '#f43f5e', // rose
            '#8b5cf6', // violet
            '#14b8a6'  // teal
        ];

        const labels = configData.labels || [];
        const rawDatasets = configData.datasets || [];
        const unit = configData.unit || '';

        if (this.chartInstances[cardId]) {
            try { this.chartInstances[cardId].destroy(); } catch (e) {}
            delete this.chartInstances[cardId];
        }

        const chartDatasets = rawDatasets.map((ds, idx) => {
            const label = ds.label || configData.title || 'شاخص';
            const data = ds.data || [];

            if (activeType === 'line') {
                const baseCol = palette[idx % palette.length];
                return {
                    label: label,
                    data: data,
                    borderColor: baseCol,
                    backgroundColor: idx === 0 ? 'rgba(16, 185, 129, 0.18)' : 'rgba(6, 182, 212, 0.18)',
                    borderWidth: 2.5,
                    fill: true,
                    tension: 0.35,
                    pointBackgroundColor: baseCol,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4.5,
                    pointHoverRadius: 7
                };
            } else if (activeType === 'doughnut' || activeType === 'pie') {
                const sliceColors = data.map((_, i) => palette[i % palette.length]);
                return {
                    label: label,
                    data: data,
                    backgroundColor: sliceColors,
                    borderColor: isDark ? '#1a1a1a' : '#ffffff',
                    borderWidth: 2,
                    hoverOffset: 8
                };
            } else if (activeType === 'radar') {
                const baseCol = palette[idx % palette.length];
                return {
                    label: label,
                    data: data,
                    borderColor: baseCol,
                    backgroundColor: 'rgba(16, 185, 129, 0.25)',
                    borderWidth: 2,
                    pointBackgroundColor: baseCol,
                    pointBorderColor: '#fff',
                    pointRadius: 4
                };
            } else {
                const isSingleDataset = rawDatasets.length === 1;
                const barColors = isSingleDataset 
                    ? data.map((_, i) => palette[i % palette.length]) 
                    : palette[idx % palette.length];

                return {
                    label: label,
                    data: data,
                    backgroundColor: barColors,
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 42
                };
            }
        });

        const isCircular = (activeType === 'doughnut' || activeType === 'pie' || activeType === 'radar');
        const scalesConfig = isCircular ? {} : {
            x: {
                grid: { color: gridColor, drawBorder: false },
                ticks: {
                    color: textColor,
                    font: { family: 'Vazirmatn, system-ui, sans-serif', size: 11 }
                }
            },
            y: {
                grid: { color: gridColor, drawBorder: false },
                ticks: {
                    color: textColor,
                    font: { family: 'Vazirmatn, system-ui, sans-serif', size: 11 },
                    callback: (value) => this.toPersianDigits(value) + (unit ? ' ' + unit : '')
                }
            }
        };

        const ctx = canvas.getContext('2d');
        const chartInstance = new Chart(ctx, {
            type: activeType,
            data: {
                labels: labels,
                datasets: chartDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 550, easing: 'easeOutQuart' },
                plugins: {
                    legend: {
                        display: (activeType === 'doughnut' || activeType === 'pie' || rawDatasets.length > 1),
                        position: 'top',
                        rtl: true,
                        textDirection: 'rtl',
                        labels: {
                            color: textColor,
                            font: { family: 'Vazirmatn, system-ui, sans-serif', size: 12 },
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 12
                        }
                    },
                    tooltip: {
                        rtl: true,
                        textDirection: 'rtl',
                        backgroundColor: isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                        titleColor: isDark ? '#f3f4f6' : '#111827',
                        bodyColor: isDark ? '#e5e7eb' : '#374151',
                        borderColor: isDark ? 'rgba(75, 85, 99, 0.4)' : 'rgba(209, 213, 219, 0.8)',
                        borderWidth: 1,
                        padding: 10,
                        boxPadding: 4,
                        usePointStyle: true,
                        titleFont: { family: 'Vazirmatn, system-ui, sans-serif', size: 12, weight: 'bold' },
                        bodyFont: { family: 'Vazirmatn, system-ui, sans-serif', size: 12 },
                        callbacks: {
                            label: (context) => {
                                const val = context.raw;
                                const displayVal = typeof val === 'number' ? this.toPersianDigits(val) : val;
                                const dsLabel = context.dataset.label ? context.dataset.label + ': ' : '';
                                return `${dsLabel}${displayVal} ${unit}`;
                            }
                        }
                    }
                },
                scales: scalesConfig
            }
        });

        this.chartInstances[cardId] = chartInstance;
        card.dataset.chartInitialized = 'true';
    },

    switchChartType(cardId, newType) {
        const card = document.getElementById(cardId);
        if (!card) return;

        let configData = null;
        try {
            configData = JSON.parse(decodeURIComponent(card.dataset.chartConfig));
        } catch (e) {
            return;
        }

        configData.activeType = newType;
        card.dataset.chartConfig = encodeURIComponent(JSON.stringify(configData));
        card.dataset.chartInitialized = 'false';

        card.querySelectorAll('.chart-type-btn').forEach(btn => {
            const btnType = btn.getAttribute('data-type');
            if (btnType === newType) {
                btn.className = 'chart-type-btn px-2.5 py-1 rounded-lg font-medium transition cursor-pointer bg-emerald-600 text-white shadow-sm';
            } else {
                btn.className = 'chart-type-btn px-2.5 py-1 rounded-lg font-medium transition cursor-pointer text-gray-600 dark:text-gray-300 hover:bg-white/40 dark:hover:bg-white/10';
            }
        });

        this.initSmartChart(cardId);
    },

    downloadChartImage(cardId) {
        const chart = this.chartInstances[cardId];
        const card = document.getElementById(cardId);
        if (!chart || !card) {
            App.toast('نمودار هنوز بارگذاری نشده است', 'warning');
            return;
        }

        let configData = {};
        try {
            configData = JSON.parse(decodeURIComponent(card.dataset.chartConfig));
        } catch (e) {}

        const title = configData.title || 'chart';
        const isDark = document.documentElement.classList.contains('dark');
        const canvas = chart.canvas;

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = canvas.width;
        exportCanvas.height = canvas.height;
        const ctx = exportCanvas.getContext('2d');

        ctx.fillStyle = isDark ? '#1a1a1a' : '#ffffff';
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        ctx.drawImage(canvas, 0, 0);

        const dataUrl = exportCanvas.toDataURL('image/png', 1.0);
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${title.replace(/[\/\\:*?"<>|]/g, '_')}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        App.toast('تصویر باکیفیت نمودار دانلود شد', 'success');
    },

    toggleChartDataTable(cardId) {
        const tableDiv = document.getElementById('table-' + cardId);
        if (tableDiv) {
            tableDiv.classList.toggle('hidden');
        }
    },

    initAllCharts(container, force = false) {
        const root = container || document;
        const chartCards = root.querySelectorAll('.smart-chart-container');
        chartCards.forEach(card => {
            if (force) {
                card.dataset.chartInitialized = 'false';
            }
            this.initSmartChart(card.id);
        });
        if (window.lucide) lucide.createIcons();
    },

    updateAllChartsTheme(isDark) {
        Object.keys(this.chartInstances).forEach(cardId => {
            const card = document.getElementById(cardId);
            if (card) {
                card.dataset.chartInitialized = 'false';
                this.initSmartChart(cardId);
            }
        });
    },

    toggleVisualCode(cardId) {
        const card = document.getElementById(cardId);
        if (!card) return;
        const rawView = card.querySelector('.raw-code-view');
        if (rawView) {
            rawView.classList.toggle('hidden');
        }
    },

    splitThinkingAndResult(rawContent) {
        if (!rawContent) {
            return { hasThinking: false, thinking: '', result: '', isThinkingActive: false };
        }

        // Case 1: Closed <think>...</think>
        const closedMatch = rawContent.match(/^<think>([\s\S]*?)<\/think>([\s\S]*)$/i);
        if (closedMatch) {
            return {
                hasThinking: true,
                thinking: closedMatch[1].trim(),
                result: closedMatch[2].trim(),
                isThinkingActive: false
            };
        }

        // Case 2: Open <think>... (actively streaming thinking phase)
        if (rawContent.startsWith('<think>')) {
            const thinkingPart = rawContent.slice(7);
            return {
                hasThinking: true,
                thinking: thinkingPart.trim(),
                result: '',
                isThinkingActive: true
            };
        }

        // Case 3: Embedded <think>...</think> anywhere
        const embeddedMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/i);
        if (embeddedMatch) {
            return {
                hasThinking: true,
                thinking: embeddedMatch[1].trim(),
                result: rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim(),
                isThinkingActive: false
            };
        }

        // Case 4: No thinking tags
        return {
            hasThinking: false,
            thinking: '',
            result: rawContent,
            isThinkingActive: false
        };
    },

    extractResultText(rawContent) {
        if (!rawContent) return '';
        let cleaned = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '').trim();
        return cleaned;
    },

    extractThinkingText(rawContent) {
        if (!rawContent) return '';
        const match = rawContent.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
        return match ? match[1].trim() : '';
    },

    copyThinkingContent(btn, event) {
        if (event) event.stopPropagation();
        const wrapper = btn.closest('.thinking-block-completed, .thinking-block-active');
        if (!wrapper) return;
        const bodyEl = wrapper.querySelector('.thinking-body');
        const text = bodyEl ? (bodyEl.innerText || bodyEl.textContent || '') : '';
        if (!text) return;

        App.copyToClipboard(text, 'متن فرآیند استدلال کپی شد');
        const span = btn.querySelector('span');
        if (span) {
            const orig = span.textContent;
            span.textContent = '✓ کپی شد';
            setTimeout(() => { span.textContent = orig; }, 2000);
        }
    },

    renderAssistantMessage(reasoning, content, isReasoningActive = false) {
        let actualReasoning = reasoning || '';
        let actualContent = content || '';
        let activeThinking = isReasoningActive;

        // Backward compatibility if called with (rawContent, isStreaming)
        if (content === undefined || typeof content === 'boolean') {
            const isStreaming = Boolean(content);
            const parsed = this.splitThinkingAndResult(reasoning || '');
            actualReasoning = parsed.thinking;
            actualContent = parsed.result;
            activeThinking = parsed.isThinkingActive || (isStreaming && !actualContent && Boolean(actualReasoning));
        } else if (!actualReasoning && actualContent && actualContent.includes('<think>')) {
            const parsed = this.splitThinkingAndResult(actualContent);
            actualReasoning = parsed.thinking;
            actualContent = parsed.result;
            if (parsed.isThinkingActive) {
                activeThinking = true;
            }
        }

        let thinkingHtml = '';
        if (actualReasoning || activeThinking) {
            if (activeThinking) {
                // Live active thinking phase
                thinkingHtml = `
                    <div class="thinking-block-active mb-3.5 p-3.5 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/30 text-xs shadow-xs" dir="rtl">
                        <div class="flex items-center justify-between pb-2 mb-2 border-b border-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold">
                            <div class="flex items-center gap-2">
                                <span class="relative flex h-2.5 w-2.5">
                                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                    <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                                </span>
                                <i data-lucide="brain" class="w-4 h-4 text-amber-500"></i>
                                <span>در حال تحلیل و استدلال عمیق مدل...</span>
                            </div>
                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 font-mono">
                                Thinking
                            </span>
                        </div>
                        <div class="thinking-body whitespace-pre-wrap font-mono text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed max-h-60 overflow-y-auto pl-1 opacity-90 select-text">
                            ${actualReasoning || 'در حال واکاوی داده‌ها و استخراج پاسخ...'}
                        </div>
                    </div>
                `;
            } else {
                // Completed thinking block (collapsible)
                const wordCount = actualReasoning ? actualReasoning.split(/\s+/).filter(Boolean).length : 0;
                const countBadge = wordCount > 0 ? `${Chat.toPersianDigits(wordCount)} کلمه استدلال` : 'فرآیند تفکر';
                thinkingHtml = `
                    <details class="thinking-block-completed mb-3.5 rounded-2xl bg-gray-100/90 dark:bg-[#252528] border border-gray-200 dark:border-gray-700/60 p-3 text-xs transition-all group shadow-xs" dir="rtl">
                        <summary class="cursor-pointer font-medium text-gray-600 dark:text-gray-400 flex items-center justify-between select-none hover:text-emerald-500 transition-colors">
                            <div class="flex items-center gap-2">
                                <div class="w-6 h-6 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                                    <i data-lucide="brain" class="w-3.5 h-3.5"></i>
                                </div>
                                <span class="font-semibold text-gray-700 dark:text-gray-300">مشاهده فرآیند استدلال و تفکر مدل</span>
                                <span class="text-[10px] px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700/80 text-gray-500 dark:text-gray-400 font-mono">
                                    ${countBadge}
                                </span>
                            </div>
                            <div class="flex items-center gap-2">
                                <button type="button" onclick="Chat.copyThinkingContent(this, event)" class="p-1 px-2 rounded-lg bg-gray-200/70 dark:bg-gray-700/70 hover:bg-emerald-500 hover:text-white text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1 transition-colors" title="کپی استدلال">
                                    <i data-lucide="copy" class="w-3 h-3"></i>
                                    <span>کپی استدلال</span>
                                </button>
                                <div class="flex items-center gap-1 text-gray-400 group-hover:text-emerald-500 text-[11px]">
                                    <i data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform duration-200 group-open:rotate-180"></i>
                                </div>
                            </div>
                        </summary>
                        <div class="thinking-body mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/50 whitespace-pre-wrap font-mono text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed max-h-72 overflow-y-auto pl-1 select-text">
                            ${actualReasoning}
                        </div>
                    </details>
                `;
            }
        }

        let resultHtml = '';
        if (actualContent) {
            const rtl = this.isRTLText(actualContent);
            const dirAttr = rtl ? 'rtl' : 'ltr';
            let sectionHeader = '';
            if (actualReasoning) {
                sectionHeader = `
                    <div class="result-section-header flex items-center gap-2 mb-2 pb-1.5 border-b border-gray-100 dark:border-gray-800 text-xs font-bold text-gray-700 dark:text-gray-200" dir="rtl">
                        <i data-lucide="sparkles" class="w-3.5 h-3.5 text-emerald-500"></i>
                        <span>پاسخ نهایی دستیار:</span>
                    </div>
                `;
            }
            resultHtml = `
                <div class="result-section" dir="${dirAttr}">
                    ${sectionHeader}
                    <div class="result-content prose-custom text-gray-800 dark:text-gray-200">
                        ${marked.parse(this.formatVisualElements(actualContent))}
                    </div>
                </div>
            `;
        } else if (activeThinking) {
            resultHtml = `
                <div class="result-placeholder flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 py-1" dir="rtl">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span>در حال آماده‌سازی پاسخ نهایی...</span>
                </div>
            `;
        }

        return `
            <div class="assistant-message-body space-y-1">
                ${thinkingHtml}
                ${resultHtml}
            </div>
        `;
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
        this.initAllCharts(container);
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
        this.initQuestionsNav();
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

        const setRTL = () => {
            input.setAttribute('dir', 'rtl');
            input.style.direction = 'rtl';
            input.style.textAlign = 'right';
        };

        const setLTR = () => {
            input.setAttribute('dir', 'ltr');
            input.style.direction = 'ltr';
            input.style.textAlign = 'left';
        };

        // Always initialize strictly RTL
        setRTL();

        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 180) + 'px';

            const rawVal = input.value;
            const val = rawVal.trim();
            if (val) {
                // If it contains ANY Persian/Arabic character, or starts with slash, KEEP RTL!
                const hasPersian = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(val);
                const isPureEnglish = !hasPersian && /^[a-zA-Z0-9\s!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]+$/.test(val);

                if (isPureEnglish && !rawVal.startsWith('/')) {
                    setLTR();
                } else {
                    setRTL();
                }
            } else {
                setRTL();
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
        if (stopBtn) {
            stopBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.stopStreaming();
            });
        }

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

        // Close session delete modal on backdrop click or Escape
        const deleteModal = document.getElementById('session-delete-modal');
        if (deleteModal) {
            deleteModal.addEventListener('click', (e) => {
                if (e.target === deleteModal) {
                    this.closeDeleteModal();
                }
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeDeleteModal();
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

        // Global Delegation for Code Block Copy Button & Interactive Controls
        document.addEventListener('click', (e) => {
            const stopMsgBtn = e.target.closest('#btn-stop-message');
            if (stopMsgBtn) {
                e.preventDefault();
                e.stopPropagation();
                this.stopStreaming();
                return;
            }

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
                const provName = (data.provider || 'سرویس مدل').toUpperCase();
                if (indicator) {
                    indicator.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse';
                    indicator.title = `${provName} آنلاین و آماده پاسخگویی است`;
                }
            } else {
                if (indicator) {
                    indicator.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
                    indicator.title = 'سرویس مدل در دسترس نیست';
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

        // Sort: pinned sessions at the very top, then by updated_at descending
        this.sessions.sort((a, b) => {
            const aPin = a.is_pinned ? 1 : 0;
            const bPin = b.is_pinned ? 1 : 0;
            if (aPin !== bPin) return bPin - aPin;
            return new Date(b.updated_at) - new Date(a.updated_at);
        });

        listEl.innerHTML = this.sessions.map(s => {
            const isActive = s.id === this.currentSessionId;
            const isPinned = Boolean(s.is_pinned);
            const activeClasses = isActive 
                ? 'bg-blue-500/10 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold border-blue-500/30 dark:border-blue-500/40 shadow-xs' 
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100/90 dark:hover:bg-[#252528] border-transparent';
            
            const cleanTitle = (s.title || 'گفتگوی بدون نام').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const escapedJsTitle = (s.title || 'گفتگوی بدون نام').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            const pinBadge = isPinned 
                ? `<span class="inline-flex items-center text-amber-500 shrink-0" title="سنجاق‌شده به اول لیست">
                       <i data-lucide="pin" class="w-3.5 h-3.5 fill-amber-500/40 rotate-45 text-amber-500"></i>
                   </span>`
                : '';

            return `
                <div class="session-item group relative flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer border transition-all ${activeClasses}" data-id="${s.id}">
                    <div class="flex items-center gap-2 overflow-hidden flex-1 select-none" onclick="Chat.switchSession('${s.id}')">
                        ${pinBadge || `<i data-lucide="message-square" class="w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-blue-500' : 'text-gray-400'}"></i>`}
                        <span class="truncate session-title text-right">${cleanTitle}</span>
                    </div>

                    <!-- Floating Action Popover on Hover -->
                    <div class="session-actions-popover" onclick="event.stopPropagation()">
                        <button type="button" class="session-action-btn ${isPinned ? 'text-amber-500 bg-amber-500/15 dark:bg-amber-500/20' : 'text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40'}" onclick="Chat.togglePinSession('${s.id}', event)" title="${isPinned ? 'برداشتن سنجاق (Unpin)' : 'سنجاق کردن به اول لیست (Pin to top)'}">
                            <i data-lucide="pin" class="w-3.5 h-3.5 ${isPinned ? 'fill-amber-500/50 rotate-45' : ''}"></i>
                        </button>
                        <button type="button" class="session-action-btn text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40" onclick="Chat.promptRenameSession('${s.id}', '${escapedJsTitle}', event)" title="تغییر نام">
                            <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
                        </button>
                        <button type="button" class="session-action-btn text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40" onclick="Chat.openDeleteModal('${s.id}', '${escapedJsTitle}', event)" title="حذف گفتگو (Delete)">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5 text-rose-500"></i>
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
                this.updateQuestionsNav();
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
                        this.appendMessage(msg.role, msg.content, msg.has_attachment, msg.attachment_name, msg.reasoning);
                    });
                    this.scrollToBottom();
                } else {
                    if (welcomeScreen) welcomeScreen.classList.remove('hidden');
                }
                
                const summaryChip = document.getElementById('session-summary-chip');
                if (summaryChip) {
                    if (data.conversation_summary && data.conversation_summary.trim()) {
                        summaryChip.classList.remove('hidden');
                        summaryChip.classList.add('flex');
                        summaryChip.title = `خلاصه پیوستگی موضوعی گفتگو:\n${data.conversation_summary}`;
                    } else if (data.messages && data.messages.length >= 2) {
                        summaryChip.classList.remove('hidden');
                        summaryChip.classList.add('flex');
                        summaryChip.title = 'پیوستگی موضوعی برای پیام‌های بعدی به صورت خودکار فعال است.';
                    } else {
                        summaryChip.classList.add('hidden');
                        summaryChip.classList.remove('flex');
                    }
                }

                this.updateQuestionsNav();
                if (window.lucide) lucide.createIcons();
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

    async togglePinSession(sessionId, event) {
        if (event) event.stopPropagation();
        try {
            const res = await fetch(`/api/chat/sessions/${sessionId}/pin`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${App.token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const sess = this.sessions.find(s => s.id === sessionId);
                if (sess) {
                    sess.is_pinned = data.is_pinned;
                }
                this.renderSessionsList();
                App.toast(data.is_pinned ? 'گفتگو به اول لیست سنجاق شد' : 'سنجاق گفتگو برداشته شد', 'info');
            } else {
                App.toast('خطا در سنجاق کردن گفتگو', 'error');
            }
        } catch (e) {
            App.toast('خطا در سنجاق کردن گفتگو', 'error');
        }
    },

    openDeleteModal(sessionId = null, sessionTitle = null, event = null) {
        if (event) {
            event.stopPropagation();
            event.preventDefault();
        }
        const targetId = sessionId || this.currentSessionId || (this.sessions && this.sessions.length > 0 ? this.sessions[0].id : null);
        if (!targetId) {
            App.toast('هیچ گفتگویی برای حذف وجود ندارد', 'warning');
            return;
        }

        this.pendingDeleteSessionId = targetId;
        let title = sessionTitle;
        if (!title) {
            const s = this.sessions.find(item => item.id === targetId);
            title = s ? s.title : 'گفتگوی جاری';
        }

        const titleEl = document.getElementById('delete-modal-session-title');
        if (titleEl) {
            titleEl.textContent = title;
        }

        const modal = document.getElementById('session-delete-modal');
        if (modal) {
            modal.classList.remove('hidden');
            if (window.lucide) lucide.createIcons();
        }
    },

    closeDeleteModal() {
        this.pendingDeleteSessionId = null;
        const modal = document.getElementById('session-delete-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    },

    async confirmDeleteSession() {
        const sessionId = this.pendingDeleteSessionId;
        if (!sessionId) {
            this.closeDeleteModal();
            return;
        }

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
                this.updateQuestionsNav();
                App.toast('گفتگو با موفقیت پاک شد', 'info');
            } else {
                App.toast('خطا در حذف گفتگو', 'error');
            }
        } catch (e) {
            App.toast('خطا در حذف گفتگو', 'error');
        } finally {
            this.closeDeleteModal();
        }
    },

    deleteSession(sessionId, event) {
        this.openDeleteModal(sessionId, null, event);
    },

    deleteCurrentSession() {
        this.openDeleteModal(this.currentSessionId);
    },

    appendMessage(role, content, hasAttachment = false, attachmentName = '', reasoning = null) {
        const streamContainer = document.getElementById('chat-stream');
        const welcomeScreen = document.getElementById('welcome-screen');
        if (welcomeScreen) welcomeScreen.classList.add('hidden');
        if (!streamContainer) return;

        const isUser = role === 'user';
        const rtl = this.isRTLText(content);
        const dirAttr = rtl ? 'rtl' : 'ltr';

        const msgDiv = document.createElement('div');
        msgDiv.className = `flex gap-3 animate-fade-in ${isUser ? 'justify-end user-message-node' : 'justify-start'}`;

        let renderedContent = '';
        if (isUser) {
            msgDiv.id = 'user-msg-' + Math.random().toString(36).substring(2, 9);
            msgDiv.dataset.role = 'user';
            let attachBadge = '';
            if (hasAttachment && attachmentName) {
                attachBadge = `<div class="text-[11px] mb-1.5 flex items-center gap-1 text-emerald-400 font-mono"><i data-lucide="file-text" class="w-3 h-3"></i><span>${attachmentName}</span></div>`;
            }
            renderedContent = `
                <div class="user-msg-bubble max-w-[85%] md:max-w-[75%] rounded-2xl p-3.5 bg-gray-200 dark:bg-[#2f2f2f] text-gray-900 dark:text-gray-100 text-sm shadow-sm transition-all" dir="${dirAttr}">
                    ${attachBadge}
                    <div class="whitespace-pre-wrap">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                </div>
            `;
        } else {
            const hasTables = /\|(?:\s*:?-+:?\s*\|)+/.test(content || '');
            const actionsHtml = this.buildMessageActionToolbar(content, null, hasTables);
            const parsedAssistantHtml = this.renderAssistantMessage(reasoning || '', content || '', false);
            renderedContent = `
                <div class="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
                    AI
                </div>
                <div class="flex-1 max-w-[90%] space-y-1">
                    <div class="assistant-content-container">
                        ${parsedAssistantHtml}
                    </div>
                    <div class="msg-actions-container w-full">
                        ${actionsHtml}
                    </div>
                </div>
            `;
        }

        msgDiv.dataset.rawContent = content || '';
        if (reasoning) {
            msgDiv.dataset.rawReasoning = reasoning;
        }
        msgDiv.innerHTML = renderedContent;
        streamContainer.appendChild(msgDiv);

        this.highlightCode(msgDiv);
        this.enhanceTablesAndMeters(msgDiv);

        if (isUser) {
            this.updateQuestionsNav();
        }

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

    async stopStreaming() {
        if (!this.isStreaming && !this.abortController && !this.activeReader) return;
        this.isStreaming = false;

        // 1. Cancel fetch stream reader immediately
        if (this.activeReader) {
            try {
                await this.activeReader.cancel();
            } catch (e) {
                console.warn('Reader cancel error:', e);
            }
            this.activeReader = null;
        }

        // 2. Abort fetch controller
        if (this.abortController) {
            try {
                this.abortController.abort();
            } catch (e) {}
            this.abortController = null;
        }

        // 3. Finalize UI immediately with whatever text was accumulated
        const contentEl = this.activeContentEl;
        const asstBubbleWrapper = this.activeBubbleWrapper;
        const accumulatedReasoning = this.currentAccumulatedReasoning || '';
        const accumulatedContent = this.currentAccumulatedContent || '';

        if (contentEl && asstBubbleWrapper) {
            if (accumulatedContent.trim() || accumulatedReasoning.trim()) {
                const rtl = this.isRTLText(accumulatedContent);
                contentEl.setAttribute('dir', rtl ? 'rtl' : 'ltr');
                contentEl.innerHTML = this.renderAssistantMessage(accumulatedReasoning, accumulatedContent, false);

                const hasTables = /\|(?:\s*:?-+:?\s*\|)+/.test(accumulatedContent);
                let actionsContainer = asstBubbleWrapper.querySelector('.msg-actions-container');
                if (!actionsContainer) {
                    actionsContainer = document.createElement('div');
                    actionsContainer.className = 'msg-actions-container w-full';
                    contentEl.parentNode.appendChild(actionsContainer);
                }
                actionsContainer.innerHTML = this.buildMessageActionToolbar(accumulatedContent, null, hasTables);
                asstBubbleWrapper.dataset.rawContent = accumulatedContent;
                if (accumulatedReasoning) {
                    asstBubbleWrapper.dataset.rawReasoning = accumulatedReasoning;
                }

                this.highlightCode(contentEl);
                this.enhanceTablesAndMeters(contentEl);
            } else {
                contentEl.innerHTML = `
                    <div class="text-xs text-gray-400 italic py-1 flex items-center gap-1.5" dir="rtl">
                        <i data-lucide="stop-circle" class="w-3.5 h-3.5 text-rose-400"></i>
                        <span>تولید پاسخ متوقف شد.</span>
                    </div>
                `;
            }
        }

        this.hideQueuePopup(true);
        this.setStreamingUI(false);
        this.scrollToBottom();
        if (window.lucide) lucide.createIcons();

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
        this.appendMessage('user', displayPrompt, Boolean(currentFile), currentFile ? currentFile.name : '');
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
                <div class="assistant-content-container streaming-content" dir="auto">
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
        this.activeContentEl = contentEl;
        this.activeBubbleWrapper = asstBubbleWrapper;
        this.currentAccumulatedReasoning = '';
        this.currentAccumulatedContent = '';
        let accumulatedReasoning = '';
        let accumulatedContent = '';
        let receivedExportIntent = null;

        let renderFramePending = false;
        let lastRenderTs = 0;
        let pendingIsThinking = false;

        const renderStreamUpdate = (thinkingMode) => {
            let currentReasoning = accumulatedReasoning;
            let currentResult = accumulatedContent;
            let isThinkingPhase = thinkingMode;

            // Handle models that send <think> tags in the content/token stream
            if (!currentReasoning && currentResult && currentResult.includes('<think>')) {
                const parsed = this.splitThinkingAndResult(currentResult);
                currentReasoning = parsed.thinking;
                currentResult = parsed.result;
                if (parsed.isThinkingActive) {
                    isThinkingPhase = true;
                }
            }

            const activeThinkingBody = contentEl.querySelector('.thinking-block-active .thinking-body');

            // Optimized update path during active thinking:
            // Updates text directly without destroying the DOM elements on every chunk
            if (isThinkingPhase && activeThinkingBody && !currentResult) {
                const distanceToBottom = activeThinkingBody.scrollHeight - activeThinkingBody.scrollTop - activeThinkingBody.clientHeight;
                const isNearBottom = distanceToBottom < 60;

                activeThinkingBody.textContent = currentReasoning;

                // By default keep pinned to the bottom so the latest thinking tokens are visible
                if (isNearBottom) {
                    activeThinkingBody.scrollTop = activeThinkingBody.scrollHeight;
                }
                this.scrollToBottom();
                return;
            }

            // Full render path (initial thinking mount, transition to final answer, or force render)
            contentEl.innerHTML = this.renderAssistantMessage(currentReasoning, currentResult, isThinkingPhase);
            if (window.lucide) lucide.createIcons();

            // When an active thinking block is mounted, ensure its scroll position starts at the bottom
            const newThinkingBody = contentEl.querySelector('.thinking-block-active .thinking-body');
            if (newThinkingBody) {
                newThinkingBody.scrollTop = newThinkingBody.scrollHeight;
            }
            this.scrollToBottom();
        };

        const scheduleStreamRender = (isThinking = false, force = false) => {
            pendingIsThinking = isThinking;
            const now = performance.now();
            if (force) {
                renderFramePending = false;
                renderStreamUpdate(isThinking);
                return;
            }
            if (renderFramePending) return;
            if (now - lastRenderTs < 35) {
                renderFramePending = true;
                requestAnimationFrame(() => {
                    renderFramePending = false;
                    lastRenderTs = performance.now();
                    renderStreamUpdate(pendingIsThinking);
                });
                return;
            }
            lastRenderTs = now;
            renderStreamUpdate(isThinking);
        };

        try {
            const response = await fetch('/api/chat/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${App.token}`
                },
                body: formData,
                signal: this.abortController.signal
            });

            if (!this.isStreaming) {
                return;
            }

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
            this.activeReader = reader;
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                if (!this.isStreaming) {
                    try { await reader.cancel(); } catch (e) {}
                    break;
                }

                const { done, value } = await reader.read();
                if (done || !this.isStreaming) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!this.isStreaming) break;
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

                            // 6. Handle Reasoning Stream
                            if (parsed.reasoning) {
                                accumulatedReasoning += parsed.reasoning;
                                this.currentAccumulatedReasoning = accumulatedReasoning;
                                scheduleStreamRender(true);
                            }

                            // 7. Handle Token Stream
                            if (parsed.token) {
                                accumulatedContent += parsed.token;
                                this.currentAccumulatedContent = accumulatedContent;
                                scheduleStreamRender(false);
                            }
                        } catch (e) {
                            console.error('SSE parse error:', e);
                        }
                    }
                }
            }

            renderFramePending = false;

            if ((accumulatedContent.trim() || accumulatedReasoning.trim()) && !asstBubbleWrapper.dataset.rawContent) {
                contentEl.innerHTML = this.renderAssistantMessage(accumulatedReasoning, accumulatedContent, false);
                
                const hasTables = /\|(?:\s*:?-+:?\s*\|)+/.test(accumulatedContent);
                let actionsContainer = asstBubbleWrapper.querySelector('.msg-actions-container');
                if (!actionsContainer) {
                    actionsContainer = document.createElement('div');
                    actionsContainer.className = 'msg-actions-container w-full';
                    contentEl.parentNode.appendChild(actionsContainer);
                }
                actionsContainer.innerHTML = this.buildMessageActionToolbar(accumulatedContent, receivedExportIntent, hasTables);
                asstBubbleWrapper.dataset.rawContent = accumulatedContent;
                if (accumulatedReasoning) {
                    asstBubbleWrapper.dataset.rawReasoning = accumulatedReasoning;
                }

                this.highlightCode(contentEl);
                this.enhanceTablesAndMeters(contentEl);
                if (window.lucide) lucide.createIcons();
            }

        } catch (err) {
            renderFramePending = false;
            this.hideQueuePopup(true);
            if (err.name === 'AbortError' || !this.isStreaming) {
                if ((accumulatedContent.trim() || accumulatedReasoning.trim()) && !asstBubbleWrapper.dataset.rawContent) {
                    contentEl.innerHTML = this.renderAssistantMessage(accumulatedReasoning, accumulatedContent, false);
                    
                    const hasTables = /\|(?:\s*:?-+:?\s*\|)+/.test(accumulatedContent);
                    let actionsContainer = asstBubbleWrapper.querySelector('.msg-actions-container');
                    if (!actionsContainer) {
                        actionsContainer = document.createElement('div');
                        actionsContainer.className = 'msg-actions-container w-full';
                        contentEl.parentNode.appendChild(actionsContainer);
                    }
                    actionsContainer.innerHTML = this.buildMessageActionToolbar(accumulatedContent, receivedExportIntent, hasTables);
                    asstBubbleWrapper.dataset.rawContent = accumulatedContent;
                    if (accumulatedReasoning) {
                        asstBubbleWrapper.dataset.rawReasoning = accumulatedReasoning;
                    }

                    this.highlightCode(contentEl);
                    this.enhanceTablesAndMeters(contentEl);
                    if (window.lucide) lucide.createIcons();
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
            this.activeReader = null;
            this.activeContentEl = null;
            this.activeBubbleWrapper = null;
            this.currentAccumulatedReasoning = '';
            this.currentAccumulatedContent = '';
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
        let content = wrapper.dataset.rawContent || '';
        if (!content) {
            const proseEl = wrapper.querySelector('.result-content, .prose-custom');
            content = proseEl ? (proseEl.innerText || proseEl.textContent || '') : '';
        }
        return this.extractResultText(content);
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
    },

    /* ============================================================
       QUESTION TIMELINE NAVIGATOR (GEMINI / CHATGPT STYLE)
       ============================================================ */
    initQuestionsNav() {
        const container = document.getElementById('messages-container');
        if (!container) return;

        let scrollTimeout = null;
        container.addEventListener('scroll', () => {
            if (scrollTimeout) return;
            scrollTimeout = setTimeout(() => {
                scrollTimeout = null;
                this.highlightActiveQuestionIndicator();
            }, 60);
        }, { passive: true });
    },

    updateQuestionsNav() {
        const navContainer = document.getElementById('questions-nav-container');
        const track = document.getElementById('questions-nav-track');
        if (!navContainer || !track) return;

        const streamContainer = document.getElementById('chat-stream');
        if (!streamContainer) {
            navContainer.classList.add('hidden');
            return;
        }

        const userMsgs = streamContainer.querySelectorAll('.user-message-node');
        if (userMsgs.length < 2) {
            navContainer.classList.add('hidden');
            track.innerHTML = '';
            return;
        }

        navContainer.classList.remove('hidden');
        track.innerHTML = Array.from(userMsgs).map((el, idx) => {
            const raw = el.dataset.rawContent || '';
            const preview = raw.length > 50 ? raw.substring(0, 47) + '...' : raw;
            const cleanPreview = preview.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const numPersian = this.toPersianDigits(idx + 1);
            return `
                <div class="question-nav-item group/pill" data-target-id="${el.id}" data-index="${idx}" onclick="Chat.scrollToUserMessage('${el.id}')" title="رفتن به سوال ${numPersian}">
                    <div class="question-nav-pill"></div>
                    <div class="question-nav-tooltip shadow-2xl">
                        <span class="font-bold text-blue-400">سوال ${numPersian}:</span>
                        <span class="text-gray-200 mr-1">${cleanPreview || 'متن سوال'}</span>
                    </div>
                </div>
            `;
        }).join('');

        this.highlightActiveQuestionIndicator();
    },

    scrollToUserMessage(targetId) {
        const targetEl = document.getElementById(targetId);
        if (!targetEl) return;
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

        const bubble = targetEl.querySelector('.user-msg-bubble') || targetEl;
        bubble.classList.remove('user-message-highlight');
        void bubble.offsetWidth;
        bubble.classList.add('user-message-highlight');
        setTimeout(() => {
            bubble.classList.remove('user-message-highlight');
        }, 1600);

        this.highlightActiveQuestionIndicator(targetId);
    },

    highlightActiveQuestionIndicator(forcedTargetId = null) {
        const navContainer = document.getElementById('questions-nav-container');
        if (!navContainer || navContainer.classList.contains('hidden')) return;

        const container = document.getElementById('messages-container');
        const streamContainer = document.getElementById('chat-stream');
        if (!container || !streamContainer) return;

        const userMsgs = Array.from(streamContainer.querySelectorAll('.user-message-node'));
        if (userMsgs.length === 0) return;

        let activeMsgId = forcedTargetId;
        if (!activeMsgId) {
            // Check if user has scrolled near or at the bottom of the container
            const isAtBottom = (container.scrollTop + container.clientHeight >= container.scrollHeight - 60);
            if (isAtBottom) {
                activeMsgId = userMsgs[userMsgs.length - 1].id;
            } else {
                const containerRect = container.getBoundingClientRect();
                // A comfortable reading viewport line: 35% from the container top
                const referenceY = containerRect.top + (containerRect.height * 0.35);

                // Find the latest user message whose top is at or above referenceY
                activeMsgId = userMsgs[0].id;
                for (let i = 0; i < userMsgs.length; i++) {
                    const el = userMsgs[i];
                    const rect = el.getBoundingClientRect();
                    if (rect.top <= referenceY) {
                        activeMsgId = el.id;
                    } else {
                        break;
                    }
                }
            }
        }

        const navItems = navContainer.querySelectorAll('.question-nav-item');
        navItems.forEach(item => {
            if (item.getAttribute('data-target-id') === activeMsgId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }
};

function bool(val) {
    return !!val;
}

window.Chat = Chat;
