// Supabase Initialization
const supabaseUrl = 'https://nmcscyqyodxajlhuxckm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tY3NjeXF5b2R4YWpsaHV4Y2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODkzMDcsImV4cCI6MjA5MTI2NTMwN30.-idljlDFGF57K75NG2JRXbywQE09tSn-E95dgaG6TeQ';
let supabaseClient = null;

// Foto placeholders
const DEFAULT_PLAYER_PHOTO = 'https://via.placeholder.com/150';
const DEFAULT_REF_PHOTO = 'https://via.placeholder.com/150';
const DEFAULT_CLUB_PHOTO = 'https://via.placeholder.com/100';

const normalizeString = (str) => {
    if (!str) return '';
    return str.toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
};

const parseCurrency = (val) => {
    if (val === undefined || val === null || val === 'N/I' || val === '') return 0;
    if (typeof val === 'number') return val;
    
    // Remove R$, %, espaços e pontos de milhar, mantendo apenas a vírgula para decimal
    let clean = String(val).replace('R$', '').replace('%', '').replace(/\s/g, '');
    
    // Se tem vírgula e ponto, o ponto é milhar e a vírgula é decimal (Padrão BR: 1.234,56)
    if (clean.includes(',') && clean.includes('.')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
    } 
    // Se só tem vírgula, é decimal (1234,56)
    else if (clean.includes(',')) {
        clean = clean.replace(',', '.');
    }
    // Se só tem ponto e parece formato americano ou apenas milhar mal formatado
    // Como o sistema é brasileiro, tratamos pontos isolados como decimais se houver apenas 2 casas após, 
    // ou milhar se for algo como 1.000. Mas o mais seguro é parseFloat direto se não houver vírgula.
    
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
};

// Previne alteração de inputs do tipo número ao rolar o mouse (scroll) de forma global
document.addEventListener('wheel', function(event) {
    if (event.target.tagName === 'INPUT' && event.target.type === 'number') {
        if (document.activeElement === event.target) {
            event.preventDefault();
        }
    }
}, { passive: false });

// State Management
const state = {
    adversarios: [],
    estadios: [],
    competicoes: [],
    arbitros: [],
    jogadores: [],
    jogos: [],
    
    // Fixed Configurations
    fixedSeason: localStorage.getItem('fixedSeason')?.replace(/"/g, '') || '',
    isSeasonFixed: localStorage.getItem('isSeasonFixed') === 'true' || false,
    fixedCampeonato: localStorage.getItem('fixedCampeonato')?.replace(/"/g, '') || '',
    isCampeonatoFixed: localStorage.getItem('isCampeonatoFixed') === 'true' || false,
    fixedTecnicoAtle: localStorage.getItem('fixedTecnicoAtle')?.replace(/"/g, '') || 'Jorge Sampaoli',
    isTecnicoFixed: localStorage.getItem('isTecnicoFixed') === 'true' || false,

    currentTab: 'adversarios',
    editingId: null,      // For Cadastros
    editingJogoId: null,  // For Jogos
    currentPage: 1,
    rowsPerPage: 50,
    sortConfig: { column: null, direction: 'asc', tableId: null },
    arbTab: 'arbitro',
    advTab: 'clubes',
    statsTab: 'coletivas', // Nova aba padrão para Estatísticas
    advClubePage: 1,
    advTecPage: 1,
    atleTecPage: 1, // Página para a nova aba de técnicos do Atlético
    jogadoresCurrentPos: 'Geral',
    jogadoresCurrentPage: 1,
    jogadoresFilterDe: '',
    jogadoresFilterAte: '',
    jogadoresFilterNome: '',
    isUpdating: false, // Flag para evitar loops de renderização
    
    // Novo estado para filtros multi-seleção
    statsMultiFilters: {
        coletivas: [],
        porFase: [],
        individuais: [],
        tecnicos: []
    },
    isFormActive: false // Flag de segurança para bloquear exclusões durante edição
};

// Cache para estatísticas pesadas para evitar travamentos
const statsCache = {
    atleticoTecnicos: null,
    coletivas: {},
    artilheiros: null,
    cartoes: null,
    lastUpdate: 0
};

const invalidateCache = () => {
    statsCache.atleticoTecnicos = null;
    statsCache.coletivas = {};
    statsCache.artilheiros = null;
    statsCache.cartoes = null;
    statsCache.lastUpdate = Date.now();
};

const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
};

const showToast = (message, type = 'error') => {
    const existing = document.getElementById('app-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.style.cssText = `
        position: fixed; bottom: 2rem; right: 2rem; z-index: 99999;
        padding: 1rem 1.5rem; border-radius: 10px; max-width: 380px;
        font-size: 0.88rem; font-weight: 500; box-shadow: 0 8px 25px rgba(0,0,0,0.15);
        background: ${type === 'error' ? '#e74c3c' : '#2ecc71'};
        color: white; animation: slideInRight 0.3s ease;
        display: flex; align-items: flex-start; gap: 0.8rem;
    `;
    toast.innerHTML = `<i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'check-circle'}"></i><span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
};

const saveData = async (key, data) => {
    try {
        if (!supabaseClient) return;
        if (['adversarios', 'estadios', 'competicoes', 'arbitros', 'jogadores', 'jogos'].includes(key)) {
            const { error } = await supabaseClient.from(key).upsert(data);
            if (error) {
                console.error('Supabase Error:', error);
                showToast(`Erro ao salvar (${key}): ${error.message || JSON.stringify(error)}`);
            } else {
                invalidateCache(); // Invalida o cache ao salvar no banco
            }
        } else {
            localStorage.setItem(key, typeof data === 'string' ? data : JSON.stringify(data));
        }
    } catch (e) {
        console.error('Network/Internal Error:', e);
        showToast('Erro de conexão com o banco de dados.');
    }
};



// SVG Icons
const WHISTLE_SVG = `<svg class="whistle-icon" viewBox="0 0 512 512"><path d="M432 128H288v48h144a16 16 0 0 1 16 16v32a16 16 0 0 1-16 16h-48v48h48a64 64 0 0 0 64-64v-32a64 64 0 0 0-64-64zM240 128H64a64 64 0 0 0-64 64v128a64 64 0 0 0 64 64h176v-48h-16v-48h16v-48h-16v-48h16V128zM96 240a16 16 0 1 1 16-16 16 16 0 0 1-16 16z"/></svg>`;

// Helpers
const compressImage = (base64Str, maxWidth = 400, quality = 0.7) => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            if (width > maxWidth) {
                height *= maxWidth / width;
                width = maxWidth;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
    });
};

const calculateAge = (birthDate, targetDateStr = new Date().toISOString().split('T')[0]) => {
    if (!birthDate || birthDate === 'N/I') return 'N/I';
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return 'N/I';
    const target = new Date(targetDateStr);
    let age = target.getFullYear() - birth.getFullYear();
    const m = target.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && target.getDate() < birth.getDate())) {
        age--;
    }
    return isNaN(age) ? 'N/I' : age;
};

const calculateAgeAtEndOfYear = (birthDate, year) => {
    if (!birthDate) return 'N/I';
    if(isNaN(year)) return 'N/I';
    const birth = new Date(birthDate);
    return year - birth.getFullYear();
};

const convertMatchTime = (inputVal) => {
    let m = parseInt(inputVal);
    if (isNaN(m)) return { min: '', tempo: 1 };
    if (m > 45) {
        return { min: m - 45, tempo: 2 };
    }
    return { min: m, tempo: 1 };
};

const formatCurrency = (val) => {
    if (val === 'N/I' || val === null || val === undefined) return 'N/I';
    const num = parseFloat(val);
    if (isNaN(num)) return 'N/I';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
};

const formatPublico = (val) => {
    if (val === 'N/I' || val === null || val === undefined || val === '') return 'N/I';
    let num;
    if (typeof val === 'number') {
        num = Math.floor(val);
    } else {
        const clean = String(val).replace(/\./g, '').replace(',', '.').replace(/[^\d]/g, '');
        num = parseInt(clean) || 0;
    }
    return num.toLocaleString('pt-BR');
};

const formatRenda = (val) => {
    if (val === 'N/I' || val === null || val === undefined || val === '') return 'N/I';
    const num = parseCurrency(val);
    if (isNaN(num)) return 'N/I';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const renderTableLegend = (siglas = []) => {
    const definitions = {
        'J': 'Jogos',
        'V': 'Vitórias',
        'E': 'Empates',
        'D': 'Derrotas',
        'GM': 'Gols Marcados',
        'GS': 'Gols Sofridos',
        'CS': 'Clean Sheets (Jogos sem sofrer gols)',
        'CG': 'Clean Goals (Jogos sem marcar gols)',
        'CA': 'Cartão Amarelo',
        'CV': 'Cartão Vermelho',
        'Aprov': 'Aproveitamento',
        'MGm': 'Média de Gols Marcados',
        'MGs': 'Média de Gols Sofridos',
        'SG': 'Saldo de Gols',
        'Pts': 'Pontos',
        'GP': 'Gols Pró',
        'GC': 'Gols Contra',
        'CA(G)': 'Amarelos Galo',
        'CV(G)': 'Vermelhos Galo',
        'CA(A)': 'Amarelos Adv',
        'CV(A)': 'Vermelhos Adv'
    };

    const items = siglas.map(s => {
        const def = definitions[s];
        return def ? `<div class="legend-item"><b>${s}:</b> ${def}</div>` : '';
    }).filter(Boolean).join('');

    return items ? `<div class="table-legend">${items}</div>` : '';
};

// --- Multi-Select Logic ---
window._msCallbacks = window._msCallbacks || {};
window._msInitialized = window._msInitialized || {};

const initMultiSelect = (containerId, options, tabKey, callback) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Registra o callback
    if (callback) {
        window._msCallbacks[containerId] = callback;
    }

    // Inicializa o estado se vazio (Todos marcados por padrão), MAS SÓ UMA VEZ!
    if (!window._msInitialized[tabKey]) {
        if (!state.statsMultiFilters[tabKey] || state.statsMultiFilters[tabKey].length === 0) {
            state.statsMultiFilters[tabKey] = ['Todos', ...options];
        }
        window._msInitialized[tabKey] = true;
    }

    // Só re-renderiza o DOM inteiro caso as opções disponíveis tenham mudado (ex: mudança de ano)
    const newOptionsStr = JSON.stringify(options);
    if (container.dataset.renderedOptions === newOptionsStr && container.querySelector('.multi-select-dropdown')) {
        if (window.updateMultiSelectUI) window.updateMultiSelectUI(containerId, tabKey);
    } else {
        container.dataset.renderedOptions = newOptionsStr;
        renderMultiSelect(containerId, options, tabKey);
    }
    
    // Fechar dropdown ao clicar fora
    const clickHandler = (e) => {
        if (!container.contains(e.target)) {
            container.classList.remove('open');
        }
    };
    
    // Remove listener antigo se existir para evitar duplicatas
    document.removeEventListener('click', container._msClickHandler);
    container._msClickHandler = clickHandler;
    document.addEventListener('click', clickHandler);
};

const renderMultiSelect = (containerId, options, tabKey) => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const selected = state.statsMultiFilters[tabKey] || [];
    const isAllSelected = selected.includes('Todos');
    
    let summaryText = "";
    if (isAllSelected) {
        summaryText = "Todos selecionados";
    } else if (selected.length === 0) {
        summaryText = "Nenhum selecionado";
    } else {
        summaryText = selected.length === 1 ? selected[0] : `${selected.length} selecionados`;
    }

    const safeOptions = JSON.stringify(options).replace(/"/g, '&quot;');

    container.innerHTML = `
        <div class="multi-select-trigger" onclick="this.parentElement.classList.toggle('open')">
            <span class="multi-select-summary">${summaryText}</span>
            <i class="fas fa-chevron-down"></i>
        </div>
        <div class="multi-select-dropdown">
            ${options.length > 5 ? `
            <div style="padding: 0.5rem; position: sticky; top: 0; background: var(--surface-color); z-index: 2; border-bottom: 1px solid var(--border-color);">
                <input type="text" placeholder="Buscar..." class="ms-search-input" onkeyup="filterMultiSelect(this)" onclick="event.stopPropagation()" style="width: 100%; border-radius: 4px; border: 1px solid var(--border-color); padding: 0.3rem 0.5rem; background: var(--bg-color); color: var(--text-main);">
            </div>
            ` : ''}
            <div class="multi-select-option all-option" onclick="event.stopPropagation(); toggleMultiSelectAll('${tabKey}', '${containerId}', ${safeOptions})">
                <input type="checkbox" ${isAllSelected ? 'checked' : ''} onclick="event.preventDefault()">
                <span>Todos</span>
            </div>
            ${options.map(opt => `
                <div class="multi-select-option" onclick="event.stopPropagation(); toggleMultiSelectOption('${tabKey}', '${opt.replace(/'/g, "\\'")}', '${containerId}', ${safeOptions})">
                    <input type="checkbox" ${selected.includes(opt) ? 'checked' : ''} onclick="event.preventDefault()">
                    <span>${opt}</span>
                </div>
            `).join('')}
        </div>
    `;
};

window.filterMultiSelect = (inputEl) => {
    const term = inputEl.value.toLowerCase();
    const dropdown = inputEl.closest('.multi-select-dropdown');
    const options = dropdown.querySelectorAll('.multi-select-option:not(.all-option)');
    options.forEach(opt => {
        const text = opt.innerText.toLowerCase();
        opt.style.display = text.includes(term) ? 'flex' : 'none';
    });
};

window.updateMultiSelectUI = (containerId, tabKey) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const selected = state.statsMultiFilters[tabKey] || [];
    const isAllSelected = selected.includes('Todos');
    
    let summaryText = "";
    if (isAllSelected) {
        summaryText = "Todos selecionados";
    } else if (selected.length === 0) {
        summaryText = "Nenhum selecionado";
    } else {
        summaryText = selected.length === 1 ? selected[0] : `${selected.length} selecionados`;
    }
    
    const summarySpan = container.querySelector('.multi-select-summary');
    if (summarySpan) summarySpan.textContent = summaryText;
    
    const allCheckbox = container.querySelector('.all-option input[type="checkbox"]');
    if (allCheckbox) allCheckbox.checked = isAllSelected;
    
    const optionDivs = container.querySelectorAll('.multi-select-option:not(.all-option)');
    optionDivs.forEach(div => {
        const span = div.querySelector('span');
        const checkbox = div.querySelector('input[type="checkbox"]');
        if (span && checkbox) {
            checkbox.checked = selected.includes(span.textContent);
        }
    });
};

window.toggleMultiSelectAll = (tabKey, containerId, allOptions) => {
    const current = state.statsMultiFilters[tabKey] || [];
    if (current.includes('Todos')) {
        state.statsMultiFilters[tabKey] = [];
    } else {
        state.statsMultiFilters[tabKey] = ['Todos', ...allOptions];
    }
    window.updateMultiSelectUI(containerId, tabKey);
    const cb = window._msCallbacks[containerId];
    if (cb) cb();
};

window.toggleMultiSelectOption = (tabKey, option, containerId, allOptions) => {
    let current = state.statsMultiFilters[tabKey] || [];
    
    if (current.includes('Todos')) {
        // Se tinha 'Todos', significa que todos estavam selecionados,
        // então agora teremos todos EXCETO o que a pessoa acabou de clicar para desmarcar.
        current = allOptions.filter(item => item !== option);
    } else {
        if (current.includes(option)) {
            current = current.filter(item => item !== option);
        } else {
            current.push(option);
        }
    }

    if (allOptions.length > 0 && allOptions.every(opt => current.includes(opt))) {
        current = ['Todos', ...allOptions];
    }

    state.statsMultiFilters[tabKey] = current;
    window.updateMultiSelectUI(containerId, tabKey);
    const cb = window._msCallbacks[containerId];
    if (cb) cb();
};


// UI Elements
const tabContent = document.getElementById('tab-content');
const tabButtons = document.querySelectorAll('.tab-btn');
const modalContainer = document.getElementById('modal-container');
const novoJogoContainer = document.getElementById('novo-jogo-container');

// Navigation
const showSection = (sectionId, skipHashUpdate = false) => {
    document.querySelectorAll('.page-section').forEach(s => s.classList.add('hidden'));
    const section = document.getElementById(`${sectionId}-section`);
    if (section) section.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(i => {
        i.classList.toggle('active', i.dataset.page === sectionId);
    });

    if (!skipHashUpdate) {
        const newHash = '#' + sectionId;
        if (window.location.hash !== newHash) history.replaceState(null, '', newHash);
    }

    // Close mobile menu on navigation
    if (window.innerWidth <= 1024) {
        document.querySelector('.sidebar')?.classList.remove('active');
        document.getElementById('sidebar-overlay')?.classList.remove('active');
    }

    if (sectionId === 'jogos') renderJogos();
    if (sectionId === 'dashboard') renderDashboard();
    if (sectionId === 'arbitragem') renderArbitragem();
    if (sectionId === 'equipe-arbitragem') renderEquipeArbitragem();
    if (sectionId === 'artilheiros') renderArtilheiros();
    if (sectionId === 'cartoes') renderCartoes();
    if (sectionId === 'adversarios') {
        // Garante que a aba correta fique visível ao navegar para Adversários
        window.changeAdvTab(state.advTab || 'clubes');
    }
    if (sectionId === 'estatisticas') {
        const firstTab = document.querySelector('#estatisticas-section .tabs-container .tab-btn');
        if (firstTab && !firstTab.classList.contains('active')) firstTab.click();
        else renderEstatisticas();
    }
    if (sectionId === 'publico-renda') {
        const firstTab = document.querySelector('#publico-renda-section .tabs-container .tab-btn');
        if (firstTab && !firstTab.classList.contains('active')) firstTab.click();
        else renderPublicoRenda();
    }
    if (sectionId === 'comparativo') renderComparativo();
    if (sectionId === 'jogadores-page') renderJogadoresPage();
    if (sectionId === 'curiosidades') renderCuriosidades();
};

// RENDERING CADASTROS
const renderTab = (tabName) => {
    state.currentTab = tabName;
    tabContent.innerHTML = '';
    // Update URL hash to reflect tab
    const newHash = '#cadastros/' + tabName;
    if (window.location.hash !== newHash) history.replaceState(null, '', newHash);
    switch(tabName) {
        case 'adversarios': renderAdversarios(); break;
        case 'estadios': renderEstadios(); break;
        case 'competicoes': renderCompeticoes(); break;
        case 'arbitros': renderArbitros(); break;
        case 'jogadores': renderJogadores(); break;
    }
};

const renderAdversarios = () => {
    tabContent.innerHTML = `
        <div class="card">
            <div class="card-title"><i class="fas fa-plus"></i> ${state.editingId ? 'Editar' : 'Cadastrar Novo'} Adversário</div>
            <form id="form-adversarios">
                <div class="form-grid">
                    <div class="form-group"><label>Clube *</label><input type="text" name="clube" required></div>
                    <div class="form-group"><label>Estado *</label><input type="text" name="estado" required></div>
                    <div class="form-group"><label>País *</label><input type="text" name="pais" value="Brasil" required></div>
                </div>
                <div class="form-group" style="margin-bottom: 1.5rem;"><label>Escudo (URL)</label><input type="text" name="escudo"></div>
                <button type="submit" class="btn-primary">${state.editingId ? 'Atualizar' : 'Cadastrar'}</button>
            </form>
        </div>
        <div class="list-container">
            <div class="list-header"><h3>Adversários (${state.adversarios.length})</h3><div class="search-container"><i class="fas fa-search"></i><input type="text" id="search-input" placeholder="Buscar..."></div></div>
            <table class="data-table"><thead><tr><th>Escudo</th><th>Clube</th><th>Estado</th><th>País</th><th>Ações</th></tr></thead>
            <tbody id="table-body-adversarios">${renderTableRows('adversarios')}</tbody></table>
        </div>
    `;
    document.getElementById('form-adversarios').addEventListener('submit', (e) => {
        e.preventDefault(); const fd = new FormData(e.target);
        const clubeNome = fd.get('clube');
        const isDuplicate = state.adversarios.some(a => a.clube.toLowerCase() === clubeNome.toLowerCase() && a.id !== state.editingId);
        if (isDuplicate) {
            showToast('Já existe um clube cadastrado com este nome.', 'error');
            return;
        }

        const item = { id: state.editingId || Date.now(), clube: clubeNome, estado: fd.get('estado'), pais: fd.get('pais'), escudo: fd.get('escudo') || 'https://via.placeholder.com/32' };
        if (state.editingId) { state.adversarios[state.adversarios.findIndex(i => i.id === state.editingId)] = item; state.editingId = null; }
        else state.adversarios.push(item);
        saveData('adversarios', [item]); renderTab('adversarios');
    });
    handleSearch('adversarios');
};

const renderEstadios = () => {
    const opts = state.adversarios.map(adv => `<option value="${adv.clube}">${adv.clube}</option>`).join('');
    tabContent.innerHTML = `
        <div class="card">
            <div class="card-title"><i class="fas fa-plus"></i> ${state.editingId ? 'Editar' : 'Cadastrar Novo'} Estádio</div>
            <form id="form-estadios">
                <div class="form-grid">
                    <div class="form-group"><label>Nome *</label><input type="text" name="nome" required></div>
                    <div class="form-group"><label>Estado *</label><input type="text" name="estado" required></div>
                    <div class="form-group"><label>País *</label><input type="text" name="pais" value="Brasil" required></div>
                </div>
                <div class="form-grid">
                    <div class="form-group"><label>Mandante</label><div class="autocomplete-container"><input type="text" name="mandante" id="estadio-mandante" placeholder="Digite o mandante..." value="${state.editingId ? state.estadios.find(i => i.id === state.editingId).mandante : ''}"></div></div>
                    <div class="form-group"><label>Foto (Cole)</label><div class="paste-area" id="paste-area-estadio">Ctrl+V aqui</div><input type="hidden" name="foto" id="foto-input"></div>
                </div>
                <button type="submit" class="btn-primary">${state.editingId ? 'Atualizar' : 'Cadastrar'}</button>
            </form>
        </div>
        <div class="list-container">
            <div class="list-header"><h3>Estádios (${state.estadios.length})</h3><div class="search-container"><i class="fas fa-search"></i><input type="text" id="search-input" placeholder="Buscar..."></div></div>
            <table class="data-table"><thead><tr><th>Foto</th><th>Nome</th><th>Estado</th><th>Mandante</th><th>Ações</th></tr></thead>
            <tbody id="table-body-estadios">${renderTableRows('estadios')}</tbody></table>
        </div>
    `;
    setupPasteHandler('paste-area-estadio', 'foto-input');
    setupAutocomplete('estadio-mandante', 'adversarios', 'clube');
    document.getElementById('form-estadios').addEventListener('submit', (e) => {
        e.preventDefault(); const fd = new FormData(e.target);
        const item = { id: state.editingId || Date.now(), nome: fd.get('nome'), estado: fd.get('estado'), pais: fd.get('pais'), mandante: fd.get('mandante'), foto: fd.get('foto') || 'https://via.placeholder.com/40' };
        if (state.editingId) { state.estadios[state.estadios.findIndex(i => i.id === state.editingId)] = item; state.editingId = null; }
        else state.estadios.push(item);
        saveData('estadios', [item]); renderTab('estadios');
    });
    handleSearch('estadios');
};

const renderCompeticoes = () => {
    tabContent.innerHTML = `
        <div class="card">
            <div class="card-title"><i class="fas fa-plus"></i> ${state.editingId ? 'Editar' : 'Cadastrar'} Competição</div>
            <form id="form-competicoes">
                <div class="form-grid">
                    <div class="form-group"><label>Campeonato *</label><input type="text" name="campeonato" required></div>
                    <div class="form-group"><label>Tipo *</label><select name="tipo" required><option value="">Selecione</option><option value="Regional">Regional</option><option value="Nacional">Nacional</option><option value="Internacional">Internacional</option></select></div>
                </div>
                <button type="submit" class="btn-primary">${state.editingId ? 'Atualizar' : 'Cadastrar'}</button>
            </form>
        </div>
        <div class="list-container">
            <div class="list-header"><h3>Competições (${state.competicoes.length})</h3><div class="search-container"><i class="fas fa-search"></i><input type="text" id="search-input" placeholder="Buscar..."></div></div>
            <table class="data-table"><thead><tr><th>Campeonato</th><th>Tipo</th><th>Ações</th></tr></thead><tbody id="table-body-competicoes">${renderTableRows('competicoes')}</tbody></table>
        </div>
    `;
    document.getElementById('form-competicoes').addEventListener('submit', (e) => {
        e.preventDefault(); const fd = new FormData(e.target);
        const item = { id: state.editingId || Date.now(), campeonato: fd.get('campeonato'), tipo: fd.get('tipo') };
        if (state.editingId) { state.competicoes[state.competicoes.findIndex(i => i.id === state.editingId)] = item; state.editingId = null; }
        else state.competicoes.push(item);
        saveData('competicoes', [item]); renderTab('competicoes');
    });
    handleSearch('competicoes');
};

const renderArbitros = () => {
    tabContent.innerHTML = `
        <div class="card">
            <div class="card-title">${WHISTLE_SVG} ${state.editingId ? 'Editar' : 'Cadastrar'} Árbitro</div>
            <form id="form-arbitros">
                <div class="form-grid">
                    <div class="form-group"><label>Nome *</label><input type="text" name="nome" required></div>
                    <div class="form-group"><label>País *</label><input type="text" name="federacao" value="Brasil" required></div>
                </div>
                <div class="form-group" style="margin-bottom:1.5rem;"><label>Foto (Cole)</label><div class="paste-area" id="paste-area-arbitro">Ctrl+V</div><input type="hidden" name="foto" id="foto-input-arbitro"></div>
                <button type="submit" class="btn-primary">${state.editingId ? 'Atualizar' : 'Cadastrar'}</button>
            </form>
        </div>
        <div class="list-container">
            <div class="list-header"><h3>Árbitros (${state.arbitros.length})</h3><div class="search-container"><i class="fas fa-search"></i><input type="text" id="search-input" placeholder="Buscar..."></div></div>
            <table class="data-table"><thead><tr><th>Foto</th><th>Nome</th><th>País</th><th>Ações</th></tr></thead><tbody id="table-body-arbitros">${renderTableRows('arbitros')}</tbody></table>
        </div>
    `;
    setupPasteHandler('paste-area-arbitro', 'foto-input-arbitro');
    document.getElementById('form-arbitros').addEventListener('submit', (e) => {
        e.preventDefault(); const fd = new FormData(e.target);
        const novoNome = fd.get('nome');
        
        const isDuplicate = state.arbitros.some(a => 
            a.nome.toLowerCase() === novoNome.toLowerCase() && 
            a.id !== state.editingId
        );

        if (isDuplicate) {
            showToast('Já existe um árbitro cadastrado com este mesmo nome e data de nascimento.', 'error');
            return;
        }

        const item = { id: state.editingId || Date.now(), nome: novoNome, federacao: fd.get('federacao'), foto: fd.get('foto') || 'https://via.placeholder.com/40' };
        if (state.editingId) { state.arbitros[state.arbitros.findIndex(i => i.id === state.editingId)] = item; state.editingId = null; }
        else state.arbitros.push(item);
        saveData('arbitros', [item]); renderTab('arbitros');
    });
    handleSearch('arbitros');
};

const renderJogadores = () => {
    tabContent.innerHTML = `
        <div class="card">
            <div class="card-title"><i class="fas fa-plus"></i> ${state.editingId ? 'Editar' : 'Cadastrar'} Jogador</div>
            <form id="form-jogadores">
                <div class="form-grid">
                    <div class="form-group"><label>Temporada *</label><div style="display:flex;gap:0.5rem;"><input type="text" name="temporada" id="input-temporada" value="${state.fixedSeason}" required><label style="font-size:0.7rem;"><input type="checkbox" id="fix-season" ${state.isSeasonFixed ? 'checked' : ''}> Fixar</label></div></div>
                    <div class="form-group"><label>Nome completo *</label><input type="text" name="nome_completo" id="input-nome-completo" required></div>
                    <div class="form-group"><label>Nome de guerra *</label><input type="text" name="nome_guerra" id="input-nome-guerra" required></div>
                </div>
                <div class="form-grid">
                    <div class="form-group"><label>Posição *</label><select name="posicao" id="input-posicao" required><option value="">Selecione</option><option value="Goleiro">Goleiro</option><option value="Lateral-Direito">Lateral-Direito</option><option value="Lateral-Esquerdo">Lateral-Esquerdo</option><option value="Zagueiro">Zagueiro</option><option value="Volante">Volante</option><option value="Meia">Meia</option><option value="Atacante">Atacante</option><option value="Técnico">Técnico</option></select></div>
                    <div class="form-group"><label>Nacionalidade *</label><input type="text" name="nacionalidade" id="input-nacionalidade" value="Brasil" required></div>
                    <div class="form-group"><label>Data de nascimento</label><input type="date" name="nascimento" id="input-nascimento"></div>
                </div>
                <div class="form-grid"><div class="form-group"><label>Número</label><input type="number" name="numero" id="input-numero"></div><div class="form-group"><label>Foto (Cole)</label><div class="paste-area" id="paste-area-jogador">Ctrl+V</div><input type="hidden" name="foto" id="foto-input-jogador"></div></div>
                <div class="form-group"><label>Observação</label><textarea name="observacao" id="input-observacao" rows="2"></textarea></div>
                <div class="form-group"><label class="checkbox-inline"><input type="checkbox" name="foraDoElenco" id="input-fora-do-elenco"> Fora do elenco atual</label></div>
                <button type="submit" class="btn-primary">${state.editingId ? 'Atualizar' : 'Cadastrar'}</button>
            </form>
        </div>
        <div class="list-container">
            <div class="list-header"><h3>Jogadores (${state.jogadores.length})</h3><div class="search-container"><i class="fas fa-search"></i><input type="text" id="search-input" placeholder="Buscar..."></div></div>
            <table class="data-table"><thead><tr><th>Foto</th><th>Nome</th><th>Posição</th><th>Temporada</th><th>Idade</th><th>Ações</th></tr></thead><tbody id="table-body-jogadores">${renderTableRows('jogadores')}</tbody></table>
        </div>
    `;
    setupPasteHandler('paste-area-jogador', 'foto-input-jogador');
    setupAutofillHandler();
    document.getElementById('fix-season').addEventListener('change', (e) => { state.isSeasonFixed = e.target.checked; state.fixedSeason = document.getElementById('input-temporada').value; localStorage.setItem('isSeasonFixed', state.isSeasonFixed); localStorage.setItem('fixedSeason', state.fixedSeason); });
    document.getElementById('form-jogadores').addEventListener('submit', (e) => {
        e.preventDefault(); const fd = new FormData(e.target);
        if (state.isSeasonFixed) { state.fixedSeason = fd.get('temporada'); localStorage.setItem('fixedSeason', state.fixedSeason); }

        const novaTemporada = fd.get('temporada');
        const novoNomeCompleto = fd.get('nome_completo');
        const novoNascimento = fd.get('nascimento');

        const isDuplicate = state.jogadores.some(j => 
            j.temporada === novaTemporada &&
            j.nome_completo.toLowerCase() === novoNomeCompleto.toLowerCase() &&
            j.nascimento === novoNascimento &&
            j.id !== state.editingId
        );

        if (isDuplicate) {
            showToast('Já existe um jogador cadastrado com este mesmo nome e data de nascimento nesta temporada.', 'error');
            return;
        }

        const item = { id: state.editingId || Date.now(), temporada: novaTemporada, nome_completo: novoNomeCompleto, nome_guerra: fd.get('nome_guerra'), posicao: fd.get('posicao'), nacionalidade: fd.get('nacionalidade'), nascimento: novoNascimento, numero: fd.get('numero'), foto: fd.get('foto') || 'https://via.placeholder.com/40', observacao: fd.get('observacao'), foraDoElenco: document.getElementById('input-fora-do-elenco').checked };
        if (state.editingId) { state.jogadores[state.jogadores.findIndex(i => i.id === state.editingId)] = item; state.editingId = null; }
        else state.jogadores.push(item);

        saveData('jogadores', [item]); renderTab('jogadores');
    });
    handleSearch('jogadores');
};

const renderTableRows = (tab, filter = '') => {
    let dataset = [...state[tab]];
    // Sort alphabetically by primary display field
    dataset.sort((a,b) => {
        const valA = (a.nome_guerra || a.nome || a.clube || a.campeonato || '').toLowerCase();
        const valB = (b.nome_guerra || b.nome || b.clube || b.campeonato || '').toLowerCase();
        return valA.localeCompare(valB);
    });

    const filtered = dataset.filter(item => Object.values(item).join(' ').toLowerCase().includes(filter.toLowerCase()));
    if (filtered.length === 0) return '<tr><td colspan="10" style="text-align:center;">Nenhum registro</td></tr>';
    return filtered.map(item => {
        let cells = '';
        if (tab === 'adversarios') cells = `<td><img src="${item.escudo}" class="shield-img"></td><td>${item.clube}</td><td>${item.estado}</td><td>${item.pais}</td>`;
        if (tab === 'estadios') cells = `<td><img src="${item.foto}" class="photo-preview"></td><td>${item.nome}</td><td>${item.estado}</td><td>${item.mandante || '-'}</td>`;
        if (tab === 'competicoes') cells = `<td>${item.campeonato}</td><td>${item.tipo}</td>`;
        if (tab === 'arbitros') cells = `<td><img src="${item.foto}" class="photo-preview"></td><td>${item.nome}</td><td>${item.federacao}</td>`;
        if (tab === 'jogadores') {
            const ageYear = parseInt(item.temporada) || new Date().getFullYear();
            cells = `<td><img src="${item.foto}" class="photo-preview"></td><td>${item.nome_guerra}</td><td>${item.posicao}</td><td>${item.temporada}</td><td>${calculateAgeAtEndOfYear(item.nascimento, ageYear)}</td>`;
        }
        return `<tr>${cells}<td class="actions"><button class="action-btn" onclick="prepareEdit('${tab}', ${item.id})"><i class="fas fa-edit"></i></button><button class="action-btn" onclick="deleteItem('${tab}', ${item.id})"><i class="fas fa-trash-alt delete"></i></button></td></tr>`;
    }).join('');
};

// ELENCO FUNCTIONS
const renderElenco = () => {
    const grid = document.getElementById('elenco-grid-container');
    const playerDetail = document.getElementById('player-detail-container');
    playerDetail.classList.add('hidden');
    grid.classList.remove('hidden');

    const fTemp = document.getElementById('elenco-filter-temporada').value;
    const fNome = document.getElementById('elenco-filter-nome').value;
    const fPos = document.getElementById('elenco-filter-posicao').value;
    const fNac = document.getElementById('elenco-filter-nacionalidade').value;
    const fStatus = document.getElementById('elenco-filter-status').value;
    const fMin = document.getElementById('elenco-filter-idade-min').value;
    const fMax = document.getElementById('elenco-filter-idade-max').value;

    const posOrder = ["Goleiro", "Lateral-Direito", "Lateral-Esquerdo", "Zagueiro", "Volante", "Meia", "Atacante", "Técnico"];

    let filtered = state.jogadores.filter(j => {
        const age = calculateAgeAtEndOfYear(j.nascimento, parseInt(fTemp || 2026));
        return (!fTemp || j.temporada === fTemp) &&
               (!fNome || j.nome_guerra === fNome) &&
               (!fPos || j.posicao === fPos) &&
               (!fNac || j.nacionalidade === fNac) &&
               (!fStatus || (fStatus === 'no-elenco' ? !j.foraDoElenco : j.foraDoElenco)) &&
               (!fMin || (age !== 'N/I' && age >= parseInt(fMin))) &&
               (!fMax || (age !== 'N/I' && age <= parseInt(fMax)));
    });

    // Sort by position then name
    filtered.sort((a,b) => {
        const aIdx = posOrder.indexOf(a.posicao);
        const bIdx = posOrder.indexOf(b.posicao);
        if (aIdx !== bIdx) return aIdx - bIdx;
        return a.nome_guerra.localeCompare(b.nome_guerra);
    });

    // Repopulate filters
    populateFilter('elenco-filter-temporada', [...new Set(state.jogadores.map(j => j.temporada))]);
    populateFilter('elenco-filter-nome', [...new Set(state.jogadores.map(j => j.nome_guerra))]);
    populateFilter('elenco-filter-nacionalidade', [...new Set(state.jogadores.map(j => j.nacionalidade))]);

    grid.innerHTML = filtered.length === 0 ? '<div style="grid-column:1/-1;text-align:center;padding:3rem;border-radius:8px;" class="detail-section-bg">Nenhum jogador encontrado para os filtros selecionados.</div>' : 
        filtered.map(j => {
            let photoUrl = j.foto && j.foto.trim() !== '' ? j.foto : null;
            if (!photoUrl) photoUrl = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

            return `
                <div class="player-card ${j.foraDoElenco && (!fTemp || fTemp === '2026') ? 'grayscale' : ''}" onclick="showPlayerDetail(${j.id}, event)">
                    <img src="${photoUrl}" alt="${j.nome_guerra}" onerror="this.src='https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'">
                    <h3>${j.nome_guerra}</h3>
                    <div class="pos">${j.posicao}</div>
                    <div class="meta">
                        <span>${calculateAgeAtEndOfYear(j.nascimento, parseInt(fTemp || 2026)) || 'N/I'} anos</span>
                        <span class="number-badge">#${j.numero || '-'}</span>
                    </div>
                </div>
            `;
        }).join('');
};

