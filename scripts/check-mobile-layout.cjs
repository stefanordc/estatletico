'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || path.join(process.env.TEMP, 'estatletico-browser-tools/node_modules/playwright-core'));
(async () => {
    const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    try {
        const html = fs.readFileSync('index.html', 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '');
        for (const width of [360, 390, 768, 1440]) {
            const page = await browser.newPage({ viewport: { width, height: 900 } });
            await page.route('https://**', route => route.abort());
            await page.setContent(html);
            await page.addStyleTag({ content: fs.readFileSync('style.css', 'utf8') });
            await page.evaluate(() => {
                document.body.className = 'app-ready role-admin';
                document.querySelectorAll('#auth-screen, #global-loader, #initial-loader, .loader-overlay, .loading-overlay').forEach(item => item.style.display = 'none');
            });
            for (const section of ['dashboard','cartoes','configuracoes','comparativo','arbitragem','jogos','estatisticas']) {
                const result = await page.evaluate(id => {
                    document.querySelectorAll('.page-section').forEach(item => item.classList.add('hidden'));
                    const current = document.getElementById(`${id}-section`);
                    current.classList.remove('hidden');
                    const rect = current.getBoundingClientRect();
                    return { page: id, viewport: innerWidth, sectionWidth: Math.round(rect.width), sectionRight: Math.round(rect.right), documentWidth: document.documentElement.scrollWidth,
                        overflow: Array.from(current.querySelectorAll('*')).filter(item => {
                            if (item.closest('.table-responsive, .table-wrapper, .table-container, .stats-section, .tabs-container')) return false;
                            const r = item.getBoundingClientRect();
                            return r.width && r.right > innerWidth + 2;
                        }).slice(0, 5).map(item => item.id || item.className || item.tagName) };
                }, section);
                console.log(JSON.stringify({ width, ...result }));
                if (width === 390 && section === 'dashboard') await page.screenshot({ path: path.join(process.env.TEMP, 'estatletico-mobile-dashboard.png'), fullPage: true });
                if (result.documentWidth > width + 2 || result.sectionRight > width + 2 || (width <= 768 && result.sectionWidth < width * .85) || result.overflow.length) process.exitCode = 1;
            }
            await page.close();
        }
    } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