const showPlayerDetail = (playerId, event) => {
    const card = event.currentTarget.closest('.player-card') || event.currentTarget;
    const existing = document.getElementById(`detail-player-${playerId}`);
    document.querySelectorAll('.detail-inline-container').forEach(d => d.remove());
    if (existing) return;

    const player = state.jogadores.find(j => j.id === playerId);
    const isTecnico = player.posicao === 'Técnico';
    const isGoalie = player.posicao === 'Goleiro';

    let statsBySeasonMap = {};
    let statsByTecnico = {};

    // Processamento otimizado: Um único laço pelos jogos
    state.jogos.forEach(jogo => {
        const s = jogo.temporada;
        if (!statsBySeasonMap[s]) {
            statsBySeasonMap[s] = { season: s, gamesCount: 0, goals: 0, gs: 0, wins: 0, draws: 0, losses: 0, yellow: 0, red: 0, titularCount: 0, subOutCount: 0, enteredCount: 0, cs: 0 };
        }
        const ss = statsBySeasonMap[s];

        if (isTecnico) {
            if (jogo.tecnicoGalo === player.nome_guerra) {
                ss.gamesCount++;
                const isCasa = jogo.casa === 'Atlético' || jogo.casa === 'Atlético-MG';
                const gm = parseInt(isCasa ? jogo.golsCasa : jogo.golsFora) || 0;
                const gc = parseInt(isCasa ? jogo.golsFora : jogo.golsCasa) || 0;
                ss.goals += gm; ss.gs += gc;
                if (jogo.vencedor === 'Atlético') ss.wins++;
                else if (jogo.vencedor === 'Empate') ss.draws++;
                else ss.losses++;
            }
        } else {
            const inLineup = jogo.lineupGalo?.find(l => l.jogador === player.nome_guerra);
            if (inLineup) {
                ss.gamesCount++;
                ss.goals += parseInt(inLineup.golsCount || 0);
                ss.gs += parseInt(inLineup.gsCount || 0);
                if (inLineup.titular) ss.titularCount++;
                if (inLineup.substituido) ss.subOutCount++;
                if (!inLineup.titular) ss.enteredCount++;

                if (jogo.vencedor === 'Atlético') ss.wins++;
                else if (jogo.vencedor === 'Empate') ss.draws++;
                else ss.losses++;

                const cards = jogo.cartoesGalo?.filter(c => c.jogador === player.nome_guerra);
                cards?.forEach(c => { ss.yellow += parseInt(c.amarelo || 0); ss.red += parseInt(c.red || 0); });

                if (isGoalie) {
                    const isCasa = jogo.casa === 'Atlético' || jogo.casa === 'Atlético-MG';
                    const advG = isCasa ? parseInt(jogo.golsFora) : parseInt(jogo.golsCasa);
                    if (advG === 0) ss.cs++;
                }

                const tec = jogo.tecnicoGalo || 'Desconhecido';
                if (!statsByTecnico[tec]) statsByTecnico[tec] = { nome: tec, jogos: 0, titular: 0, subOut: 0, entered: 0, goals: 0, gs: 0 };
                const st = statsByTecnico[tec];
                st.jogos++;
                st.goals += parseInt(inLineup.golsCount || 0);
                st.gs += parseInt(inLineup.gsCount || 0);
                if (inLineup.titular) st.titular++;
                if (inLineup.substituido) st.subOut++;
                if (!inLineup.titular) st.entered++;
            }
        }
    });

    const statsBySeason = Object.values(statsBySeasonMap)
        .filter(s => s.gamesCount > 0)
        .sort((a,b) => b.season - a.season)
        .map(s => ({
            ...s,
            aprov: ((s.wins * 3 + s.draws) / (s.gamesCount * 3) * 100).toFixed(1) + '%'
        }));

    const total = statsBySeason.reduce((acc, s) => {
        acc.gamesCount += s.gamesCount; acc.goals += s.goals; acc.gs += s.gs; acc.wins += s.wins; acc.draws += s.draws; acc.losses += s.losses; acc.yellow += s.yellow; acc.red += s.red;
        acc.titularCount += s.titularCount; acc.subOutCount += s.subOutCount; acc.enteredCount += s.enteredCount;
        acc.cs += (s.cs || 0);
        return acc;
    }, { gamesCount:0, goals:0, gs:0, wins:0, draws:0, losses:0, yellow:0, red:0, titularCount: 0, subOutCount: 0, enteredCount: 0, cs: 0 });
    total.aprov = total.gamesCount > 0 ? ((total.wins * 3 + total.draws) / (total.gamesCount * 3) * 100).toFixed(1) + '%' : "0%";

    const detail = document.createElement('div');
    detail.id = `detail-player-${playerId}`;
    detail.className = 'detail-inline-container';
    detail.style.gridColumn = '1/-1';
    
    let seasonTableHeaders = isTecnico 
        ? '<th>Temporada</th><th>Jogos</th><th>Vitórias</th><th>Empates</th><th>Derrotas</th><th>GM</th><th>GS</th><th>Aprov.</th>'
        : `<th>Temporada</th><th>Jogos</th><th>Titular</th><th>Subst.</th><th>Entrou</th><th>Gols</th>${isGoalie ? '<th>GS</th><th>CS</th>' : ''}<th>Vitórias</th><th>Empates</th><th>Derrotas</th><th>Aprov.</th><th>CA</th><th>CV</th>`;

    let seasonTableBody = statsBySeason.map(s => {
        if (isTecnico) {
            return `<tr><td>${s.season}</td><td>${s.gamesCount}</td><td><span class="win-text">${s.wins}</span></td><td><span class="draw-text">${s.draws}</span></td><td><span class="loss-text">${s.losses}</span></td><td>${s.goals}</td><td>${s.gs}</td><td><strong>${s.aprov}</strong></td></tr>`;
        } else {
            return `<tr><td>${s.season}</td><td>${s.gamesCount}</td><td style="color:#2980b9; font-weight:600;">${s.titularCount}</td><td style="color:#7f8c8d;">${s.subOutCount}</td><td style="color:#27ae60;">${s.enteredCount}</td><td>${s.goals}</td>${isGoalie ? `<td><strong>${s.gs}</strong></td><td style="color:#3498db; font-weight:bold;">${s.cs}</td>` : ''}<td><span class="win-text">${s.wins}</span></td><td><span class="draw-text">${s.draws}</span></td><td><span class="loss-text">${s.losses}</span></td><td>${s.aprov}</td><td>${s.yellow}</td><td>${s.red}</td></tr>`;
        }
    }).join('');

    let seasonTableFooter = isTecnico
        ? `<tr class="table-total-row"><td>TOTAL</td><td>${total.gamesCount}</td><td>${total.wins}</td><td>${total.draws}</td><td>${total.losses}</td><td>${total.goals}</td><td>${total.gs}</td><td>${total.aprov}</td></tr>`
        : `<tr class="table-total-row"><td>TOTAL</td><td>${total.gamesCount}</td><td>${total.titularCount}</td><td>${total.subOutCount}</td><td>${total.enteredCount}</td><td>${total.goals}</td>${isGoalie ? `<td><strong>${total.gs}</strong></td><td style="color:#3498db; font-weight:bold;">${total.cs}</td>` : ''}<td><span class="win-text">${total.wins}</span></td><td><span class="draw-text">${total.draws}</span></td><td><span class="loss-text">${total.losses}</span></td><td>${total.aprov}</td><td>${total.yellow}</td><td>${total.red}</td></tr>`;

    // Analytics by Coach for players
    let tecTableHtml = '';
    if (!isTecnico && Object.keys(statsByTecnico).length > 0) {
        const tecList = Object.values(statsByTecnico).sort((a,b) => b.jogos - a.jogos);
        
        // Explicitly answer user's "Top" questions
        const topTitular = [...tecList].sort((a,b) => b.titular - a.titular)[0];
        const topSub = [...tecList].sort((a,b) => b.subOut - a.subOut)[0];
        const topEntrou = [...tecList].sort((a,b) => b.entered - a.entered)[0];

        tecTableHtml = `
            <div style="margin-top: 2rem;">
                <h4 style="margin-bottom:1rem; color:var(--primary-color);">Estatísticas por Técnico</h4>
                
                <div class="detail-section-bg" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
                    <div style="font-size:0.85rem;"><i class="fas fa-shield-halved" style="color:#333;"></i> <strong>Mais titular com:</strong><br>${topTitular.titular > 0 ? topTitular.nome : '-'} (${topTitular.titular}x)</div>
                    <div style="font-size:0.85rem;"><i class="fas fa-right-from-bracket" style="color:#e67e22;"></i> <strong>Mais substituído por:</strong><br>${topSub.subOut > 0 ? topSub.nome : '-'} (${topSub.subOut}x)</div>
                    <div style="font-size:0.85rem;"><i class="fas fa-right-to-bracket" style="color:#27ae60;"></i> <strong>Mais utilizado reserva:</strong><br>${topEntrou.entered > 0 ? topEntrou.nome : '-'} (${topEntrou.entered}x)</div>
                </div>

                <table class="stats-table" style="font-size:0.9rem;">
                    <thead>
                        <tr><th>Técnico</th><th>Jogos</th><th>Titular</th><th>Subst.</th><th>Entrou</th><th>Gols</th>${isGoalie ? '<th>GS</th>' : ''}</tr>
                    </thead>
                    <tbody>
                        ${tecList.map(t => `<tr><td><strong>${t.nome}</strong></td><td>${t.jogos}</td><td>${t.titular}</td><td>${t.subOut}</td><td>${t.entered}</td><td>${t.goals}</td>${isGoalie ? `<td>${t.gs}</td>` : ''}</tr>`).join('')}
                    </tbody>
                </table>
                ${renderTableLegend(['J', 'GS'])}
            </div>
        `;
    }

    detail.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
            <h3>Histórico: ${player.nome_guerra}</h3>
            <button class="btn-icon" onclick="this.closest('.detail-inline-container').remove()"><i class="fas fa-times"></i></button>
        </div>
        <table class="stats-table">
            <thead><tr>${seasonTableHeaders}</tr></thead>
            <tbody>${seasonTableBody}</tbody>
            <tfoot>${seasonTableFooter}</tfoot>
        </table>
        ${renderTableLegend(isTecnico ? ['J', 'GM', 'GS', 'Aprov'] : ['J', 'GS', 'CS', 'Aprov', 'CA', 'CV'])}
        ${tecTableHtml}
    `;
    card.after(detail);
};

// ARTILHEIROS FUNCTIONS
window.changeArtTab = (tab) => {
    state.artTab = tab;
    const section = document.getElementById('artilheiros-section');
    section.querySelectorAll('.tabs-container .tab-btn').forEach(btn => {
        if (btn.innerText.toLowerCase().includes(tab.replace('-', ' '))) btn.classList.add('active');
        else if (tab === 'geral' && btn.innerText.toLowerCase().includes('artilheiros')) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    renderCurrentArtTab();
};

const renderCurrentArtTab = () => {
    const tab = state.artTab || 'geral';
    if (tab === 'geral') renderArtilheiros();
    else if (tab === 'six-plus') renderSixPlusTab();
    else {
        const goalMap = { 'dobletes': 2, 'hat-tricks': 3, 'poker-tricks': 4, 'manitas': 5 };
        renderMultiGolsTab(goalMap[tab]);
    }
};


const renderArtilheiros = () => {
    const fTemp = document.getElementById('art-filter-temporada').value;
    const fJog = document.getElementById('art-filter-jogador').value;
    const fPos = document.getElementById('art-filter-posicao').value;
    const fAdv = document.getElementById('art-filter-adversario').value;
    const fEst = document.getElementById('art-filter-estadio').value;
    const fCamp = document.getElementById('art-filter-campeonato').value;
    const fTipo = document.getElementById('art-filter-tipo').value;
    const fNac = document.getElementById('art-filter-nacionalidade').value;

    const stats = {};
    state.jogos.forEach(jogo => {
        const comp = state.competicoes.find(c => c.campeonato === jogo.campeonato);
        const matchMatchesFilter = (!fTemp || jogo.temporada === fTemp) &&
                                   (!fAdv || jogo.casa === fAdv || jogo.fora === fAdv) &&
                                   (!fEst || jogo.estadio === fEst) &&
                                   (!fCamp || jogo.campeonato === fCamp) &&
                                   (!fTipo || comp?.tipo === fTipo);
        if (!matchMatchesFilter) return;

        jogo.lineupGalo?.forEach(l => {
            if (!stats[l.jogador]) stats[l.jogador] = { nome: l.jogador, goals: 0, games: 0 };
            stats[l.jogador].games++;
            stats[l.jogador].goals += parseInt(l.golsCount || 0);
        });
    });

    let artList = Object.values(stats).map(s => {
        const p = state.jogadores.find(j => j.nome_guerra === s.nome);
        return { ...s, player: p };
    });

    // Exibir somente jogadores com gols >= 1
    artList = artList.filter(a => a.goals >= 1);

    if (fJog) artList = artList.filter(a => a.nome === fJog);
    if (fPos) artList = artList.filter(a => a.player?.posicao === fPos);
    if (fNac) artList = artList.filter(a => a.player?.nacionalidade === fNac);

    artList.sort((a,b) => b.goals - a.goals || a.games - b.games);

    const data = artList.map(a => ({
        ...a,
        media: a.games > 0 ? (a.goals / a.games).toFixed(2) : '0.00'
    }));

    const sortedData = sortInternal(data, 'artilheiros-table');

    const content = document.getElementById('artilheiros-content');
    content.innerHTML = `
        <table class="data-table" id="artilheiros-table">
            <thead>
                <tr>
                    <th>Foto</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'nome', 'string')">Jogador <i class="fas fa-sort"></i></th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'games', 'number')">Jogos <i class="fas fa-sort"></i></th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'goals', 'number')">Gols <i class="fas fa-sort"></i></th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'media', 'number')">Média <i class="fas fa-sort"></i></th>
                </tr>
            </thead>
            <tbody>
                ${sortedData.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Nenhum artilheiro encontrado.</td></tr>' : 
                    sortedData.map(a => `
                        <tr onclick="showArtilheiroDetail('${a.nome}', event)" style="cursor:pointer;" title="Clique para ver detalhes">
                            <td><img src="${a.player?.foto || 'https://via.placeholder.com/100'}" class="mini-foto" style="width:30px; height:30px; border-radius:50%; object-fit:cover;"></td>
                            <td style="font-weight:bold;">${a.nome}</td>
                            <td>${a.games}</td>
                            <td style="color:var(--primary-color); font-weight:bold;">${a.goals}</td>
                            <td>${a.media}</td>
                        </tr>
                    `).join('')}
            </tbody>
        </table>
    `;
    
    populateFilter('art-filter-temporada', [...new Set(state.jogos.map(j => j.temporada))]);
    populateFilter('art-filter-jogador', [...new Set(state.jogadores.map(j => j.nome_guerra))]);
    populateFilter('art-filter-adversario', [...new Set(state.adversarios.map(a => a.clube))]);
    populateFilter('art-filter-estadio', [...new Set(state.estadios.map(e => e.nome))]);
};

const showArtilheiroDetail = (playerName, event) => {
    const row = event.currentTarget.closest('tr');
    const existing = document.getElementById(`art-detail-${playerName.replace(/\s+/g, '-')}`);
    document.querySelectorAll('.art-detail-row').forEach(r => r.remove());
    if (existing) return;

    const campStats = {};
    const advStats = {};
    state.jogos.forEach(j => {
        const lp = j.lineupGalo?.find(p => p.jogador === playerName);
        const hasPlayed = j.lineupGalo?.some(p => p.jogador === playerName);
        if (hasPlayed) {
            if (!campStats[j.campeonato]) campStats[j.campeonato] = { nome: j.campeonato, games: 0, goals: 0 };
            campStats[j.campeonato].games++;
        }
        if (lp && (parseInt(lp.golsCount) || 0) > 0) {
            const g = parseInt(lp.golsCount);
            if (!campStats[j.campeonato]) campStats[j.campeonato] = { nome: j.campeonato, games: 0, goals: 0 };
            campStats[j.campeonato].goals += g;
            const adv = (j.casa.includes('Atlético') || j.casa.includes('Atletico')) ? j.fora : j.casa;
            if (!advStats[adv]) advStats[adv] = { nome: adv, goals: 0 };
            advStats[adv].goals += g;
        }
    });

    const html = `
        <tr id="art-detail-${playerName.replace(/\s+/g, '-')}" class="art-detail-row">
            <td colspan="5">
                <div class="detail-inline-container" style="display:block; margin:0; padding:1.5rem; background:rgba(0,0,0,0.02);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                        <h4 style="margin:0;">Histórico de Gols: ${playerName}</h4>
                        <button class="btn-icon" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="form-grid" style="gap:2rem;">
                        <div class="stats-section detail-section-bg" style="margin:0; box-shadow:none; padding:0;">
                            <div class="stats-section-title" style="font-size:0.85rem;">Por Campeonato</div>
                            <table class="stats-table">
                                <thead><tr><th>Campeonato</th><th>Jogos</th><th>Gols</th></tr></thead>
                                <tbody>${Object.values(campStats).sort((a,b)=>b.goals-a.goals).map(c => `<tr><td>${c.nome}</td><td>${c.games}</td><td><strong>${c.goals}</strong></td></tr>`).join('')}</tbody>
                            </table>
                        </div>
                        <div class="stats-section detail-section-bg" style="margin:0; box-shadow:none; padding:0;">
                            <div class="stats-section-title" style="font-size:0.85rem;">Contra Adversários</div>
                            <table class="stats-table">
                                <thead><tr><th>Adversário</th><th>Gols</th></tr></thead>
                                <tbody>${Object.values(advStats).sort((a,b)=>b.goals-a.goals).map(a => `<tr><td>${a.nome}</td><td><strong>${a.goals}</strong></td></tr>`).join('')}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    `;
    row.insertAdjacentHTML('afterend', html);
};

const renderMultiGolsTab = (nGols) => {
    const fTemp = document.getElementById('art-filter-temporada').value;
    const fJog = document.getElementById('art-filter-jogador').value;
    const fPos = document.getElementById('art-filter-posicao').value;
    const fAdv = document.getElementById('art-filter-adversario').value;
    const fEst = document.getElementById('art-filter-estadio').value;
    const fCamp = document.getElementById('art-filter-campeonato').value;
    const fTipo = document.getElementById('art-filter-tipo').value;
    const fNac = document.getElementById('art-filter-nacionalidade').value;

    const stats = {};
    state.jogos.forEach(jogo => {
        const comp = state.competicoes.find(c => c.campeonato === jogo.campeonato);
        const matchMatchesFilter = (!fTemp || jogo.temporada === fTemp) &&
                                   (!fAdv || jogo.casa === fAdv || jogo.fora === fAdv) &&
                                   (!fEst || jogo.estadio === fEst) &&
                                   (!fCamp || jogo.campeonato === fCamp) &&
                                   (!fTipo || comp?.tipo === fTipo);
        if (!matchMatchesFilter) return;

        jogo.lineupGalo?.forEach(l => {
            const g = parseInt(l.golsCount || 0);
            if (g === nGols) {
                if (!stats[l.jogador]) stats[l.jogador] = { nome: l.jogador, count: 0, totalGames: 0 };
                stats[l.jogador].count++;
            }
        });
        
        // Contar jogos totais para os jogadores que alcançaram a marca (dentro dos filtros aplicados)
        jogo.lineupGalo?.forEach(l => {
            if (stats[l.jogador]) stats[l.jogador].totalGames++;
        });
    });

    let list = Object.values(stats).filter(s => s.count > 0).map(s => {
        const p = state.jogadores.find(j => j.nome_guerra === s.nome);
        return { ...s, player: p };
    });

    if (fJog) list = list.filter(a => a.nome === fJog);
    if (fPos) list = list.filter(a => a.player?.posicao === fPos);
    if (fNac) list = list.filter(a => a.player?.nacionalidade === fNac);

    const sortedData = sortInternal(list, 'multigols-table');
    sortedData.sort((a,b) => b.count - a.count || b.totalGames - a.totalGames);


    const content = document.getElementById('artilheiros-content');
    content.innerHTML = `
        <table class="data-table" id="multigols-table">
            <thead>
                <tr>
                    <th>Foto</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'nome', 'string')">Jogador <i class="fas fa-sort"></i></th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'totalGames', 'number')">Jogos <i class="fas fa-sort"></i></th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'count', 'number')">Quantidade <i class="fas fa-sort"></i></th>
                </tr>
            </thead>
            <tbody>
                ${list.length === 0 ? `<tr><td colspan="4" style="text-align:center;">Nenhum registro de ${nGols} gols em um único jogo.</td></tr>` : 
                    list.map(s => `
                        <tr onclick="showMultiGolsGames('${s.nome}', ${nGols}, event)" style="cursor:pointer;" title="Clique para ver os jogos">
                            <td><img src="${s.player?.foto || 'https://via.placeholder.com/100'}" class="mini-foto" style="width:30px; height:30px; border-radius:50%; object-fit:cover;"></td>
                            <td style="font-weight:bold;">${s.nome}</td>
                            <td>${s.totalGames}</td>
                            <td style="color:var(--primary-color); font-weight:bold;">${s.count}</td>
                        </tr>
                    `).join('')}
            </tbody>
        </table>
    `;
};

const showMultiGolsGames = (playerName, nGols, event) => {
    const row = event.currentTarget.closest('tr');
    const existing = document.getElementById(`multigols-detail-${playerName.replace(/\s+/g, '-')}`);
    document.querySelectorAll('.multigols-detail-row').forEach(r => r.remove());
    if (existing) return;

    const games = state.jogos.filter(j => {
        const lp = j.lineupGalo?.find(p => p.jogador === playerName);
        return lp && parseInt(lp.golsCount) === nGols;
    }).sort((a,b) => new Date(b.data) - new Date(a.data));

    const html = `
        <tr id="multigols-detail-${playerName.replace(/\s+/g, '-')}" class="multigols-detail-row">
            <td colspan="4">
                <div class="detail-inline-container" style="display:block; margin:0; padding:1.5rem; background:rgba(0,0,0,0.02);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                        <h4 style="margin:0;">Jogos com ${nGols} gols: ${playerName}</h4>
                        <button class="btn-icon" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button>
                    </div>
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Campeonato</th>
                                <th>Casa</th>
                                <th>Placar</th>
                                <th>Fora</th>
                                <th>Estádio</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${games.map(j => `
                                <tr>
                                    <td>${j.data.split('-').reverse().join('/')}</td>
                                    <td>${j.campeonato}</td>
                                    <td style="text-align:right;">${j.casa}</td>
                                    <td style="text-align:center; font-weight:bold;">${j.golsCasa} x ${j.golsFora}</td>
                                    <td>${j.fora}</td>
                                    <td>${j.estadio || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </td>
        </tr>
    `;
    row.insertAdjacentHTML('afterend', html);
};

const renderSixPlusTab = () => {
    const fTemp = document.getElementById('art-filter-temporada').value;
    const fJog = document.getElementById('art-filter-jogador').value;
    const fPos = document.getElementById('art-filter-posicao').value;
    const fAdv = document.getElementById('art-filter-adversario').value;
    const fEst = document.getElementById('art-filter-estadio').value;
    const fCamp = document.getElementById('art-filter-campeonato').value;
    const fTipo = document.getElementById('art-filter-tipo').value;
    const fNac = document.getElementById('art-filter-nacionalidade').value;

    const stats = {};
    state.jogos.forEach(jogo => {
        const comp = state.competicoes.find(c => c.campeonato === jogo.campeonato);
        const matchMatchesFilter = (!fTemp || jogo.temporada === fTemp) &&
                                   (!fAdv || jogo.casa === fAdv || jogo.fora === fAdv) &&
                                   (!fEst || jogo.estadio === fEst) &&
                                   (!fCamp || jogo.campeonato === fCamp) &&
                                   (!fTipo || comp?.tipo === fTipo);
        if (!matchMatchesFilter) return;

        jogo.lineupGalo?.forEach(l => {
            const g = parseInt(l.golsCount || 0);
            if (g >= 6 && g <= 10) {
                if (!stats[l.jogador]) stats[l.jogador] = { nome: l.jogador, total: 0, 6:0, 7:0, 8:0, 9:0, 10:0 };
                stats[l.jogador][g]++;
                stats[l.jogador].total++;
            }
        });
    });

    let list = Object.values(stats).map(s => {
        const p = state.jogadores.find(j => j.nome_guerra === s.nome);
        return { ...s, player: p };
    });

    if (fJog) list = list.filter(a => a.nome === fJog);
    if (fPos) list = list.filter(a => a.player?.posicao === fPos);
    if (fNac) list = list.filter(a => a.player?.nacionalidade === fNac);

    const sortedData = sortInternal(list, 'sixplus-table');
    sortedData.sort((a,b) => b.total - a.total);


    const content = document.getElementById('artilheiros-content');
    content.innerHTML = `
        <table class="data-table" id="sixplus-table">
            <thead>
                <tr>
                    <th>Foto</th>
                    <th>Jogador</th>
                    <th>6 Gols</th>
                    <th>7 Gols</th>
                    <th>8 Gols</th>
                    <th>9 Gols</th>
                    <th>10 Gols</th>
                </tr>
            </thead>
            <tbody>
                ${list.length === 0 ? '<tr><td colspan="7" style="text-align:center;">Nenhum registro de 6 ou mais gols em um único jogo.</td></tr>' : 
                    list.map(s => `
                        <tr onclick="showSixPlusGames('${s.nome}', event)" style="cursor:pointer;" title="Clique para ver os jogos">
                            <td><img src="${s.player?.foto || 'https://via.placeholder.com/100'}" class="mini-foto" style="width:30px; height:30px; border-radius:50%; object-fit:cover;"></td>
                            <td style="font-weight:bold;">${s.nome}</td>
                            <td>${s[6]}</td>
                            <td>${s[7]}</td>
                            <td>${s[8]}</td>
                            <td>${s[9]}</td>
                            <td>${s[10]}</td>
                        </tr>
                    `).join('')}

            </tbody>
        </table>
    `;
};const showSixPlusGames = (playerName, event) => {
    const row = event.currentTarget.closest('tr');
    const existing = document.getElementById(`sixplus-detail-${playerName.replace(/\s+/g, '-')}`);
    document.querySelectorAll('.sixplus-detail-row').forEach(r => r.remove());
    if (existing) return;

    const games = state.jogos.filter(j => {
        const lp = j.lineupGalo?.find(p => p.jogador === playerName);
        const g = parseInt(lp?.golsCount || 0);
        return lp && g >= 6 && g <= 10;
    }).sort((a,b) => new Date(b.data) - new Date(a.data));

    const html = `
        <tr id="sixplus-detail-${playerName.replace(/\s+/g, '-')}" class="sixplus-detail-row">
            <td colspan="7">
                <div class="detail-inline-container" style="display:block; margin:0; padding:1.5rem; background:rgba(0,0,0,0.02);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                        <h4 style="margin:0;">Jogos com 6 ou mais gols: ${playerName}</h4>
                        <button class="btn-icon" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button>
                    </div>
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Campeonato</th>
                                <th>Casa</th>
                                <th>Placar</th>
                                <th>Fora</th>
                                <th>Gols</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${games.map(j => {
                                const lp = j.lineupGalo.find(p => p.jogador === playerName);
                                return `
                                    <tr>
                                        <td>${j.data.split('-').reverse().join('/')}</td>
                                        <td>${j.campeonato}</td>
                                        <td style="text-align:right;">${j.casa}</td>
                                        <td style="text-align:center; font-weight:bold;">${j.golsCasa} x ${j.golsFora}</td>
                                        <td>${j.fora}</td>
                                        <td style="font-weight:bold; color:var(--primary-color);">${lp.golsCount}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </td>
        </tr>
    `;
    row.insertAdjacentHTML('afterend', html);
};


// CARTÕES FUNCTIONS
const renderCartoes = () => {
    const detail = document.getElementById('cartoes-detail-container');
    if (detail) detail.classList.add('hidden');

    const fTemp = document.getElementById('cart-filter-temporada').value;
    const fTime = document.getElementById('cart-filter-time').value; // 'Atlético' ou 'Adversário'
    const fPos = document.getElementById('cart-filter-posicao').value;

    const stats = {};
    state.jogos.forEach(jogo => {
        if (fTemp && jogo.temporada !== fTemp) return;
        
        const list = fTime === 'Atlético' ? (jogo.cartoesGalo || []) : (jogo.cartoesAdv || []);
        list.forEach(c => {
            const name = c.jogador || 'Adversário';
            if (!stats[name]) stats[name] = { nome: name, yellow: 0, red: 0, games: new Set() };
            stats[name].yellow += parseInt(c.amarelo || 0);
            stats[name].red += parseInt(c.red || 0);
            stats[name].games.add(jogo.id);
            if (!stats[name].posicao) stats[name].posicao = c.posicao || '-';
        });
    });

    let cardList = Object.values(stats).map(s => {
        const p = state.jogadores.find(j => j.nome_guerra === s.nome);
        return { ...s, total: s.yellow + s.red, player: p, gamesCount: s.games.size };
    });

    if (fPos) cardList = cardList.filter(c => (c.player?.posicao || c.posicao) === fPos);

    // Populate Seasons Filter
    populateFilter('cart-filter-temporada', [...new Set(state.jogos.map(j => j.temporada))]);

    const tbody = document.querySelector('#cartoes-table tbody');
    if (!tbody) return;

    const data = cardList.map(c => ({
        ...c,
        total: c.yellow + c.red
    }));

    const sortedData = sortInternal(data, 'cartoes-table');

    tbody.innerHTML = sortedData.length === 0 ? '<tr><td colspan="5" style="text-align:center;">Nenhum registro de cartão encontrado.</td></tr>' : 
        sortedData.map((c, idx) => `
            <tr onclick="toggleCartoesDetail('${c.nome}', this)" style="cursor:pointer;" title="Clique para ver detalhes" data-player="${c.nome}">
                <td><img src="${c.player?.foto || 'https://via.placeholder.com/100'}" class="mini-foto" style="width:30px; height:30px; border-radius:50%; object-fit:cover;"></td>
                <td style="font-weight:bold;">${c.nome}</td>
                <td style="color:#f39c12; font-weight:bold;">${c.yellow}</td>
                <td style="color:#e74c3c; font-weight:bold;">${c.red}</td>
                <td><strong>${c.total}</strong></td>
            </tr>
        `).join('');
};

const toggleCartoesDetail = (playerName, row) => {
    const nextRow = row.nextElementSibling;
    const isDetailOpen = nextRow && nextRow.classList.contains('detail-row');
    
    // Fecha outros detalhes abertos na tabela
    row.parentElement.querySelectorAll('.detail-row').forEach(r => r.remove());
    
    if (isDetailOpen) return; // Se já estava aberto para este jogador, apenas fecha

    const byCamp = {}, byAdv = {}, byArb = {};
    state.jogos.forEach(j => {
        const cGalo = (j.cartoesGalo || []).find(c => c.jogador === playerName);
        const cAdv = (j.cartoesAdv || []).find(c => c.jogador === playerName);
        const cardObj = cGalo || cAdv;
        if (!cardObj) return;

        const y = parseInt(cardObj.amarelo || 0), r = parseInt(cardObj.red || 0), t = y + r;
        if (!byCamp[j.campeonato]) byCamp[j.campeonato] = { nome: j.campeonato, y:0, r:0, t:0 };
        byCamp[j.campeonato].y += y; byCamp[j.campeonato].r += r; byCamp[j.campeonato].t += t;
        
        const opp = j.casa === 'Atlético' || j.casa === 'Atlético-MG' ? j.fora : j.casa;
        if (!byAdv[opp]) byAdv[opp] = { nome: opp, y:0, r:0, t:0 };
        byAdv[opp].y += y; byAdv[opp].r += r; byAdv[opp].t += t;

        if (j.arbitro) {
            if (!byArb[j.arbitro]) byArb[j.arbitro] = { nome: j.arbitro, y:0, r:0, t:0 };
            byArb[j.arbitro].y += y; byArb[j.arbitro].r += r; byArb[j.arbitro].t += t;
        }
    });

    const detailHtml = `
        <tr class="detail-row">
            <td colspan="5" style="padding: 1.5rem;" class="table-total-row">
                <div class="detail-inline-container" style="display:block; margin:0; border:none; box-shadow:none; background:transparent;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:1rem; align-items:center;">
                        <h3 style="margin:0; font-size:1.1rem; color:var(--primary-color);">Detalhamento de Cartões: ${playerName}</h3>
                        <button class="btn-icon" onclick="this.closest('.detail-row').remove()"><i class="fas fa-times"></i></button>
                    </div>
                    <div class="form-grid" style="gap:1rem; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));">
                        <div class="stats-section detail-section-bg" style="margin:0; box-shadow:none;">
                            <div class="stats-section-title" style="font-size:0.85rem; padding:0.5rem 1rem;">Por Campeonato</div>
                            <table class="stats-table" style="font-size:0.85rem;">
                                <thead><tr><th>Campeonato</th><th class="col-mini">CA</th><th class="col-mini">CV</th><th class="col-mini">Total</th></tr></thead>
                                <tbody>${Object.values(byCamp).sort((a,b)=>b.t-a.t).map(x => `<tr><td>${x.nome}</td><td style="color:#f39c12; font-weight:bold;">${x.y}</td><td style="color:#e74c3c; font-weight:bold;">${x.r}</td><td><strong>${x.t}</strong></td></tr>`).join('')}</tbody>
                            </table>
                        </div>
                        <div class="stats-section detail-section-bg" style="margin:0; box-shadow:none;">
                            <div class="stats-section-title" style="font-size:0.85rem; padding:0.5rem 1rem;">Por Adversário</div>
                            <table class="stats-table" style="font-size:0.85rem;">
                                <thead><tr><th>Adversário</th><th class="col-mini">CA</th><th class="col-mini">CV</th><th class="col-mini">Total</th></tr></thead>
                                <tbody>${Object.values(byAdv).sort((a,b)=>b.t-a.t).map(x => `<tr><td>${x.nome}</td><td style="color:#f39c12; font-weight:bold;">${x.y}</td><td style="color:#e74c3c; font-weight:bold;">${x.r}</td><td><strong>${x.t}</strong></td></tr>`).join('')}</tbody>
                            </table>
                        </div>
                        <div class="stats-section detail-section-bg" style="margin:0; box-shadow:none;">
                            <div class="stats-section-title" style="font-size:0.85rem; padding:0.5rem 1rem;">Por Árbitro</div>
                            <table class="stats-table" style="font-size:0.85rem;">
                                <thead><tr><th>Árbitro</th><th class="col-mini">CA</th><th class="col-mini">CV</th><th class="col-mini">Total</th></tr></thead>
                                <tbody>${Object.values(byArb).sort((a,b)=>b.t-a.t).map(x => `<tr><td>${x.nome}</td><td style="color:#f39c12; font-weight:bold;">${x.y}</td><td style="color:#e74c3c; font-weight:bold;">${x.r}</td><td><strong>${x.t}</strong></td></tr>`).join('')}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    `;
    row.insertAdjacentHTML('afterend', detailHtml);
    row.nextElementSibling.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// ARBITRAGEM FUNCTIONS
window.changeArbTab = (tab) => {
    state.arbTab = tab;
    
    // Update Tab Buttons UI
    const ids = ['arbitro', 'assistente', 'var'];
    ids.forEach(id => {
        const btn = document.getElementById(`btn-arb-tab-${id}`);
        if (btn) {
            if (id === tab) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });

    renderArbitragem();
};

const renderArbitragem = () => {
    const tbody = document.getElementById('table-body-arbitragem');
    if (!tbody) return;

    const fTemp = document.getElementById('arb-filter-temporada').value;
    const fNac = document.getElementById('arb-filter-nacionalidade').value;
    const fArb = document.getElementById('arb-filter-arbitro').value;
    const fAdv = document.getElementById('arb-filter-adversario').value;
    const fEst = document.getElementById('arb-filter-estadio').value;
    const fCamp = document.getElementById('arb-filter-campeonato').value;
    const fTipo = document.getElementById('arb-filter-tipo').value;
    const fAnoDe = document.getElementById('arb-filter-ano-de').value;
    const fAnoAte = document.getElementById('arb-filter-ano-ate').value;

    const statsArr = state.arbitros.filter(a => a.nome && a.nome !== 'Sem VAR').map(arb => {
        if (fNac && arb.federacao !== fNac) return null;
        let arbGames = [];
        
        if (state.arbTab === 'arbitro') {
            arbGames = state.jogos.filter(j => j.arbitro === arb.nome);
        } else if (state.arbTab === 'assistente') {
            arbGames = state.jogos.filter(j => j.assistente1 === arb.nome || j.assistente2 === arb.nome);
        } else if (state.arbTab === 'var') {
            arbGames = state.jogos.filter(j => j.varArbitro === arb.nome);
        }
        
        // Filters
        if (fTemp) arbGames = arbGames.filter(j => j.temporada === fTemp);
        if (fAdv) arbGames = arbGames.filter(j => j.casa === fAdv || j.fora === fAdv);
        if (fEst) arbGames = arbGames.filter(j => j.estadio === fEst);
        if (fCamp) arbGames = arbGames.filter(j => j.campeonato === fCamp);
        if (fTipo) {
            arbGames = arbGames.filter(jg => {
                const comp = state.competicoes.find(c => c.campeonato === jg.campeonato);
                return comp?.tipo === fTipo;
            });
        }
        if (fAnoDe) arbGames = arbGames.filter(j => parseInt(j.data.substring(0,4)) >= parseInt(fAnoDe));
        if (fAnoAte) arbGames = arbGames.filter(j => parseInt(j.data.substring(0,4)) <= parseInt(fAnoAte));

        if (arbGames.length === 0 && fArb && fArb !== arb.nome) return null;
        if (fArb && !normalizeString(arb.nome).includes(normalizeString(fArb))) return null;
        if (arbGames.length === 0 && !fArb) return null;

        const res = {
            foto: arb.foto,
            nome: arb.nome,
            jogos: arbGames.length,
            vitorias: 0,
            derrotas: 0,
            amarelosAtl: 0, vermelhosAtl: 0,
            amarelosAdv: 0, vermelhosAdv: 0
        };

        arbGames.forEach(j => {
            const isCasa = j.casa === 'Atlético';
            const gGalo = parseInt(isCasa ? j.golsCasa : j.golsFora);
            const gAdv = parseInt(isCasa ? j.golsFora : j.golsCasa);
            if (gGalo > gAdv) res.vitorias++;
            else if (gGalo < gAdv) res.derrotas++;

            (j.cartoesGalo || []).forEach(c => { res.amarelosAtl += parseInt(c.amarelo || 0); res.vermelhosAtl += parseInt(c.red || 0); });
            (j.cartoesAdv || []).forEach(c => { res.amarelosAdv += parseInt(c.amarelo || 0); res.vermelhosAdv += parseInt(c.red || 0); });
        });

        res.medAmarAtl = res.jogos > 0 ? (res.amarelosAtl / res.jogos) : 0;
        res.medVermAtl = res.jogos > 0 ? (res.vermelhosAtl / res.jogos) : 0;
        res.medAmarAdv = res.jogos > 0 ? (res.amarelosAdv / res.jogos) : 0;
        res.medVermAdv = res.jogos > 0 ? (res.vermelhosAdv / res.jogos) : 0;
        
        res.totalAmar = res.amarelosAtl + res.amarelosAdv;
        res.totalVerm = res.vermelhosAtl + res.vermelhosAdv;
        res.medAmarTotal = res.jogos > 0 ? (res.totalAmar / res.jogos) : 0;
        res.medVermTotal = res.jogos > 0 ? (res.totalVerm / res.jogos) : 0;

        return res;
    }).filter(x => x !== null);

    // Populate Filters
    populateFilter('arb-filter-temporada', [...new Set(state.jogos.map(j => j.temporada))]);
    populateFilter('arb-filter-nacionalidade', [...new Set(state.arbitros.filter(a => a.nome !== 'Sem VAR' && a.federacao).map(a => a.federacao))]);
    
    if (!document.getElementById('arb-filter-arbitro').dataset.autocompleteBound) {
        setupAutocomplete('arb-filter-arbitro', 'arbitros', 'nome', null, () => renderArbitragem());
        setupAutocomplete('arb-filter-adversario', 'adversarios', 'clube', null, () => renderArbitragem());
        setupAutocomplete('arb-filter-estadio', 'estadios', 'nome', null, () => renderArbitragem());
        document.getElementById('arb-filter-arbitro').dataset.autocompleteBound = 'true';
    }

    populateFilter('arb-filter-campeonato', [...new Set(state.jogos.map(j => j.campeonato))]);

    const allYearsArb = [...new Set(state.jogos.map(j => j.data.substring(0,4)))].sort((a,b) => b-a);
    populateFilter('arb-filter-ano-de', allYearsArb);
    populateFilter('arb-filter-ano-ate', allYearsArb);

    // Bind new filters
    const nacFilter = document.getElementById('arb-filter-nacionalidade');
    if (nacFilter && !nacFilter.dataset.bound) {
        ['arb-filter-temporada', 'arb-filter-nacionalidade', 'arb-filter-campeonato', 'arb-filter-tipo', 'arb-filter-ano-de', 'arb-filter-ano-ate'].forEach(id => {
            document.getElementById(id).addEventListener('change', renderArbitragem);
        });
        ['arb-filter-arbitro', 'arb-filter-adversario', 'arb-filter-estadio'].forEach(id => {
            document.getElementById(id).addEventListener('input', renderArbitragem);
        });
        nacFilter.dataset.bound = 'true';
    }

    // Ordenação Dinâmica
    let sortedStats = statsArr;
    if (state.sortConfig.tableId === 'arbitragem-table') {
        sortedStats = sortInternal(statsArr, 'arbitragem-table');
    } else {
        // Default Sort: Jogos Descending
        sortedStats.sort((a, b) => b.jogos - a.jogos);
    }

    const roleLabel = state.arbTab === 'arbitro' ? 'Árbitro' : (state.arbTab === 'assistente' ? 'Assistente' : 'VAR');

    tbody.innerHTML = sortedStats.length === 0 ? `<tr><td colspan="18" style="text-align:center;">Nenhum ${roleLabel.toLowerCase()} encontrado com estes filtros</td></tr>` : 
        sortedStats.map(s => `
            <tr onclick="showArbitragemJogos('${s.nome}', event)" style="cursor:pointer;" title="Clique para ver os jogos de ${s.nome} como ${roleLabel}">
                <td><img src="${s.foto}" class="mini-foto" style="width:30px;height:30px;object-fit:cover;border-radius:50%;"></td>
                <td><strong>${s.nome}</strong></td>
                <td>${s.jogos}</td>
                <td style="color:#27ae60; font-weight:bold;">${s.vitorias}</td>
                <td style="color:#e74c3c; font-weight:bold;">${s.derrotas}</td>
                                <td style="background:rgba(243, 156, 18, 0.1); font-weight:bold;">${s.amarelosAtl}</td>
                                <td style="background:rgba(231, 76, 60, 0.1); font-weight:bold;">${s.vermelhosAtl}</td>
                                <td>${Math.round(s.medAmarAtl)}</td>
                                <td>${Math.round(s.medVermAtl)}</td>
                                <td style="background:rgba(243, 156, 18, 0.1); font-weight:bold;">${s.amarelosAdv}</td>
                                <td style="background:rgba(231, 76, 60, 0.1); font-weight:bold;">${s.vermelhosAdv}</td>
                                <td>${Math.round(s.medAmarAdv)}</td>
                                <td>${Math.round(s.medVermAdv)}</td>
                                <td style="font-weight:bold; color:var(--primary-color);">${s.totalAmar}</td>
                                <td style="font-weight:bold; color:#e74c3c;">${s.totalVerm}</td>
                                <td>${Math.round(s.medAmarTotal)}</td>
                                <td>${Math.round(s.medVermTotal)}</td>
                            </tr>
                        `).join('');
};

window.showArbitragemJogos = (arbNome, event) => {
    const row = event.currentTarget;
    const existing = document.getElementById(`detail-arb-${arbNome.replace(/\s/g,'')}`);
    document.querySelectorAll('.tr-detail-row').forEach(r => r.remove());
    if (existing) return;

    let jogosArb = [];
    if (state.arbTab === 'arbitro') {
        jogosArb = state.jogos.filter(j => j.arbitro === arbNome);
    } else if (state.arbTab === 'assistente') {
        jogosArb = state.jogos.filter(j => j.assistente1 === arbNome || j.assistente2 === arbNome);
    } else if (state.arbTab === 'var') {
        jogosArb = state.jogos.filter(j => j.varArbitro === arbNome);
    }

    jogosArb.sort((a,b) => new Date(b.data) - new Date(a.data));

    const detailRow = document.createElement('tr');
    detailRow.id = `detail-arb-${arbNome.replace(/\s/g,'')}`;
    detailRow.className = 'tr-detail-row';
    detailRow.innerHTML = `
        <td colspan="15">
            <div class="tr-detail-container">
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                    <h3>Jogos do Atlético: ${arbNome} (${state.arbTab.charAt(0).toUpperCase() + state.arbTab.slice(1)})</h3>
                    <button class="btn-icon" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button>
                </div>
                <table class="stats-table">
                    <thead><tr><th>Data</th><th>Campeonato</th><th>Casa</th><th>Placar</th><th>Fora</th><th>Público</th></tr></thead>
                    <tbody>
                        ${jogosArb.map(j => `
                            <tr>
                                <td>${j.data.split('-').reverse().join('/')}</td>
                                <td>${j.campeonato}</td>
                                 <td>${j.casa}</td>
                                 <td><strong>${j.golsCasa} x ${j.golsFora}</strong></td>
                                 <td>${j.fora}</td>
                                 <td>${formatPublico(j.publico)}</td>
                             </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </td>
    `;
    row.after(detailRow);
};

// EQUIPE DE ARBITRAGEM FUNCTIONS
const renderEquipeArbitragem = () => {
    const grid = document.getElementById('equipe-arbitragem-grid-container');
    const fTemp = document.getElementById('ea-filter-temporada').value;
    const fAnoDe = document.getElementById('ea-filter-ano-de').value;
    const fAnoAte = document.getElementById('ea-filter-ano-ate').value;
    const fCamp = document.getElementById('ea-filter-campeonato').value;
    const fAdv = document.getElementById('ea-filter-adversario').value;
    const fNac = document.getElementById('ea-filter-nacionalidade').value;
    const fArb = document.getElementById('ea-filter-arbitro').value;
    const fAss = document.getElementById('ea-filter-assistente').value;
    const fVar = document.getElementById('ea-filter-var').value;

    const profissionais = {};

    state.jogos.forEach(j => {
        if (fTemp && j.temporada !== fTemp) return;
        if (fAnoDe && parseInt(j.data.substring(0,4)) < parseInt(fAnoDe)) return;
        if (fAnoAte && parseInt(j.data.substring(0,4)) > parseInt(fAnoAte)) return;
        if (fCamp && j.campeonato !== fCamp) return;
        const op = j.casa === 'Atlético' ? j.fora : j.casa;
        if (fAdv && op !== fAdv) return;
        
        if (fArb && !normalizeString(j.arbitro).includes(normalizeString(fArb))) return;
        if (fAss && !normalizeString(j.assistente1).includes(normalizeString(fAss)) && !normalizeString(j.assistente2).includes(normalizeString(fAss))) return;
        if (fVar && !normalizeString(j.varArbitro).includes(normalizeString(fVar))) return;

        const p = (name, role) => {
            if (!name || name === 'N/I' || name === '-' || name === 'Sem VAR' || name.trim() === '') return;
            const arbInfo = state.arbitros.find(a => a.nome === name);
            if (fNac && arbInfo?.federacao !== fNac) return;
            
            if (!profissionais[name]) profissionais[name] = { 
                nome: name, 
                jogos: [], 
                roles: { 'Árbitro': 0, 'Assistente': 0, 'VAR': 0 }, 
                foto: arbInfo?.foto || 'https://via.placeholder.com/100',
                nacionalidade: arbInfo?.federacao || ''
            };
            profissionais[name].roles[role]++;
            profissionais[name].jogos.push(j);
        };

        p(j.arbitro, 'Árbitro');
        p(j.assistente1, 'Assistente');
        p(j.assistente2, 'Assistente');
        p(j.varArbitro, 'VAR');
    });

    // Populando dropdowns (apenas 1 vez caso vazio)
    if (document.getElementById('ea-filter-temporada').options.length === 1) {
        populateFilter('ea-filter-temporada', [...new Set(state.jogos.map(j => j.temporada))]);
        
        const allYearsEA = [...new Set(state.jogos.map(j => j.data.substring(0,4)))].sort((a,b) => b-a);
        populateFilter('ea-filter-ano-de', allYearsEA);
        populateFilter('ea-filter-ano-ate', allYearsEA);

        populateFilter('ea-filter-campeonato', [...new Set(state.jogos.map(j => j.campeonato))]);
        populateFilter('ea-filter-nacionalidade', [...new Set(state.arbitros.filter(a => a.nome !== 'Sem VAR' && a.federacao).map(a => a.federacao))]);
        
        setupAutocomplete('ea-filter-adversario', 'adversarios', 'clube', null, () => renderEquipeArbitragem());
        setupAutocomplete('ea-filter-arbitro', 'arbitros', 'nome', null, () => renderEquipeArbitragem());
        setupAutocomplete('ea-filter-assistente', 'arbitros', 'nome', null, () => renderEquipeArbitragem());
        setupAutocomplete('ea-filter-var', 'arbitros', 'nome', null, () => renderEquipeArbitragem());
        
        const attachUpdate = (id) => document.getElementById(id).addEventListener('change', renderEquipeArbitragem);
        ['temporada','campeonato','nacionalidade','ano-de','ano-ate'].forEach(t => attachUpdate(`ea-filter-${t}`));
        
        ['ea-filter-adversario','ea-filter-arbitro','ea-filter-assistente','ea-filter-var'].forEach(id => {
            document.getElementById(id).addEventListener('input', renderEquipeArbitragem);
        });
    }

    const cards = Object.values(profissionais).sort((a,b) => b.jogos.length - a.jogos.length);
    
    grid.innerHTML = cards.length === 0 ? '<div style="grid-column:1/-1;text-align:center;padding:3rem;border-radius:8px;" class="detail-section-bg">Nenhum profissional encontrado.</div>' : 
        cards.map(c => {
            let primaryRole = 'Assistente';
            if (c.roles['Árbitro'] >= c.roles['Assistente'] && c.roles['Árbitro'] >= c.roles['VAR']) primaryRole = 'Árbitro';
            else if (c.roles['VAR'] >= c.roles['Árbitro'] && c.roles['VAR'] >= c.roles['Assistente']) primaryRole = 'VAR';
            
            return `
            <div class="artilheiro-card" onclick="showEquipeArbitragemDetail('${c.nome}', event)">
                <img src="${c.foto}">
                <h3>${c.nome}</h3>
                <div class="pos-nac">${primaryRole} ${c.nacionalidade ? `| ${c.nacionalidade}` : ''}</div>
                <div class="artilheiro-main-stat" style="color:var(--primary-color);">
                   <i class="fas fa-whistle"></i> ${c.jogos.length} <span>jogos</span>
                </div>
            </div>
            `;
        }).join('');
};

window.showEquipeArbitragemDetail = (name, event) => {
    const card = event.currentTarget;
    const existing = document.getElementById(`detail-ea-${name.replace(/\s/g,'')}`);
    document.querySelectorAll('.detail-inline-container').forEach(d => d.remove());
    if (existing) return;

    let totalV=0, totalE=0, totalD=0;
    const statsByCamp = {};
    const jList = [];

    state.jogos.forEach(j => {
        if (j.arbitro === name || j.assistente1 === name || j.assistente2 === name || j.varArbitro === name) {
            jList.push(j);
            const isCasa = j.casa === 'Atlético';
            const gGalo = parseInt(isCasa ? j.golsCasa : j.golsFora);
            const gAdv  = parseInt(isCasa ? j.golsFora : j.golsCasa);
            let v=0, e=0, d=0;
            if (gGalo > gAdv) v=1; else if (gGalo === gAdv) e=1; else d=1;
            totalV+=v; totalE+=e; totalD+=d;
            
            if (!statsByCamp[j.temporada]) statsByCamp[j.temporada] = { t: j.temporada, jogos:0, v:0, e:0, d:0 };
            statsByCamp[j.temporada].jogos++; statsByCamp[j.temporada].v += v; statsByCamp[j.temporada].e += e; statsByCamp[j.temporada].d += d;
        }
    });

    const tbByTemp = Object.values(statsByCamp).sort((a,b)=>b.t-a.t).map(s => {
        const aprov = s.jogos > 0 ? ((s.v*3 + s.e) / (s.jogos*3) * 100).toFixed(1) : 0;
        return `<tr><td>${s.t}</td><td>${s.jogos}</td><td style="color:#27ae60">${s.v}</td><td style="color:#f39c12">${s.e}</td><td style="color:#e74c3c">${s.d}</td><td><strong>${aprov}%</strong></td></tr>`;
    }).join('');

    const tbJogos = jList.sort((a,b)=>new Date(b.data) - new Date(a.data)).map(j => {
        let roleAtuacao = [];
        if(j.arbitro===name) roleAtuacao.push('Árbitro');
        if(j.assistente1===name||j.assistente2===name) roleAtuacao.push('Assistente');
        if(j.varArbitro===name) roleAtuacao.push('VAR');
        return `<tr><td>${j.data.split('-').reverse().join('/')}</td><td>${j.campeonato}</td><td>${j.casa}</td><td><strong>${j.golsCasa} x ${j.golsFora}</strong></td><td>${j.fora}</td><td>${roleAtuacao.join(' / ')}</td></tr>`;
    }).join('');

    const calcTotalAprov = jList.length > 0 ? ((totalV*3 + totalE) / (jList.length*3) * 100).toFixed(1) : 0;

    const detail = document.createElement('div');
    detail.id = `detail-ea-${name.replace(/\s/g,'')}`;
    detail.className = 'detail-inline-container';
    detail.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
            <h3>Resumo de Estatísticas: ${name}</h3>
            <button class="btn-icon" onclick="this.closest('.detail-inline-container').remove()"><i class="fas fa-times"></i></button>
        </div>
        
        <div style="margin-bottom:1rem; font-size:1.1rem;">
            <strong>Total de Jogos Envolvidos:</strong> ${jList.length} &nbsp;|&nbsp;
            <strong>Vitórias (Galo):</strong> <span style="color:#27ae60">${totalV}</span> &nbsp;|&nbsp;
            <strong>Empates:</strong> <span style="color:#f39c12">${totalE}</span> &nbsp;|&nbsp;
            <strong>Derrotas:</strong> <span style="color:#e74c3c">${totalD}</span> &nbsp;|&nbsp;
            <strong>Aproveitamento: ${calcTotalAprov}%</strong>
        </div>

        <div class="form-grid" style="gap:2rem;">
            <div class="stats-section detail-section-bg" style="margin:0; box-shadow:none;">
                <div class="stats-section-title">Por Temporada</div>
                <table class="stats-table" style="text-align:center;">
                    <thead><tr><th style="padding-left:1rem;">Temporada</th><th>Jogos</th><th>V</th><th>E</th><th>D</th><th>% Aprov</th></tr></thead>
                    <tbody>${tbByTemp}</tbody>
                </table>
            </div>
            
            <div class="stats-section detail-section-bg" style="margin:0; box-shadow:none;">
                <div class="stats-section-title">Todos os Jogos</div>
                <div style="max-height: 250px; overflow-y: auto;">
                    <table class="stats-table">
                        <thead><tr><th>Data</th><th>Camp.</th><th>Casa</th><th>Placar</th><th>Fora</th><th>Função</th></tr></thead>
                        <tbody>${tbJogos}</tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    card.after(detail);
};

// JOGOS FUNCTIONS
const renderJogos = () => {
    const tableBody = document.getElementById('table-body-jogos');
    const fTemp = document.getElementById('filter-temporada').value;
    const fCamp = document.getElementById('filter-campeonato').value;
    const fCasa = document.getElementById('filter-casa').value;
    const fFora = document.getElementById('filter-fora').value;
    const fEst = document.getElementById('filter-estadio').value;
    const fArb = document.getElementById('filter-arbitro').value;
    const fAsst = document.getElementById('filter-assistente').value;
    const fVar = document.getElementById('filter-var').value;
    const fMax = document.getElementById('filter-publico-max').value;

    let filtered = [...state.jogos];
    if (fTemp) filtered = filtered.filter(j => j.temporada.toLowerCase().includes(fTemp.toLowerCase()));
    if (fCamp) filtered = filtered.filter(j => j.campeonato.toLowerCase().includes(fCamp.toLowerCase()));
    if (fCasa) filtered = filtered.filter(j => j.casa.toLowerCase().includes(fCasa.toLowerCase()));
    if (fFora) filtered = filtered.filter(j => j.fora.toLowerCase().includes(fFora.toLowerCase()));
    if (fEst) filtered = filtered.filter(j => j.estadio.toLowerCase().includes(fEst.toLowerCase()));
    if (fArb) filtered = filtered.filter(j => j.arbitro.toLowerCase().includes(fArb.toLowerCase()));
    if (fAsst) filtered = filtered.filter(j => 
        (j.assistente1 || '').toLowerCase().includes(fAsst.toLowerCase()) || 
        (j.assistente2 || '').toLowerCase().includes(fAsst.toLowerCase())
    );
    if (fVar) filtered = filtered.filter(j => (j.varArbitro || '').toLowerCase().includes(fVar.toLowerCase()));
    if (fMax) filtered = filtered.filter(j => (j.publico === 'N/I' ? 0 : parseInt(j.publico || 0)) <= parseInt(fMax || 9999999));

    // Ordenação Dinâmica
    const sorted = sortInternal(filtered, 'jogos-table');
    const paginated = sorted.slice((state.currentPage - 1) * state.rowsPerPage, state.currentPage * state.rowsPerPage);

    setupAutocomplete('filter-temporada', 'jogos', 'temporada', null, null, false);
    setupAutocomplete('filter-campeonato', 'jogos', 'campeonato', null, null, false);
    setupAutocomplete('filter-casa', 'adversarios', 'clube', null, null, false);
    setupAutocomplete('filter-fora', 'adversarios', 'clube', null, null, false);
    setupAutocomplete('filter-estadio', 'estadios', 'nome', null, null, false);
    setupAutocomplete('filter-arbitro', 'arbitros', 'nome', null, null, false);
    setupAutocomplete('filter-assistente', 'arbitros', 'nome', null, null, false);
    setupAutocomplete('filter-var', 'arbitros', 'nome', null, null, false);

    // Bind inputs to re-filter
    ['filter-temporada', 'filter-campeonato', 'filter-casa', 'filter-fora', 'filter-estadio', 'filter-arbitro', 'filter-assistente', 'filter-var', 'filter-publico-max'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.filterBound) {
            el.addEventListener('input', () => { state.currentPage = 1; renderJogos(); });
            el.dataset.filterBound = 'true';
        }
    });

    // Clear filters button
    const clearBtn = document.getElementById('btn-clear-filters');
    if (clearBtn && !clearBtn.dataset.bound) {
        clearBtn.onclick = () => {
            ['filter-temporada', 'filter-campeonato', 'filter-casa', 'filter-fora', 'filter-estadio', 'filter-arbitro', 'filter-assistente', 'filter-var', 'filter-publico-max'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            state.currentPage = 1;
            renderJogos();
        };
        clearBtn.dataset.bound = 'true';
    }

    tableBody.innerHTML = paginated.map(j => {
        const pub = formatPublico(j.publico);
        const ren = formatRenda(j.renda);
        const tic = (j.publico > 0 && j.renda !== 'N/I') ? formatCurrency(j.renda / j.publico) : 'N/I';
        return `<tr><td>${j.data.split('-').reverse().join('/')}</td><td>${j.campeonato}</td><td>${j.casa}</td><td><strong>${j.golsCasa} x ${j.golsFora}</strong></td><td>${j.fora}</td><td>${j.arbitro}</td><td>${pub}</td><td>${ren}</td><td>${tic}</td><td class="actions"><button class="action-btn view-btn" onclick="showJogoDetail(${j.id}, event)" title="Visualizar Detalhes"><i class="fas fa-search"></i></button><button class="action-btn" onclick="editJogo(${j.id})" title="Editar"><i class="fas fa-edit"></i></button><button class="action-btn" onclick="deleteJogo(${j.id})" title="Excluir"><i class="fas fa-trash-alt delete"></i></button></td></tr>`;
    }).join('');
};

window.showJogoDetail = (jogoId, event) => {
    const row = event.currentTarget.closest('tr');
    const existing = document.getElementById(`detail-jogo-${jogoId}`);
    document.querySelectorAll('.tr-detail-row').forEach(r => r.remove());
    if (existing) return;

    const j = state.jogos.find(x => x.id === jogoId);
    if (!j) return;

    const detailHtml = `
        <tr id="detail-jogo-${jogoId}" class="tr-detail-row">
            <td colspan="11">
                <div class="tr-detail-container detail-section-bg" style="margin: 10px 0; animation: slideDown 0.3s ease-out;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:1px solid #ddd;">
                        <h3 style="margin:0; color:var(--primary-color);">Ficha Técnica do Jogo</h3>
                        <button class="btn-icon" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button>
                    </div>
                    
                    <div class="form-grid" style="gap:1.5rem;">
                        <div class="stats-section detail-section-bg" style="margin:0;">
                            <div class="stats-section-title">Informações Gerais</div>
                            <div style="padding:1rem;">
                                <p><strong>Data:</strong> ${j.data.split('-').reverse().join('/')}</p>
                                <p><strong>Campeonato:</strong> ${j.campeonato} (${j.rodada})</p>
                                <p><strong>Estádio:</strong> ${j.estadio} - ${j.estadioEstado || ''} / ${j.estadioPais || ''}</p>
                                <p><strong>Técnico Galo:</strong> ${j.tecnicoGalo}</p>
                                <p><strong>Técnico Adv:</strong> ${j.tecnicoAdv}</p>
                                <p><strong>Observações:</strong> ${j.observacao || '-'}</p>
                            </div>
                        </div>
                        
                        <div class="stats-section detail-section-bg" style="margin:0;">
                            <div class="stats-section-title">Financeiro e Arbitragem</div>
                            <div style="padding:1rem;">
                                <p><strong>Público:</strong> ${j.publico === 'N/I' ? 'Não Identificado' : parseInt(j.publico).toLocaleString()}</p>
                                <p><strong>Renda:</strong> ${j.renda === 'N/I' ? 'Não Identificada' : formatCurrency(j.renda)}</p>
                                <p><strong>Ticket Médio:</strong> ${(j.publico > 0 && j.renda !== 'N/I') ? formatCurrency(j.renda / j.publico) : 'N/I'}</p>
                                <hr>
                                <p><strong>Árbitro:</strong> ${j.arbitro}</p>
                                <p><strong>Assistente 1:</strong> ${j.assistente1 || '-'}</p>
                                <p><strong>Assistente 2:</strong> ${j.assistente2 || '-'}</p>
                                <p><strong>VAR:</strong> ${j.varArbitro || '-'}</p>
                            </div>
                        </div>
                    </div>

                    <div class="stats-section detail-section-bg" style="margin-top:1.5rem;">
                        <div class="stats-section-title">Escalação do Atlético</div>
                        <div style="overflow-x:auto;">
                            <table class="stats-table" style="font-size:0.85rem;">
                                <thead>
                                    <tr>
                                        <th>Jogador</th>
                                        <th>Posição</th>
                                        <th>GM</th>
                                        <th>Min (Tempo)</th>
                                        <th>GS</th>
                                        <th>Min (Tempo)</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${j.lineupGalo?.map(p => `
                                        <tr>
                                            <td><strong>${p.jogador}</strong></td>
                                            <td>${p.posicao}</td>
                                            <td style="color:#27ae60; font-weight:bold;">${p.golsCount || 0}</td>
                                            <td>${(p.golsMin || []).map((m, idx) => `${m}' (${p.golsTempo?.[idx] || 1}T)`).join(', ') || '-'}</td>
                                            <td style="color:#e74c3c; font-weight:bold;">${p.gsCount || 0}</td>
                                            <td>${(p.gsMin || []).map((m, idx) => `${m}' (${p.gsTempo?.[idx] || 1}T)`).join(', ') || '-'}</td>
                                            <td>${p.titular ? '<span class="badge" style="background:#fff9e6; color:#b8962d; border: 1px solid #d4af37;">Titular</span>' : '<span class="badge" style="background:#f5f5f5; color:#666;">Reserva</span>'}</td>
                                        </tr>
                                    `).join('')}
                                    ${(j.gcFavorList || []).length > 0 ? `
                                        <tr class="highlight-success-bg">
                                            <td><strong>Gol Contra (Favor)</strong></td>
                                            <td>-</td>
                                            <td style="color:#27ae60; font-weight:bold;">${j.gcFavorList.length}</td>
                                            <td>${j.gcFavorList.map(gc => `${gc.min}' (${gc.tempo}T)`).join(', ')}</td>
                                            <td>0</td>
                                            <td>-</td>
                                            <td>-</td>
                                        </tr>
                                    ` : ''}
                                    ${(j.gcContraList || []).length > 0 ? `
                                         <tr class="highlight-error-bg">
                                             <td><strong>Gol Contra (Contra)</strong></td>
                                             <td>-</td>
                                             <td>0</td>
                                             <td>-</td>
                                             <td style="color:#e74c3c; font-weight:bold;">${j.gcContraList.length}</td>
                                             <td>${j.gcContraList.map(gc => `${gc.min}' (${gc.tempo}T)`).join(', ')}</td>
                                             <td>-</td>
                                         </tr>
                                     ` : ''}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    `;
    row.insertAdjacentHTML('afterend', detailHtml);
};

const populateFilter = (id, values) => {
    const s = document.getElementById(id); 
    if(!s) return; 
    
    const curValue = s.value;
    const sortedValues = [...new Set(values)].sort();
    
    // Comparar se as opções mudaram antes de reconstruir o DOM
    const currentOptions = Array.from(s.options).map(o => o.value).filter(v => v !== "");
    const isSame = sortedValues.length === currentOptions.length && sortedValues.every((v, i) => v === currentOptions[i]);
    
    if (isSame && s.options.length > 0) return;

    // Marcamos como atualização interna para evitar loop de eventos
    state.isUpdating = true;
    s.innerHTML = '<option value="">Selecione...</option>' + 
                  sortedValues.map(v => `<option value="${v}" ${v === curValue ? 'selected' : ''}>${v}</option>`).join('');
    
    // Pequeno timeout para limpar a flag após o ciclo de renderização do DOM
    setTimeout(() => state.isUpdating = false, 50);
};

const setupAutocomplete = (id, sourceKey, field, filterFn = null, onSelect = null, showQuickAdd = true) => {
    const inp = document.getElementById(id); if (!inp) return;
    
    // Se já estiver vinculado, apenas atualiza a fonte de dados e retorna
    if (inp.dataset.autocompleteBound) {
        inp.dataset.sourceKey = sourceKey;
        inp.dataset.field = field;
        return;
    }
    inp.dataset.autocompleteBound = 'true';
    inp.dataset.sourceKey = sourceKey;
    inp.dataset.field = field;

    let cont = inp.parentElement;
    // Ensure the wrapper exists for relative positioning
    if (!cont.classList.contains('autocomplete-container')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'autocomplete-container';
        inp.parentNode.insertBefore(wrapper, inp);
        wrapper.appendChild(inp);
        cont = wrapper;
    }
    
    let selectedIndex = -1;

    inp.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase(); 
        const old = cont.querySelector('.autocomplete-results'); 
        if (old) old.remove();
        selectedIndex = -1;
        
        if (val.length < 1) return;
        const normVal = normalizeString(val);
        const currentSourceKey = inp.dataset.sourceKey || sourceKey;
        const currentField = inp.dataset.field || field;
        let ds = state[currentSourceKey]; 
        if (typeof filterFn === 'function') ds = ds.filter(filterFn);
        const resultsFull = ds.filter(item => normalizeString(item[currentField]).includes(normVal))
                          .sort((a,b) => a[currentField].localeCompare(b[currentField]));
        
        // Garantir valores únicos no dropdown para campos como 'temporada'
        const results = [];
        const seen = new Set();
        resultsFull.forEach(item => {
            if (!seen.has(item[currentField])) {
                seen.add(item[currentField]);
                results.push(item);
            }
        });
        
        const drop = document.createElement('div'); 
        drop.className = 'autocomplete-results';
        
        results.forEach((res, idx) => {
            const item = document.createElement('div'); 
            item.className = 'autocomplete-item'; 
            item.textContent = res[currentField];
            item.onclick = () => { 
                inp.value = res[currentField]; 
                drop.remove(); 
                if (typeof onSelect === 'function') onSelect(res);
                inp.dispatchEvent(new Event('change')); 
                inp.dispatchEvent(new Event('blur')); 
            };
            drop.appendChild(item);
        });
        
        if (showQuickAdd) {
            const add = document.createElement('div'); 
            add.className = 'autocomplete-item new-item'; 
            add.innerHTML = `<i class="fas fa-plus-circle"></i> + Novo "${e.target.value}"`;
            add.onclick = () => { drop.remove(); openQuickAddModal(sourceKey, e.target.value, id); };
            drop.appendChild(add); 
        }
        
        if (drop.children.length > 0) {
            selectedIndex = 0;
            drop.children[0].classList.add('selected');
        }

        drop.style.width = inp.offsetWidth + 'px';
        cont.appendChild(drop);
    });

    inp.addEventListener('keydown', (e) => {
        const drop = cont.querySelector('.autocomplete-results');
        if (!drop) return;
        const items = drop.querySelectorAll('.autocomplete-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex++;
            if (selectedIndex >= items.length) selectedIndex = 0;
            updateSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex--;
            if (selectedIndex < 0) selectedIndex = items.length - 1;
            updateSelection(items);
        } else if (e.key === 'Enter') {
            if (selectedIndex > -1) {
                e.preventDefault();
                items[selectedIndex].click();
            }
        }
    });

    const updateSelection = (items) => {
        items.forEach((item, idx) => {
            item.classList.toggle('selected', idx === selectedIndex);
            if (idx === selectedIndex) {
                item.scrollIntoView({ block: 'nearest' });
            }
        });
    };

    document.addEventListener('click', (e) => { 
        if (!cont.contains(e.target)) { 
            const d = cont.querySelector('.autocomplete-results'); 
            if (d) d.remove(); 
        }
    });
};

const openQuickAddModal = (type, initialValue, targetInputId) => {
    const tabNames = { adversarios: 'Adversário', estadios: 'Estádio', arbitros: 'Árbitro', competicoes: 'Competição', jogadores: 'Jogador' };
    const name = tabNames[type];
    const miniModal = document.createElement('div');
    miniModal.id = 'quick-add-modal';
    miniModal.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(0,0,0,0.55);
        display: flex; align-items: center; justify-content: center;
        padding: 1rem;
    `;
    let formHtml = '';
    if(type === 'competicoes') {
        formHtml = `<div class="form-group"><label>Campeonato *</label><input type="text" id="qa-campeonato" value="${initialValue}"></div><div class="form-group"><label>Tipo *</label><select id="qa-tipo"><option value="Regional">Regional</option><option value="Nacional">Nacional</option><option value="Internacional">Internacional</option></select></div>`;
    } else if(type === 'estadios') {
        const opts = state.adversarios.map(adv => `<option value="${adv.clube}">${adv.clube}</option>`).join('');
        formHtml = `<div class="form-group"><label>Nome *</label><input type="text" id="qa-nome" value="${initialValue}"></div><div class="form-grid"><div class="form-group"><label>Estado</label><input type="text" id="qa-estado"></div><div class="form-group"><label>País</label><input type="text" id="qa-pais" value="Brasil"></div></div><div class="form-group"><label>Mandante</label><select id="qa-mandante"><option value="">Selecione</option>${opts}</select></div><div class="form-group"><label>Foto (Cole)</label><div class="paste-area" id="qa-paste-estadio">Ctrl+V</div><input type="hidden" id="qa-foto"></div>`;
    } else if(type === 'adversarios') {
        formHtml = `<div class="form-group"><label>Clube *</label><input type="text" id="qa-clube" value="${initialValue}"></div><div class="form-grid"><div class="form-group"><label>Estado</label><input type="text" id="qa-estado"></div><div class="form-group"><label>País</label><input type="text" id="qa-pais" value="Brasil"></div></div><div class="form-group"><label>Escudo (URL)</label><input type="text" id="qa-escudo"></div>`;
    } else if(type === 'arbitros') {
        formHtml = `<div class="form-group"><label>Nome *</label><input type="text" id="qa-nome" value="${initialValue}"></div><div class="form-grid"><div class="form-group"><label>País</label><input type="text" id="qa-federacao" value="Brasil"></div></div><div class="form-group"><label>Foto (Cole)</label><div class="paste-area" id="qa-paste-arbitro">Ctrl+V</div><input type="hidden" id="qa-foto"></div>`;
    } else if (type === 'jogadores') {
        formHtml = `
            <div class="form-group"><label>Nome Completo</label><input type="text" id="qa-nome-completo"></div>
            <div class="form-group"><label>Nome de Guerra *</label><input type="text" id="qa-nome-guerra" value="${initialValue}"></div>
            <div class="form-grid">
                <div class="form-group"><label>Posição *</label><select id="qa-pos"><option value="">Selecione</option><option value="Goleiro">Goleiro</option><option value="Lateral-Direito">Lateral-Direito</option><option value="Lateral-Esquerdo">Lateral-Esquerdo</option><option value="Zagueiro">Zagueiro</option><option value="Volante">Volante</option><option value="Meia">Meia</option><option value="Atacante">Atacante</option></select></div>
                <div class="form-group"><label>Temporada</label><input type="text" id="qa-temporada" value="${state.fixedSeason || 2026}"></div>
            </div>
            <div class="form-grid">
                <div class="form-group"><label>Nascimento</label><input type="date" id="qa-nascimento"></div>
                <div class="form-group"><label>Nacionalidade</label><input type="text" id="qa-nacionalidade" value="Brasil"></div>
            </div>
            <div class="form-grid">
                <div class="form-group"><label>Número</label><input type="number" id="qa-numero"></div>
                <div class="form-group" style="align-self:flex-end; padding-bottom:0.5rem;"><label class="checkbox-inline"><input type="checkbox" id="qa-fora-do-elenco"> Fora do elenco atual</label></div>
            </div>
            <div class="form-group"><label>Foto (Cole)</label><div class="paste-area" id="qa-paste-jogador">Ctrl+V</div><input type="hidden" id="qa-foto"></div>
        `;
    }
    miniModal.innerHTML = `
        <div style="background:white; border-radius:12px; width:100%; max-width:520px; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.3); overflow:hidden;">
            <div class="block-header" style="flex-shrink:0;">
                <span>Cadastrar Novo ${name}</span>
                <button onclick="document.getElementById('quick-add-modal').remove()" style="background:none; border:none; cursor:pointer; font-size:1.1rem; color:white;"><i class="fas fa-times"></i></button>
            </div>
            <div class="p-4" style="overflow-y:auto; flex:1;">
                ${formHtml}
                <div class="flex-end" style="margin-top:2rem;">
                    <button type="button" class="btn-primary" onclick="saveQuickAdd('${type}', '${targetInputId}')">Salvar e Continuar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(miniModal);
    if(type === 'estadios') setupPasteHandler('qa-paste-estadio', 'qa-foto');
    if(type === 'arbitros') setupPasteHandler('qa-paste-arbitro', 'qa-foto');
    if(type === 'jogadores') setupPasteHandler('qa-paste-jogador', 'qa-foto');
};

window.saveQuickAdd = (type, targetInputId) => {
    let item = { id: Date.now() };
    if (type === 'adversarios') {
        const clubeNome = document.getElementById('qa-clube').value.trim();
        const existe = state.adversarios.some(adv => adv.clube.trim().toLowerCase() === clubeNome.toLowerCase());
        if (existe) {
            showToast(`O clube "${clubeNome}" já está cadastrado.`, 'error');
            return;
        }
        item.clube = clubeNome;
        item.estado = document.getElementById('qa-estado').value;
        item.pais = document.getElementById('qa-pais').value;
        item.escudo = document.getElementById('qa-escudo').value || 'https://via.placeholder.com/32';
    }
    else if(type === 'competicoes') { item.campeonato = document.getElementById('qa-campeonato').value; item.tipo = document.getElementById('qa-tipo').value; }
    else if(type === 'estadios') { item.nome = document.getElementById('qa-nome').value; item.estado = document.getElementById('qa-estado').value; item.pais = document.getElementById('qa-pais').value; item.mandante = document.getElementById('qa-mandante').value; item.foto = document.getElementById('qa-foto').value || 'https://via.placeholder.com/40'; }
    else if(type === 'arbitros') { item.nome = document.getElementById('qa-nome').value; item.federacao = document.getElementById('qa-federacao').value || 'Brasil'; item.foto = document.getElementById('qa-foto').value || 'https://via.placeholder.com/40'; }
    else if(type === 'jogadores') { 
        item.nome_guerra = document.getElementById('qa-nome-guerra').value; 
        item.nome_completo = document.getElementById('qa-nome-completo').value; 
        item.posicao = document.getElementById('qa-pos').value; 
        item.temporada = document.getElementById('qa-temporada').value; 
        item.nascimento = document.getElementById('qa-nascimento').value || ''; 
        item.nacionalidade = document.getElementById('qa-nacionalidade').value || 'Brasil'; 
        item.numero = document.getElementById('qa-numero').value || ''; 
        item.foraDoElenco = document.getElementById('qa-fora-do-elenco').checked; 
        item.foto = document.getElementById('qa-foto').value || 'https://via.placeholder.com/40'; 
    }
    state[type].push(item); saveData(type, [item]);
    const inp = document.getElementById(targetInputId); 
    if(inp) { 
        inp.value = item.campeonato || item.nome || item.clube || item.nome_guerra; 
        inp.dispatchEvent(new Event('change')); 
        if (type === 'arbitros' && ['game-arbitro', 'game-assistente1', 'game-assistente2', 'game-var'].includes(targetInputId)) {
            updateRefereeInfo();
        }
    }
    document.getElementById('quick-add-modal').remove();
};

const updateRefereeInfo = () => {
    const fields = [
        { nameId: 'game-arbitro', imgId: 'img-game-arbitro' },
        { nameId: 'game-assistente1', imgId: 'img-game-assistente1' },
        { nameId: 'game-assistente2', imgId: 'img-game-assistente2' },
        { nameId: 'game-var', imgId: 'img-game-var' }
    ];

    fields.forEach(f => {
        const name = document.getElementById(f.nameId)?.value || '';
        const img = document.getElementById(f.imgId);
        if (!img) return;

        if (!name || name === 'N/I') {
            img.src = DEFAULT_REF_PHOTO;
            if (f.nameId === 'game-arbitro') {
                const fed = document.getElementById('game-arbitro-federacao');
                if (fed) fed.value = '';
            }
            return;
        }

        const arb = state.arbitros.find(a => a.nome === name);
        if (arb) {
            img.src = arb.foto || DEFAULT_REF_PHOTO;
            if (f.nameId === 'game-arbitro') {
                const fed = document.getElementById('game-arbitro-federacao');
                if (fed) fed.value = arb.federacao || '';
            }
        } else {
            img.src = DEFAULT_REF_PHOTO;
        }
    });
};

const renderNovoJogoPage = (jogoToEdit = null) => {
    state.isFormActive = true; // Ativa trava de segurança
    state.editingJogoId = jogoToEdit ? jogoToEdit.id : null;
    showSection('novo-jogo');
    novoJogoContainer.innerHTML = `
        <div class="p-4" style="background: white; border-radius: var(--border-radius); box-shadow: var(--shadow);">
            <div class="block-header" style="background: none; color: var(--text-main); padding: 0 0 1rem 0; border-bottom: 2px solid #eee; margin-bottom: 2rem;">
                <div style="display:flex; align-items:center; gap:1rem;">
                    <button class="btn-secondary" style="padding:0.4rem 1rem; font-size:0.8rem;" id="btn-back-form">
                        <i class="fas fa-arrow-left"></i> Voltar
                    </button>
                    <h2 style="margin:0;">${jogoToEdit ? 'Editar Jogo' : 'Novo Jogo'}</h2>
                </div>
            </div>
            <form id="multi-step-form">
                <div class="form-block active" id="block-1">
                    <div class="stats-section"><div class="stats-section-title">Dados Básicos do Jogo</div><div class="p-4">
                        <div class="form-grid"><div class="form-group"><label>Temporada *</label><input type="text" name="temporada" id="game-temporada" required value="${jogoToEdit?.temporada || state.fixedSeason || new Date().getFullYear()}"><label class="checkbox-inline"><input type="checkbox" id="fix-game-season" ${state.isSeasonFixed ? 'checked' : ''}> Fixar Temporada</label></div><div class="form-group"><label>Data *</label><input type="date" name="data" id="game-data" required value="${jogoToEdit?.data || (state.fixedSeason ? `${state.fixedSeason}-01-01` : `${new Date().getFullYear()}-01-01`)}"></div><div class="form-group"><label>Rodada *</label><input type="text" name="rodada" placeholder="Ex: 1ª rodada" required value="${jogoToEdit?.rodada || ''}"></div></div>
                        <div class="form-grid"><div class="form-group"><label>Campeonato *</label><input type="text" name="campeonato" id="game-campeonato" required value="${jogoToEdit?.campeonato || state.fixedCampeonato}"><label class="checkbox-inline"><input type="checkbox" id="fix-game-camp" ${state.isCampeonatoFixed ? 'checked' : ''}> Fixar Campeonato</label></div><div class="form-group"><label>Estádio *</label><input type="text" name="estadio" id="game-estadio" required value="${jogoToEdit?.estadio || ''}"></div><div class="form-group"><label>Estado do Estádio</label><input type="text" name="estadioEstado" id="game-estadio-estado" readonly value="${jogoToEdit?.estadioEstado || ''}"></div></div>
                        <div class="form-grid"><div class="form-group"><label>País do Estádio</label><input type="text" name="estadioPais" id="game-estadio-pais" readonly value="${jogoToEdit?.estadioPais || ''}"></div><div class="form-group"><label>Casa *</label><input type="text" name="casa" id="game-casa" required value="${jogoToEdit?.casa || ''}"></div><div class="form-group"><label>Fora *</label><input type="text" name="fora" id="game-fora" required value="${jogoToEdit?.fora || ''}"></div></div>
                        <div class="form-grid"><div class="form-group"><label>Gols Casa *</label><input type="number" name="golsCasa" id="game-gols-casa" required value="${jogoToEdit?.golsCasa ?? 0}"></div><div class="form-group"><label>Gols Fora *</label><input type="number" name="golsFora" id="game-gols-fora" required value="${jogoToEdit?.golsFora ?? 0}"></div><div class="form-group"><label>Vencedor</label><input type="text" name="vencedor" id="game-vencedor" readonly value="${jogoToEdit?.vencedor || (jogoToEdit ? '' : 'Empate')}"></div></div>
                    </div></div><div class="flex-end"><button type="button" class="btn-primary" onclick="nextBlock(2)">Avançar <i class="fas fa-chevron-right"></i></button></div>
                </div>
                <div class="form-block" id="block-2">
                    <div class="stats-section"><div class="stats-section-title">Arbitragem e Público</div><div class="p-4">
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Árbitro *</label>
                                <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.3rem;">
                                    <img id="img-game-arbitro" src="${DEFAULT_REF_PHOTO}" style="width:38px; height:38px; border-radius:50%; object-fit:cover; border:1px solid #ddd;">
                                    <input type="text" name="arbitro" id="game-arbitro" required value="${jogoToEdit?.arbitro || ''}" style="margin:0;">
                                </div>
                                <label class="checkbox-inline" style="margin-top:0.5rem;"><input type="checkbox" id="game-arb-ni" ${jogoToEdit?.arbitro === 'N/I' ? 'checked' : ''}> Não identificado</label>
                            </div>
                            <div class="form-group">
                                <label>País do Árbitro</label>
                                <input type="text" name="arbitroFederacao" id="game-arbitro-federacao" value="${jogoToEdit?.arbitroFederacao || ''}">
                            </div>
                        </div>
                        <div class="form-grid">
                            <div class="form-group">
                                <label>Assistente 1</label>
                                <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.3rem;">
                                    <img id="img-game-assistente1" src="${DEFAULT_REF_PHOTO}" style="width:38px; height:38px; border-radius:50%; object-fit:cover; border:1px solid #ddd;">
                                    <input type="text" name="assistente1" id="game-assistente1" value="${jogoToEdit?.assistente1 || ''}" style="margin:0;">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Assistente 2</label>
                                <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.3rem;">
                                    <img id="img-game-assistente2" src="${DEFAULT_REF_PHOTO}" style="width:38px; height:38px; border-radius:50%; object-fit:cover; border:1px solid #ddd;">
                                    <input type="text" name="assistente2" id="game-assistente2" value="${jogoToEdit?.assistente2 || ''}" style="margin:0;">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>VAR</label>
                                <div style="display:flex; align-items:center; gap:0.5rem; margin-top:0.3rem;">
                                    <img id="img-game-var" src="${DEFAULT_REF_PHOTO}" style="width:38px; height:38px; border-radius:50%; object-fit:cover; border:1px solid #ddd;">
                                    <input type="text" name="varArbitro" id="game-var" value="${jogoToEdit?.varArbitro || ''}" style="margin:0;">
                                </div>
                            </div>
                        </div>
                        <div class="form-grid"><div class="form-group"><label>Público *</label><input type="text" name="publico" id="game-publico" required value="${jogoToEdit?.publico === 'N/I' ? '' : formatPublico(jogoToEdit?.publico)}"><label class="checkbox-inline"><input type="checkbox" id="game-pub-ni" ${jogoToEdit?.publico === 'N/I' ? 'checked' : ''}> Não identificado</label></div><div class="form-group"><label>Renda (R$) *</label><input type="text" name="renda" id="game-renda" required value="${jogoToEdit?.renda === 'N/I' ? '' : formatRenda(jogoToEdit?.renda)}"><label class="checkbox-inline"><input type="checkbox" id="game-ren-ni" ${jogoToEdit?.renda === 'N/I' ? 'checked' : ''}> Não identificada</label></div><div class="form-group"><label>Ticket Médio</label><input type="text" name="ticketMedio" id="game-ticket-label" readonly value="N/I"><label class="checkbox-inline"><input type="checkbox" id="game-portoes-fechados" ${jogoToEdit?.portoesFechados ? 'checked' : ''}> Portões fechados</label></div></div>
                        <div class="form-grid"><div class="form-group"><label>Técnico do Atlético *</label><input type="text" name="tecnicoGalo" id="game-tecnico-galo" required value="${jogoToEdit?.tecnicoGalo || state.fixedTecnicoAtle}"><label class="checkbox-inline"><input type="checkbox" id="fix-game-tec" ${state.isTecnicoFixed ? 'checked' : ''}> Fixar técnico</label></div><div class="form-group"><label>Técnico do Adversário *</label><input type="text" name="tecnicoAdv" id="game-tecnico-adv" required value="${jogoToEdit?.tecnicoAdv || ''}"></div></div>
                    </div></div><div class="flex-end"><button type="button" class="btn-secondary" onclick="nextBlock(1)">Voltar</button><button type="button" class="btn-primary" onclick="nextBlock(3)">Avançar <i class="fas fa-chevron-right"></i></button></div>
                </div>
                <div class="form-block" id="block-3"><div class="stats-section"><div class="stats-section-title">Pênaltis</div><div class="p-4"><div class="form-group" style="width:200px;"><label>Pênaltis</label><select name="penaltis" id="game-penaltis-toggle"><option value="Não" ${jogoToEdit?.penaltis === 'Não' ? 'selected' : ''}>Não</option><option value="Sim" ${jogoToEdit?.penaltis === 'Sim' ? 'selected' : ''}>Sim</option></select></div><div id="penaltis-placar" style="display:${jogoToEdit?.penaltis === 'Sim' ? 'grid' : 'none'};" class="form-grid"><div class="form-group"><label>Gols Pênaltis Casa</label><input type="number" name="penaltisCasa" id="game-pen-casa" value="${jogoToEdit?.penaltisCasa || 0}"></div><div class="form-group"><label>Gols Pênaltis Fora</label><input type="number" name="penaltisFora" id="game-pen-fora" value="${jogoToEdit?.penaltisFora || 0}"></div></div><div class="form-group" style="margin-top:2rem;"><label>Observações</label><textarea name="observacao" rows="6" placeholder="Observações da partida...">${jogoToEdit?.observacao || ''}</textarea></div></div></div><div class="flex-end"><button type="button" class="btn-secondary" onclick="nextBlock(2)">Voltar</button><button type="button" class="btn-primary" onclick="nextBlock(4)">Avançar <i class="fas fa-chevron-right"></i></button></div></div>
                <div class="form-block" id="block-4"><div class="stats-section"><div class="stats-section-title">Cartões - Atlético <label style="font-size:0.8rem; font-weight:normal;"><input type="checkbox" id="no-cards-galo"> Nenhum cartão</label></div><table class="stats-table"><thead><tr><th class="col-player">Jogador *</th><th class="col-med">Posição *</th><th class="col-mini">Amarelo *</th><th class="col-mini">Vermelho *</th><th class="col-mini"></th></tr></thead><tbody id="cards-galo-body"></tbody></table><button type="button" class="add-row-btn" style="margin-top:1rem;" onclick="addCardRow('galo')">+ Adicionar Cartão</button></div><div class="stats-section"><div class="stats-section-title">Cartões - Adversário <label style="font-size:0.8rem; font-weight:normal;"><input type="checkbox" id="no-cards-adv"> Nenhum cartão</label></div><table class="stats-table"><thead><tr><th class="col-player">Jogador *</th><th class="col-mini">Amarelo *</th><th class="col-mini">Vermelho *</th><th class="col-mini"></th></tr></thead><tbody id="cards-adv-body"></tbody></table><button type="button" class="add-row-btn" style="margin-top:1rem;" onclick="addCardRow('adv')">+ Adicionar Cartão</button></div><div class="flex-end"><button type="button" class="btn-secondary" onclick="nextBlock(3)">Voltar</button><button type="button" class="btn-primary" onclick="nextBlock(5)">Avançar <i class="fas fa-chevron-right"></i></button></div></div>
                <div class="form-block" id="block-5">
                    <div class="stats-section">
                        <div class="stats-section-title">Escalação do Atlético</div>
                        <div style="overflow-x: auto;">
                            <table class="stats-table">
                                <thead>
                                    <tr>
                                        <th class="col-mini">Foto</th>
                                        <th class="col-player">Jogador *</th>
                                        <th class="col-med">Posição *</th>
                                        <th class="col-mini">Idade</th>
                                        <th class="col-mini" title="Gols Marcados">GM *</th>
                                        <th class="col-small">Min. GM</th>
                                        <th class="col-small">T. GM</th>
                                        <th class="col-mini" title="Gols Sofridos">GS *</th>
                                        <th class="col-small">Min. GS</th>
                                        <th class="col-small">T. GS</th>
                                        <th class="col-mini">Titular</th>
                                        <th class="col-mini">Subst.</th>
                                        <th class="col-mini"></th>
                                    </tr>
                                </thead>
                                <tbody id="lineup-galo-body"></tbody>
                            </table>
                        </div>
                        <button type="button" class="add-row-btn" style="margin-top:1rem;" onclick="addLineupRow('galo')">+ Adicionar Jogador</button>
                    </div>

                    <div class="stats-section" style="margin-top:2rem;">
                        <div class="stats-section-title">Gols Contra a favor do Atlético</div>
                        <div class="p-4">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label>Quantidade de Gols Contra</label>
                                    <input type="number" id="game-gc-favor" value="${jogoToEdit?.gcFavorCount || 0}" min="0" style="max-width:200px;">
                                    <div id="gc-favor-details" style="margin-top:1rem;"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="stats-section" style="margin-top:2rem;">
                        <div class="stats-section-title">Gols Contra contra o Atlético</div>
                        <div class="p-4">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label>Quantidade de Gols Contra</label>
                                    <input type="number" id="game-gc-contra" value="${jogoToEdit?.gcContraCount || 0}" min="0" style="max-width:200px;">
                                    <div id="gc-contra-details" style="margin-top:1rem;"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="flex-end">
                        <button type="button" class="btn-secondary" onclick="nextBlock(4)">Voltar</button>
                        <button type="button" id="btn-salvar-jogo" class="btn-primary" onclick="saveNewJogo()">${jogoToEdit ? 'Atualizar' : 'Cadastrar Jogo'}</button>
                    </div>
                </div>
            </form>
        </div>
    `;
    setupAutocomplete('game-campeonato', 'competicoes', 'campeonato');
    setupAutocomplete('game-estadio', 'estadios', 'nome');
    setupAutocomplete('game-arbitro', 'arbitros', 'nome');
    document.getElementById('game-arbitro').addEventListener('blur', updateRefereeInfo);
    document.getElementById('game-data').addEventListener('change', updateRefereeInfo);

    // Sync the year in game-data when temporada changes
    document.getElementById('game-temporada').addEventListener('input', () => {
        const season = document.getElementById('game-temporada').value.trim();
        if (/^\d{4}$/.test(season)) {
            const dataInp = document.getElementById('game-data');
            const parts = dataInp.value ? dataInp.value.split('-') : [];
            const month = parts[1] || '01';
            const day = parts[2] || '01';
            dataInp.value = `${season}-${month}-${day}`;

            // Ajuste dinâmico de linhas para NOVO jogo
            if (!state.editingJogoId) {
                const targetCount = parseInt(season) <= 2019 ? 14 : 16;
                const currentRows = document.querySelectorAll('#lineup-galo-body tr').length;
                if (currentRows !== targetCount) {
                    document.getElementById('lineup-galo-body').innerHTML = '';
                    for (let i = 0; i < targetCount; i++) addLineupRow('galo');
                }
            }
        }
    });

    setupAutocomplete('game-assistente1', 'arbitros', 'nome');
    document.getElementById('game-assistente1').addEventListener('blur', updateRefereeInfo);

    setupAutocomplete('game-assistente2', 'arbitros', 'nome');
    document.getElementById('game-assistente2').addEventListener('blur', updateRefereeInfo);

    setupAutocomplete('game-var', 'arbitros', 'nome');
    document.getElementById('game-var').addEventListener('blur', updateRefereeInfo);

    // Initial photo load if editing
    setTimeout(updateRefereeInfo, 100);
    setupAutocomplete('game-fora', 'adversarios', 'clube');
    setupAutocomplete('game-casa', 'adversarios', 'clube');
    const estInp = document.getElementById('game-estadio'); 
    estInp.addEventListener('change', () => { 
        const est = state.estadios.find(e => e.nome === estInp.value); 
        if (est) { 
            document.getElementById('game-estadio-estado').value = est.estado; 
            document.getElementById('game-estadio-pais').value = est.pais; 
            if (est.mandante && est.mandante !== 'Atlético' && est.mandante !== 'Atlético-MG') { 
                document.getElementById('game-casa').value = est.mandante; 
                document.getElementById('game-fora').value = 'Atlético'; 
            } else if (!est.mandante) {
                // Sem mandante definido: Atlético no Fora, Casa vazio
                document.getElementById('game-casa').value = ''; 
                document.getElementById('game-fora').value = 'Atlético';
            } else {
                // Mandante é o Atlético
                document.getElementById('game-casa').value = est.mandante; 
                document.getElementById('game-fora').value = '';
            }
        }
    });
    const updWinner = () => { const c = parseInt(document.getElementById('game-gols-casa').value)||0, f = parseInt(document.getElementById('game-gols-fora').value)||0; const casa = document.getElementById('game-casa').value, fora = document.getElementById('game-fora').value; const venced = document.getElementById('game-vencedor'); if (c > f) venced.value = casa || 'Casa'; else if (f > c) venced.value = fora || 'Fora'; else venced.value = 'Empate'; };
    ['game-gols-casa', 'game-gols-fora', 'game-casa', 'game-fora'].forEach(id => document.getElementById(id).addEventListener('input', updWinner));
    const updTicket = () => { 
        const renCk = document.getElementById('game-ren-ni').checked; 
        const pubCk = document.getElementById('game-pub-ni').checked; 
        const label = document.getElementById('game-ticket-label'); 
        if (renCk || pubCk) { label.value = 'N/I'; return; } 
        const renVal = document.getElementById('game-renda').value;
        const pubVal = document.getElementById('game-publico').value;
        const r = (parseInt(String(renVal).replace(/\D/g, '')) || 0) / 100;
        const p = parseInt(String(pubVal).replace(/\D/g, '')) || 0;
        label.value = (p > 0) ? formatCurrency(r/p) : 'N/I'; 
    };
    ['game-renda', 'game-publico', 'game-ren-ni', 'game-pub-ni'].forEach(id => document.getElementById(id)?.addEventListener('input', updTicket));
    ['game-ren-ni', 'game-pub-ni'].forEach(id => document.getElementById(id)?.addEventListener('change', updTicket));
    
    // Header Back navigation logic
    document.getElementById('btn-back-form').onclick = () => {
        const activeBlock = document.querySelector('.form-block.active');
        const blockNum = parseInt(activeBlock?.id.split('-')[1] || 1);
        if (blockNum > 1) {
            nextBlock(blockNum - 1);
        } else {
            state.isFormActive = false; // Desativa trava ao cancelar/voltar
            showSection('jogos');
        }
    };
    
    // Gols Contra logic
    const setupGCFields = (inputId, containerId, dataList = null) => {
        const inp = document.getElementById(inputId);
        const cont = document.getElementById(containerId);
        if (!inp || !cont) return;
        
        const updateGCHtml = () => {
            const count = parseInt(inp.value || 0);
            const currentInputs = cont.querySelectorAll('.gc-wrapper').length;
            
            // Se o contador diminuir, removemos os últimos
            if (count < currentInputs) {
                for (let i = currentInputs; i > count; i--) {
                    cont.lastElementChild?.remove();
                }
            } 
            // Se o contador aumentar, adicionamos novos sem apagar os já preenchidos
            else if (count > currentInputs) {
                for (let i = currentInputs; i < count; i++) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'gc-wrapper';
                    wrapper.style.display = 'flex'; wrapper.style.alignItems = 'center'; wrapper.style.gap = '0.3rem';
                    wrapper.style.marginTop = '0.3rem';
                    wrapper.innerHTML = `
                        <input type="number" class="gc-min" placeholder="Min" style="width:60px; padding:0.2rem;" value="${dataList?.[i]?.min || ''}">
                        <select class="gc-tempo" style="padding:0.2rem;"><option value="1" ${dataList?.[i]?.tempo === '1' ? 'selected' : ''}>1T</option><option value="2" ${dataList?.[i]?.tempo === '2' ? 'selected' : ''}>2T</option></select>
                        <span style="font-size:0.7rem; color:#666;">${inputId.includes('favor') ? 'Pro' : 'Contra'}</span>
                    `;
                    
                    const mi = wrapper.querySelector('.gc-min');
                    const ts = wrapper.querySelector('.gc-tempo');
                    mi.addEventListener('input', (e) => {
                        const t = convertMatchTime(e.target.value);
                        if (t.tempo === 2) { e.target.value = t.min; ts.value = '2'; }
                    });
                    
                    cont.appendChild(wrapper);
                }
            }
        };
        
        inp.addEventListener('input', updateGCHtml);
        inp.addEventListener('change', updateGCHtml); // Backup para mudanças via botões
        if(dataList && dataList.length > 0) updateGCHtml();
    };

    setupGCFields('game-gc-favor', 'gc-favor-details', jogoToEdit?.gcFavorList);
    setupGCFields('game-gc-contra', 'gc-contra-details', jogoToEdit?.gcContraList);

    const setupNIToggle = (checkId, inputId) => {
        const ck = document.getElementById(checkId); const inp = document.getElementById(inputId);
        if(!ck || !inp) return;
        ck.onchange = () => {
            const isChecked = ck.checked;
            inp.disabled = isChecked;
            inp.parentElement.classList.toggle('disabled', isChecked);
            if(isChecked) {
                inp.dataset.oldValue = inp.value;
                inp.value = '';
            } else if (inp.dataset.oldValue) {
                // Restore value if it was previously set, but only if current is empty
                if(!inp.value) inp.value = inp.dataset.oldValue;
            }
            updTicket();
        };
        // Initial state
        if(ck.checked) { inp.disabled = true; inp.parentElement.classList.add('disabled'); }
    };
    setupNIToggle('game-arb-ni', 'game-arbitro'); setupNIToggle('game-pub-ni', 'game-publico'); setupNIToggle('game-ren-ni', 'game-renda');
    
    const ckPF = document.getElementById('game-portoes-fechados');
    if(ckPF) {
        ckPF.onchange = () => {
            const isChecked = ckPF.checked;
            const inP = document.getElementById('game-publico');
            const inR = document.getElementById('game-renda');
            const ckPNI = document.getElementById('game-pub-ni');
            const ckRNI = document.getElementById('game-ren-ni');
            
            if(isChecked) {
                if(ckPNI) ckPNI.checked = false;
                if(ckRNI) ckRNI.checked = false;
                inP.value = 0;
                inR.value = 0;
                inP.disabled = true;
                inR.disabled = true;
                inP.parentElement.classList.add('disabled');
                inR.parentElement.classList.add('disabled');
            } else {
                inP.disabled = false;
                inR.disabled = false;
                inP.parentElement.classList.remove('disabled');
                inR.parentElement.classList.remove('disabled');
            }
            updTicket();
        };

        // Listeners para máscaras de Público e Renda
        const inP = document.getElementById('game-publico');
        const inR = document.getElementById('game-renda');

        if (inP) {
            inP.addEventListener('input', (e) => {
                let val = e.target.value.replace(/\D/g, '');
                if (val) {
                    e.target.value = Number(val).toLocaleString('pt-BR');
                }
            });
        }

        if (inR) {
            inR.addEventListener('input', (e) => {
                let val = e.target.value.replace(/\D/g, '');
                if (val) {
                    const num = parseInt(val) / 100;
                    e.target.value = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                }
            });
        }

        if(ckPF.checked) {
            document.getElementById('game-publico').disabled = true;
            document.getElementById('game-renda').disabled = true;
            document.getElementById('game-publico').parentElement.classList.add('disabled');
            document.getElementById('game-renda').parentElement.classList.add('disabled');
        }
    }
    document.getElementById('game-penaltis-toggle').addEventListener('change', (e) => { document.getElementById('penaltis-placar').style.display = e.target.value === 'Sim' ? 'grid' : 'none'; });
    if(!jogoToEdit) {
        const seasonVal = parseInt(document.getElementById('game-temporada').value) || 2026;
        const initialRows = seasonVal <= 2019 ? 14 : 16;
        for(let i=0; i<initialRows; i++) addLineupRow('galo');
    } else {
        jogoToEdit.cartoesGalo?.forEach(c => addCardRow('galo', c));
        jogoToEdit.cartoesAdv?.forEach(c => addCardRow('adv', c));
        jogoToEdit.lineupGalo?.forEach(l => addLineupRow('galo', l));
        updTicket();
        updWinner();
    }
};

const addCardRow = (team, data = null) => {
    const isAdv = team === 'adv'; const tbody = document.getElementById(`cards-${team}-body`); const row = document.createElement('tr'); const season = document.getElementById('game-temporada').value;
    const yellowVal = data ? data.amarelo : 1;
    row.innerHTML = `<td class="col-player">${isAdv ? '<input type="text" placeholder="Adversário" class="card-player-inp" value="Adversário" required>' : `<div class="autocomplete-container"><input type="text" placeholder="Jogador" class="card-player-inp" value="${data?.jogador || ''}" required></div>`}</td>${isAdv ? '' : `<td><input type="text" class="pos-inp" readonly value="${data?.posicao || '-' }" required></td>`}<td><select class="yellow-sel" required><option value="0" ${yellowVal == 0 ? 'selected' : '' }>0</option><option value="1" ${yellowVal == 1 ? 'selected' : '' }>1</option></select></td><td><select class="red-sel" required><option value="0" ${data?.red == 0 ? 'selected' : '' }>0</option><option value="1" ${data?.red == 1 ? 'selected' : '' }>1</option></select></td><td class="col-mini"><button type="button" class="btn-icon" onclick="removeLineupRow(this)" title="Remover da lista"><i class="fas fa-times" style="color:#7f8c8d;"></i></button></td>`;
    
    // TAB behavior for cards
    const inputsOnRow = row.querySelectorAll('input, select');
    inputsOnRow.forEach(inpRow => {
        inpRow.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                // Se for a coluna jogador (classe card-player-inp), pula para linha de baixo
                if (inpRow.classList.contains('card-player-inp')) {
                    e.preventDefault();
                    const targetTr = e.shiftKey ? row.previousElementSibling : row.nextElementSibling;
                    if (targetTr) {
                        const targetInp = targetTr.querySelector('.card-player-inp');
                        if (targetInp) targetInp.focus();
                    }
                }
                // Outros campos (selects) mantêm comportamento padrão do Tab (muda de coluna)
            }
        });
    });

    if(!isAdv) { 
        const inp = row.querySelector('.card-player-inp'); 
        const id = 'cq-'+Date.now()+Math.random(); 
        inp.id = id; 
        setTimeout(() => { 
            setupAutocomplete(id, 'jogadores', 'nome_guerra', 
                p => {
                    const gS = document.getElementById('game-temporada')?.value?.trim();
                    const pS = String(p.temporada || '').trim();
                    return (!gS || pS === gS) && p.posicao !== 'Técnico';
                },
                (res) => {
                    const nextTr = row.nextElementSibling;
                    if (nextTr) {
                        const nextInp = nextTr.querySelector('.card-player-inp');
                        if (nextInp) nextInp.focus();
                    }
                }
            ); 
            
            inp.addEventListener('blur', () => { 
                const currentSeason = document.getElementById('game-temporada').value;
                const player = state.jogadores.find(j => j.nome_guerra === inp.value && String(j.temporada) === String(currentSeason)); 
                if(player) { 
                    const posInp = row.querySelector('.pos-inp');
                    if (posInp) posInp.value = player.posicao; 
                } 
            }); 
        }, 10); 
    }
    tbody.appendChild(row);
};

const addLineupRow = (team, data = null) => {
    const isAdv = team === 'adv';
    const tbody = document.getElementById(`lineup-${team}-body`);
    const row = document.createElement('tr');
    const season = document.getElementById('game-temporada').value;

    row.innerHTML = `
        <td class="col-mini"><div class="player-photo-td"><img src="${data?.foto || 'https://via.placeholder.com/35'}" class="mini-foto"></div></td>
        <td class="col-player">${isAdv ? `<input type="text" placeholder="Jogador" value="${data?.jogador || ''}" required>` : `<div class="autocomplete-container"><input type="text" placeholder="Jogador" class="line-player-inp" value="${data?.jogador || ''}" required></div>`}</td>
        <td class="col-med"><input type="text" class="pos-inp" ${isAdv ? '' : 'readonly'} value="${data?.posicao || '-'}" required></td>
        <td class="col-mini"><input type="number" class="goals-inp" value="${data?.golsCount || 0}" style="width:40px;" required></td>
        <td class="min-goals-td col-small"></td>
        <td class="tempo-goals-td col-small"></td>
        <td class="col-mini"><input type="number" class="gs-inp" value="${data?.gsCount || 0}" style="width:40px;" required></td>
        <td class="min-gs-td col-small"></td>
        <td class="tempo-gs-td col-small"></td>
        <td class="col-mini"><input type="checkbox" class="titular-ck" ${(data ? data.titular : true) ? 'checked' : ''}></td>
        <td class="col-mini"><input type="checkbox" class="sub-ck" ${(data ? data.substituido : false) ? 'checked' : ''}></td>
        <td class="col-mini"><button type="button" class="btn-icon" onclick="removeLineupRow(this)" title="Remover da lista"><i class="fas fa-user-minus" style="color:#7f8c8d;"></i></button></td>
    `;
    
    const gInp = row.querySelector('.goals-inp'), minCont = row.querySelector('.min-goals-td'), tempoCont = row.querySelector('.tempo-goals-td');
    const updateGoals = () => { 
        minCont.innerHTML = ''; tempoCont.innerHTML = ''; 
        for(let i=0; i<parseInt(gInp.value || 0); i++) { 
            const mi = document.createElement('input'); mi.type='number'; mi.placeholder='Min'; mi.className='min-g-inp'; mi.value = data?.golsMin?.[i] || ''; 
            const ts = document.createElement('select'); ts.innerHTML = '<option value="1">1T</option><option value="2">2T</option>'; ts.value = data?.golsTempo?.[i] || '1'; 
            mi.addEventListener('input', (e) => { const t = convertMatchTime(e.target.value); if(t.tempo === 2) { e.target.value = t.min; ts.value = '2'; }}); 
            minCont.appendChild(mi); tempoCont.appendChild(ts); 
        } 
    };
    gInp.addEventListener('input', updateGoals); if(data?.golsCount > 0) updateGoals();

    const gsInp = row.querySelector('.gs-inp'), minGsCont = row.querySelector('.min-gs-td'), tempoGsCont = row.querySelector('.tempo-gs-td');
    const updateGS = () => {
        minGsCont.innerHTML = ''; tempoGsCont.innerHTML = '';
        for(let i=0; i<parseInt(gsInp.value || 0); i++) {
            const mi = document.createElement('input'); mi.type='number'; mi.placeholder='Min'; mi.className='min-gs-inp'; mi.value = data?.gsMin?.[i] || '';
            const ts = document.createElement('select'); ts.innerHTML = '<option value="1">1T</option><option value="2">2T</option>'; ts.value = data?.gsTempo?.[i] || '1';
            mi.addEventListener('input', (e) => { const t = convertMatchTime(e.target.value); if(t.tempo === 2) { e.target.value = t.min; ts.value = '2'; }});
            minGsCont.appendChild(mi); tempoGsCont.appendChild(ts);
        }
    };
    gsInp.addEventListener('input', updateGS); if(data?.gsCount > 0) updateGS();

    if(!isAdv) { 
        const inp = row.querySelector('.line-player-inp'); 
        const id = 'lq-'+Date.now()+Math.random(); 
        inp.id = id; 
        setTimeout(() => { 
            setupAutocomplete(id, 'jogadores', 'nome_guerra', 
                p => {
                    const gS = document.getElementById('game-temporada')?.value?.trim();
                    const pS = String(p.temporada || '').trim();
                    return (!gS || pS === gS) && p.posicao !== 'Técnico';
                },
                (res) => {
                    const nextTr = row.nextElementSibling;
                    if (nextTr) {
                        const nextInp = nextTr.querySelector('.line-player-inp');
                        if (nextInp) nextInp.focus();
                    }
                }
            ); 
            
            // Vertical Tab Navigation Logic for all inputs in the row
            const inputs = row.querySelectorAll('input, select');
            inputs.forEach(inp => {
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Tab') {
                        // Se for campo de Gols (GM) ou GS, deixa o Tab padrão (ir para próxima coluna)
                        if (inp.classList.contains('goals-inp') || inp.classList.contains('gs-inp')) return;

                        e.preventDefault();
                        const targetTr = e.shiftKey ? row.previousElementSibling : row.nextElementSibling;
                        if (targetTr) {
                            const colIndex = Array.from(row.children).indexOf(inp.closest('td'));
                            const targetTd = targetTr.children[colIndex];
                            if (targetTd) {
                                const targetInp = targetTd.querySelector('input, select');
                                if (targetInp) {
                                    targetInp.focus();
                                    if (targetInp.select) targetInp.select();
                                }
                            }
                        }
                    }
                });
            });

            inp.addEventListener('blur', () => { 
                const currentSeason = document.getElementById('game-temporada').value;
                const p = state.jogadores.find(j => j.nome_guerra === inp.value && String(j.temporada) === String(currentSeason)); 
                if(p) { 
                    row.querySelector('.mini-foto').src = p.foto; 
                    row.querySelector('.pos-inp').value = p.posicao; 
                } 
            }); 
        }, 10); 
    }
    tbody.appendChild(row);
};

const removeLineupRow = (btn) => {
    if (confirm('Deseja remover este jogador da lista? (Esta ação NÃO exclui o cadastro global do jogador)')) {
        btn.closest('tr').remove();
    }
};

const saveNewJogo = () => {
    const btnSalvar = document.getElementById('btn-salvar-jogo');
    if (btnSalvar) {
        if (btnSalvar.disabled) return;
        btnSalvar.disabled = true;
        const originalText = btnSalvar.innerText;
        btnSalvar.innerText = 'Salvando...';
        btnSalvar.dataset.originalText = originalText;
    }
    const resetBtn = () => {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerText = btnSalvar.dataset.originalText || 'Cadastrar Jogo';
        }
    };

    const fd = new FormData(document.getElementById('multi-step-form'));
    const jogo = { id: state.editingJogoId || Date.now() }; fd.forEach((v, k) => jogo[k] = v);
    if(document.getElementById('game-arb-ni').checked) jogo.arbitro = 'N/I';
    
    // Processar Público e Renda (remover máscaras de forma robusta)
    if(document.getElementById('game-pub-ni').checked) {
        jogo.publico = 'N/I';
    } else {
        const pubVal = document.getElementById('game-publico').value;
        jogo.publico = parseInt(String(pubVal).replace(/\D/g, '')) || 0;
    }
    if(document.getElementById('game-ren-ni').checked) {
        jogo.renda = 'N/I';
    } else {
        const renVal = document.getElementById('game-renda').value;
        jogo.renda = (parseInt(String(renVal).replace(/\D/g, '')) || 0) / 100;
    }

    jogo.portoesFechados = document.getElementById('game-portoes-fechados')?.checked || false;
    state.isSeasonFixed = document.getElementById('fix-game-season').checked; state.fixedSeason = jogo.temporada;
    state.isCampeonatoFixed = document.getElementById('fix-game-camp').checked; state.fixedCampeonato = jogo.campeonato;
    state.isTecnicoFixed = document.getElementById('fix-game-tec').checked; state.fixedTecnicoAtle = jogo.tecnicoGalo;
    saveData('fixedSeason', state.fixedSeason); saveData('isSeasonFixed', state.isSeasonFixed);
    saveData('fixedCampeonato', state.fixedCampeonato); saveData('isCampeonatoFixed', state.isCampeonatoFixed);
    saveData('fixedTecnicoAtle', state.fixedTecnicoAtle); saveData('isTecnicoFixed', state.isTecnicoFixed);
    jogo.cartoesGalo = Array.from(document.querySelectorAll('#cards-galo-body tr')).map(row => ({ 
        jogador: row.querySelector('.card-player-inp')?.value || '', 
        posicao: row.querySelector('.pos-inp')?.value || '', 
        amarelo: row.querySelector('.yellow-sel')?.value || '0', 
        red: row.querySelector('.red-sel')?.value || '0', 
        minAmarelo: '', tempoAmarelo: '1', minVermelho: '', tempoVermelho: '1' 
    }));
    jogo.cartoesAdv = Array.from(document.querySelectorAll('#cards-adv-body tr')).map(row => ({ 
        jogador: row.querySelector('.card-player-inp')?.value || 'Adversário', 
        amarelo: row.querySelector('.yellow-sel')?.value || '0', 
        red: row.querySelector('.red-sel')?.value || '0', 
        minAmarelo: '', tempoAmarelo: '1', minVermelho: '', tempoVermelho: '1' 
    }));
    
    // Collect Gols Contra
    jogo.gcFavorCount = parseInt(document.getElementById('game-gc-favor')?.value || 0);
    jogo.gcFavorList = Array.from(document.getElementById('gc-favor-details')?.children || []).map(div => ({
        min: div.querySelector('.gc-min')?.value || '',
        tempo: div.querySelector('.gc-tempo')?.value || '1'
    }));

    jogo.gcContraCount = parseInt(document.getElementById('game-gc-contra')?.value || 0);
    jogo.gcContraList = Array.from(document.getElementById('gc-contra-details')?.children || []).map(div => ({
        min: div.querySelector('.gc-min')?.value || '',
        tempo: div.querySelector('.gc-tempo')?.value || '1'
    }));

    jogo.lineupGalo = [];
    Array.from(document.querySelectorAll('#lineup-galo-body tr')).forEach(r => {
        const l = r.querySelector('.line-player-inp')?.value || r.querySelector('input[placeholder="Jogador"]')?.value;
        if (!l || l.trim() === '' || l === 'Jogador') return; // Filtra linhas vazias
        const gsInps = r.querySelectorAll('.gs-inp');
        const gsCnt = gsInps.length > 0 ? parseInt(gsInps[0].value || 0) : 0;
        
        jogo.lineupGalo.push({
            foto: r.querySelector('img')?.src || 'https://via.placeholder.com/35',
            jogador: l,
            posicao: r.querySelector('.pos-inp')?.value || '-',
            golsCount: parseInt(r.querySelector('.goals-inp')?.value || 0),
            golsMin: Array.from(r.querySelectorAll('.min-g-inp')).map(i => i.value),
            golsTempo: Array.from(r.querySelectorAll('.tempo-goals-td select')).map(i => i.value),
            gsCount: gsCnt,
            gsMin: Array.from(r.querySelectorAll('.min-gs-inp')).map(i => i.value),
            gsTempo: Array.from(r.querySelectorAll('.tempo-gs-td select')).map(i => i.value),
            titular: r.querySelector('.titular-ck')?.checked || false,
            substituido: r.querySelector('.sub-ck')?.checked || false
        });
    });

    const titularesCount = jogo.lineupGalo.filter(l => l.titular).length;
    if (titularesCount !== 11) {
        alert(`Erro de Validação: O número de jogadores titulares deve ser exatamente 11. Você marcou ${titularesCount}.`);
        resetBtn();
        return;
    }

    // Checar duplicatas na escalação
    const lineupNames = jogo.lineupGalo.map(l => l.jogador.trim().toLowerCase()).filter(n => n && n !== 'jogador');
    const duplicates = lineupNames.filter((name, idx) => lineupNames.indexOf(name) !== idx);
    if (duplicates.length > 0) {
        const dupNames = [...new Set(duplicates)].join(', ');
        showToast(`Erro de Validação: O(s) jogador(es) "${dupNames}" está(ão) inserido(s) mais de uma vez na escalação.`, 'error');
        resetBtn();
        return;
    }


    const golsGalo = parseInt(jogo.casa === 'Atlético' ? jogo.golsCasa : jogo.golsFora) || 0;
    const golsLineup = jogo.lineupGalo.reduce((acc, obj) => acc + obj.golsCount, 0);
    const gsTotal = jogo.lineupGalo.reduce((acc, obj) => acc + obj.gsCount, 0);
    const advGols = parseInt(jogo.casa === 'Atlético' ? jogo.golsFora : jogo.golsCasa) || 0;

    if (gsTotal !== advGols) {
        alert(`Erro de Validação: A quantidade de Gols Sofridos informada na escalação (${gsTotal}) não confere com os gols marcados pelo adversário (${advGols}). Ajuste os valores para salvar o jogo.`);
        resetBtn();
        return;
    }

    const totalGolsCalculado = golsLineup + jogo.gcFavorCount;
    if (totalGolsCalculado !== golsGalo) {
        showToast(`Erro de Validação: A soma de gols dos jogadores (${golsLineup}) + gols contra a favor (${jogo.gcFavorCount}) totaliza ${totalGolsCalculado}, mas o placar do Atlético informado é ${golsGalo}. Ajuste a escalação ou o placar para salvar.`, 'error');
        resetBtn();
        return;
    }

    const doSaveJogo = async () => {
        state.jogos.find(j => j.id === jogo.id) ? state.jogos[state.jogos.findIndex(j => j.id === jogo.id)] = jogo : state.jogos.push(jogo);
        
        // Remove fotos para economizar espaço e evitar erros de schema imediato
        const jogoParaSalvar = {
            ...jogo,
            lineupGalo: (jogo.lineupGalo || []).map(({ foto, ...player }) => player)
        };
        
        try {
            await saveData('jogos', [jogoParaSalvar]);
            state.isFormActive = false; // Desativa trava ao salvar com sucesso
            renderJogos();
            showSection('jogos');
            showToast('Jogo salvo com sucesso!', 'success');
        } catch (error) {
            console.error('Erro detalhado ao salvar:', error);
            if (error.message?.includes('portoesFechados')) {
                showToast('Erro de Schema: Coluna "portoesFechados" não encontrada no Supabase. Por favor, execute o comando SQL enviado no chat.', 'error');
            } else {
                showToast(`Erro ao salvar (jogos): ${error.message || 'Erro desconhecido'}`, 'error');
            }
        } finally {
            resetBtn();
        }
    };

    doSaveJogo();
};



// COMPARATIVO FUNCTIONS
const renderComparativo = () => {
    const seasons = [...new Set(state.jogos.map(j => j.temporada))].sort((a,b) => b - a);
    const coaches = [...new Set(state.jogos.map(j => j.tecnicoGalo))].sort();
    
    // Prepare unique list of players with formatted name for autocomplete (avoids duplicates across seasons)
    const uniquePlayersMap = {};
    state.jogadores.forEach(j => {
        const sn = `${j.nome_guerra} - ${j.nome_completo}`;
        if (!uniquePlayersMap[sn]) {
            uniquePlayersMap[sn] = { ...j, searchName: sn };
        }
    });
    state.jogadoresComparativo = Object.values(uniquePlayersMap).sort((a,b) => a.nome_guerra.localeCompare(b.nome_guerra));

    // Helper to avoid duplicate coaches in autocomplete
    state.tecnicosList = [...new Set(state.jogos.map(j => j.tecnicoGalo))].map(t => ({ nome: t }));

    [1,2,3,4,5].forEach(i => {
        populateFilter(`comp-t${i}`, seasons);
        setupAutocomplete(`comp-tec${i}`, 'tecnicosList', 'nome', null); 
        setupAutocomplete(`comp-jog${i}`, 'jogadoresComparativo', 'searchName', null);
    });
    
    // Add change listeners for autocomplete inputs (manual because setupAutocomplete doesn't trigger 'change' always)
    document.querySelectorAll('.comp-inp').forEach(inp => {
        inp.addEventListener('blur', () => setTimeout(updateComparativo, 200));
    });

    const updateComparativo = () => {
        const scenarios = [1,2,3,4,5].map(i => {
            const jogVal = document.getElementById(`comp-jog${i}`).value;
            // Extract war name from "War Name - Full Name"
            const warName = jogVal && jogVal.includes(' - ') ? jogVal.split(' - ')[0] : jogVal;

            return {
                temporada: document.getElementById(`comp-t${i}`).value,
                tecnico: document.getElementById(`comp-tec${i}`).value,
                jogador: warName
            };
        });
        
        const container = document.getElementById('comparativo-content-container');
        
        const metricsTemplate = [
            { key: 'jogos', label: 'Jogos' },
            { key: 'vitorias', label: 'Vitórias' },
            { key: 'empates', label: 'Empates' },
            { key: 'derrotas', label: 'Derrotas' },
            { key: 'aprov', label: 'Aproveitamento' },
            { key: 'gm', label: 'Gols Marcados' },
            { key: 'gs', label: 'Gols Sofridos' },
            { key: 'saldo', label: 'Saldo de Gols' },
            { key: 'artilheiro', label: 'Melhor do Perfil' }
        ];

        const datasetsGM = [];
        const datasetsGS = [];
        const colors = ['#d4af37', '#27ae60', '#444444', '#8e44ad', '#e67e22'];

        const stats = scenarios.map((scen, idx) => {
            if (!scen.temporada && !scen.tecnico && !scen.jogador) return null;
            
            const jogos = state.jogos.filter(j => {
                if (scen.temporada && j.temporada !== scen.temporada) return false;
                if (scen.tecnico && j.tecnicoGalo !== scen.tecnico) return false;
                if (scen.jogador) {
                    const inLineup = j.lineupGalo?.some(l => l.jogador === scen.jogador);
                    if (!inLineup) return false;
                }
                return true;
            });

            let jCount=0, v=0, e=0, d=0, gm=0, gs=0;
            const golsPorJogador = {};
            const binsGM = [0,0,0,0,0,0];
            const binsGS = [0,0,0,0,0,0];
            
            jogos.forEach(j => {
                jCount++;
                const isCasa = j.casa === 'Atlético';
                const golGalo = parseInt(isCasa ? j.golsCasa : j.golsFora);
                const golAdv = parseInt(isCasa ? j.golsFora : j.golsCasa);
                
                if (scen.jogador) {
                    const l = j.lineupGalo?.find(ply => ply.jogador === scen.jogador);
                    const pGoals = parseInt(l?.golsCount || 0);
                    gm += pGoals;
                    gs += parseInt(l?.gsCount || 0);
                    
                    if (l?.golsMin) {
                        l.golsMin.forEach((m, idx) => {
                            let min = parseInt(m); if (isNaN(min)) return;
                            const tempo = parseInt(l.golsTempo?.[idx] || 1);
                            if (tempo === 2) min += 45;
                            const bIdx = Math.min(Math.floor((min - 1) / 15), 5);
                            if (bIdx >= 0) binsGM[bIdx]++;
                        });
                    }
                    if (l?.gsMin) {
                        l.gsMin.forEach((m, idx) => {
                            let min = parseInt(m); if (isNaN(min)) return;
                            const tempo = parseInt(l.gsTempo?.[idx] || 1);
                            if (tempo === 2) min += 45;
                            const bIdx = Math.min(Math.floor((min - 1) / 15), 5);
                            if (bIdx >= 0) binsGS[bIdx]++;
                        });
                    }
                } else {
                    gm += golGalo;
                    gs += golAdv;
                    
                    j.lineupGalo?.forEach(l => {
                        (l.golsMin || []).forEach((m, idx) => {
                            let min = parseInt(m); if (isNaN(min)) return;
                            const tempo = parseInt(l.golsTempo?.[idx] || 1);
                            if (tempo === 2) min += 45;
                            const bIdx = Math.min(Math.floor((min - 1) / 15), 5);
                            if (bIdx >= 0) binsGM[bIdx]++;
                        });
                        (l.gsMin || []).forEach((m, idx) => {
                            let min = parseInt(m); if (isNaN(min)) return;
                            const tempo = parseInt(l.gsTempo?.[idx] || 1);
                            if (tempo === 2) min += 45;
                            const bIdx = Math.min(Math.floor((min - 1) / 15), 5);
                            if (bIdx >= 0) binsGS[bIdx]++;
                        });
                    });

                    // Add Gols Contra in general view
                    (j.gcFavorList || []).forEach(gc => {
                        let min = parseInt(gc.min); if (isNaN(min)) return;
                        if (parseInt(gc.tempo) === 2) min += 45;
                        const bIdx = Math.min(Math.floor((min - 1) / 15), 5);
                        if (bIdx >= 0) binsGM[bIdx]++;
                    });
                    (j.gcContraList || []).forEach(gc => {
                        let min = parseInt(gc.min); if (isNaN(min)) return;
                        if (parseInt(gc.tempo) === 2) min += 45;
                        const bIdx = Math.min(Math.floor((min - 1) / 15), 5);
                        if (bIdx >= 0) binsGS[bIdx]++;
                    });
                }

                if (golGalo > golAdv) v++; else if (golGalo === golAdv) e++; else d++;

                (j.lineupGalo || []).forEach(l => {
                    const g = parseInt(l.golsCount || 0);
                    if (g > 0) golsPorJogador[l.jogador] = (golsPorJogador[l.jogador] || 0) + g;
                });
            });

            let topGol = 0, topName = '-';
            Object.keys(golsPorJogador).forEach(k => { if (golsPorJogador[k] > topGol) { topGol = golsPorJogador[k]; topName = k; } });
            
            const label = scen.temporada || scen.tecnico || scen.jogador || `Seleção ${idx+1}`;
            datasetsGM.push({ label: label, data: binsGM, backgroundColor: colors[idx], borderColor: colors[idx], borderWidth: 1 });
            datasetsGS.push({ label: label, data: binsGS, backgroundColor: colors[idx].replace(')', ', 0.7)').replace('rgb', 'rgba'), borderColor: colors[idx], borderWidth: 1 });

            // Format metrics for table
            const aprov = jCount > 0 ? ((v * 3 + e) / (jCount * 3) * 100).toFixed(1) + '%' : '0%';
            const vText = `<span style="color:#27ae60">${v}</span>`;
            const eText = `<span style="color:#f39c12">${e}</span>`;
            const dText = `<span style="color:#e74c3c">${d}</span>`;
            const saldo = gm - gs;
            const saldoText = saldo > 0 ? `<span style="color:#27ae60;font-weight:bold;">+${saldo}</span>` : `<span style="color:${saldo < 0 ? '#e74c3c' : 'black'};font-weight:bold;">${saldo}</span>`;

            return {
                label: label, jogos: jCount, vitorias: vText, empates: eText, derrotas: dText,
                aprov: `<strong>${aprov}</strong>`, gm: gm, gs: gs, saldo: saldoText, artilheiro: topGol > 0 ? `${topName} (${topGol})` : '-'
            };
        });

        const headerHtml = stats.map(st => `<th>${st ? st.label : '-'}</th>`).join('');
        const tbodyHtml = metricsTemplate.map(m => {
            const rowTds = stats.map(st => `<td>${st ? st[m.key] : '-'}</td>`).join('');
            return `<tr><td style="font-weight:bold; text-align:left; border-right: 1px solid #eee;">${m.label}</td>${rowTds}</tr>`;
        }).join('');

        container.innerHTML = `<table class="data-table" style="text-align:center;"><thead><tr><th style="padding-left:1.5rem; text-align:left; border-right: 1px solid #eee;">Métrica</th>${headerHtml}</tr></thead><tbody>${tbodyHtml}</tbody></table>`;
        renderComparativoCharts(datasetsGM, datasetsGS);
    };

    [1,2,3,4,5].forEach(i => {
        document.getElementById(`comp-t${i}`).addEventListener('change', updateComparativo);
    });

    updateComparativo();
};

window.clearComparativoFilters = () => {
    [1,2,3,4,5].forEach(i => {
        const t = document.getElementById(`comp-t${i}`);
        const tec = document.getElementById(`comp-tec${i}`);
        const jog = document.getElementById(`comp-jog${i}`);
        if(t) t.value = "";
        if(tec) tec.value = "";
        if(jog) jog.value = "";
    });
    // Trigger update
    const container = document.getElementById('comparativo-content-container');
    if (container) {
        // Find existing updateComparativo in context or just re-render the page
        renderComparativo();
    }
};

let compChartGM = null;
let compChartGS = null;

const renderComparativoCharts = (dsGM, dsGS) => {
    const bins = ["0-15", "16-30", "31-45", "46-60", "61-75", "76-90"];
    
    if (compChartGM) compChartGM.destroy();
    if (compChartGS) compChartGS.destroy();

    const ctxGM = document.getElementById('chart-comp-goals-marked').getContext('2d');
    compChartGM = new Chart(ctxGM, {
        type: 'bar',
        data: { labels: bins, datasets: dsGM },
        options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });

    const ctxGS = document.getElementById('chart-comp-goals-conceded').getContext('2d');
    compChartGS = new Chart(ctxGS, {
        type: 'bar',
        data: { labels: bins, datasets: dsGS },
        options: { responsive: true, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
};
// ESTATESTICAS FUNCTIONS
const switchStatsTab = (tab) => {
    document.getElementById('btn-stats-coletivas').classList.toggle('active', tab === 'coletivas');
    document.getElementById('btn-stats-individuais').classList.toggle('active', tab === 'individuais');
    document.getElementById('btn-stats-tecnicos').classList.toggle('active', tab === 'tecnicos');
    document.getElementById('btn-stats-por-fase').classList.toggle('active', tab === 'por-fase');
    
    document.getElementById('stats-filters-coletivas').classList.toggle('hidden', tab !== 'coletivas');
    document.getElementById('stats-filters-individuais').classList.toggle('hidden', tab !== 'individuais');
    document.getElementById('stats-filters-tecnicos').classList.toggle('hidden', tab !== 'tecnicos');
    document.getElementById('stats-filters-por-fase').classList.toggle('hidden', tab !== 'por-fase');
    
    state.currentStatsTab = tab;
    
    // Update URL hash without breaking the navigation
    const newHash = '#estatisticas/' + tab;
    if (window.location.hash !== newHash) history.replaceState(null, '', newHash);
    
    renderEstatisticas();
};

const renderEstatisticas = () => {
    const tab = state.currentStatsTab || 'coletivas';
    const container = document.getElementById('stats-content-container');
    
    if (tab === 'coletivas') {
        renderStatsColetivas(container);
    } else if (tab === 'individuais') {
        renderStatsIndividuais(container);
    } else if (tab === 'tecnicos') {
        renderAtleticoTecnicos(container);
    } else if (tab === 'por-fase') {
        renderStatsPorFase(container);
    }
};

const getAtleticoTecnicoStats = () => {
    if (statsCache.atleticoTecnicos) return statsCache.atleticoTecnicos;

    const stats = {};
    state.jogos.forEach(j => {
        const tecnico = j.tecnicoGalo || 'N/I';
        if (!stats[tecnico]) {
            stats[tecnico] = { 
                nome: tecnico, 
                jogos: 0, v: 0, e: 0, d: 0, 
                gm: 0, gc: 0, points: 0,
                cs: 0, cg: 0,
                campeonatos: {} 
            };
        }
        
        const s = stats[tecnico];
        const camp = j.campeonato || 'Outros';
        if (!s.campeonatos[camp]) {
            s.campeonatos[camp] = { nome: camp, jogos: 0, v: 0, e: 0, d: 0, gm: 0, gc: 0, points: 0, cs: 0, cg: 0 };
        }
        const sc = s.campeonatos[camp];

        s.jogos++;
        sc.jogos++;

        const isCasa = j.casa === 'Atlético' || j.casa === 'Atlético-MG';
        const galoGols = isCasa ? parseInt(j.golsCasa) : parseInt(j.golsFora);
        const advGols = isCasa ? parseInt(j.golsFora) : parseInt(j.golsCasa);
        
        s.gm += galoGols; sc.gm += galoGols;
        s.gc += advGols; sc.gc += advGols;

        if (galoGols > advGols) { 
            s.v++; s.points += 3; 
            sc.v++; sc.points += 3;
        } else if (galoGols === advGols) { 
            s.e++; s.points += 1; 
            sc.e++; sc.points += 1;
        } else { 
            s.d++;
            sc.d++;
        }

        if (advGols === 0) { s.cs++; sc.cs++; }
        if (galoGols === 0) { s.cg++; sc.cg++; }
    });

    statsCache.atleticoTecnicos = Object.values(stats).map(s => ({
        ...s,
        aproveitamento: s.jogos > 0 ? ((s.points / (s.jogos * 3)) * 100).toFixed(2) : "0.00",
        mediaGM: s.jogos > 0 ? (s.gm / s.jogos).toFixed(2) : "0.00",
        mediaGC: s.jogos > 0 ? (s.gc / s.jogos).toFixed(2) : "0.00",
        saldo: s.gm - s.gc,
        campeonatos: Object.values(s.campeonatos).map(c => ({
            ...c,
            aproveitamento: c.jogos > 0 ? ((c.points / (c.jogos * 3)) * 100).toFixed(2) : "0.00",
            saldo: c.gm - c.gc
        }))
    }));

    return statsCache.atleticoTecnicos;
};

const renderAtleticoTecnicos = (container) => {
    const fTempDe = parseInt(document.getElementById('stt-filter-temporada-de')?.value) || 0;
    const fTempAte = parseInt(document.getElementById('stt-filter-temporada-ate')?.value) || 9999;

    // Obtém filtros Multi
    const selectedCamps = state.statsMultiFilters['tec-campeonato'] || [];
    const selectedTecnicos = state.statsMultiFilters['tec-tecnico'] || [];
    const selectedTipos = state.statsMultiFilters['tec-tipo'] || [];

    let tecnicos = [];

    // Recalcular com base nos filtros de jogos
    const tempStats = {};
    state.jogos.forEach(j => {
        const anoJogo = parseInt(j.temporada || j.data.substring(0, 4)) || 0;
        if (fTempDe > 0 && anoJogo < fTempDe) return;
        if (fTempAte < 9999 && anoJogo > fTempAte) return;
        
        // Filtro Campeonato
        if (selectedCamps.length > 0 && !selectedCamps.includes(j.campeonato) && !selectedCamps.includes('Todos')) return;
        if (selectedCamps.length === 0) return;

        // Filtro Tipo
        const comp = state.competicoes.find(c => c.campeonato === j.campeonato);
        if (selectedTipos.length > 0 && !selectedTipos.includes(comp?.tipo) && !selectedTipos.includes('Todos')) return;
        if (selectedTipos.length === 0) return;
        
        const tecnico = j.tecnicoGalo || 'N/I';
        if (!tempStats[tecnico]) tempStats[tecnico] = { nome: tecnico, jogos: 0, v: 0, e: 0, d: 0, gm: 0, gc: 0, points: 0, cs: 0, cg: 0, campeonatos: [] };
        
        const s = tempStats[tecnico];
        s.jogos++;
        const isCasa = j.casa === 'Atlético' || j.casa === 'Atlético-MG';
        const galoGols = isCasa ? parseInt(j.golsCasa) : parseInt(j.golsFora);
        const advGols = isCasa ? parseInt(j.golsFora) : parseInt(j.golsCasa);
        s.gm += galoGols; s.gc += advGols;
        if (galoGols > advGols) { s.v++; s.points += 3; }
        else if (galoGols === advGols) { s.e++; s.points += 1; }
        else s.d++;
        if (advGols === 0) s.cs++;
        if (galoGols === 0) s.cg++;
    });
    tecnicos = Object.values(tempStats).map(s => ({
        ...s,
        aproveitamento: s.jogos > 0 ? ((s.points / (s.jogos * 3)) * 100).toFixed(2) : "0.00",
        saldo: s.gm - s.gc
    }));

    if (selectedTecnicos.length > 0 && !selectedTecnicos.includes('Todos')) {
        tecnicos = tecnicos.filter(t => selectedTecnicos.includes(t.nome));
    }
    if (selectedTecnicos.length === 0) tecnicos = [];

    // Aplicar Ordenação
    const sorted = sortInternal(tecnicos, 'table-atletico-tecnicos');
    
    // Se não houver ordenação manual, manter a padrão por jogos
    if (!state.sortConfig.column || state.sortConfig.tableId !== 'table-atletico-tecnicos') {
        sorted.sort((a, b) => b.jogos - a.jogos);
    }

    // Paginação
    const rowsPerPage = 20;
    const totalPages = Math.ceil(sorted.length / rowsPerPage);
    state.atleTecPage = Math.min(state.atleTecPage || 1, totalPages || 1);
    const start = (state.atleTecPage - 1) * rowsPerPage;
    const paginated = sorted.slice(start, start + rowsPerPage);

    const getSortIcon = (col) => {
        if (state.sortConfig.tableId === 'table-atletico-tecnicos' && state.sortConfig.column === col) {
            return state.sortConfig.direction === 'asc' ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>';
        }
        return '<i class="fas fa-sort" style="opacity:0.3;"></i>';
    };

    container.innerHTML = `
        <table class="data-table" id="table-atletico-tecnicos" style="text-align:center;">
            <thead>
                <tr>
                    <th style="text-align:left; cursor:pointer;" onclick="sortTable(event, 'nome')">Técnico ${getSortIcon('nome')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'jogos')">J ${getSortIcon('jogos')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'v')">V ${getSortIcon('v')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'e')">E ${getSortIcon('e')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'd')">D ${getSortIcon('d')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'gm')">GM ${getSortIcon('gm')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'gc')">GC ${getSortIcon('gc')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'saldo')">SG ${getSortIcon('saldo')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'aproveitamento')">% ${getSortIcon('aproveitamento')}</th>
                    <th style="cursor:pointer; color:var(--primary-color);" onclick="sortTable(event, 'cs')" title="Clean Sheets">CS ${getSortIcon('cs')}</th>
                    <th style="cursor:pointer; color:#e67e22;" onclick="sortTable(event, 'cg')" title="Clean Goals">CG ${getSortIcon('cg')}</th>
                </tr>
            </thead>
            <tbody>
                ${paginated.map(t => `
                    <tr onclick="showAtleticoTecnicoDetail('${t.nome.replace(/'/g, "\\'")}', this)" style="cursor:pointer;">
                        <td style="text-align:left; font-weight:bold; color:var(--primary-color);">${t.nome}</td>
                        <td>${t.jogos}</td>
                        <td><span class="win-text">${t.v}</span></td>
                        <td><span class="draw-text">${t.e}</span></td>
                        <td><span class="loss-text">${t.d}</span></td>
                        <td>${t.gm}</td>
                        <td>${t.gc}</td>
                        <td style="font-weight:bold;">${t.saldo > 0 ? '+' : ''}${t.saldo}</td>
                        <td style="font-weight:bold;">${t.aproveitamento}%</td>
                        <td style="color:var(--primary-color); font-weight:bold;">${t.cs}</td>
                        <td style="color:#e67e22; font-weight:bold;">${t.cg}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <div class="atle-tec-pagination">
            <button class="btn-secondary" ${state.atleTecPage === 1 ? 'disabled' : ''} onclick="state.atleTecPage--; renderEstatisticas();"><i class="fas fa-chevron-left"></i></button>
            <span>Página ${state.atleTecPage} de ${totalPages || 1}</span>
            <button class="btn-secondary" ${state.atleTecPage >= totalPages ? 'disabled' : ''} onclick="state.atleTecPage++; renderEstatisticas();"><i class="fas fa-chevron-right"></i></button>
        </div>
        ${renderTableLegend(['J', 'V', 'E', 'D', 'GM', 'GS', 'SG', 'Aprov', 'CS', 'CG'])}
    `;

    // Inicia Filtros
    const availableCamps = [...new Set(state.jogos.filter(j => {
        const anoJogo = parseInt(j.temporada || j.data.substring(0, 4)) || 0;
        return (fTempDe === 0 || anoJogo >= fTempDe) && (fTempAte === 9999 || anoJogo <= fTempAte);
    }).map(j => j.campeonato))].sort();
    initMultiSelect('stt-multi-campeonato', availableCamps, 'tec-campeonato', () => renderAtleticoTecnicos(container));

    const avTecs = [...new Set(state.jogos.map(j => j.tecnicoGalo))].filter(Boolean).sort();
    initMultiSelect('stt-multi-tecnico', avTecs, 'tec-tecnico', () => renderAtleticoTecnicos(container));

    const avTipos = [...new Set(state.competicoes.map(c => c.tipo))].filter(Boolean).sort();
    initMultiSelect('stt-multi-tipo', avTipos, 'tec-tipo', () => renderAtleticoTecnicos(container));

    // Bind inputs
    if (!container.dataset.tecBound) {
        ['stt-filter-temporada-de', 'stt-filter-temporada-ate'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('change', () => renderAtleticoTecnicos(container));
        });
        container.dataset.tecBound = 'true';
    }
};

const showAtleticoTecnicoDetail = (tecnicoNome, row) => {
    const existing = document.getElementById(`detail-ate-tec-${tecnicoNome.replace(/\s/g, '-')}`);
    if (existing) { existing.remove(); return; }
    
    // Fecha outros detalhes abertos
    document.querySelectorAll('.detail-row-tec').forEach(r => r.remove());

    const tecData = getAtleticoTecnicoStats().find(t => t.nome === tecnicoNome);
    if (!tecData) return;

    // Foto do técnico (Tenta achar no elenco)
    const player = state.jogadores.find(p => p.nome_guerra === tecnicoNome);
    const photoUrl = player?.foto || DEFAULT_REF_PHOTO;

    const detailHtml = `
        <tr class="detail-row-tec" id="detail-ate-tec-${tecnicoNome.replace(/\s/g, '-')}">
            <td colspan="11" style="padding:1.5rem;">
                <div style="display:flex; gap:2rem; flex-wrap:wrap;">
                    <div style="flex: 0 0 150px;">
                        <img src="${photoUrl}" style="width:150px; height:150px; border-radius:12px; object-fit:cover; border:3px solid var(--border-color); box-shadow:0 4px 10px rgba(0,0,0,0.1);">
                        <h4 style="margin-top:1rem; text-align:center; color:var(--text-main);">${tecnicoNome}</h4>
                    </div>
                    <div style="flex:1; min-width:300px;">
                        <h4 style="margin-bottom:1rem; color:var(--primary-color);">Desempenho por Campeonato</h4>
                        <table class="stats-table" style="font-size:0.9rem;">
                            <thead>
                                <tr>
                                    <th style="text-align:left;">Campeonato</th>
                                    <th>J</th><th>V</th><th>E</th><th>D</th><th>GM</th><th>GC</th><th>SG</th><th>%</th>
                                    <th style="color:var(--primary-color);">CS</th>
                                    <th style="color:#e67e22;">CG</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tecData.campeonatos.sort((a,b) => b.jogos - a.jogos).map(c => `
                                    <tr>
                                        <td style="text-align:left; color:var(--text-main);"><strong>${c.nome}</strong></td>
                                        <td style="color:var(--text-main);">${c.jogos}</td>
                                        <td><span class="win-text">${c.v}</span></td>
                                        <td><span class="draw-text">${c.e}</span></td>
                                        <td><span class="loss-text">${c.d}</span></td>
                                        <td style="color:var(--text-main);">${c.gm}</td>
                                        <td style="color:var(--text-main);">${c.gc}</td>
                                        <td style="color:var(--text-main);">${c.saldo > 0 ? '+' : ''}${c.saldo}</td>
                                        <td style="color:var(--text-main);"><strong>${c.aproveitamento}%</strong></td>
                                        <td style="color:var(--primary-color); font-weight:bold;">${c.cs}</td>
                                        <td style="color:#e67e22; font-weight:bold;">${c.cg}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </td>
        </tr>
    `;
    row.insertAdjacentHTML('afterend', detailHtml);
};

const renderStatsPorFase = (container) => {
    const fTempDe = parseInt(document.getElementById('spf-filter-temporada-de').value) || 0;
    const fTempAte = parseInt(document.getElementById('spf-filter-temporada-ate').value) || 9999;
    const fRodDe = parseInt(document.getElementById('spf-filter-rodada-de').value) || 0;
    const fRodAte = parseInt(document.getElementById('spf-filter-rodada-ate').value) || 999;

    // Obtém filtros Multi
    const selectedCamps = state.statsMultiFilters['fas-campeonato'] || [];
    const selectedAdvs = state.statsMultiFilters['fas-adversario'] || [];
    const selectedTipos = state.statsMultiFilters['fas-tipo'] || [];

    const filteredJogos = state.jogos.filter(j => {
        const anoJogo = parseInt(j.temporada || j.data.substring(0, 4)) || 0;
        if (fTempDe > 0 && anoJogo < fTempDe) return false;
        if (fTempAte < 9999 && anoJogo > fTempAte) return false;
        
        // Filtro Campeonato
        const isCampSpecific = selectedCamps.length > 0 && !selectedCamps.includes('Todos');
        if (selectedCamps.length > 0 && !selectedCamps.includes(j.campeonato) && !selectedCamps.includes('Todos')) return false;
        if (selectedCamps.length === 0) return false;

        // Filtro Adversário
        if (selectedAdvs.length > 0 && !selectedAdvs.includes('Todos')) {
            if (!selectedAdvs.includes(j.casa) && !selectedAdvs.includes(j.fora)) return false;
        }
        if (selectedAdvs.length === 0) return false;

        // Filtro Tipo (Só aplica se não houver um campeonato específico selecionado)
        if (!isCampSpecific) {
            const comp = state.competicoes.find(c => c.campeonato === j.campeonato);
            if (selectedTipos.length > 0 && !selectedTipos.includes(comp?.tipo) && !selectedTipos.includes('Todos')) return false;
            if (selectedTipos.length === 0) return false;
        }
        
        const rodNum = parseInt(j.rodada?.replace(/\D/g, '')) || 0;
        if (fRodDe > 0 && rodNum < fRodDe) return false;
        if (fRodAte < 999 && rodNum > fRodAte) return false;
        
        return true;
    });

    const stats = {};
    filteredJogos.forEach(j => {
        const fase = j.rodada || 'Não Informada';
        if (!stats[fase]) {
            stats[fase] = { nome: fase, pontos: 0, jogos: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, cs: 0, cg: 0, order: parseInt(fase.replace(/\D/g, '')) || 999 };
        }
        
        const s = stats[fase];
        s.jogos++;
        
        const isCasa = j.casa === 'Atlético' || j.casa === 'Atlético-MG';
        const galoGols = isCasa ? parseInt(j.golsCasa) : parseInt(j.golsFora);
        const advGols = isCasa ? parseInt(j.golsFora) : parseInt(j.golsCasa);
        
        s.gp += galoGols;
        s.gc += advGols;
        
        if (galoGols > advGols) { s.v++; s.pontos += 3; }
        else if (galoGols === advGols) { s.e++; s.pontos += 1; }
        else s.d++;

        if (advGols === 0) s.cs++;
        if (galoGols === 0) s.cg++;
    });

    // Setup Autocomplete e Filtros
    const availableCamps = [...new Set(state.jogos.filter(j => {
        const anoJogo = parseInt(j.temporada || j.data.substring(0, 4)) || 0;
        return (fTempDe === 0 || anoJogo >= fTempDe) && (fTempAte === 9999 || anoJogo <= fTempAte);
    }).map(j => j.campeonato))].sort();
    initMultiSelect('spf-multi-campeonato', availableCamps, 'fas-campeonato', () => renderStatsPorFase(container));

    const availableAdvs = [...new Set(state.adversarios.map(a => a.clube))].sort();
    initMultiSelect('spf-multi-adversario', availableAdvs, 'fas-adversario', () => renderStatsPorFase(container));

    const availableTipos = [...new Set(state.competicoes.map(c => c.tipo))].filter(Boolean).sort();
    initMultiSelect('spf-multi-tipo', availableTipos, 'fas-tipo', () => renderStatsPorFase(container));

    // Vincular eventos se necessário (apenas uma vez)
    if (!container.dataset.bound) {
        ['spf-filter-temporada-de', 'spf-filter-temporada-ate', 'spf-filter-rodada-de', 'spf-filter-rodada-ate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => renderStatsPorFase(container));
                if (el.tagName === 'INPUT') el.addEventListener('input', () => renderStatsPorFase(container));
            }
        });
        container.dataset.bound = 'true';
    }

    let list = Object.values(stats);
    
    // Ordenação padrão por número da rodada se não houver ordenação ativa
    if (!state.sortConfig.column || state.sortConfig.tableId !== 'table-stats-fase') {
        list.sort((a, b) => a.order - b.order);
    } else {
        list = sortInternal(list, 'table-stats-fase');
    }

    const total = list.reduce((acc, c) => {
        acc.pontos += c.pontos; acc.jogos += c.jogos; acc.v += c.v; acc.e += c.e; acc.d += c.d; acc.gp += c.gp; acc.gc += c.gc;
        acc.cs += c.cs; acc.cg += c.cg;
        return acc;
    }, { nome: 'TOTAL', pontos: 0, jogos: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, cs: 0, cg: 0 });

    const getSortIcon = (col) => {
        if (state.sortConfig.tableId === 'table-stats-fase' && state.sortConfig.column === col) {
            return state.sortConfig.direction === 'asc' ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>';
        }
        return '<i class="fas fa-sort" style="opacity:0.3;"></i>';
    };

    const calcRow = (s, isTotal = false) => {
        const sg = s.gp - s.gc;
        const aprove = s.jogos > 0 ? ((s.pontos / (s.jogos * 3)) * 100).toFixed(2) : "0.00";
        const mgm = s.jogos > 0 ? (s.gp / s.jogos).toFixed(2) : "0.00";
        const mgs = s.jogos > 0 ? (s.gc / s.jogos).toFixed(2) : "0.00";
        const style = isTotal ? 'class="total-row" style="background:var(--bg-highlight); color:var(--text-main); font-weight:bold; border-top:2px solid var(--border-color);"' : '';
        
        return `<tr ${style}>
            <td style="text-align:left;"><strong>${s.nome}</strong></td>
            <td>${s.jogos}</td>
            <td><span class="win-text">${s.v}</span></td>
            <td><span class="draw-text">${s.e}</span></td>
            <td><span class="loss-text">${s.d}</span></td>
            <td>${s.gp}</td>
            <td>${s.gc}</td>
            <td style="font-weight:bold;">${sg > 0 ? '+' : ''}${sg}</td>
            <td><strong>${aprove}%</strong></td>
            <td>${mgm}</td>
            <td>${mgs}</td>
            <td style="color:var(--primary-color); font-weight:bold;">${s.cs}</td>
            <td style="color:#e67e22; font-weight:bold;">${s.cg}</td>
        </tr>`;
    };

    container.innerHTML = `
        <table class="data-table" id="table-stats-fase" style="text-align:center;">
            <thead>
                <tr>
                    <th style="text-align:left; cursor:pointer;" onclick="sortTable(event, 'nome')">Fase / Rodada ${getSortIcon('nome')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'jogos')">J ${getSortIcon('jogos')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'v')">V ${getSortIcon('v')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'e')">E ${getSortIcon('e')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'd')">D ${getSortIcon('d')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'gp')">GP ${getSortIcon('gp')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'gc')">GC ${getSortIcon('gc')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'sg')">SG ${getSortIcon('sg')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'aproveitamento')">% ${getSortIcon('aproveitamento')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'mgm')">MGm ${getSortIcon('mgm')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'mgs')">MGs ${getSortIcon('mgs')}</th>
                    <th style="cursor:pointer; color:var(--primary-color);" onclick="sortTable(event, 'cs')" title="Clean Sheets">CS ${getSortIcon('cs')}</th>
                    <th style="cursor:pointer; color:#e67e22;" onclick="sortTable(event, 'cg')" title="Clean Goals">CG ${getSortIcon('cg')}</th>
                </tr>
            </thead>
            <tbody>
                ${list.map(s => calcRow(s)).join('')}
                ${list.length > 0 ? calcRow(total, true) : '<tr><td colspan="13">Nenhum dado encontrado</td></tr>'}
            </tbody>
        </table>
        ${renderTableLegend(['J', 'V', 'E', 'D', 'GP', 'GC', 'SG', '%', 'MGm', 'MGs', 'CS', 'CG'])}
    `;

    renderStatsPorFaseCharts(list);
};

let chartStatsAprovFase = null;
let chartStatsGolsMarcadosFase = null;
let chartStatsGolsSofridosFase = null;

const renderStatsPorFaseCharts = (data) => {
    if (chartStatsAprovFase) chartStatsAprovFase.destroy();
    if (chartStatsGolsMarcadosFase) chartStatsGolsMarcadosFase.destroy();
    if (chartStatsGolsSofridosFase) chartStatsGolsSofridosFase.destroy();

    const labels = data.map(d => d.nome);
    const aproveData = data.map(d => parseFloat(((d.pontos / (d.jogos * 3)) * 100).toFixed(1)));
    const gpData = data.map(d => d.gp);
    const gcData = data.map(d => d.gc);

    const ctxAprov = document.getElementById('chart-spf-aproveitamento')?.getContext('2d');
    if (ctxAprov) {
        chartStatsAprovFase = new Chart(ctxAprov, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Aproveitamento (%)',
                    data: aproveData,
                    backgroundColor: 'rgba(212, 175, 55, 0.7)',
                    borderColor: 'rgba(212, 175, 55, 1)',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });
    }

    // Gols Marcados
    const ctxGM = document.getElementById('chart-spf-gols-marcados')?.getContext('2d');
    if (ctxGM) {
        chartStatsGolsMarcadosFase = new Chart(ctxGM, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Gols Marcados',
                    data: gpData,
                    backgroundColor: 'rgba(46, 204, 113, 0.7)',
                    borderRadius: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });
    }

    // Gols Sofridos
    const ctxGC = document.getElementById('chart-spf-gols-sofridos')?.getContext('2d');
    if (ctxGC) {
        chartStatsGolsSofridosFase = new Chart(ctxGC, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Gols Sofridos',
                    data: gcData,
                    backgroundColor: 'rgba(231, 76, 60, 0.7)',
                    borderRadius: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        });
    }
};

const renderStatsColetivas = (container) => {
    const fTempDe = parseInt(document.getElementById('stc-filter-temporada-de').value) || 0;
    const fTempAte = parseInt(document.getElementById('stc-filter-temporada-ate').value) || 9999;

    // Obtém filtros multi
    const selectedCamps = state.statsMultiFilters['col-campeonato'] || [];
    const selectedTecnicos = state.statsMultiFilters['col-tecnico'] || [];
    const selectedTipos = state.statsMultiFilters['col-tipo'] || [];

    const filteredJogos = state.jogos.filter(j => {
        const anoJogo = parseInt(j.temporada || j.data.substring(0, 4)) || 0;
        if (fTempDe > 0 && anoJogo < fTempDe) return false;
        if (fTempAte < 9999 && anoJogo > fTempAte) return false;
        
        // Filtro Campeonato
        const isCampSpecific = selectedCamps.length > 0 && !selectedCamps.includes('Todos');
        if (selectedCamps.length > 0 && !selectedCamps.includes(j.campeonato) && !selectedCamps.includes('Todos')) return false;
        if (selectedCamps.length === 0) return false;

        // Filtro Técnico
        if (selectedTecnicos.length > 0 && !selectedTecnicos.includes(j.tecnicoGalo) && !selectedTecnicos.includes('Todos')) return false;
        if (selectedTecnicos.length === 0) return false;

        // Filtro Tipo (Só aplica se não houver um campeonato específico selecionado)
        if (!isCampSpecific) {
            const comp = state.competicoes.find(c => c.campeonato === j.campeonato);
            if (selectedTipos.length > 0 && !selectedTipos.includes(comp?.tipo) && !selectedTipos.includes('Todos')) return false;
            if (selectedTipos.length === 0) return false;
        }
        return true;
    });

    // Bind listeners
    if (!container.dataset.boundColetivas) {
        ['stc-filter-temporada-de', 'stc-filter-temporada-ate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => renderStatsColetivas(container));
        });
        container.dataset.boundColetivas = 'true';
    }

    // Inicializa Filtros
    const availableCamps = [...new Set(state.jogos.filter(j => {
        const anoJogo = parseInt(j.temporada || j.data.substring(0, 4)) || 0;
        return (fTempDe === 0 || anoJogo >= fTempDe) && (fTempAte === 9999 || anoJogo <= fTempAte);
    }).map(j => j.campeonato))].sort();
    initMultiSelect('stc-multi-campeonato', availableCamps, 'col-campeonato', () => renderStatsColetivas(container));

    const availableTecnicos = [...new Set(state.jogos.map(j => j.tecnicoGalo))].filter(Boolean).sort();
    initMultiSelect('stc-multi-tecnico', availableTecnicos, 'col-tecnico', () => renderStatsColetivas(container));

    const availableTipos = [...new Set(state.competicoes.map(c => c.tipo))].filter(Boolean).sort();
    initMultiSelect('stc-multi-tipo', availableTipos, 'col-tipo', () => renderStatsColetivas(container));

    const stats = {};
    filteredJogos.forEach(j => {

        if (!stats[j.campeonato]) stats[j.campeonato] = { nome: j.campeonato, pontos: 0, jogos: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, yellowAtl: 0, redAtl: 0, yellowAdv: 0, redAdv: 0, cs: 0, cg: 0 };
        
        const s = stats[j.campeonato];
        s.jogos++;
        
        const galoGols = j.casa === 'Atlético' || j.casa === 'Atlético-MG' ? parseInt(j.golsCasa) : parseInt(j.golsFora);
        const advGols = j.casa === 'Atlético' || j.casa === 'Atlético-MG' ? parseInt(j.golsFora) : parseInt(j.golsCasa);
        
        s.gp += galoGols;
        s.gc += advGols;
        
        if (galoGols > advGols) { s.v++; s.pontos += 3; }
        else if (galoGols === advGols) { s.e++; s.pontos += 1; }
        else s.d++;

        // Clean Sheets & Clean Goals
        if (advGols === 0) s.cs++;
        if (galoGols === 0) s.cg++;

        (j.cartoesGalo || []).forEach(c => { s.yellowAtl += parseInt(c.amarelo || 0); s.redAtl += parseInt(c.red || 0); });
        (j.cartoesAdv || []).forEach(c => { s.yellowAdv += parseInt(c.amarelo || 0); s.redAdv += parseInt(c.red || 0); });
    });

    for (let jId in stats) {
        const s = stats[jId];
        s.aproveitamento = s.jogos > 0 ? ((s.pontos / (s.jogos * 3)) * 100).toFixed(2) : "0.00";
    }

    let list = Object.values(stats);
    
    // Aplicar Ordenação
    if (state.sortConfig.tableId === 'table-stats-coletivas') {
        list = sortInternal(list, 'table-stats-coletivas');
    } else {
        list.sort((a,b) => b.pontos - a.pontos || b.gp - a.gp);
    }

    const getSortIcon = (col) => {
        if (state.sortConfig.tableId === 'table-stats-coletivas' && state.sortConfig.column === col) {
            return state.sortConfig.direction === 'asc' ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>';
        }
        return '<i class="fas fa-sort" style="opacity:0.3;"></i>';
    };

    const total = list.reduce((acc, c) => {
        acc.pontos += c.pontos; acc.jogos += c.jogos; acc.v += c.v; acc.e += c.e; acc.d += c.d; acc.gp += c.gp; acc.gc += c.gc;
        acc.yellowAtl += c.yellowAtl; acc.redAtl += c.redAtl; acc.yellowAdv += c.yellowAdv; acc.redAdv += c.redAdv;
        acc.cs += c.cs; acc.cg += c.cg;
        return acc;
    }, { nome: 'TOTAL', pontos: 0, jogos: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, yellowAtl: 0, redAtl: 0, yellowAdv: 0, redAdv: 0, cs: 0, cg: 0 });
    total.aproveitamento = total.jogos > 0 ? ((total.pontos / (total.jogos * 3)) * 100).toFixed(2) : "0.00";

    const calcRow = (s, isTotal = false) => {
        const sg = s.gp - s.gc;
        const mgm = s.jogos > 0 ? (s.gp / s.jogos).toFixed(2) : "0.00";
        const mgs = s.jogos > 0 ? (s.gc / s.jogos).toFixed(2) : "0.00";
        const style = isTotal ? 'class="total-row" style="background:var(--bg-highlight); color:var(--text-main); font-weight:bold; border-top:2px solid var(--border-color);"' : '';
        return `<tr ${style}><td style="text-align:left;"><strong>${s.nome}</strong></td><td>${s.pontos}</td><td>${s.jogos}</td><td>${s.v}</td><td>${s.e}</td><td>${s.d}</td><td>${s.gp}</td><td>${s.gc}</td><td>${sg}</td><td>${s.aproveitamento}%</td><td>${mgm}</td><td>${mgs}</td><td style="color:var(--primary-color); font-weight:bold;">${s.cs}</td><td style="color:#e67e22; font-weight:bold;">${s.cg}</td><td style="color:#f39c12;">${s.yellowAtl}</td><td style="color:#e74c3c;">${s.redAtl}</td><td style="color:#f39c12; border-left:1px solid #eee;">${s.yellowAdv}</td><td style="color:#e74c3c;">${s.redAdv}</td></tr>`;
    };

    container.innerHTML = `
        <table class="data-table" id="table-stats-coletivas" style="text-align:center;">
            <thead>
                <tr>
                    <th style="text-align:left; cursor:pointer;" onclick="sortTable(event, 'nome')">Campeonato ${getSortIcon('nome')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'pontos')">Pts ${getSortIcon('pontos')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'jogos')">J ${getSortIcon('jogos')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'v')">V ${getSortIcon('v')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'e')">E ${getSortIcon('e')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'd')">D ${getSortIcon('d')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'gp')">GP ${getSortIcon('gp')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'gc')">GC ${getSortIcon('gc')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'sg')">SG ${getSortIcon('sg')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'aproveitamento')">% ${getSortIcon('aproveitamento')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'mgm')">MGm ${getSortIcon('mgm')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'mgs')">MGs ${getSortIcon('mgs')}</th>
                    <th style="cursor:pointer; color:var(--primary-color);" onclick="sortTable(event, 'cs')" title="Clean Sheets">CS ${getSortIcon('cs')}</th>
                    <th style="cursor:pointer; color:#e67e22;" onclick="sortTable(event, 'cg')" title="Clean Goals">CG ${getSortIcon('cg')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'yellowAtl')" title="Amarelos Galo">CA(G) ${getSortIcon('yellowAtl')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'redAtl')" title="Vermelhos Galo">CV(G) ${getSortIcon('redAtl')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'yellowAdv')" title="Amarelos Adv">CA(A) ${getSortIcon('yellowAdv')}</th>
                    <th style="cursor:pointer;" onclick="sortTable(event, 'redAdv')" title="Vermelhos Adv">CV(A) ${getSortIcon('redAdv')}</th>
                </tr>
            </thead>
            <tbody>
                ${list.map(s => calcRow(s)).join('')}
                ${list.length > 0 ? calcRow(total, true) : '<tr><td colspan="18">Nenhum dado filtrado</td></tr>'}
            </tbody>
        </table>
        ${renderTableLegend(['Pts', 'J', 'V', 'E', 'D', 'GP', 'GC', 'SG', 'MGm', 'MGs', 'CS', 'CG', 'CA(G)', 'CV(G)', 'CA(A)', 'CV(A)'])}
    `;

    // Render Charts
    renderGoalDistributionCharts(filteredJogos);
};

let goalsMarkedChart = null;
let goalsConcededChart = null;

const renderGoalDistributionCharts = debounce((filteredJogos) => {
    const bins = ["0-15", "16-30", "31-45", "46-60", "61-75", "76-90"];
    const gmData = [0, 0, 0, 0, 0, 0];
    const gsData = [0, 0, 0, 0, 0, 0];

    filteredJogos.forEach(j => {
        j.lineupGalo?.forEach(l => {
            // Processing Gols Marcados (GM)
            if (l.golsCount > 0 && l.golsMin) {
                l.golsMin.forEach((m, idx) => {
                    let min = parseInt(m);
                    if (isNaN(min)) return;
                    
                    const tempo = parseInt(l.golsTempo?.[idx] || 1);
                    if (tempo === 2) min += 45; // Ex: 15' 2T = 60'
                    
                    const binIdx = Math.min(Math.floor((min - 1) / 15), 5);
                    if (binIdx >= 0) gmData[binIdx]++;
                });
            }

            // Processing Gols Sofridos (GS)
            if (l.gsCount > 0 && l.gsMin) {
                l.gsMin.forEach((m, idx) => {
                    let min = parseInt(m);
                    if (isNaN(min)) return;
                    
                    const tempo = parseInt(l.gsTempo?.[idx] || 1);
                    if (tempo === 2) min += 45; // Ex: 15' 2T = 60'
                    
                    const binIdx = Math.min(Math.floor((min - 1) / 15), 5);
                    if (binIdx >= 0) gsData[binIdx]++;
                });
            }
        });
    });

    const createChart = (id, label, data, color, existingChart) => {
        const ctx = document.getElementById(id);
        if (!ctx) return null;
        if (existingChart) existingChart.destroy();
        
        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: bins,
                datasets: [{
                    label: label,
                    data: data,
                    backgroundColor: color,
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false }, title: { display: true, text: label, font: { size: 16 } } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    };

    goalsMarkedChart = createChart('chart-goals-marked', 'Gols Marcados por Minuto', gmData, 'rgba(46, 204, 113, 0.7)', goalsMarkedChart);
    goalsConcededChart = createChart('chart-goals-conceded', 'Gols Sofridos por Minuto', gsData, 'rgba(231, 76, 60, 0.7)', goalsConcededChart);
}, 300);

const renderStatsIndividuais = (container) => {
    const fTempDe = parseInt(document.getElementById('sti-filter-temporada-de').value) || 0;
    const fTempAte = parseInt(document.getElementById('sti-filter-temporada-ate').value) || 9999;

    // Obtém filtros Multi
    const selectedCamps = state.statsMultiFilters['ind-campeonato'] || [];
    const selectedJogadores = state.statsMultiFilters['ind-jogador'] || [];
    const selectedPosicoes = state.statsMultiFilters['ind-posicao'] || [];
    const selectedTipos = state.statsMultiFilters['ind-tipo'] || [];

    const stats = {};
    state.jogos.forEach(j => {
        const anoJogo = parseInt(j.temporada || j.data.substring(0, 4)) || 0;
        if (fTempDe > 0 && anoJogo < fTempDe) return;
        if (fTempAte < 9999 && anoJogo > fTempAte) return;
        
        // Filtro Campeonato
        const isCampSpecific = selectedCamps.length > 0 && !selectedCamps.includes('Todos');
        if (selectedCamps.length > 0 && !selectedCamps.includes(j.campeonato) && !selectedCamps.includes('Todos')) return;
        if (selectedCamps.length === 0) return;

        // Filtro Tipo (Só aplica se não houver um campeonato específico selecionado)
        if (!isCampSpecific) {
            const comp = state.competicoes.find(c => c.campeonato === j.campeonato);
            if (selectedTipos.length > 0 && !selectedTipos.includes(comp?.tipo) && !selectedTipos.includes('Todos')) return;
            if (selectedTipos.length === 0) return;
        }

        j.lineupGalo?.forEach(l => {
            const player = state.jogadores.find(p => p.nome_guerra === l.jogador && p.temporada === j.temporada);
            if (!stats[l.jogador]) stats[l.jogador] = { nome: l.jogador, foto: l.foto, posicao: l.posicao, jogos: 0, v: 0, d: 0, gols: 0, gs: 0, yellow: 0, red: 0, pontos: 0, cs: 0 };
            
            const s = stats[l.jogador];
            s.jogos++;
            s.gols += parseInt(l.golsCount || 0);
            s.gs += parseInt(l.gsCount || 0);

            const galoGols = (j.casa === 'Atlético' || j.casa === 'Atlético-MG') ? parseInt(j.golsCasa) : parseInt(j.golsFora);
            const advGols = (j.casa === 'Atlético' || j.casa === 'Atlético-MG') ? parseInt(j.golsFora) : parseInt(j.golsCasa);
            
            if (advGols === 0) s.cs++;
            
            if (galoGols > advGols) { s.v++; s.pontos += 3; }
            else if (galoGols < advGols) s.d++;
            else s.pontos += 1;
        });

        j.cartoesGalo?.forEach(c => {
             if (stats[c.jogador]) {
                 stats[c.jogador].yellow += parseInt(c.amarelo || 0);
                 stats[c.jogador].red += parseInt(c.red || 0);
             }
        });
    });

    let list = Object.values(stats);
    if (selectedJogadores.length > 0 && !selectedJogadores.includes('Todos')) {
        list = list.filter(l => selectedJogadores.includes(l.nome));
    } else if (selectedJogadores.length === 0) {
        list = [];
    }

    if (selectedPosicoes.length > 0 && !selectedPosicoes.includes('Todos')) {
        list = list.filter(l => selectedPosicoes.includes(l.posicao));
    } else if (selectedPosicoes.length === 0) {
        list = [];
    }

    // Cascading Filter Logic
    const availableJogadores = (fTempDe > 0 || fTempAte < 9999)
        ? state.jogadores.filter(p => {
            const anoJ = parseInt(p.temporada) || 0;
            return (fTempDe === 0 || anoJ >= fTempDe) && (fTempAte === 9999 || anoJ <= fTempAte);
        })
        : state.jogadores;
        
    const filteredForCamps = state.jogos.filter(j => {
        const anoJogo = parseInt(j.temporada || j.data.substring(0, 4)) || 0;
        return (fTempDe === 0 || anoJogo >= fTempDe) && (fTempAte === 9999 || anoJogo <= fTempAte);
    });
    
    // Bind events
    if (!container.dataset.indBound) {
        ['sti-filter-temporada-de', 'sti-filter-temporada-ate'].forEach(id => {
            const el = document.getElementById(id);
            if(el) el.addEventListener('change', () => renderStatsIndividuais(container));
        });
        container.dataset.indBound = 'true';
    }

    // Inicializa Filtros
    initMultiSelect('sti-multi-campeonato', [...new Set(filteredForCamps.map(j => j.campeonato))].sort(), 'ind-campeonato', () => renderStatsIndividuais(container));
    initMultiSelect('sti-multi-jogador', [...new Set(availableJogadores.map(p => p.nome_guerra))].sort(), 'ind-jogador', () => renderStatsIndividuais(container));
    initMultiSelect('sti-multi-posicao', [...new Set(state.jogadores.map(p => p.posicao))].filter(Boolean), 'ind-posicao', () => renderStatsIndividuais(container));
    initMultiSelect('sti-multi-tipo', [...new Set(state.competicoes.map(c => c.tipo))].filter(Boolean).sort(), 'ind-tipo', () => renderStatsIndividuais(container));

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Foto</th>
                    <th>Jogador <i class="fas fa-sort" style="font-size:0.7rem; opacity:0.5;"></i></th>
                    <th>Posição <i class="fas fa-sort" style="font-size:0.7rem; opacity:0.5;"></i></th>
                    <th>Jogos <i class="fas fa-sort" style="font-size:0.7rem; opacity:0.5;"></i></th>
                    <th>Gols <i class="fas fa-sort" style="font-size:0.7rem; opacity:0.5;"></i></th>
                    <th>Vitórias <i class="fas fa-sort" style="font-size:0.7rem; opacity:0.5;"></i></th>
                    <th>Derrotas <i class="fas fa-sort" style="font-size:0.7rem; opacity:0.5;"></i></th>
                    <th>Aprov. <i class="fas fa-sort" style="font-size:0.7rem; opacity:0.5;"></i></th>
                    <th style="color:var(--primary-color);" title="Clean Sheets">CS</th>
                </tr>
            </thead>
            <tbody>
                ${list.sort((a,b) => b.jogos - a.jogos).map(s => {
                    const aprove = s.jogos > 0 ? ((s.pontos / (s.jogos * 3)) * 100).toFixed(2) : "0.00";
                    return `
                        <tr onclick="showPlayerDetail(${state.jogadores.find(p => p.nome_guerra === s.nome)?.id}, event)" style="cursor:pointer;">
                            <td><img src="${s.foto}" class="mini-foto" style="width:35px; height:35px; border-radius:50%; object-fit:cover; border:1px solid #eee;"></td>
                            <td><strong>${s.nome}</strong></td>
                            <td>${s.posicao}</td>
                            <td>${s.jogos}</td>
                            <td>${s.gols}</td>
                            <td><span class="win-text">${s.v}</span></td>
                            <td><span class="loss-text">${s.d}</span></td>
                            <td>${aprove}%</td>
                            <td style="color:var(--primary-color); font-weight:bold;">${s.cs > 0 ? s.cs : '-'}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
        ${renderTableLegend(['J', 'CS', 'Aprov'])}
    `;
};

const editJogo = (id) => renderNovoJogoPage(state.jogos.find(j => j.id === id));
const deleteJogo = async (id) => {
    if (confirm('Excluir jogo?')) {
        try {
            if (supabaseClient) {
                const { error } = await supabaseClient.from('jogos').delete().eq('id', id);
                if (error) throw error;
            }
            state.jogos = state.jogos.filter(j => j.id !== id);
            renderJogos();
            showToast('Jogo excluído com sucesso!', 'success');
        } catch (e) {
            console.error(e);
            showToast('Erro ao excluir do banco de dados.');
        }
    }
};

const validateBlock = (n) => {
    const block = document.getElementById(`block-${n}`);
    if (!block) return true;
    
    // Select both inputs and selects that are required
    const inputs = block.querySelectorAll('input[required], select[required], textarea[required]');
    let valid = true;

    inputs.forEach(inp => {
        // Skip disabled inputs (like when N/I is checked)
        if (inp.disabled) {
            inp.classList.remove('invalid');
            return;
        }

        const val = inp.value ? inp.value.trim() : '';
        if (val === '' || val === 'Selecione...') {
            inp.classList.add('invalid');
            valid = false;
        } else {
            inp.classList.remove('invalid');
        }
    });

    if (!valid) {
        showToast('Por favor, preencha todos os campos obrigatórios marcados em vermelho.', 'error');
        // Scroll to the first invalid element
        const firstInvalid = block.querySelector('.invalid');
        if (firstInvalid) {
            firstInvalid.focus();
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    return valid;
};

const nextBlock = (n) => {
    const current = parseInt(document.querySelector('.form-block.active').id.split('-')[1]);
    if (n > current && !validateBlock(current)) return;
    
    document.querySelectorAll('.form-block').forEach(b => b.classList.remove('active'));
    document.getElementById(`block-${n}`).classList.add('active');
    window.scrollTo(0,0);
};

// CADASTROS COMMON
const deleteItem = async (tab, id) => {
    if (state.isFormActive) {
        showToast('Não é permitido excluir registros enquanto um formulário de jogo está aberto. Salve ou cancele o jogo primeiro.', 'error');
        return;
    }
    if (confirm('Excluir registro?')) {
        try {
            if (supabaseClient) {
                const { error } = await supabaseClient.from(tab).delete().eq('id', id);
                if (error) throw error;
            }
            state[tab] = state[tab].filter(i => i.id !== id);
            renderTab(tab);
            showToast('Registro excluído com sucesso!', 'success');
        } catch (e) {
            console.error(e);
            showToast('Erro ao excluir do banco de dados.');
        }
    }
};
const prepareEdit = (tab, id) => { 
    state.editingId = id; renderTab(tab); 
    let item = state[tab].find(i => i.id === id); 
    if (tab === 'jogadores') {
        const nome = item.nome_completo.toLowerCase();
        const others = state.jogadores.filter(j => j.nome_completo.toLowerCase() === nome);

        // Função auxiliar: melhor valor entre todos os registros do jogador
        const getBest = (field, defaults = []) => {
            const nonDefault = others.find(m => {
                const v = m[field];
                return v !== undefined && v !== null && v !== '' &&
                       v !== 'https://via.placeholder.com/40' &&
                       !defaults.map(d => d.toLowerCase()).includes(String(v).toLowerCase().trim());
            });
            return nonDefault ? nonDefault[field] : (item[field] || '');
        };

        item = {
            ...item,
            nacionalidade: getBest('nacionalidade', ['brasil']),
            nome_guerra: getBest('nome_guerra'),
            nascimento: getBest('nascimento'),
            observacao: getBest('observacao'),
        };
    }
    const form = document.querySelector(`#form-${tab}`); 
    if(!form) return; 
    Array.from(form.elements).forEach(inp => { 
        if (inp.name && inp.name !== 'foto') { 
            if (inp.type === 'checkbox') inp.checked = item[inp.name] || false; 
            else inp.value = item[inp.name] !== undefined && item[inp.name] !== null ? item[inp.name] : ''; 
        } 
    });
    // Preenche a foto manualmente pois é um hidden input
    const fotoInp = form.querySelector('[name="foto"]');
    const pasteArea = document.getElementById('paste-area-jogador');
    if (fotoInp && item.foto && item.foto !== 'https://via.placeholder.com/40') {
        fotoInp.value = item.foto;
        if (pasteArea) pasteArea.innerHTML = `<img src="${item.foto}" style="max-height:80px;">`;
    }
    window.scrollTo(0,0); 
};
const handleSearch = (tab) => { const search = document.getElementById('search-input'); if(search) search.addEventListener('input', (e) => { const tbody = document.getElementById(`table-body-${tab}`); if(tbody) tbody.innerHTML = renderTableRows(tab, e.target.value); }); };
const setupPasteHandler = (areaId, inputId) => {
    const area = document.getElementById(areaId); const input = document.getElementById(inputId);
    if(!area || !input) return;
    area.tabIndex = 0;
    area.addEventListener('paste', async (e) => {
        const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
        if (item) {
            const r = new FileReader();
            r.onload = async (ev) => {
                const compressed = await compressImage(ev.target.result);
                input.value = compressed;
                area.innerHTML = `<img src="${compressed}" style="max-height:80px;">`;
            };
            r.readAsDataURL(item.getAsFile());
        }
    });
};
const normalizeStr = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const setupAutofillHandler = () => {
    const nameInp = document.getElementById('input-nome-completo');
    if (!nameInp) return;
    nameInp.addEventListener('blur', (e) => {
        const nome = normalizeStr(e.target.value);
        if (!nome) return;

        // Compara sem acentos para suportar digitação de "Matias" == "Matías"
        const matches = state.jogadores.filter(p => normalizeStr(p.nome_completo) === nome);
        if (matches.length === 0) return;

        // Ordena por ID decrescente — suporta ID numérico ou string
        matches.sort((a, b) => {
            const nA = Number(a.id), nB = Number(b.id);
            if (!isNaN(nA) && !isNaN(nB)) return nB - nA;
            return String(b.id).localeCompare(String(a.id));
        });
        const src = matches[0]; // mais recente como base

        // Função auxiliar: pega o melhor valor de um campo entre todos os registros
        // Para um dado campo, prefere valores que não sejam os defaults/vazios
        const getBestValue = (field, defaults = []) => {
            const nonDefault = matches.find(m => {
                const v = m[field];
                return v !== undefined && v !== null && v !== '' &&
                       !defaults.map(d => d.toLowerCase()).includes(String(v).toLowerCase().trim());
            });
            return nonDefault ? nonDefault[field] : (src[field] || '');
        };

        // Preenche cada campo com o melhor valor disponível
        const elNomeGuerra = document.getElementById('input-nome-guerra');
        if (elNomeGuerra) elNomeGuerra.value = getBestValue('nome_guerra');

        const elPosicao = document.getElementById('input-posicao');
        if (elPosicao) elPosicao.value = getBestValue('posicao');

        // Nacionalidade: prioriza qualquer valor diferente de 'Brasil' (padrão do form)
        const elNac = document.getElementById('input-nacionalidade');
        if (elNac) elNac.value = getBestValue('nacionalidade', ['brasil']);

        const elNascimento = document.getElementById('input-nascimento');
        if (elNascimento) elNascimento.value = getBestValue('nascimento');

        const elNumero = document.getElementById('input-numero');
        // O número não é autofilled pois é individual por temporada

        const elObs = document.getElementById('input-observacao');
        if (elObs) elObs.value = src.observacao || '';

        // A foto não é autofilled pois é individual por temporada

        // Checkbox Fora do Elenco
        const foraCheck = document.getElementById('input-fora-do-elenco');
        if (foraCheck) foraCheck.checked = !!src.foraDoElenco;
    });
};

// INITIAL LISTENERS
tabButtons.forEach(btn => btn.addEventListener('click', () => { 
    // Only handle if it's a Cadastros tab
    if (!btn.closest('#cadastros-section')) return;
    
    tabButtons.forEach(b => b.classList.remove('active')); 
    btn.classList.add('active'); 
    renderTab(btn.dataset.tab); 
}));
document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => {
    const page = item.dataset.page;
    if (['estadios', 'competicoes', 'arbitros', 'jogadores', 'cadastros'].includes(page)) {
        showSection('cadastros');
        const targetTab = page === 'cadastros' ? 'adversarios' : page;
        renderTab(targetTab);
        const tabBtn = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`);
        if (tabBtn) {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabBtn.classList.add('active');
        }
    } else if (page === 'elenco') {
        showSection('elenco');
        renderElenco();
    } else if (page === 'artilheiros') {
        showSection('artilheiros');
        renderCurrentArtTab();
    } else if (page === 'cartoes') {

        showSection('cartoes');
        renderCartoes();
    } else if (page === 'arbitragem') {
        showSection('arbitragem');
        renderArbitragem();
    } else if (page === 'estatisticas') {
        showSection('estatisticas');
        renderEstatisticas();
    } else if (page === 'publico-renda') {
        showSection('publico-renda');
        populatePRFilters();
        renderPublicoRenda();
    } else {
        showSection(page);
    }
}));
document.getElementById('btn-novo-jogo')?.addEventListener('click', () => renderNovoJogoPage());
['filter-temporada', 'filter-campeonato', 'filter-casa', 'filter-fora', 'filter-estadio', 'filter-arbitro', 'filter-publico-min', 'filter-publico-max'].forEach(id => { document.getElementById(id)?.addEventListener('change', renderJogos); if(id.includes('publico')) document.getElementById(id)?.addEventListener('input', renderJogos); });
['elenco-filter-temporada', 'elenco-filter-posicao', 'elenco-filter-status', 'elenco-filter-nome', 'elenco-filter-nacionalidade'].forEach(id => document.getElementById(id)?.addEventListener('change', renderElenco));
['elenco-filter-idade-min', 'elenco-filter-idade-max'].forEach(id => document.getElementById(id)?.addEventListener('input', renderElenco));
['art-filter-temporada', 'art-filter-jogador', 'art-filter-posicao', 'art-filter-adversario', 'art-filter-estadio', 'art-filter-campeonato', 'art-filter-tipo', 'art-filter-nacionalidade'].forEach(id => document.getElementById(id)?.addEventListener('change', renderCurrentArtTab));
['cart-filter-temporada', 'cart-filter-time', 'cart-filter-posicao'].forEach(id => document.getElementById(id)?.addEventListener('change', renderCartoes));
['arb-filter-temporada', 'arb-filter-arbitro', 'arb-filter-adversario', 'arb-filter-estadio', 'arb-filter-campeonato', 'arb-filter-tipo', 'arb-filter-ano-de', 'arb-filter-ano-ate'].forEach(id => document.getElementById(id)?.addEventListener('change', renderArbitragem));
['stc-filter-temporada', 'stc-filter-tecnico', 'stc-filter-tipo'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
        if (state.isUpdating) return;
        renderEstatisticas();
    });
});
['stt-filter-temporada'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
        if (state.isUpdating) return;
        renderEstatisticas();
    });
});
document.getElementById('stt-filter-tecnico')?.addEventListener('input', debounce(() => {
    if (state.isUpdating) return;
    renderEstatisticas();
}, 300));

['sti-filter-temporada', 'sti-filter-jogador', 'sti-filter-posicao'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
        if (state.isUpdating) return;
        renderEstatisticas();
    });
});

document.getElementById('export-csv')?.addEventListener('click', () => { let csv = 'Data,Campeonato,Casa,Placar,Fora,Árbitro,Público,Renda\n'; state.jogos.forEach(j => { csv += `${j.data},${j.campeonato},${j.casa},${j.golsCasa}x${j.golsFora},${j.fora},${j.arbitro},${j.publico},${j.renda}\n`; }); const blob = new Blob([csv], { type: 'text/csv' }); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'jogos.csv'; a.click(); });
document.getElementById('export-artilheiros-csv')?.addEventListener('click', () => {
    // Basic export for artilheiros
    alert('Artilheiros exportados com sucesso! (Funcionalidade demonstrativa)');
});


// JOGADORES STATISTICS PAGE
const renderJogadoresPage = () => {
    const container = document.getElementById('jogadores-grid-container');
    if (!container) return;

    const deInp = document.getElementById('jogadores-filter-temp-de');
    const ateInp = document.getElementById('jogadores-filter-temp-ate');
    const nomeInp = document.getElementById('jogadores-filter-nome');

    if (deInp && !deInp.dataset.bound) {
        // Agora usamos 'input' para filtros digitáveis para resposta imediata
        deInp.addEventListener('input', () => { state.jogadoresFilterDe = deInp.value; state.jogadoresCurrentPage = 1; renderJogadoresPage(); });
        ateInp.addEventListener('input', () => { state.jogadoresFilterAte = ateInp.value; state.jogadoresCurrentPage = 1; renderJogadoresPage(); });
        nomeInp.addEventListener('input', () => { state.jogadoresFilterNome = nomeInp.value; state.jogadoresCurrentPage = 1; renderJogadoresPage(); });
        deInp.dataset.bound = 'true';
    }

    // Listeners para as abas de posição
    const posTabs = document.querySelectorAll('#jogadores-pos-tabs .tab-btn');
    posTabs.forEach(btn => {
        if (!btn.dataset.bound) {
            btn.addEventListener('click', () => {
                posTabs.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.jogadoresCurrentPos = btn.dataset.pos;
                state.jogadoresCurrentPage = 1;
                renderJogadoresPage();
            });
            btn.dataset.bound = 'true';
        }
    });

    // Agregação de dados com filtros de temporada
    const statsMap = {};
    const fDe = parseInt(state.jogadoresFilterDe) || 0;
    const fAte = parseInt(state.jogadoresFilterAte) || 9999;

    state.jogos.forEach(j => {
        const temp = parseInt(j.temporada);
        if (temp < fDe || temp > fAte) return;

        const isMandante = (j.casa || '').toLowerCase().includes('atlético');
        const golsAdv = parseInt(isMandante ? j.golsFora : j.golsCasa) || 0;

        if (Array.isArray(j.lineupGalo)) {
            j.lineupGalo.forEach(l => {
                const name = l.jogador;
                if (!name || name === 'Adversário') return;
                
                if (!statsMap[name]) {
                    const pInfo = state.jogadores.find(p => p.nome_guerra === name);
                    statsMap[name] = {
                        nome: name,
                        foto: pInfo?.foto || l.foto || DEFAULT_PLAYER_PHOTO,
                        posicao: pInfo?.posicao || l.posicao || '-',
                        jogos: 0,
                        v: 0, e: 0, d: 0,
                        gols: 0,
                        gs: 0, // Gols Sofridos
                        cs: 0
                    };
                }
                
                const s = statsMap[name];
                s.jogos++;
                const golsGalo = parseInt(isMandante ? j.golsCasa : j.golsFora) || 0;
                if (golsGalo > golsAdv) s.v++;
                else if (golsGalo === golsAdv) s.e++;
                else s.d++;

                s.gols += parseInt(l.golsCount) || 0;
                
                // Se for goleiro, computa gols sofridos
                if (s.posicao === 'Goleiro') {
                    s.gs += golsAdv;
                }

                if (golsAdv === 0) s.cs++;
            });
        }
    });

    let list = Object.values(statsMap);

    // Filtro por Nome
    if (state.jogadoresFilterNome) {
        const term = normalizeString(state.jogadoresFilterNome);
        list = list.filter(p => normalizeString(p.nome).includes(term));
    }

    // Filtro por posição
    if (state.jogadoresCurrentPos !== 'Geral') {
        const pos = state.jogadoresCurrentPos;
        list = list.filter(p => {
            if (pos === 'Goleiro') return p.posicao === 'Goleiro';
            if (pos === 'Lateral-Direito') return p.posicao === 'Lateral-Direito';
            if (pos === 'Lateral-Esquerdo') return p.posicao === 'Lateral-Esquerdo';
            if (pos === 'Zagueiro') return p.posicao === 'Zagueiro';
            if (pos === 'Volante') return p.posicao === 'Volante';
            if (pos === 'Meia') return p.posicao === 'Meia';
            if (pos === 'Atacante') return p.posicao === 'Atacante';
            if (pos === 'Técnico') return p.posicao === 'Técnico';
            return true;
        });
    }

    // Ordenação (por jogos desc)
    list.sort((a, b) => b.jogos - a.jogos || b.gols - a.gols);

    // Paginação
    const rowsPerPage = 20; 
    const totalPages = Math.ceil(list.length / rowsPerPage);
    if (state.jogadoresCurrentPage > totalPages) state.jogadoresCurrentPage = 1;
    const page = state.jogadoresCurrentPage;
    const paginated = list.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    // Renderização em Cards
    container.innerHTML = paginated.length === 0 ? '<div style="grid-column:1/-1; text-align:center; padding:3rem; color:var(--text-muted);">Nenhum jogador encontrado para estes filtros.</div>' : 
        paginated.map((p, i) => {
            const rank = ((page - 1) * rowsPerPage) + i + 1;
            const isGoleiro = p.posicao === 'Goleiro';
            
            return `
                <div class="player-card" onclick="renderPlayerCareerDetail('${p.nome.replace(/'/g, "\\'")}')" style="cursor:pointer; animation: fadeIn 0.4s ease-out both; animation-delay: ${i * 0.05}s;">
                    <div class="player-rank">#${rank}</div>
                    <img src="${p.foto}" class="player-photo" onerror="this.src='${DEFAULT_PLAYER_PHOTO}'">
                    <div class="player-info">
                        <h3 class="player-name">${p.nome}</h3>
                        <div class="player-pos-badge">${p.posicao}</div>
                        <div class="player-stats-summary" style="grid-template-columns: ${isGoleiro ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)'};">
                            <div class="stat-item">
                                <span class="stat-value">${p.jogos}</span>
                                <span class="stat-label">Jogos</span>
                            </div>
                            ${isGoleiro ? `
                                <div class="stat-item">
                                    <span class="stat-value" style="color:var(--danger-color);">${p.gs}</span>
                                    <span class="stat-label">GS</span>
                                </div>
                                <div class="stat-item">
                                    <span class="stat-value" style="color:var(--success-color);">${p.gols}</span>
                                    <span class="stat-label">Gols</span>
                                </div>
                            ` : `
                                <div class="stat-item">
                                    <span class="stat-value" style="color:var(--success-color);">${p.gols}</span>
                                    <span class="stat-label">Gols</span>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    // Atualizar Paginação
    const paginDiv = document.getElementById('jogadores-pagination');
    if (paginDiv) {
        if (totalPages > 1) {
            paginDiv.style.display = 'flex';
            paginDiv.innerHTML = `
                <button class="page-btn" onclick="state.jogadoresCurrentPage=${page - 1}; renderJogadoresPage();" ${page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
                <span style="font-weight:600;">Página ${page} de ${totalPages} <span style="font-size:0.8rem; color:var(--text-muted);">(${list.length} jogadores)</span></span>
                <button class="page-btn" onclick="state.jogadoresCurrentPage=${page + 1}; renderJogadoresPage();" ${page >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
            `;
        } else {
            paginDiv.style.display = 'none';
        }
    }
};

const renderPlayerCareerDetail = (playerName) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '5000';
    
    const pInfo = state.jogadores.find(p => p.nome_guerra === playerName);
    const isGoleiro = pInfo?.posicao === 'Goleiro';
    
    // Coleta de jogos para estreia e último jogo
    let playerGames = [];
    
    // Agregação por temporada
    const seasonsMap = {};
    state.jogos.forEach(j => {
        const line = j.lineupGalo?.find(l => l.jogador === playerName);
        if (!line) return;
        
        playerGames.push(j);
        
        const temp = j.temporada;
        if (!seasonsMap[temp]) seasonsMap[temp] = { temporada: temp, j: 0, v: 0, e: 0, d: 0, gols: 0, cs: 0, gs: 0, jssg: 0, jsmg: 0 };
        
        const isMandante = (j.casa || '').toLowerCase().includes('atlético');
        const golsGalo = parseInt(isMandante ? j.golsCasa : j.golsFora) || 0;
        const golsAdv = parseInt(isMandante ? j.golsFora : j.golsCasa) || 0;
        
        const s = seasonsMap[temp];
        s.j++;
        if (golsGalo > golsAdv) s.v++;
        else if (golsGalo === golsAdv) s.e++;
        else s.d++;
        
        const gCount = parseInt(line.golsCount) || 0;
        s.gols += gCount;
        
        if (isGoleiro) {
            s.gs += golsAdv;
            if (golsAdv === 0) s.jssg++;
        }
        if (gCount === 0) s.jsmg++;
        
        if (golsAdv === 0) s.cs++;
    });

    // Ordenação cronológica para Estreia e Último Jogo
    playerGames.sort((a, b) => new Date(a.data) - new Date(b.data));

    const formatFullMatchInfo = (j) => {
        if (!j) return 'N/I';
        const dateStr = j.data.split('-').reverse().join('/');
        return `${dateStr} - ${j.casa} ${j.golsCasa}x${j.golsFora} ${j.fora} - ${j.campeonato}`;
    };

    const debutInfo = formatFullMatchInfo(playerGames[0]);
    const lastInfo = formatFullMatchInfo(playerGames[playerGames.length - 1]);
    
    // Find first goal
    const gamesWithGoals = playerGames.filter(j => {
        const line = j.lineupGalo?.find(l => l.jogador === playerName);
        return line && parseInt(line.golsCount) > 0;
    });
    // playerGames is already sorted chronologically, so index 0 is the first goal
    const firstGoalInfo = gamesWithGoals.length > 0 ? formatFullMatchInfo(gamesWithGoals[0]) : null;

    // Sorting seasons oldest to newest (ascending)
    const seasons = Object.values(seasonsMap).sort((a, b) => a.temporada - b.temporada);
    
    // Calculate Totals
    const totals = seasons.reduce((acc, s) => {
        acc.j += s.j;
        acc.v += s.v;
        acc.e += s.e;
        acc.d += s.d;
        acc.gols += s.gols;
        acc.gs += s.gs || 0;
        acc.jssg += s.jssg || 0;
        acc.jsmg += s.jsmg || 0;
        return acc;
    }, { j: 0, v: 0, e: 0, d: 0, gols: 0, gs: 0, jssg: 0, jsmg: 0 });
    const foto = pInfo?.foto || DEFAULT_PLAYER_PHOTO;

    overlay.innerHTML = `
        <div class="modal-content" style="padding: 2rem; width: 95%; max-width: 900px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
                <div style="display:flex; align-items:center; gap:1.5rem;">
                    <img src="${foto}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:3px solid var(--primary-color);">
                    <div>
                        <h2 style="margin:0; font-size:1.8rem;">${playerName}</h2>
                        <div style="color:var(--text-muted); font-size:0.9rem;">${pInfo?.nome_completo || ''}</div>
                        <div class="badge position-badge" style="margin-top:0.5rem;">${pInfo?.posicao || '-'}</div>
                    </div>
                </div>
                <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times" style="font-size:1.5rem;"></i></button>
            </div>

            <div style="margin-bottom: 1.5rem; padding: 1rem; background: var(--bg-highlight); border-radius: 8px; border-left: 4px solid var(--primary-color);">
                <div style="margin-bottom: 0.5rem; font-size: 0.95rem;">
                    <strong style="color: var(--text-muted);">Estreia:</strong> 
                    <span style="margin-left: 0.5rem; font-weight: 500;">${debutInfo}</span>
                </div>
                <div style="margin-bottom: ${firstGoalInfo ? '0.5rem' : '0'}; font-size: 0.95rem;">
                    <strong style="color: var(--text-muted);">Último Jogo:</strong> 
                    <span style="margin-left: 0.5rem; font-weight: 500;">${lastInfo}</span>
                </div>
                ${firstGoalInfo ? `
                <div style="font-size: 0.95rem;">
                    <strong style="color: var(--text-muted);">Primeiro gol:</strong> 
                    <span style="margin-left: 0.5rem; font-weight: 500;">${firstGoalInfo}</span>
                </div>
                ` : ''}
            </div>

            <div class="stats-section">
                <div class="stats-section-title">Histórico por Temporada</div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Temporada</th>
                            <th>Jogos</th>
                            <th style="color:var(--success-color);">V</th>
                            <th style="color:var(--warning-color);">E</th>
                            <th style="color:var(--danger-color);">D</th>
                            <th>Gols</th>
                            ${isGoleiro ? `
                                <th style="color:var(--danger-color);" title="Gols Sofridos">GS</th>
                                <th title="Jogos Sem Sofrer Gol">JSSG</th>
                            ` : `
                                <th title="Jogos Sem Marcar Gol">JSMG</th>
                            `}
                            <th>Aprov</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${seasons.map(s => {
                            const aprov = s.j > 0 ? (((s.v * 3) + s.e) / (s.j * 3) * 100).toFixed(1) : 0;
                            return `
                                <tr>
                                    <td style="font-weight:bold; color:var(--primary-color);">${s.temporada}</td>
                                    <td>${s.j}</td>
                                    <td style="color:var(--success-color);">${s.v}</td>
                                    <td>${s.e}</td>
                                    <td style="color:var(--danger-color);">${s.d}</td>
                                    <td style="font-weight:bold;">${s.gols}</td>
                                    ${isGoleiro ? `
                                        <td style="color:var(--danger-color);">${s.gs}</td>
                                        <td style="color:#27ae60;">${s.jssg}</td>
                                    ` : `
                                        <td style="color:var(--text-muted);">${s.jsmg}</td>
                                    `}
                                    <td style="font-weight:600;">${aprov}%</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="background: rgba(255, 255, 255, 0.05); font-weight: bold; border-top: 2px solid rgba(255, 255, 255, 0.1);">
                            <td style="color: var(--text-main);">TOTAL</td>
                            <td>${totals.j}</td>
                            <td style="color:var(--success-color);">${totals.v}</td>
                            <td>${totals.e}</td>
                            <td style="color:var(--danger-color);">${totals.d}</td>
                            <td>${totals.gols}</td>
                            ${isGoleiro ? `
                                <td style="color:var(--danger-color);">${totals.gs}</td>
                                <td style="color:#27ae60;">${totals.jssg}</td>
                            ` : `
                                <td style="color:var(--text-muted);">${totals.jsmg}</td>
                            `}
                            <td>${totals.j > 0 ? (((totals.v * 3) + totals.e) / (totals.j * 3) * 100).toFixed(1) : 0}%</td>
                        </tr>
                    </tfoot>

                </table>
                <div style="margin-top: 1rem; font-size: 0.8rem; color: var(--text-muted); display: flex; gap: 1.5rem;">
                    ${isGoleiro ? `
                        <span><strong>GS:</strong> Gols Sofridos</span>
                        <span><strong>JSSG:</strong> Jogos Sem Sofrer Gol</span>
                    ` : `
                        <span><strong>JSMG:</strong> Jogos Sem Marcar Gol</span>
                    `}
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
};

// DASHBOARD & DATA MGMT
const renderDashboard = () => {
    window.populateDashboardFilters();

    const isCurrentYearOnly = document.getElementById('dash-filtro-ano')?.checked;
    const deYear = document.getElementById('dash-filter-temp-de')?.value;
    const ateYear = document.getElementById('dash-filter-temp-ate')?.value;
    
    let jogos = state.jogos || [];
    
    if (isCurrentYearOnly) {
        const currentYear = new Date().getFullYear().toString();
        jogos = jogos.filter(j => j.temporada === currentYear || j.data?.includes(currentYear));
    } else if (deYear && ateYear) {
        const yStart = parseInt(deYear);
        const yEnd = parseInt(ateYear);
        jogos = jogos.filter(j => {
            const y = parseInt(j.temporada || j.data?.substring(0, 4));
            return y >= yStart && y <= yEnd;
        });
    }
    
    let jogosTotal = jogos.length;
    let v = 0, e = 0, d = 0;
    let publicoTotal = 0, jogosComPublico = 0;
    let rendaTotal = 0, jogosComRenda = 0;
    let gm = 0, gs = 0;
    let cs = 0, cg = 0;
    
    let artilheirosMap = {};
    let amarelosMap = {};
    let vermelhosMap = {};

    jogos.forEach(j => {
        // V, E, D
        const isMandante = j.casa === 'Atlético-MG' || j.casa === 'Atlético';
        const golsA = parseInt(j.golsCasa) || 0;
        const golsB = parseInt(j.golsFora) || 0;
        
        let golsGalo = isMandante ? golsA : golsB;
        let golsAdv = isMandante ? golsB : golsA;
        
        gm += golsGalo;
        gs += golsAdv;
        
        if(golsGalo > golsAdv) v++;
        else if(golsGalo === golsAdv) e++;
        else d++;
        
        if (golsAdv === 0) cs++;
        if (golsGalo === 0) cg++;
        
        // Público e Renda (Apenas Mandante)
        const casaLower = (j.casa || '').toLowerCase();
        // Critério estrito para evitar pegar "Athletico-PR" ou similares
        const isMandanteReal = casaLower === 'atlético' || casaLower === 'atletico' || casaLower === 'atlético-mg';

        if (isMandanteReal) {
            if (j.publico && j.publico !== 'N/I') {
                let p = typeof j.publico === 'number' ? j.publico : parseInt(String(j.publico).replace(/\D/g, '')) || 0;
                if (p > 0) { publicoTotal += p; jogosComPublico++; }
            }
            if (j.renda && j.renda !== 'N/I') {
                let rValue = 0;
                if (typeof j.renda === 'number') {
                    rValue = j.renda;
                } else {
                    // Trata formatos: "R$ 1.234,56", "1234,56", "1.234,56"
                    let cleanR = String(j.renda).replace('R$', '').trim();
                    if (cleanR.includes(',') && cleanR.includes('.')) {
                        cleanR = cleanR.replace(/\./g, '').replace(',', '.');
                    } else if (cleanR.includes(',')) {
                        cleanR = cleanR.replace(',', '.');
                    }
                    rValue = parseFloat(cleanR) || 0;
                }
                if (rValue > 0) { rendaTotal += rValue; jogosComRenda++; }
            }
        }
        
        // Artilheiros
        if(Array.isArray(j.lineupGalo)) {
            j.lineupGalo.forEach(x => {
                const gCount = parseInt(x.golsCount) || 0;
                if(gCount > 0) {
                    artilheirosMap[x.jogador] = (artilheirosMap[x.jogador] || 0) + gCount;
                }
            });
        }
        
        // Cartões
        if(Array.isArray(j.cartoesGalo)) {
            j.cartoesGalo.forEach(c => {
                const pNome = c.jogador;
                if(!pNome || pNome === 'Adversário') return;
                
                const yellow = parseInt(c.amarelo) || 0;
                const red = parseInt(c.red) || 0;
                
                if(yellow > 0) amarelosMap[pNome] = (amarelosMap[pNome] || 0) + yellow;
                if(red > 0) vermelhosMap[pNome] = (vermelhosMap[pNome] || 0) + red;
            });
        }
    });

    // Top Cards
    let aproveitamento = jogosTotal > 0 ? (((v * 3) + (e * 1)) / (jogosTotal * 3)) * 100 : 0;
    let mediaP = jogosComPublico > 0 ? Math.round(publicoTotal / jogosComPublico) : 0;
    let mediaR = jogosComRenda > 0 ? rendaTotal / jogosComRenda : 0;
    
    document.getElementById('dash-jogos-total').innerText = jogosTotal;
    document.getElementById('dash-aproveitamento').innerText = aproveitamento.toFixed(1) + '%';
    document.getElementById('dash-media-publico').innerText = mediaP.toLocaleString('pt-BR');
    document.getElementById('dash-media-renda').innerText = mediaR.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    
    // Mid Cards
    document.getElementById('dash-vitorias').innerText = v;
    document.getElementById('dash-empates').innerText = e;
    document.getElementById('dash-derrotas').innerText = d;
    document.getElementById('dash-cs').innerText = cs;
    document.getElementById('dash-cg').innerText = cg;
    
    document.getElementById('dash-gm').innerText = gm;
    document.getElementById('dash-gs').innerText = gs;
    document.getElementById('dash-mgm').innerText = jogosTotal > 0 ? (gm / jogosTotal).toFixed(2) : '0.00';
    document.getElementById('dash-mgs').innerText = jogosTotal > 0 ? (gs / jogosTotal).toFixed(2) : '0.00';
    
    const totaisAmarelos = Object.values(amarelosMap).reduce((a, b) => a + b, 0);
    const totaisVermelhos = Object.values(vermelhosMap).reduce((a, b) => a + b, 0);
    document.getElementById('dash-ca').innerText = totaisAmarelos;
    document.getElementById('dash-cv').innerText = totaisVermelhos;

    // Helper for Rankings
    const renderRank = (mapHash, containerId, colorCount) => {
        const sorted = Object.entries(mapHash).sort((a,b) => b[1] - a[1]).slice(0, 10);
        const container = document.getElementById(containerId);
        if(!container) return;
        container.innerHTML = '';
        if(sorted.length === 0) {
            container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhum registro.</span>';
            return;
        }
        sorted.forEach((item, index) => {
            const player = state.jogadores.find(p => p.nome_guerra === item[0]);
            const photo = player?.foto ? `<img src="${player.foto}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;">` : `<div style="width:30px;height:30px;border-radius:50%;background:#eee;display:flex;align-items:center;justify-content:center;font-size:0.7rem;"><i class="fas fa-user"></i></div>`;
            container.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
                    <div style="display: flex; align-items: center; gap: 0.8rem;">
                        <span style="color: #bdc3c7; font-weight: bold; width: 20px;">#${index+1}</span>
                        ${photo}
                        <span style="font-weight: 500; color: var(--text-main);">${item[0]}</span>
                    </div>
                    <span style="font-weight: bold; font-size: 1.1rem; color: ${colorCount};">${item[1]}</span>
                </div>
            `;
        });
    };

    renderRank(artilheirosMap, 'dash-rank-artilheiros', 'var(--text-main)');
    renderRank(amarelosMap, 'dash-rank-amarelos', '#f39c12');
    renderRank(vermelhosMap, 'dash-rank-vermelhos', '#c0392b');
};

// PUBLICO E RENDA LOGIC
const populatePRFilters = () => {
    setupAutocomplete('pr-filter-temporada', 'jogos', 'temporada', null, null, false);
    setupAutocomplete('pr-filter-campeonato', 'jogos', 'campeonato', null, null, false);
    setupAutocomplete('pr-filter-adversario', 'adversarios', 'clube', null, null, false);
    setupAutocomplete('pr-filter-estadio', 'estadios', 'nome', null, null, false);
    
    ['pr-filter-temporada', 'pr-filter-campeonato', 'pr-filter-adversario', 'pr-filter-estadio'].forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.dataset.filterBound) {
            el.addEventListener('input', () => { 
                state.currentPage = 1;
                const activeTab = document.querySelector('#pr-tabs-header .tab-btn.active')?.dataset.tab || 'hist-temporada';
                renderPublicoRenda(activeTab); 
                updatePRFiltersOptions(id); // Atualiza os outros filtros
            });
            el.dataset.filterBound = 'true';
        }
    });

    // Inicializa as opções se ainda não foram carregadas
    updatePRFiltersOptions();
};

const updatePRFiltersOptions = (excludeId = null) => {
    const fTemp = document.getElementById('pr-filter-temporada')?.value.toLowerCase();
    const fComp = document.getElementById('pr-filter-campeonato')?.value.toLowerCase();
    const fAdv = document.getElementById('pr-filter-adversario')?.value.toLowerCase();
    const fEst = document.getElementById('pr-filter-estadio')?.value.toLowerCase();

    // Filtra os jogos baseando-se no que já está selecionado PARA populat os filtros
    let filtered = (state.jogos || []).filter(j => j.casa === 'Atlético' || j.casa === 'Atlético-MG');

    // Funções auxiliares para popular cada campo
    const populatePRAutocomplete = (id, field, sourceData) => {
        if (id === excludeId) return; // Não filtra o campo que o usuário está digitando no momento
        
        // Aplica os filtros dos OUTROS campos para ver o que sobra neste
        let currentFiltered = filtered;
        if (id !== 'pr-filter-temporada' && fTemp) currentFiltered = currentFiltered.filter(j => j.temporada.toLowerCase().includes(fTemp));
        if (id !== 'pr-filter-campeonato' && fComp) currentFiltered = currentFiltered.filter(j => j.campeonato.toLowerCase().includes(fComp));
        if (id !== 'pr-filter-adversario' && fAdv) currentFiltered = currentFiltered.filter(j => j.fora.toLowerCase().includes(fAdv));
        if (id !== 'pr-filter-estadio' && fEst) currentFiltered = currentFiltered.filter(j => (j.estadio || '').toLowerCase().includes(fEst));

        const uniqueValues = [...new Set(currentFiltered.map(j => j[field]))].filter(Boolean).sort();
        
        // Reconfigura o autocomplete com os novos valores
        const sourceName = `dynamic_${id}`;
        state[sourceName] = uniqueValues.map(v => ({ [field]: v }));
        setupAutocomplete(id, sourceName, field, null, null, false); // false para não mostrar "Novo" nestes filtros
    };

    populatePRAutocomplete('pr-filter-temporada', 'temporada');
    populatePRAutocomplete('pr-filter-campeonato', 'campeonato');
    populatePRAutocomplete('pr-filter-adversario', 'fora');
    populatePRAutocomplete('pr-filter-estadio', 'estadio');
};

const clearPRFilters = () => {
    ['pr-filter-temporada', 'pr-filter-campeonato', 'pr-filter-adversario', 'pr-filter-estadio'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    state.currentPage = 1;
    const activeTab = document.querySelector('#pr-tabs-header .tab-btn.active')?.dataset.tab || 'hist-temporada';
    renderPublicoRenda(activeTab);
};

const renderPublicoRenda = (tabId = 'hist-temporada') => {
    // Tab switching internal
    const prTabsHeader = document.getElementById('pr-tabs-header');
    if (prTabsHeader) {
        prTabsHeader.querySelectorAll('.tab-btn').forEach(btn => {
            btn.onclick = () => {
                prTabsHeader.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.querySelectorAll('#publico-renda-section .tab-content').forEach(c => {
                    c.style.display = 'none';
                    c.classList.remove('active');
                });
                const target = document.getElementById(`tab-${btn.dataset.tab}`);
                if (target) {
                    target.style.display = 'block';
                    target.classList.add('active');
                    // Reset manual sort when switching to these specific tabs to trigger auto-sort
                    if (btn.dataset.tab === 'maiores-publicos' || btn.dataset.tab === 'menores-publicos') {
                        state.sortConfig.tableId = null;
                        state.sortConfig.column = null;
                    }
                    renderPublicoRenda(btn.dataset.tab);
                }
            };
        });
    }

    const fTemp = document.getElementById('pr-filter-temporada')?.value;
    const fComp = document.getElementById('pr-filter-campeonato')?.value;
    const fAdv = document.getElementById('pr-filter-adversario')?.value;
    const fEst = document.getElementById('pr-filter-estadio')?.value;

    let jogosMandante = (state.jogos || []).filter(j => j.casa === 'Atlético' || j.casa === 'Atlético-MG');

    // Aplicar Filtros
    if(fTemp) jogosMandante = jogosMandante.filter(j => j.temporada.toLowerCase().includes(fTemp.toLowerCase()));
    if(fComp) jogosMandante = jogosMandante.filter(j => j.campeonato.toLowerCase().includes(fComp.toLowerCase()));
    if(fAdv) jogosMandante = jogosMandante.filter(j => j.fora.toLowerCase().includes(fAdv.toLowerCase()));
    if(fEst) jogosMandante = jogosMandante.filter(j => j.estadio.toLowerCase().includes(fEst.toLowerCase()));

    if (tabId === 'hist-temporada') {
        const agrp = {};
        jogosMandante.forEach(j => {
            const temp = j.temporada;
            if (!agrp[temp]) agrp[temp] = { temporada: temp, jogos: 0, v: 0, e: 0, d: 0, gm: 0, gs: 0, pTotal: 0, rTotal: 0, jP: 0, jR: 0, menorP: Infinity, maiorP: -Infinity, menorR: Infinity, maiorR: -Infinity };
            const isCasa = j.casa === 'Atlético' || j.casa === 'Atlético-MG';
            const gM = parseInt(isCasa ? j.golsCasa : j.golsFora) || 0;
            const gS = parseInt(isCasa ? j.golsFora : j.golsCasa) || 0;
            agrp[temp].jogos++;
            if (gM > gS) agrp[temp].v++; else if (gM === gS) agrp[temp].e++; else agrp[temp].d++;
            agrp[temp].gm += gM; agrp[temp].gs += gS;
            
            if (j.publico && j.publico !== 'N/I' && !j.portoesFechados) {
                const p = typeof j.publico === 'number' ? j.publico : parseInt(String(j.publico).replace(/\D/g, '')) || 0;
                if (p > 0) {
                    agrp[temp].pTotal += p; agrp[temp].jP++;
                    if (p < agrp[temp].menorP) agrp[temp].menorP = p;
                    if (p > agrp[temp].maiorP) agrp[temp].maiorP = p;
                }
            }
            if (j.renda && j.renda !== 'N/I' && !j.portoesFechados) {
                const r = parseCurrency(j.renda);
                if (r > 0) {
                    agrp[temp].rTotal += r; agrp[temp].jR++;
                    if (r < agrp[temp].menorR) agrp[temp].menorR = r;
                    if (r > agrp[temp].maiorR) agrp[temp].maiorR = r;
                }
            }
        });

        const rows = Object.values(agrp).map(v => ({
            ...v,
            aprov: (v.jogos > 0 ? ((v.v * 3 + v.e) / (v.jogos * 3)) * 100 : 0),
            mediaP: (v.jP > 0 ? v.pTotal / v.jP : 0),
            mediaR: (v.jR > 0 ? v.rTotal / v.jR : 0),
            ticket: (v.pTotal > 0 ? v.rTotal / v.pTotal : 0)
        }));

        const sortedRows = sortInternal(rows, 'table-hist-temporada');
        
        const tbody = document.querySelector('#tab-hist-temporada tbody');
        if (tbody) {
            tbody.innerHTML = sortedRows.map(v => `
                <tr>
                    <td style="font-weight: 600; color: var(--primary-color);">${v.temporada}</td>
                    <td class="val-highlight">${v.jogos}</td>
                    <td style="color:#2ecc71; font-weight:bold;">${v.v}</td>
                    <td style="color:#f1c40f; font-weight:bold;">${v.e}</td>
                    <td style="color:#e74c3c; font-weight:bold;">${v.d}</td>
                    <td>${v.gm}</td>
                    <td>${v.gs}</td>
                    <td style="font-weight: 700;">${v.aprov.toFixed(1)}%</td>
                    <td class="val-highlight">${Math.round(v.mediaP).toLocaleString('pt-BR')}</td>
                    <td>${formatCurrency(v.mediaR)}</td>
                    <td>${formatCurrency(v.ticket)}</td>
                    <td>${v.menorP === Infinity ? '0' : v.menorP.toLocaleString('pt-BR')}</td>
                    <td>${formatCurrency(v.menorR === Infinity ? 0 : v.menorR)}</td>
                    <td>${v.maiorP === -Infinity ? '0' : v.maiorP.toLocaleString('pt-BR')}</td>
                    <td>${formatCurrency(v.maiorR === -Infinity ? 0 : v.maiorR)}</td>
                </tr>
            `).join('');
        }
    } else if (tabId === 'maiores-publicos' || tabId === 'menores-publicos') {
        const list = jogosMandante.map(j => {
            const isNI = j.publico === 'N/I';
            const p = isNI ? 0 : (typeof j.publico === 'number' ? j.publico : parseInt(String(j.publico).replace(/\D/g, '')) || 0);
            const rNI = j.renda === 'N/I';
            const r = rNI ? 0 : parseCurrency(j.renda);
            
            return { 
                temporada: j.temporada, 
                adversario: j.fora, 
                competicao: j.campeonato, 
                publico: p, 
                renda: r,
                rendaNI: rNI,
                publicoNI: isNI,
                ticket: (p > 0 && !isNaN(r)) ? r / p : 0,
                dataRaw: j.data
            };
        }).filter(item => !item.publicoNI && item.publico > 0); // Somente jogos com público informado e maior que zero entram no ranking

        const tableId = `table-${tabId}`;
        const sortedList = sortInternal(list, tableId);

        // Force auto-sort if no manual sort
        if (state.sortConfig.tableId !== tableId) {
            if (tabId === 'maiores-publicos') sortedList.sort((a, b) => b.publico - a.publico);
            else sortedList.sort((a, b) => a.publico - b.publico);
        }

        const top50 = sortedList.slice(0, 50);
        const tbody = document.querySelector(`#${tableId} tbody`);
        if (tbody) {
            tbody.innerHTML = top50.map((v, i) => {
                const rank = i + 1;
                const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
                const rendaDisplay = v.rendaNI ? '<span style="color:var(--text-muted); font-style:italic;">Não informada</span>' : formatCurrency(v.renda);
                
                return `
                    <tr>
                        <td><div class="rank-badge ${rankClass}">${rank}º</div></td>
                        <td>${v.temporada}</td>
                        <td style="font-weight: 600; color: var(--text-main);">${v.adversario}</td>
                        <td>${v.competicao}</td>
                        <td class="val-highlight">${v.publico.toLocaleString('pt-BR')}</td>
                        <td>${rendaDisplay}</td>
                        <td>${v.ticket > 0 ? formatCurrency(v.ticket) : (v.rendaNI ? '-' : 'R$ 0,00')}</td>
                    </tr>
                `;
            }).join('');
        }
    } else if (tabId === 'estat-estadios') {
        const estStats = {};
        jogosMandante.forEach(j => {
            const est = j.estadio;
            if (!est) return;
            if (!estStats[est]) estStats[est] = { nome: est, jogos: 0, v: 0, e: 0, d: 0, gm: 0, gs: 0, pTotal: 0, rTotal: 0, jP: 0, jR: 0, menorP: Infinity, maiorP: -Infinity, menorR: Infinity, maiorR: -Infinity };
            const gC = parseInt(j.golsCasa) || 0;
            const gF = parseInt(j.golsFora) || 0;
            estStats[est].jogos++;
            if (gC > gF) estStats[est].v++; else if (gC === gF) estStats[est].e++; else estStats[est].d++;
            estStats[est].gm += gC; estStats[est].gs += gF;
            
            if (j.publico && j.publico !== 'N/I') {
                const p = typeof j.publico === 'number' ? j.publico : parseInt(String(j.publico).replace(/\D/g, '')) || 0;
                estStats[est].pTotal += p; estStats[est].jP++;
                if (p < estStats[est].menorP) estStats[est].menorP = p;
                if (p > estStats[est].maiorP) estStats[est].maiorP = p;
            }
            if (j.renda && j.renda !== 'N/I') {
                const r = parseCurrency(j.renda);
                estStats[est].rTotal += r; estStats[est].jR++;
                if (r < estStats[est].menorR) estStats[est].menorR = r;
                if (r > estStats[est].maiorR) estStats[est].maiorR = r;
            }
        });

        const container = document.getElementById('cards-estat-estadios');
        container.className = 'estadios-grid-5';
        container.innerHTML = '';

        Object.values(estStats).forEach(s => {
            const estObj = state.estadios.find(e => e.nome === s.nome);
            const foto = estObj?.foto ? estObj.foto : 'https://via.placeholder.com/400x200?text=Estádio';
            const aprov = (s.jogos > 0 ? ((s.v * 3 + s.e) / (s.jogos * 3)) * 100 : 0);

            const card = document.createElement('div');
            card.className = 'card';
            card.style.cssText = 'padding:0; overflow:hidden; cursor:pointer;';
            card.innerHTML = `
                <img src="${foto}" style="width:100%; height:180px; object-fit:cover;">
                <div style="padding:1.5rem;">
                    <h3 style="margin-bottom:1rem; border-bottom:2px solid var(--primary-color); display:inline-block;">${s.nome}</h3>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; font-size:0.85rem;">
                        <span><strong>Jogos:</strong> ${s.jogos}</span>
                        <span><strong>Aprov:</strong> ${aprov.toFixed(1)}%</span>
                        <span><strong>V/E/D:</strong> ${s.v}/${s.e}/${s.d}</span>
                        <span><strong>Gols:</strong> ${s.gm}-${s.gs}</span>
                        <span><strong>Média Público:</strong> ${(s.jP > 0 ? Math.round(s.pTotal/s.jP) : 0).toLocaleString('pt-BR')}</span>
                        <span><strong>Média Renda:</strong> ${formatCurrency(s.jR > 0 ? s.rTotal/s.jR : 0)}</span>
                        <span><strong>Ticket Médio:</strong> ${formatCurrency(s.pTotal > 0 ? s.rTotal/s.pTotal : 0)}</span>
                    </div>
                    <div style="margin-top:1rem; padding-top:1rem; border-top:1px solid #eee; display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; font-size:0.8rem; color:var(--text-muted);">
                        <span><strong>Menor público:</strong> ${(s.menorP === Infinity ? 0 : s.menorP).toLocaleString('pt-BR')}</span>
                        <span><strong>Maior público:</strong> ${(s.maiorP === -Infinity ? 0 : s.maiorP).toLocaleString('pt-BR')}</span>
                        <span><strong>Menor renda:</strong> ${formatCurrency(s.menorR === Infinity ? 0 : s.menorR)}</span>
                        <span><strong>Maior renda:</strong> ${formatCurrency(s.maiorR === -Infinity ? 0 : s.maiorR)}</span>
                    </div>
                </div>
            `;
            // Vincula clique diretamente à função (sem onclick inline, sem depender de window.*)
            card.addEventListener('click', () => renderEstadioModal(s.nome));
            container.appendChild(card);
        });
    }
};

const renderCuriosidades = () => {
    const grid = document.getElementById('curiosidades-grid');
    if (!grid) return;

    const fCamp = document.getElementById('cur-filter-campeonato').value;
    const fTipo = document.getElementById('cur-filter-tipo').value;
    const fAdv = document.getElementById('cur-filter-adversario').value;
    const fEst = document.getElementById('cur-filter-estadio').value;
    const fAnoDe = document.getElementById('cur-filter-ano-de').value;
    const fAnoAte = document.getElementById('cur-filter-ano-ate').value;

    let filtered = [...state.jogos];
    if (fCamp) filtered = filtered.filter(j => j.campeonato === fCamp);
    if (fAdv) filtered = filtered.filter(j => j.casa === fAdv || j.fora === fAdv);
    if (fEst) filtered = filtered.filter(j => j.estadio === fEst);
    if (fAnoDe) filtered = filtered.filter(j => {
        const ano = parseInt(j.data.substring(0,4));
        return ano >= parseInt(fAnoDe);
    });
    if (fAnoAte) filtered = filtered.filter(j => {
        const ano = parseInt(j.data.substring(0,4));
        return ano <= parseInt(fAnoAte);
    });
    if (fTipo) {
        filtered = filtered.filter(jg => {
            const comp = state.competicoes.find(c => c.campeonato === jg.campeonato);
            return comp?.tipo === fTipo;
        });
    }

    // Populando filtros e autocomplete na primeira vez
    const campSel = document.getElementById('cur-filter-campeonato');
    if (campSel && campSel.options.length === 1) {
        populateFilter('cur-filter-campeonato', [...new Set(state.jogos.map(j => j.campeonato))]);
        
        setupAutocomplete('cur-filter-adversario', 'adversarios', 'clube', null, () => renderCuriosidades());
        setupAutocomplete('cur-filter-estadio', 'estadios', 'nome', null, () => renderCuriosidades());

        ['cur-filter-campeonato', 'cur-filter-tipo'].forEach(id => {
            document.getElementById(id).addEventListener('change', renderCuriosidades);
        });
        ['cur-filter-ano-de', 'cur-filter-ano-ate', 'cur-filter-adversario', 'cur-filter-estadio'].forEach(id => {
            document.getElementById(id).addEventListener('input', renderCuriosidades);
        });
    }

    const formatVal = (val, type) => {
        if (type === 'money') return formatCurrency(val);
        if (type === 'number') return val.toLocaleString('pt-BR');
        return val;
    };

    const createTable = (title, data, valueKey, type = 'number', extraLabel = '', extraCols = []) => {
        return `
            <div class="stats-section detail-section-bg" style="margin:0; box-shadow: var(--shadow-sm); width:100%; border-radius:12px; overflow:hidden;">
                <div class="stats-section-title" style="padding: 1.2rem 1.5rem; background: rgba(212, 175, 55, 0.05); color: var(--primary-color); font-size: 1.15rem; font-weight: 800; letter-spacing: 0.5px; border-bottom: 1px solid rgba(212, 175, 55, 0.1); display: flex; align-items: center; gap: 0.8rem; text-transform: uppercase;">
                    <i class="fas fa-trophy" style="font-size: 1rem;"></i>
                    ${title}
                </div>
                <div class="table-responsive">
                    <table class="data-table" style="font-size:0.85rem; width:100%;">
                        <thead>
                            <tr>
                                <th style="text-align:center;">Data</th>
                                <th style="text-align:center;">Campeonato</th>
                                <th style="text-align:center;">Adversário</th>
                                ${extraCols.map(c => `<th style="text-align:center;">${c}</th>`).join('')}
                                <th style="text-align:right;">${extraLabel || 'Valor'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.slice(0, 5).map(j => {
                                const adv = j.casa === 'Atlético' || j.casa === 'Atlético-MG' ? j.fora : j.casa;
                                const val = j[valueKey] !== undefined ? formatVal(j[valueKey], type) : (j.sortVal !== undefined ? formatVal(j.sortVal, type) : '-');
                                return `
                                    <tr>
                                        <td>${j.data.split('-').reverse().join('/')}</td>
                                        <td>${j.campeonato}</td>
                                        <td><strong>${adv}</strong></td>
                                        ${extraCols.map(c => {
                                            const label = c.toLowerCase();
                                            let key = '';
                                            if (label === 'estádio') key = 'estadio';
                                            else if (label === 'jogador') key = 'jogador';
                                            else if (label === 'placar') key = 'placar';
                                            
                                            const cellVal = j[key] || '-';
                                            return `<td>${cellVal}</td>`;
                                        }).join('')}
                                        <td style="text-align:right; font-weight:bold; color:var(--primary-color);">${val}</td>
                                    </tr>
                                `;
                            }).join('')}
                            ${data.length === 0 ? `<tr><td colspan="${4 + extraCols.length}" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Nenhum registro encontrado com os filtros aplicados.</td></tr>` : ''}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    };

    // 1. Maiores e Menores Públicos (Apenas mandante)
    const publicosBase = filtered.filter(j => (j.casa === 'Atlético' || j.casa === 'Atlético-MG') && j.publico && j.publico !== 'N/I' && !j.portoesFechados);
    
    const maioresPublicos = [...publicosBase]
        .map(j => ({ ...j, sortVal: parseInt(j.publico) || 0 }))
        .filter(j => j.sortVal > 0)
        .sort((a, b) => b.sortVal - a.sortVal);

    const menoresPublicos = [...publicosBase]
        .map(j => ({ ...j, sortVal: parseInt(j.publico) || 0 }))
        .filter(j => j.sortVal > 0)
        .sort((a, b) => a.sortVal - b.sortVal);

    // 2. Maiores e Menores Rendas (Apenas mandante)
    const rendasBase = filtered.filter(j => (j.casa === 'Atlético' || j.casa === 'Atlético-MG') && j.renda && j.renda !== 'N/I' && !j.portoesFechados);
    
    const maioresRendas = [...rendasBase]
        .map(j => ({ ...j, sortVal: parseCurrency(j.renda) }))
        .filter(j => j.sortVal > 0)
        .sort((a, b) => b.sortVal - a.sortVal);

    const menoresRendas = [...rendasBase]
        .map(j => ({ ...j, sortVal: parseCurrency(j.renda) }))
        .filter(j => j.sortVal > 0)
        .sort((a, b) => a.sortVal - b.sortVal);

    // 3. Jogadores com mais gols (Recorde Individual)
    const recordeGolsIndiv = [];
    filtered.forEach(j => {
        (j.lineupGalo || []).forEach(p => {
            if (p.golsCount > 0) {
                recordeGolsIndiv.push({
                    data: j.data,
                    casa: j.casa,
                    fora: j.fora,
                    campeonato: j.campeonato,
                    jogador: p.jogador,
                    sortVal: p.golsCount
                });
            }
        });
    });
    recordeGolsIndiv.sort((a, b) => b.sortVal - a.sortVal || new Date(b.data) - new Date(a.data));

    // 4. Maiores Vitórias e Derrotas
    const maioresVitorias = [...filtered]
        .map(j => {
            const isGaloMandante = j.casa === 'Atlético' || j.casa === 'Atlético-MG';
            const gGalo = parseInt(isGaloMandante ? j.golsCasa : j.golsFora) || 0;
            const gAdv = parseInt(isGaloMandante ? j.golsFora : j.golsCasa) || 0;
            const saldo = gGalo - gAdv;
            return { ...j, sortVal: saldo, gGalo, placar: `${gGalo} x ${gAdv}` };
        })
        .filter(j => j.sortVal > 0)
        .sort((a, b) => b.sortVal - a.sortVal || b.gGalo - a.gGalo);

    const maioresDerrotas = [...filtered]
        .map(j => {
            const isGaloMandante = j.casa === 'Atlético' || j.casa === 'Atlético-MG';
            const gGalo = parseInt(isGaloMandante ? j.golsCasa : j.golsFora) || 0;
            const gAdv = parseInt(isGaloMandante ? j.golsFora : j.golsCasa) || 0;
            const saldo = gAdv - gGalo;
            return { ...j, sortVal: saldo, gAdv, placar: `${gGalo} x ${gAdv}` };
        })
        .filter(j => j.sortVal > 0)
        .sort((a, b) => b.sortVal - a.sortVal || b.gAdv - a.gAdv);

    // 5. Mais Gols Marcados e Sofridos
    const maisGolsMarcados = [...filtered]
        .map(j => {
            const isGaloMandante = j.casa === 'Atlético' || j.casa === 'Atlético-MG';
            return { ...j, sortVal: parseInt(isGaloMandante ? j.golsCasa : j.golsFora) || 0 };
        })
        .sort((a, b) => b.sortVal - a.sortVal);

    const maisGolsSofridos = [...filtered]
        .map(j => {
            const isGaloMandante = j.casa === 'Atlético' || j.casa === 'Atlético-MG';
            return { ...j, sortVal: parseInt(isGaloMandante ? j.golsFora : j.golsCasa) || 0 };
        })
        .sort((a, b) => b.sortVal - a.sortVal);

    // 6. Cartões
    const cartoesStats = (field, team) => {
        return [...filtered]
            .map(j => {
                const list = team === 'galo' ? (j.cartoesGalo || []) : (j.cartoesAdv || []);
                const count = list.reduce((acc, c) => acc + (parseInt(c[field]) || 0), 0);
                return { ...j, sortVal: count };
            })
            .sort((a, b) => b.sortVal - a.sortVal);
    };

    grid.innerHTML = `
        ${createTable('Maiores Públicos', maioresPublicos, 'sortVal', 'number', 'Público', ['Estádio'])}
        ${createTable('Menores Públicos', menoresPublicos, 'sortVal', 'number', 'Público', ['Estádio'])}
        ${createTable('Maiores Rendas', maioresRendas, 'sortVal', 'money', 'Renda', ['Estádio'])}
        ${createTable('Menores Rendas', menoresRendas, 'sortVal', 'money', 'Renda', ['Estádio'])}
        ${createTable('Jogadores com mais gols em um único jogo', recordeGolsIndiv, 'sortVal', 'number', 'Gols', ['Jogador'])}
        ${createTable('Maiores Vitórias', maioresVitorias, 'placar', 'string', 'Placar')}
        ${createTable('Maiores Derrotas', maioresDerrotas, 'placar', 'string', 'Placar')}
        ${createTable('Mais Gols Marcados', maisGolsMarcados, 'sortVal', 'number', 'Gols')}
        ${createTable('Mais Gols Sofridos', maisGolsSofridos, 'sortVal', 'number', 'Gols')}
        ${createTable('Mais Amarelos Recebidos', cartoesStats('amarelo', 'galo'), 'sortVal', 'number', 'Cartões')}
        ${createTable('Mais Vermelhos Recebidos', cartoesStats('red', 'galo'), 'sortVal', 'number', 'Cartões')}
        ${createTable('Mais Amarelos do Adversário', cartoesStats('amarelo', 'adv'), 'sortVal', 'number', 'Cartões')}
        ${createTable('Mais Vermelhos do Adversário', cartoesStats('red', 'adv'), 'sortVal', 'number', 'Cartões')}
    `;
};



window.clearCurFilters = () => {
    ['cur-filter-campeonato', 'cur-filter-tipo', 'cur-filter-adversario', 'cur-filter-estadio', 'cur-filter-ano-de', 'cur-filter-ano-ate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    renderCuriosidades();
};

window.clearAdvFilters = () => {
    const ids = ['adv-filter-temporada', 'adv-filter-campeonato', 'adv-filter-adversario', 'adv-filter-estadio'];
    ids.forEach(id => { if (document.getElementById(id)) document.getElementById(id).value = ''; });
    renderAdversariosPage();
};

const renderClubeStats = () => {
    setupAutocomplete('adv-filter-temporada', 'jogos', 'temporada', null, renderClubeStats);
    setupAutocomplete('adv-filter-campeonato', 'jogos', 'campeonato', null, renderClubeStats);
    setupAutocomplete('adv-filter-adversario', 'adversarios', 'clube', null, renderClubeStats);
    setupAutocomplete('adv-filter-estadio', 'estadios', 'nome', null, renderClubeStats);

    const container = document.getElementById('cards-estat-adversarios');
    if (!container) return;

    const fTemp = document.getElementById('adv-filter-temporada')?.value;
    const fComp = document.getElementById('adv-filter-campeonato')?.value;
    const fAdv = document.getElementById('adv-filter-adversario')?.value;
    const fEst = document.getElementById('adv-filter-estadio')?.value;

    let filteredJogos = state.jogos;

    if(fTemp) filteredJogos = filteredJogos.filter(j => j.temporada.toLowerCase().includes(fTemp.toLowerCase()));
    if(fComp) filteredJogos = filteredJogos.filter(j => j.campeonato.toLowerCase().includes(fComp.toLowerCase()));
    if(fAdv) filteredJogos = filteredJogos.filter(j => (j.fora.toLowerCase().includes(fAdv.toLowerCase()) || j.casa.toLowerCase().includes(fAdv.toLowerCase())));
    if(fEst) filteredJogos = filteredJogos.filter(j => j.estadio.toLowerCase().includes(fEst.toLowerCase()));

    const advStats = {};

    filteredJogos.forEach(j => {
        const isGaloMandante = j.casa === 'Atlético' || j.casa === 'Atlético-MG';
        if (!isGaloMandante && j.fora !== 'Atlético' && j.fora !== 'Atlético-MG') return;
        
        const advName = isGaloMandante ? j.fora : j.casa;
        if (!advStats[advName]) {
            const advObj = state.adversarios.find(a => a.clube === advName);
            advStats[advName] = {
                nome: advName,
                estado: advObj?.estado || '-',
                pais: advObj?.pais || '-',
                escudo: advObj?.escudo || 'https://via.placeholder.com/45',
                jogos: 0, v: 0, e: 0, d: 0, gm: 0, gs: 0, pts: 0,
                pTotal: 0, jP: 0, rTotal: 0, jR: 0, cs: 0, cg: 0
            };
        }
        
        const s = advStats[advName];
        s.jogos++;
        const galoGols = parseInt(isGaloMandante ? j.golsCasa : j.golsFora) || 0;
        const advGols = parseInt(isGaloMandante ? j.golsFora : j.golsCasa) || 0;
        s.gm += galoGols;
        s.gs += advGols;

        if (galoGols > advGols) { s.v++; s.pts += 3; }
        else if (galoGols === advGols) { s.e++; s.pts += 1; }
        else s.d++;

        if (advGols === 0) s.cs++;
        if (galoGols === 0) s.cg++;

        if (j.publico && j.publico !== 'N/I' && !j.portoesFechados) {
            const p = typeof j.publico === 'number' ? j.publico : parseInt(String(j.publico).replace(/\D/g, '')) || 0;
            if (p > 0) { s.pTotal += p; s.jP++; }
        }
        if (j.renda && j.renda !== 'N/I' && !j.portoesFechados) {
            const r = parseCurrency(j.renda);
            if (r > 0) { s.rTotal += r; s.jR++; }
        }
    });

    const list = Object.values(advStats).sort((a, b) => b.jogos - a.jogos);
    const rowsPerPage = 40;
    const totalPages = Math.ceil(list.length / rowsPerPage);
    if (state.advClubePage > totalPages) state.advClubePage = 1;
    const page = state.advClubePage;
    const paginated = list.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    container.className = 'adversarios-grid';
    container.innerHTML = paginated.map(s => {
        const aprov = s.jogos > 0 ? ((s.pts / (s.jogos * 3)) * 100).toFixed(1) : 0;
        return `
            <div class="adversario-stat-card" onclick="renderAdversarioPRModal('${s.nome.replace(/'/g, "\\'")}')">
                <div class="adversario-header">
                    <img src="${s.escudo}" alt="${s.nome}">
                    <div>
                        <h3>${s.nome}</h3>
                        <div style="font-size:0.75rem; color:var(--text-muted);">${s.estado} | ${s.pais}</div>
                    </div>
                </div>
                <div class="adv-stats-body">
                    <div class="adv-stat-item"><strong>Jogos</strong><span>${s.jogos}</span></div>
                    <div class="adv-stat-item"><strong>Aproveitamento</strong><span>${aprov}%</span></div>
                    <div class="adv-stat-item"><strong>V/E/D</strong><span>${s.v}/${s.e}/${s.d}</span></div>
                    <div class="adv-stat-item"><strong>Gols M/S</strong><span>${s.gm}/${s.gs}</span></div>
                    <div class="adv-stat-item" title="Clean Sheets"><strong>Clean Sheets</strong><span style="color:#27ae60;">${s.cs}</span></div>
                    <div class="adv-stat-item" title="Clean Goals"><strong>Clean Goals</strong><span style="color:#e67e22;">${s.cg}</span></div>
                    <div class="adv-stat-item"><strong>Méd. Público</strong><span>${(s.jP > 0 ? Math.round(s.pTotal/s.jP).toLocaleString('pt-BR') : 0)}</span></div>
                    <div class="adv-stat-item"><strong>Méd. Renda</strong><span>${formatCurrency(s.jR > 0 ? s.rTotal/s.jR : 0)}</span></div>
                </div>
            </div>
        `;
    }).join('');

    // Paginação
    const paginDiv = document.getElementById('adv-clube-pagination');
    if (paginDiv) {
        if (totalPages > 1) {
            paginDiv.style.display = 'flex';
            paginDiv.innerHTML = `
                <button class="page-btn" onclick="state.advClubePage=${page-1}; renderClubeStats();" ${page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
                <span style="font-weight:600; color:var(--text-main);">Página ${page} de ${totalPages} <span style="color:var(--text-muted); font-size:0.85rem;">(${list.length} clubes)</span></span>
                <button class="page-btn" onclick="state.advClubePage=${page+1}; renderClubeStats();" ${page >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
            `;
        } else {
            paginDiv.style.display = 'none';
        }
    }
};

window.changeAdvTab = (tab) => {
    state.advTab = tab;

    // Esconder todas as abas de conteúdo
    const allContents = document.querySelectorAll('#adversarios-section .tab-content');
    allContents.forEach(c => {
        c.classList.remove('active');
        c.style.display = 'none';
    });

    // Remover active de todos os botões de aba
    document.querySelectorAll('#adversarios-section .tabs-container .tab-btn').forEach(b => b.classList.remove('active'));

    if (tab === 'clubes') {
        const btn = document.getElementById('btn-adv-tab-clubes');
        const content = document.getElementById('tab-content-clubes');
        if (btn) btn.classList.add('active');
        if (content) { content.classList.add('active'); content.style.display = 'block'; }
        renderClubeStats();
    } else {
        const btn = document.getElementById('btn-adv-tab-tecnicos');
        const content = document.getElementById('tab-content-tecnicos');
        if (btn) btn.classList.add('active');
        if (content) { content.classList.add('active'); content.style.display = 'block'; }
        renderTecnicoStats();
    }
};

const renderTecnicoStats = () => {
    const tbody = document.getElementById('table-body-tecnicos-adv');
    if (!tbody) return;

    setupAutocomplete('adv-tec-filter-temporada', 'jogos', 'temporada', null, () => { state.advTecPage = 1; renderTecnicoStats(); });
    setupAutocomplete('adv-tec-filter-tecnico', 'jogos', 'tecnicoAdv', null, () => { state.advTecPage = 1; renderTecnicoStats(); });
    setupAutocomplete('adv-tec-filter-clube', 'adversarios', 'clube', null, () => { state.advTecPage = 1; renderTecnicoStats(); });

    const minJogosEl = document.getElementById('adv-tec-filter-min-jogos');
    if (minJogosEl && !minJogosEl._listenerAdded) {
        minJogosEl._listenerAdded = true;
        minJogosEl.addEventListener('input', () => { state.advTecPage = 1; renderTecnicoStats(); });
    }

    const fTemp = document.getElementById('adv-tec-filter-temporada')?.value;
    const fTec = document.getElementById('adv-tec-filter-tecnico')?.value;
    const fClube = document.getElementById('adv-tec-filter-clube')?.value;
    const fMinJogos = parseInt(document.getElementById('adv-tec-filter-min-jogos')?.value) || 0;

    let filteredJogos = state.jogos;
    if(fTemp) filteredJogos = filteredJogos.filter(j => j.temporada.toLowerCase().includes(fTemp.toLowerCase()));
    if(fTec) filteredJogos = filteredJogos.filter(j => j.tecnicoAdv && j.tecnicoAdv.toLowerCase().includes(fTec.toLowerCase()));
    if(fClube) filteredJogos = filteredJogos.filter(j => (j.casa.toLowerCase().includes(fClube.toLowerCase()) || j.fora.toLowerCase().includes(fClube.toLowerCase())));

    const tecStats = {};

    filteredJogos.forEach(j => {
        if (!j.tecnicoAdv) return;
        const tec = j.tecnicoAdv;
        const isGaloMandante = j.casa === 'Atlético' || j.casa === 'Atlético-MG';
        const advClube = isGaloMandante ? j.fora : j.casa;
        
        if (!tecStats[tec]) {
            tecStats[tec] = {
                tecnico: tec,
                totalClubes: new Set(),
                jogos: 0,
                v: 0, e: 0, d: 0,
                gm: 0, gs: 0
            };
        }

        const s = tecStats[tec];
        s.totalClubes.add(advClube);
        s.jogos++;

        const galoGols = parseInt(isGaloMandante ? j.golsCasa : j.golsFora) || 0;
        const advGols = parseInt(isGaloMandante ? j.golsFora : j.golsCasa) || 0;

        // Perspectiva do Galo (Atlético)
        s.gm += galoGols;
        s.gs += advGols;

        if (galoGols > advGols) s.v++;
        else if (galoGols === advGols) s.e++;
        else s.d++;
    });

    let statsArr = Object.values(tecStats).map(s => {
        const pts = (s.v * 3) + s.e;
        return {
            ...s,
            clubesCount: s.totalClubes.size,
            aprov: s.jogos > 0 ? ((pts / (s.jogos * 3)) * 100).toFixed(1) : 0,
            medGM: s.jogos > 0 ? (s.gm / s.jogos).toFixed(2) : 0,
            medGS: s.jogos > 0 ? (s.gs / s.jogos).toFixed(2) : 0
        };
    });

    // Filtro de mínimo de jogos
    if (fMinJogos > 0) statsArr = statsArr.filter(s => s.jogos >= fMinJogos);

    // Ordenação automática por número de jogos (maior para menor)
    statsArr.sort((a, b) => b.jogos - a.jogos);

    const sorted = sortInternal(statsArr, 'table-tecnicos-adv');

    // Paginação 50 a 50
    const rowsPerPage = 50;
    const totalPages = Math.ceil(sorted.length / rowsPerPage);
    if (state.advTecPage > totalPages) state.advTecPage = 1;
    const page = state.advTecPage;
    const paginated = sorted.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    tbody.innerHTML = paginated.map(s => `
        <tr onclick="showTecnicoJogos('${s.tecnico.replace(/'/g, "\\'")}', event)" style="cursor:pointer;" title="Clique para ver os jogos contra este técnico">
            <td><strong>${s.tecnico}</strong></td>
            <td>${s.clubesCount}</td>
            <td>${s.jogos}</td>
            <td style="color:#27ae60; font-weight:bold;">${s.v}</td>
            <td>${s.e}</td>
            <td style="color:#e74c3c; font-weight:bold;">${s.d}</td>
            <td>${s.gm}</td>
            <td>${s.gs}</td>
            <td style="font-weight:bold;">${s.aprov}%</td>
            <td>${s.medGM}</td>
            <td>${s.medGS}</td>
        </tr>
    `).join('');

    // Renderizar paginação
    const paginDiv = document.getElementById('adv-tec-pagination');
    if (paginDiv) {
        if (totalPages > 1) {
            paginDiv.style.display = 'flex';
            paginDiv.innerHTML = `
                <button class="page-btn" onclick="state.advTecPage=${page-1}; renderTecnicoStats();" ${page <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
                <span style="font-weight:600; color:var(--text-main);">Página ${page} de ${totalPages} <span style="color:var(--text-muted); font-size:0.85rem;">(${sorted.length} técnicos)</span></span>
                <button class="page-btn" onclick="state.advTecPage=${page+1}; renderTecnicoStats();" ${page >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
            `;
        } else {
            paginDiv.style.display = 'none';
            paginDiv.innerHTML = `<span style="color:var(--text-muted); font-size:0.85rem;">${sorted.length} técnico(s)</span>`;
            if (sorted.length > 0) paginDiv.style.display = 'flex';
        }
    }
};

window.showTecnicoJogos = (tecnicoNome, event) => {
    const row = event.currentTarget.closest('tr');
    const existing = document.getElementById(`tec-detail-${tecnicoNome.replace(/\s+/g, '-')}`);
    document.querySelectorAll('.tr-detail-row-tec').forEach(r => r.remove());
    if (existing) return;

    const tecGames = state.jogos.filter(j => j.tecnicoAdv === tecnicoNome).sort((a,b) => new Date(b.data) - new Date(a.data));

    const html = `
        <tr id="tec-detail-${tecnicoNome.replace(/\s+/g, '-')}" class="tr-detail-row-tec">
            <td colspan="12">
                <div class="tr-detail-container" style="background:var(--bg-color); border:1px solid var(--border-color); padding:1rem; animation: slideDown 0.3s ease;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                        <h4 style="margin:0;">Jogos de ${tecnicoNome} contra o Atlético</h4>
                        <button class="btn-icon" onclick="this.closest('tr').remove()"><i class="fas fa-times"></i></button>
                    </div>
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Temporada</th>
                                <th>Campeonato</th>
                                <th>Equipe Técnico</th>
                                <th>Placar</th>
                                <th>Estádio</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tecGames.map(j => {
                                const isGaloMandante = j.casa === 'Atlético' || j.casa === 'Atlético-MG';
                                const tecEquipe = isGaloMandante ? j.fora : j.casa;
                                const placar = isGaloMandante ? `${j.golsFora} x ${j.golsCasa}` : `${j.golsCasa} x ${j.golsFora}`; // Perspectiva do Técnico
                                return `
                                    <tr>
                                        <td>${j.data.split('-').reverse().join('/')}</td>
                                        <td>${j.temporada}</td>
                                        <td>${j.campeonato}</td>
                                        <td><strong>${tecEquipe}</strong></td>
                                        <td style="font-weight:bold;">${placar}</td>
                                        <td>${j.estadio}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </td>
        </tr>
    `;
    row.insertAdjacentHTML('afterend', html);
};

window.renderAdversariosPage = () => {
    if (state.advTab === 'clubes') {
        renderClubeStats();
    } else {
        renderTecnicoStats();
    }
};

let advModalPage = 1;
const advRowsPerPage = 20;

const renderAdversarioPRModal = (clubeNome) => {
    advModalPage = 1;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'adv-pr-modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '4000';
    
    overlay.innerHTML = `
        <div class="modal-content" style="padding: 2rem; width: 95%; max-width: 1200px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
                <h2 style="margin:0;">Jogos contra: ${clubeNome}</h2>
                <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times" style="font-size:1.5rem;"></i></button>
            </div>

            <div id="adv-modal-games-container" style="width: 100%; border: none;">
                <!-- Jogos serão renderizados aqui -->
            </div>
            
            <div id="adv-modal-pagination" class="pagination-controls">
                <!-- Paginação será renderizada aqui -->
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    updateAdversarioModalGames(clubeNome);
};

window.updateAdversarioModalGames = (clubeNome) => {
    let filtered = state.jogos.filter(j => 
        (j.fora === clubeNome && (j.casa === 'Atlético' || j.casa === 'Atlético-MG')) || 
        (j.casa === clubeNome && (j.fora === 'Atlético' || j.fora === 'Atlético-MG'))
    );

    filtered.sort((a,b) => new Date(b.data) - new Date(a.data));

    const totalPages = Math.ceil(filtered.length / advRowsPerPage);
    const start = (advModalPage - 1) * advRowsPerPage;
    const paginated = filtered.slice(start, start + advRowsPerPage);

    const container = document.getElementById('adv-modal-games-container');
    container.innerHTML = `
        <table class="premium-table">
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Competição</th>
                    <th style="text-align:right;">Casa</th>
                    <th style="text-align:center;">Placar</th>
                    <th>Fora</th>
                    <th>Público</th>
                    <th>Renda</th>
                    <th>Estádio</th>
                </tr>
            </thead>
            <tbody>
                ${paginated.map(j => `
                    <tr style="cursor: pointer;" onclick="showJogoDetail(${j.id}, event)">
                        <td>${j.data.split('-').reverse().join('/')}</td>
                        <td>${j.campeonato}</td>
                        <td style="text-align:right;">${j.casa}</td>
                        <td style="font-weight:bold; text-align:center;">${j.golsCasa} x ${j.golsFora}</td>
                        <td>${j.fora}</td>
                        <td class="val-highlight">${(j.publico && j.publico !== 'N/I' && !j.portoesFechados) ? parseInt(j.publico).toLocaleString('pt-BR') : (j.portoesFechados ? 'P.F.' : 'N/I')}</td>
                        <td>${(j.renda && j.renda !== 'N/I' && !j.portoesFechados) ? formatCurrency(j.renda) : (j.portoesFechados ? '0' : 'N/I')}</td>
                        <td>${j.estadio || '-'}</td>
                    </tr>
                `).join('')}
                ${filtered.length === 0 ? '<tr><td colspan="6" style="text-align:center; padding:2rem;">Nenhum jogo encontrado com os filtros aplicados.</td></tr>' : ''}
            </tbody>
        </table>
        ${renderTableLegend(['J'])}
    `;

    const paginContainer = document.getElementById('adv-modal-pagination');
    paginContainer.innerHTML = `
        <button class="page-btn" ${advModalPage === 1 ? 'disabled' : ''} onclick="changeAdvModalPage('${clubeNome.replace(/'/g, "\\'")}', ${advModalPage - 1})">Anterior</button>
        <span style="font-weight:600;">Página ${advModalPage} de ${totalPages || 1}</span>
        <button class="page-btn" ${advModalPage === totalPages || totalPages === 0 ? 'disabled' : ''} onclick="changeAdvModalPage('${clubeNome.replace(/'/g, "\\'")}', ${advModalPage + 1})">Próxima</button>
    `;
};

window.changeAdvModalPage = (clubeNome, page) => {
    advModalPage = page;
    updateAdversarioModalGames(clubeNome);
};

window.renderAdversarioPRModal = renderAdversarioPRModal;


function sortInternal(data, tableId) {
    if (state.sortConfig.tableId === tableId && state.sortConfig.column) {
        const { column, direction } = state.sortConfig;
        
        data.sort((a, b) => {
            let valA = a[column];
            let valB = b[column];

            // Helper to extract numeric value from formatted strings
            const getSortValue = (v) => {
                if (v === undefined || v === null) return -Infinity;
                if (typeof v === 'number') return v;
                
                let s = String(v).toLowerCase();
                
                // Moeda/Preço
                if (s.includes('r$') || s.includes('%')) {
                    return parseCurrency(s);
                }
                
                // Placar (ex: "2x1") -> retorna o saldo do placar para ordenação aproximada ou o primeiro valor
                if (s.includes('x') && /^\d+x\d+$/.test(s.replace(/\s/g, ''))) {
                    const parts = s.split('x');
                    return parseInt(parts[0]) * 100 + parseInt(parts[1]); // Ordena pelo primeiro gol, depois pelo segundo
                }

                // Data (YYYY-MM-DD ou DD/MM/YYYY)
                if (/^\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s).getTime();
                if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
                    const p = s.split('/');
                    return new Date(`${p[2]}-${p[1]}-${p[0]}`).getTime();
                }

                // Tenta converter qualquer string numérica
                const cleanNum = s.replace(/[^\d.-]/g, '');
                if (cleanNum !== '' && !isNaN(cleanNum)) return parseFloat(cleanNum);

                return s;
            };

            const sortA = getSortValue(valA);
            const sortB = getSortValue(valB);

            if (typeof sortA === 'string' && typeof sortB === 'string') {
                return direction === 'asc' ? sortA.localeCompare(sortB) : sortB.localeCompare(sortA);
            }

            return direction === 'asc' ? (sortA > sortB ? 1 : -1) : (sortA < sortB ? 1 : -1);
        });
    }
    return data;
};

function sortTable(event, column, type) {
    const th = event.currentTarget;
    const table = th.closest('table');
    const tableId = table.id;

    if (state.sortConfig.column === column && state.sortConfig.tableId === tableId) {
        state.sortConfig.direction = state.sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortConfig.column = column;
        state.sortConfig.direction = 'asc';
        state.sortConfig.tableId = tableId;
    }

    // Update icons
    table.querySelectorAll('th i').forEach(icon => {
        icon.className = 'fas fa-sort';
    });
    const icon = th.querySelector('i');
    if (state.sortConfig.direction === 'asc') icon.className = 'fas fa-sort-up';
    else icon.className = 'fas fa-sort-down';

    // Re-render the correct section/tab
    if (tableId === 'table-hist-temporada') renderPublicoRenda('hist-temporada');
    else if (tableId === 'table-maiores-publicos') renderPublicoRenda('maiores-publicos');
    else if (tableId === 'table-menores-publicos') renderPublicoRenda('menores-publicos');
    else if (tableId === 'jogos-table') renderJogos();
    else if (tableId === 'artilheiros-table') renderArtilheiros();
    else if (tableId === 'cartoes-table') renderCartoes();
    else if (tableId === 'arbitragem-table') renderArbitragem();
    else if (tableId === 'table-tecnicos-adv') renderTecnicoStats();
    else if (tableId === 'table-atletico-tecnicos') renderAtleticoTecnicos(document.getElementById('stats-content-container'));
    else if (tableId === 'table-stats-fase') renderStatsPorFase(document.getElementById('stats-content-container'));
    else if (tableId === 'table-stats-coletivas') renderStatsColetivas(document.getElementById('stats-content-container'));
};



const renderEstadioModal = (estadioNome) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';
    overlay.style.zIndex = '4000';
    
    const jogosEstadio = state.jogos.filter(j => j.estadio === estadioNome && (j.casa === 'Atlético' || j.casa === 'Atlético-MG' || j.fora === 'Atlético' || j.fora === 'Atlético-MG'))
                                   .sort((a, b) => new Date(b.data) - new Date(a.data));

    window.estModalData = { jogos: jogosEstadio, page: 1, perPage: 20 };

    const processMap = (keyFn) => {
        const mapObj = {};
        jogosEstadio.forEach(j => {
            const k = keyFn(j) || 'N/I';
            if (!mapObj[k]) mapObj[k] = { nome: k, j:0, v:0, e:0, d:0, gm:0, gs:0, pts:0, p:0, jP:0, r:0, jR:0 };
            const s = mapObj[k];
            s.j++;
            const gGalo = parseInt(j.casa === 'Atlético' || j.casa === 'Atlético-MG' ? j.golsCasa : j.golsFora) || 0;
            const gAdv = parseInt(j.casa === 'Atlético' || j.casa === 'Atlético-MG' ? j.golsFora : j.golsCasa) || 0;
            s.gm += gGalo; s.gs += gAdv;
            if(gGalo > gAdv) { s.v++; s.pts += 3; }
            else if(gGalo === gAdv) { s.e++; s.pts += 1; }
            else s.d++;
            if(j.publico && j.publico !== 'N/I' && !j.portoesFechados) {
                const pVal = typeof j.publico === 'number' ? j.publico : parseInt(String(j.publico).replace(/\D/g, ''))||0;
                if(pVal>0) { s.p += pVal; s.jP++; }
            }
            if(j.renda && j.renda !== 'N/I' && !j.portoesFechados) {
                const rVal = parseCurrency(j.renda);
                if(rVal>0) { s.r += rVal; s.jR++; }
            }
        });
        return mapObj;
    };

    const tempMap = processMap(j => j.temporada);
    const campMap = processMap(j => j.campeonato);

    const renderTable = (mapObj) => Object.values(mapObj).sort((a,b)=>b.j - a.j).map(s => {
        const aprov = s.j > 0 ? ((s.pts / (s.j*3))*100).toFixed(1) : 0;
        const mgm = s.j > 0 ? (s.gm / s.j).toFixed(2) : '0.00';
        const mp = s.jP > 0 ? Math.round(s.p/s.jP).toLocaleString('pt-BR') : 0;
        const mr = s.jR > 0 ? formatCurrency(s.r/s.jR) : formatCurrency(0);
        return `<tr>
            <td style="color:var(--primary-color); font-weight:bold;">${s.nome}</td>
            <td>${s.j}</td><td style="color:var(--success-color);">${s.v}</td><td>${s.e}</td><td style="color:#e74c3c;">${s.d}</td>
            <td>${s.gm}</td><td>${s.gs}</td>
            <td>${aprov}%</td><td>${mgm}</td>
            <td>${mp}</td><td>${mr}</td>
        </tr>`;
    }).join('');

    overlay.innerHTML = `
        <div class="modal-content" style="padding: 2rem; width: 95%; max-width: 1200px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1.5rem;">
                <h2 style="margin:0;">Estádio: ${estadioNome}</h2>
                <button class="btn-icon" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times" style="font-size:1.5rem;"></i></button>
            </div>

            <div class="tabs-container" id="est-modal-tabs" style="margin-bottom: 1rem;">
                <button class="tab-btn active" id="btn-est-temp" onclick="window.switchEstadioModalTab('est-temp')"><i class="fas fa-calendar-alt"></i> Temporada</button>
                <button class="tab-btn" id="btn-est-camp" onclick="window.switchEstadioModalTab('est-camp')"><i class="fas fa-trophy"></i> Campeonato</button>
                <button class="tab-btn" id="btn-est-hist" onclick="window.switchEstadioModalTab('est-hist')"><i class="fas fa-list"></i> Histórico de Jogos</button>
            </div>

            <!-- TAB TEMPORADA -->
            <div id="est-temp" class="est-modal-pane">
                <table class="data-table premium-table">
                    <thead><tr><th>Temporada</th><th>Jogos</th><th>V</th><th>E</th><th>D</th><th>GM</th><th>GS</th><th>Aprov</th><th>Média GM</th><th>Média Público</th><th>Média Renda</th></tr></thead>
                    <tbody>${renderTable(tempMap)}</tbody>
                </table>
            </div>

            <!-- TAB CAMPEONATO -->
            <div id="est-camp" class="est-modal-pane hidden">
                <table class="data-table premium-table">
                    <thead><tr><th>Campeonato</th><th>Jogos</th><th>V</th><th>E</th><th>D</th><th>GM</th><th>GS</th><th>Aprov</th><th>Média GM</th><th>Média Público</th><th>Média Renda</th></tr></thead>
                    <tbody>${renderTable(campMap)}</tbody>
                </table>
            </div>

            <!-- TAB HISTÓRICO -->
            <div id="est-hist" class="est-modal-pane hidden">
                <table class="premium-table" style="margin-bottom:1rem;">
                    <thead><tr><th>Data</th><th>Competição</th><th style="text-align:right;">Casa</th><th style="text-align:center;">Placar</th><th>Fora</th><th>Público</th><th>Renda</th></tr></thead>
                    <tbody id="est-hist-tbody"></tbody>
                </table>
                <div class="pagination-controls" style="margin-top: 1rem;">
                    <button id="est-hist-prev" class="page-btn" onclick="window.changeEstadioHistPage(-1)"><i class="fas fa-chevron-left"></i> Anterior</button>
                    <span id="est-hist-page-info" style="font-weight:600;">Página 1</span>
                    <button id="est-hist-next" class="page-btn" onclick="window.changeEstadioHistPage(1)">Próxima <i class="fas fa-chevron-right"></i></button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    window.switchEstadioModalTab('est-temp');
    window.renderEstadioHistPage();
};

window.renderEstadioModal = renderEstadioModal;
window.switchEstadioModalTab = (tabId) => {
    document.querySelectorAll('#est-modal-tabs .tab-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`btn-${tabId}`);
    if(btn) btn.classList.add('active');
    document.querySelectorAll('.est-modal-pane').forEach(pane => pane.classList.add('hidden'));
    const pane = document.getElementById(tabId);
    if(pane) pane.classList.remove('hidden');
};
window.renderEstadioHistPage = () => {
    const start = (window.estModalData.page - 1) * window.estModalData.perPage;
    const end = start + window.estModalData.perPage;
    const items = window.estModalData.jogos.slice(start, end);
    const tbody = document.getElementById('est-hist-tbody');
    if(!tbody) return;
    tbody.innerHTML = items.map(j => `
        <tr style="cursor: pointer;" onclick="showJogoDetail(${j.id}, event)">
            <td>${j.data.split('-').reverse().join('/')}</td>
            <td>${j.campeonato}</td>
            <td style="text-align:right;">${j.casa}</td>
            <td style="font-weight:bold; text-align:center;">${j.golsCasa} x ${j.golsFora}</td>
            <td>${j.fora}</td>
            <td class="val-highlight">${(j.publico && j.publico !== 'N/I' && !j.portoesFechados) ? parseInt(j.publico).toLocaleString('pt-BR') : (j.portoesFechados ? 'P.F.' : 'N/I')}</td>
            <td>${(j.renda && j.renda !== 'N/I' && !j.portoesFechados) ? formatCurrency(j.renda) : (j.portoesFechados ? '0' : 'N/I')}</td>
        </tr>
    `).join('') || '<tr><td colspan="7" style="text-align:center; padding:2rem;">Nenhum jogo encontrado.</td></tr>';

    const maxPage = Math.ceil(window.estModalData.jogos.length / window.estModalData.perPage) || 1;
    document.getElementById('est-hist-page-info').textContent = `Página ${window.estModalData.page} de ${maxPage}`;
    document.getElementById('est-hist-prev').disabled = window.estModalData.page === 1;
    document.getElementById('est-hist-next').disabled = window.estModalData.page >= maxPage;
};
window.changeEstadioHistPage = (dir) => {
    window.estModalData.page += dir;
    window.renderEstadioHistPage();
};


// --- Theme Management ---
window.toggleTheme = () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('estatletico_theme', newTheme);
    updateThemeUI(newTheme);
};

const updateThemeUI = (theme) => {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    
    if (theme === 'dark') {
        btn.innerHTML = '<i class="fas fa-sun"></i><span>Tema Claro</span>';
    } else {
        btn.innerHTML = '<i class="fas fa-moon"></i><span>Tema Escuro</span>';
    }
};

// --- IndexedDB Cache Wrapper ---
const idbCache = {
    dbName: 'EstatleticoDB',
    storeName: 'cacheStore',
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onerror = e => reject(e.target.error);
            request.onsuccess = e => resolve(e.target.result);
            request.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    },
    async set(key, value) {
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readwrite');
                tx.objectStore(this.storeName).put(value, key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => reject(false);
            });
        } catch(e) { return false; }
    },
    async get(key) {
        try {
            const db = await this.init();
            return new Promise((resolve, reject) => {
                const tx = db.transaction(this.storeName, 'readonly');
                const req = tx.objectStore(this.storeName).get(key);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
            });
        } catch(e) { return null; }
    }
};

// --- ENTRY POINT ---
window.addEventListener('DOMContentLoaded', async () => {
    // Initialize theme UI
    const savedTheme = localStorage.getItem('estatletico_theme') || 'light';
    updateThemeUI(savedTheme);

    console.log('Estatlético: Inicializando aplicativo...');
    const loader = document.getElementById('global-loader');
    
    // Safety Timeout: Forçar a remoção do loader após 7 segundos caso algo trave
    const safetyTimer = setTimeout(() => {
        if (loader && loader.style.display !== 'none') {
            console.warn('Estatlético: Timeout de segurança atingido. Forçando entrada.');
            loader.style.display = 'none';
        }
    }, 20000);

    // Definição de handleRouting ANTES de ser usada pelo cache
    const handleRouting = () => {
        const hash = window.location.hash.replace('#', '');
        const parts = hash.split('/');
        const page = parts[0];
        const tab  = parts[1];
        const validPages = ['dashboard','cadastros','jogos','elenco','jogadores-page','artilheiros','cartoes','adversarios','arbitragem','equipe-arbitragem','estatisticas','comparativo','novo-jogo', 'curiosidades'];
        const validTabs  = ['adversarios','estadios','competicoes','arbitros','jogadores'];
        
        if (page && validPages.includes(page)) {
            showSection(page, true);
            if (page === 'cadastros' && tab && validTabs.includes(tab)) {
                renderTab(tab);
            } else if (page === 'cadastros') {
                renderTab('adversarios');
            } else if (page === 'estatisticas' && tab) {
                switchStatsTab(tab);
            } else if (page === 'curiosidades') {
                renderCuriosidades();
            }
        } else {
            showSection('dashboard');
        }
    };

    const fetchTableWithPagination = async (tableName, batchSize = 1000) => {
        let allData = [];
        let from = 0;
        let to = batchSize - 1;
        let finished = false;

        const fetchWithTimeout = (promise, ms = 10000) => {
            return Promise.race([
                promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout da requisição de rede excedido')), ms))
            ]);
        };

        while (!finished) {
            try {
                const { data, error } = await fetchWithTimeout(
                    supabaseClient.from(tableName).select('*').range(from, to),
                    10000 // 10s timeout
                );

                if (error) {
                    console.error(`Erro ao buscar página ${from}-${to} da tabela ${tableName}:`, error);
                    throw error;
                }

                if (data && data.length > 0) {
                    allData = [...allData, ...data];
                    if (data.length < batchSize) {
                        finished = true;
                    } else {
                        from += batchSize;
                        to += batchSize;
                    }
                } else {
                    finished = true;
                }
            } catch (err) {
                console.error(`Falha fatal ao buscar tabela ${tableName}:`, err);
                return { data: null, error: err };
            }
        }
        return { data: allData, error: null };
    };

    // Cache Layer: Tenta carregar dados salvos imediatamente
    let cachedData = await idbCache.get('estatletico_cache');
    
    // Fallback migration: if indexedDB is empty but localStorage has it, move it.
    if (!cachedData) {
        const lsCache = localStorage.getItem('estatletico_cache');
        if (lsCache) {
            try {
                cachedData = JSON.parse(lsCache);
                await idbCache.set('estatletico_cache', cachedData);
                localStorage.removeItem('estatletico_cache');
            } catch(e) {}
        }
    }

    if (cachedData) {
        try {
            console.log('Estatlético: Carregando cache do IndexedDB...');
            Object.keys(cachedData).forEach(k => { if(state[k]) state[k] = cachedData[k]; });
            handleRouting(); // Renderiza com dados em cache
            if (loader) loader.style.display = 'none';
        } catch(e) { console.warn('Estatlético: Cache corrompido.'); }
    }

    try {
        if(loader && !cachedData) loader.style.display = 'flex';
        
        console.log('Estatlético: Verificando Supabase Client...');
        if (!window.supabase) {
            throw new Error("O script do Supabase não foi carregado corretamente.");
        }
        
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        
        // Remove the loader instantly if cache exists, or after a short delay if we're waiting for network
        if (!cachedData && loader) {
             loader.style.display = 'none'; // We'll show a non-blocking indicator instead if needed, but for now just hide it.
        }

        const tables = ['adversarios', 'estadios', 'competicoes', 'arbitros', 'jogadores', 'jogos'];
        // Batch sizes por tabela: 'jogadores' usa 50 pois cada linha tem foto em Base64 (pode ser centenas de KB)
        // Tabelas sem imagens usam 1000 para velocidade máxima
        const batchSizes = {
            adversarios: 1000,
            estadios: 1000,
            competicoes: 1000,
            arbitros: 1000,
            jogadores: 50,   // Base64 fotos = linhas muito grandes
            jogos: 200       // jogos tem lineups aninhados, usar tamanho médio
        };
        console.log('Estatlético: Buscando tabelas de forma otimizada em background...');

        // Fetch tables concurrently in the background
        Promise.all(tables.map(t => fetchTableWithPagination(t, batchSizes[t]).then(res => ({ table: t, ...res })).catch(err => ({ table: t, data: null, error: err }))))
            .then(async results => {
                console.log('Estatlético: Dados de background recebidos. Atualizando estado...');
                const freshData = {};
                let hasChanges = false;

                results.forEach(res => {
                    const tableName = res.table;
                    if (res.error) {
                        console.error(`Estatlético: Erro detectado na tabela "${tableName}":`, res.error);
                        if (tableName === 'jogos') {
                            showToast(`Atenção: O banco de dados recusou a tabela de Jogos. Verifique sua conexão.`, 'error');
                        }
                    }
                    if (res.data) {
                        state[tableName] = res.data;
                        freshData[tableName] = res.data;
                        hasChanges = true;
                        console.log(`Estatlético: Tabela "${tableName}" atualizada em background com ${res.data.length} registros.`);
                    } else if (!state[tableName]) {
                        state[tableName] = []; 
                    }
                });

                if (hasChanges) {
                    // Migração Básica de Árbitros
                    state.arbitros = (state.arbitros || []).map(a => {
                        if (a.federacao && a.federacao.trim().length === 2) {
                            return { ...a, federacao: 'Brasil' };
                        }
                        return a;
                    });

                    // Salva no cache IndexedDB
                    if (Object.keys(freshData).length > 0) {
                        await idbCache.set('estatletico_cache', freshData);
                    }
                }
                
                // Sempre tenta rotear se não tinha cache (para não deixar a tela preta) ou se houve mudanças
                if (!cachedData) {
                    handleRouting();
                } else if (hasChanges) {
                    handleRouting();
                }
            });

    } catch (e) {
        console.error('Estatlético: Falha na inicialização:', e);
    } finally {
        clearTimeout(safetyTimer);
        console.log('Estatlético: Inicialização principal concluída.');
        if(loader) loader.style.display = 'none';

        // Sidebar
        const hamburgerBtn = document.getElementById('hamburger-btn');
        const sidebar = document.querySelector('.sidebar');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        
        hamburgerBtn?.addEventListener('click', () => {
            sidebar?.classList.toggle('active');
            sidebarOverlay?.classList.toggle('active');
        });
        
        sidebarOverlay?.addEventListener('click', () => {
            sidebar?.classList.remove('active');
            sidebarOverlay?.classList.remove('active');
        });

        // Enriquece o lineup com fotos dos jogadores
        state.jogos = state.jogos.map(jogo => ({
            ...jogo,
            lineupGalo: (jogo.lineupGalo || []).map(l => {
                const player = state.jogadores.find(p => p.nome_guerra === l.jogador && p.temporada === jogo.temporada)
                            || state.jogadores.find(p => p.nome_guerra === l.jogador);
                return { ...l, foto: player?.foto || l.foto || 'https://via.placeholder.com/35' };
            })
        }));
        
        handleRouting();
        window.addEventListener('hashchange', handleRouting);
    }
});

window.populateDashboardFilters = () => {
    const years = [...new Set(state.jogos.map(j => parseInt(j.temporada || j.data?.substring(0, 4))))].filter(Boolean).sort((a,b) => a - b);
    const deInput = document.getElementById('dash-filter-temp-de');
    const ateInput = document.getElementById('dash-filter-temp-ate');
    
    if (!deInput || !ateInput) return;
    
    // Define valores iniciais apenas se os campos estiverem vazios
    if (!deInput.value && years.length > 0) {
        deInput.value = years[0]; // O mais antigo
    }
    if (!ateInput.value && years.length > 0) {
        ateInput.value = years[years.length - 1]; // O mais recente
    }
};

window.toggleDashCurrentSeason = () => {
    const check = document.getElementById('dash-filtro-ano');
    if (check && check.checked) {
        const currentYear = new Date().getFullYear().toString();
        const de = document.getElementById('dash-filter-temp-de');
        const ate = document.getElementById('dash-filter-temp-ate');
        if (de && ate) {
            de.value = currentYear;
            ate.value = currentYear;
        }
    }
    renderDashboard();
};

window.sortTable = sortTable;
