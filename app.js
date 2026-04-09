// Supabase Initialization
const supabaseUrl = 'https://nmcscyqyodxajlhuxckm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tY3NjeXF5b2R4YWpsaHV4Y2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODkzMDcsImV4cCI6MjA5MTI2NTMwN30.-idljlDFGF57K75NG2JRXbywQE09tSn-E95dgaG6TeQ';
let supabaseClient = null;

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
    rowsPerPage: 50
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
            }
        } else {
            localStorage.setItem(key, typeof data === 'string' ? data : JSON.stringify(data));
        }
    } catch (e) {
        console.error('Network/Internal Error:', e);
        showToast('Erro de conexão com o banco de dados.');
    }
};

window.addEventListener('DOMContentLoaded', async () => {
    try {
        const loader = document.getElementById('global-loader');
        if(loader) loader.style.display = 'flex';
        
        if (!window.supabase) {
            throw new Error("O script do Supabase foi bloqueado pelo seu navegador (Comum ao rodar arquivos locais offline).");
        }
        
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        
        const tables = ['adversarios', 'estadios', 'competicoes', 'arbitros', 'jogadores', 'jogos'];
        for (const t of tables) {
            const { data, error } = await supabaseClient.from(t).select('*');
            if (error) throw error;
            state[t] = data || [];
        }
        
    } catch (e) {
        console.error('Falha de inicialização:', e);
        alert('Modo offline detectado: ' + e.message);
    } finally {
        const loader = document.getElementById('global-loader');
        if(loader) loader.style.display = 'none';

        // Sidebar functionality for mobile
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

        // Set up hash routing
        const handleRouting = () => {
            const hash = window.location.hash.replace('#', '');
            const parts = hash.split('/');
            const page = parts[0];
            const tab  = parts[1];
            const validPages = ['dashboard','cadastros','jogos','elenco','artilheiros','cartoes','arbitragem','equipe-arbitragem','estatisticas','comparativo','novo-jogo'];
            const validTabs  = ['adversarios','estadios','competicoes','arbitros','jogadores'];
            
            if (page && validPages.includes(page)) {
                showSection(page, true);
                if (page === 'cadastros' && tab && validTabs.includes(tab)) {
                    renderTab(tab);
                } else if (page === 'cadastros') {
                    renderTab('adversarios');
                } else if (page === 'estatisticas' && tab) {
                    switchStatsTab(tab);
                }
            } else {
                showSection('dashboard');
            }
        };

        handleRouting();
        window.addEventListener('hashchange', handleRouting);
    }
});

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
    if (sectionId === 'estatisticas') renderEstatisticas();
    if (sectionId === 'comparativo') renderComparativo();
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
        const item = { id: state.editingId || Date.now(), clube: fd.get('clube'), estado: fd.get('estado'), pais: fd.get('pais'), escudo: fd.get('escudo') || 'https://via.placeholder.com/32' };
        if (state.editingId) { state.adversarios[state.adversarios.findIndex(i => i.id === state.editingId)] = item; state.editingId = null; }
        else state.adversarios.push(item);
        saveData('adversarios', state.adversarios); renderTab('adversarios');
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
        saveData('estadios', state.estadios); renderTab('estadios');
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
        saveData('competicoes', state.competicoes); renderTab('competicoes');
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
                    <div class="form-group"><label>Nascimento</label><input type="date" name="nascimento"></div>
                    <div class="form-group"><label>Federação *</label><input type="text" name="federacao" required></div>
                </div>
                <div class="form-group" style="margin-bottom:1.5rem;"><label>Foto (Cole)</label><div class="paste-area" id="paste-area-arbitro">Ctrl+V</div><input type="hidden" name="foto" id="foto-input-arbitro"></div>
                <button type="submit" class="btn-primary">${state.editingId ? 'Atualizar' : 'Cadastrar'}</button>
            </form>
        </div>
        <div class="list-container">
            <div class="list-header"><h3>Árbitros (${state.arbitros.length})</h3><div class="search-container"><i class="fas fa-search"></i><input type="text" id="search-input" placeholder="Buscar..."></div></div>
            <table class="data-table"><thead><tr><th>Foto</th><th>Nome</th><th>Federação</th><th>Ações</th></tr></thead><tbody id="table-body-arbitros">${renderTableRows('arbitros')}</tbody></table>
        </div>
    `;
    setupPasteHandler('paste-area-arbitro', 'foto-input-arbitro');
    document.getElementById('form-arbitros').addEventListener('submit', (e) => {
        e.preventDefault(); const fd = new FormData(e.target);
        const novoNome = fd.get('nome');
        const novoNascimento = fd.get('nascimento');
        
        const isDuplicate = state.arbitros.some(a => 
            a.nome.toLowerCase() === novoNome.toLowerCase() && 
            a.nascimento === novoNascimento &&
            a.id !== state.editingId
        );

        if (isDuplicate) {
            showToast('Já existe um árbitro cadastrado com este mesmo nome e data de nascimento.', 'error');
            return;
        }

        const item = { id: state.editingId || Date.now(), nome: novoNome, nascimento: novoNascimento, federacao: fd.get('federacao'), foto: fd.get('foto') || 'https://via.placeholder.com/40' };
        if (state.editingId) { state.arbitros[state.arbitros.findIndex(i => i.id === state.editingId)] = item; state.editingId = null; }
        else state.arbitros.push(item);
        saveData('arbitros', state.arbitros); renderTab('arbitros');
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
        saveData('jogadores', state.jogadores); renderTab('jogadores');
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

    grid.innerHTML = filtered.length === 0 ? '<div style="grid-column:1/-1;text-align:center;padding:3rem;background:white;border-radius:8px;">Nenhum jogador encontrado para os filtros selecionados.</div>' : 
        filtered.map(j => {
            let photoUrl = j.foto && j.foto.trim() !== '' ? j.foto : null;
            if (!photoUrl) {
                const otherRecords = state.jogadores.filter(p => p.nome_completo === j.nome_completo && p.foto && p.foto.trim() !== '');
                if (otherRecords.length > 0) photoUrl = otherRecords[0].foto;
            }
            if (!photoUrl) photoUrl = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

            return `
                <div class="player-card ${j.foraDoElenco ? 'grayscale' : ''}" onclick="showPlayerDetail(${j.id}, event)">
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
    const seasons = [...new Set(state.jogos.map(j => j.temporada))].sort((a,b) => b-a);
    const isTecnico = player.posicao === 'Técnico';
    const isGoalie = player.posicao === 'Goleiro';

    let statsBySeason = [];
    let statsByTecnico = {};

    seasons.forEach(s => {
        const seasonJogos = state.jogos.filter(j => j.temporada === s);
        let gamesCount = 0, goals = 0, gs = 0, wins = 0, draws = 0, losses = 0, yellow = 0, red = 0;
        let titularCount = 0, subOutCount = 0, enteredCount = 0;

        seasonJogos.forEach(jogo => {
            let matches = false;
            if (isTecnico) {
                if (jogo.tecnicoGalo === player.nome_guerra) {
                    matches = true;
                    gamesCount++;
                    const gm = parseInt(jogo.casa === 'Atlético' ? jogo.golsCasa : jogo.golsFora);
                    const gc = parseInt(jogo.casa === 'Atlético' ? jogo.golsFora : jogo.golsCasa);
                    goals += gm; gs += gc;
                    if (jogo.vencedor === 'Atlético') wins++;
                    else if (jogo.vencedor === 'Empate') draws++;
                    else losses++;
                }
            } else {
                const inLineup = jogo.lineupGalo?.find(l => l.jogador === player.nome_guerra);
                if (inLineup) {
                    matches = true;
                    gamesCount++;
                    goals += parseInt(inLineup.golsCount || 0);
                    gs += parseInt(inLineup.gsCount || 0);
                    if (inLineup.titular) titularCount++;
                    if (inLineup.substituido) subOutCount++;
                    if (!inLineup.titular) enteredCount++;

                    if (jogo.vencedor === 'Atlético') wins++;
                    else if (jogo.vencedor === 'Empate') draws++;
                    else losses++;

                    const cards = jogo.cartoesGalo?.filter(c => c.jogador === player.nome_guerra);
                    cards?.forEach(c => { yellow += parseInt(c.amarelo || 0); red += parseInt(c.red || 0); });

                    // Aggregate stats by técnico
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

        if (gamesCount > 0) {
            const aprov = ((wins * 3 + draws) / (gamesCount * 3) * 100).toFixed(1) + '%';
            statsBySeason.push({ season: s, gamesCount, goals, gs, wins, draws, losses, aprov, yellow, red, titularCount, subOutCount, enteredCount });
        }
    });

    const total = statsBySeason.reduce((acc, s) => {
        acc.gamesCount += s.gamesCount; acc.goals += s.goals; acc.gs += s.gs; acc.wins += s.wins; acc.draws += s.draws; acc.losses += s.losses; acc.yellow += s.yellow; acc.red += s.red;
        acc.titularCount += s.titularCount; acc.subOutCount += s.subOutCount; acc.enteredCount += s.enteredCount;
        return acc;
    }, { gamesCount:0, goals:0, gs:0, wins:0, draws:0, losses:0, yellow:0, red:0, titularCount: 0, subOutCount: 0, enteredCount: 0 });
    total.aprov = total.gamesCount > 0 ? ((total.wins * 3 + total.draws) / (total.gamesCount * 3) * 100).toFixed(1) + '%' : "0%";

    const detail = document.createElement('div');
    detail.id = `detail-player-${playerId}`;
    detail.className = 'detail-inline-container';
    detail.style.gridColumn = '1/-1';
    
    let seasonTableHeaders = isTecnico 
        ? '<th>Temporada</th><th>Jogos</th><th>Vitórias</th><th>Empates</th><th>Derrotas</th><th>GM</th><th>GS</th><th>Aprov.</th>'
        : `<th>Temporada</th><th>Jogos</th><th>Titular</th><th>Subst.</th><th>Entrou</th><th>Gols</th>${isGoalie ? '<th>GS</th>' : ''}<th>Vitórias</th><th>Empates</th><th>Derrotas</th><th>Aprov.</th><th>CA</th><th>CV</th>`;

    let seasonTableBody = statsBySeason.map(s => {
        if (isTecnico) {
            return `<tr><td>${s.season}</td><td>${s.gamesCount}</td><td><span class="win-text">${s.wins}</span></td><td><span class="draw-text">${s.draws}</span></td><td><span class="loss-text">${s.losses}</span></td><td>${s.goals}</td><td>${s.gs}</td><td><strong>${s.aprov}</strong></td></tr>`;
        } else {
            return `<tr><td>${s.season}</td><td>${s.gamesCount}</td><td style="color:#2980b9; font-weight:600;">${s.titularCount}</td><td style="color:#7f8c8d;">${s.subOutCount}</td><td style="color:#27ae60;">${s.enteredCount}</td><td>${s.goals}</td>${isGoalie ? `<td><strong>${s.gs}</strong></td>` : ''}<td><span class="win-text">${s.wins}</span></td><td><span class="draw-text">${s.draws}</span></td><td><span class="loss-text">${s.losses}</span></td><td>${s.aprov}</td><td>${s.yellow}</td><td>${s.red}</td></tr>`;
        }
    }).join('');

    let seasonTableFooter = isTecnico
        ? `<tr style="font-weight:700; background:#f9f9f9;"><td>TOTAL</td><td>${total.gamesCount}</td><td>${total.wins}</td><td>${total.draws}</td><td>${total.losses}</td><td>${total.goals}</td><td>${total.gs}</td><td>${total.aprov}</td></tr>`
        : `<tr style="font-weight:700; background:#f9f9f9;"><td>TOTAL</td><td>${total.gamesCount}</td><td>${total.titularCount}</td><td>${total.subOutCount}</td><td>${total.enteredCount}</td><td>${total.goals}</td>${isGoalie ? `<td><strong>${total.gs}</strong></td>` : ''}<td><span class="win-text">${total.wins}</span></td><td><span class="draw-text">${total.draws}</span></td><td><span class="loss-text">${total.losses}</span></td><td>${total.aprov}</td><td>${total.yellow}</td><td>${total.red}</td></tr>`;

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
                
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:1rem; margin-bottom:1.5rem; padding:1rem; background:#fcfcfc; border-radius:8px; border:1px solid #eee;">
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
        ${tecTableHtml}
    `;
    card.after(detail);
};

// ARTILHEIROS FUNCTIONS
const renderArtilheiros = () => {
    const grid = document.getElementById('artilheiros-grid-container');
    const detail = document.getElementById('artilheiro-detail-container');
    detail.classList.add('hidden'); grid.classList.remove('hidden');

    const fTemp = document.getElementById('art-filter-temporada').value;
    const fJog = document.getElementById('art-filter-jogador').value;
    const fPos = document.getElementById('art-filter-posicao').value;
    const fAdv = document.getElementById('art-filter-adversario').value;
    const fEst = document.getElementById('art-filter-estadio').value;
    const fCamp = document.getElementById('art-filter-campeonato').value;
    const fTipo = document.getElementById('art-filter-tipo').value;
    const fNac = document.getElementById('art-filter-nacionalidade').value;

    const stats = {};
    // Aggregate goals and games
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

    // Apply Player-specific filters
    if (fJog) artList = artList.filter(a => a.nome === fJog);
    if (fPos) artList = artList.filter(a => a.player?.posicao === fPos);
    if (fNac) artList = artList.filter(a => a.player?.nacionalidade === fNac);

    // Sorting: Gols (desc), Games (asc)
    artList.sort((a,b) => b.goals - a.goals || a.games - b.games);

    // Filter Top 10 (But if filtered, just show top 10 of result)
    const top10 = artList.slice(0, 10);

    // Populate Filters
    populateFilter('art-filter-temporada', [...new Set(state.jogos.map(j => j.temporada))]);
    populateFilter('art-filter-jogador', [...new Set(state.jogadores.map(j => j.nome_guerra))]);
    populateFilter('art-filter-adversario', [...new Set(state.adversarios.map(a => a.clube))]);
    populateFilter('art-filter-estadio', [...new Set(state.estadios.map(e => e.nome))]);
    populateFilter('art-filter-campeonato', [...new Set(state.jogos.map(j => j.campeonato))]);
    populateFilter('art-filter-nacionalidade', [...new Set(state.jogadores.map(j => j.nacionalidade))]);

    grid.innerHTML = top10.length === 0 ? '<div style="grid-column:1/-1;text-align:center;padding:3rem;background:white;border-radius:8px;">Nenhum artilheiro encontrado.</div>' : 
        top10.map((a, idx) => `
            <div class="artilheiro-card" onclick="showArtilheiroDetail('${a.nome}', event)">
                <div class="artilheiro-rank">${idx + 1}</div>
                <img src="${a.player?.foto || 'https://via.placeholder.com/100'}" alt="${a.nome}">
                <h3>${a.nome}</h3>
                <div class="pos-nac">${a.player?.posicao || '-'} | ${a.player?.nacionalidade || '-'}</div>
                <div class="artilheiro-main-stat">
                    <i class="fas fa-trophy"></i> ${a.goals} <span>gols</span>
                </div>
                <div class="artilheiro-sub-stats">
                    <div class="artilheiro-sub-stat"><span>${a.games}</span><span>jogos</span></div>
                    <div class="artilheiro-sub-stat"><span>${a.games > 0 ? (a.goals / a.games).toFixed(2) : 0}</span><span>média/jogo</span></div>
                </div>
            </div>
        `).join('');
};

const showArtilheiroDetail = (playerName, event) => {
    const card = event.currentTarget;
    const existing = document.getElementById(`detail-art-${playerName.replace(/\s/g,'')}`);
    
    // Remove any other open details in this grid
    document.querySelectorAll('.detail-inline-container').forEach(d => d.remove());
    if (existing) return;

    const player = state.jogadores.find(j => j.nome_guerra === playerName);
    const campStats = {};
    const advStats = {};

    state.jogos.forEach(jogo => {
        const inLineup = jogo.lineupGalo?.find(l => l.jogador === playerName);
        if (!inLineup) return;
        const goals = parseInt(inLineup.golsCount || 0);
        const opponent = jogo.casa === 'Atlético' ? jogo.fora : jogo.casa;
        if (!campStats[jogo.campeonato]) campStats[jogo.campeonato] = { nome: jogo.campeonato, goals: 0, games: 0 };
        campStats[jogo.campeonato].games++;
        campStats[jogo.campeonato].goals += goals;
        if (goals > 0) {
            if (!advStats[opponent]) advStats[opponent] = { nome: opponent, goals: 0 };
            advStats[opponent].goals += goals;
        }
    });

    const detail = document.createElement('div');
    detail.id = `detail-art-${playerName.replace(/\s/g,'')}`;
    detail.className = 'detail-inline-container';
    detail.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
            <h3>Histórico de Gols: ${playerName}</h3>
            <button class="btn-icon" onclick="this.closest('.detail-inline-container').remove()"><i class="fas fa-times"></i></button>
        </div>
        <div class="form-grid" style="gap:2rem;">
            <div class="stats-section" style="margin:0; box-shadow:none; border:1px solid #eee;">
                <div class="stats-section-title">Por Campeonato</div>
                <table class="stats-table">
                    <thead><tr><th>Campeonato</th><th>Jogos</th><th>Gols</th></tr></thead>
                    <tbody>${Object.values(campStats).sort((a,b)=>b.goals-a.goals).map(c => `<tr><td>${c.nome}</td><td>${c.games}</td><td><strong>${c.goals}</strong></td></tr>`).join('')}</tbody>
                </table>
            </div>
            <div class="stats-section" style="margin:0; box-shadow:none; border:1px solid #eee;">
                <div class="stats-section-title">Contra Adversários</div>
                <table class="stats-table">
                    <thead><tr><th>Adversário</th><th>Gols</th></tr></thead>
                    <tbody>${Object.values(advStats).sort((a,b)=>b.goals-a.goals).map(a => `<tr><td>${a.nome}</td><td><strong>${a.goals}</strong></td></tr>`).join('')}</tbody>
                </table>
            </div>
        </div>
    `;
    card.after(detail);
};

// CARTÕES FUNCTIONS
const renderCartoes = () => {
    const grid = document.getElementById('cartoes-grid-container');
    const detail = document.getElementById('cartoes-detail-container');
    detail.classList.add('hidden'); grid.classList.remove('hidden');

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

    cardList.sort((a,b) => b.total - a.total || b.red - a.red);
    const top10 = cardList.slice(0, 10);

    grid.className = 'cartoes-grid';
    grid.innerHTML = top10.length === 0 ? '<div style="grid-column:1/-1;text-align:center;padding:3rem;background:white;border-radius:8px;">Nenhum registro de cartão encontrado.</div>' : 
        top10.map((c, idx) => `
            <div class="artilheiro-card" onclick="showCartoesDetail('${c.nome}', event)">
                <div class="artilheiro-rank">${idx + 1}</div>
                <img src="${c.player?.foto || 'https://via.placeholder.com/100'}" alt="${c.nome}">
                <h3>${c.nome}</h3>
                <div class="pos-nac">${c.player?.posicao || c.posicao || '-'} | ${fTime}</div>
                <div class="artilheiro-main-stat" style="color: var(--primary-color);">
                   <i class="fas fa-copy"></i> ${c.total} <span>cartões</span>
                </div>
                <div class="artilheiro-sub-stats">
                    <div class="artilheiro-sub-stat"><span>${c.yellow}</span><span style="color:#f39c12;">amarelos</span></div>
                    <div class="artilheiro-sub-stat"><span>${c.red}</span><span style="color:#e74c3c;">vermelhos</span></div>
                </div>
            </div>
        `).join('');
};

const showCartoesDetail = (playerName, event) => {
    const card = event.currentTarget;
    const existing = document.getElementById(`detail-cart-${playerName.replace(/\s/g,'')}`);
    document.querySelectorAll('.detail-inline-container').forEach(d => d.remove());
    if (existing) return;

    const byCamp = {}, byAdv = {}, byArb = {};
    state.jogos.forEach(j => {
        const cGalo = (j.cartoesGalo || []).find(c => c.jogador === playerName);
        const cAdv = (j.cartoesAdv || []).find(c => c.jogador === playerName);
        const cardObj = cGalo || cAdv;
        if (!cardObj) return;

        const y = parseInt(cardObj.amarelo || 0), r = parseInt(cardObj.red || 0), t = y + r;
        if (!byCamp[j.campeonato]) byCamp[j.campeonato] = { nome: j.campeonato, y:0, r:0, t:0 };
        byCamp[j.campeonato].y += y; byCamp[j.campeonato].r += r; byCamp[j.campeonato].t += t;
        
        const opp = j.casa === 'Atlético' ? j.fora : j.casa;
        if (!byAdv[opp]) byAdv[opp] = { nome: opp, y:0, r:0, t:0 };
        byAdv[opp].y += y; byAdv[opp].r += r; byAdv[opp].t += t;

        if (j.arbitro) {
            if (!byArb[j.arbitro]) byArb[j.arbitro] = { nome: j.arbitro, y:0, r:0, t:0 };
            byArb[j.arbitro].y += y; byArb[j.arbitro].r += r; byArb[j.arbitro].t += t;
        }
    });

    const detail = document.createElement('div');
    detail.id = `detail-cart-${playerName.replace(/\s/g,'')}`;
    detail.className = 'detail-inline-container';
    detail.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
            <h3>Detalhamento de Cartões: ${playerName}</h3>
            <button class="btn-icon" onclick="this.closest('.detail-inline-container').remove()"><i class="fas fa-times"></i></button>
        </div>
        <div class="form-grid" style="gap:1rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
            <div class="stats-section" style="margin:0; box-shadow:none; border:1px solid #eee;">
                <div class="stats-section-title">Por Campeonato</div>
                <table class="stats-table">
                    <thead><tr><th>Campeonato</th><th>CA</th><th>CV</th><th>Total</th></tr></thead>
                    <tbody>${Object.values(byCamp).sort((a,b)=>b.t-a.t).map(x => `<tr><td>${x.nome}</td><td style="color:#f39c12; font-weight:bold;">${x.y}</td><td style="color:#e74c3c; font-weight:bold;">${x.r}</td><td><strong>${x.t}</strong></td></tr>`).join('')}</tbody>
                </table>
            </div>
            <div class="stats-section" style="margin:0; box-shadow:none; border:1px solid #eee;">
                <div class="stats-section-title">Por Adversário</div>
                <table class="stats-table">
                    <thead><tr><th>Adversário</th><th>CA</th><th>CV</th><th>Total</th></tr></thead>
                    <tbody>${Object.values(byAdv).sort((a,b)=>b.t-a.t).map(x => `<tr><td>${x.nome}</td><td style="color:#f39c12; font-weight:bold;">${x.y}</td><td style="color:#e74c3c; font-weight:bold;">${x.r}</td><td><strong>${x.t}</strong></td></tr>`).join('')}</tbody>
                </table>
            </div>
            <div class="stats-section" style="margin:0; box-shadow:none; border:1px solid #eee;">
                <div class="stats-section-title">Por Árbitro</div>
                <table class="stats-table">
                    <thead><tr><th>Árbitro</th><th>CA</th><th>CV</th><th>Total</th></tr></thead>
                    <tbody>${Object.values(byArb).sort((a,b)=>b.t-a.t).map(x => `<tr><td>${x.nome}</td><td style="color:#f39c12; font-weight:bold;">${x.y}</td><td style="color:#e74c3c; font-weight:bold;">${x.r}</td><td><strong>${x.t}</strong></td></tr>`).join('')}</tbody>
                </table>
            </div>
        </div>
    `;
    card.after(detail);
};

// ARBITRAGEM FUNCTIONS
const renderArbitragem = () => {
    const tbody = document.getElementById('table-body-arbitragem');
    if (!tbody) return;

    const fTemp = document.getElementById('arb-filter-temporada').value;
    const fArb = document.getElementById('arb-filter-arbitro').value;
    const fAdv = document.getElementById('arb-filter-adversario').value;
    const fEst = document.getElementById('arb-filter-estadio').value;
    const fCamp = document.getElementById('arb-filter-campeonato').value;
    const fTipo = document.getElementById('arb-filter-tipo').value;

    const statsArr = state.arbitros.map(arb => {
        let arbGames = state.jogos.filter(j => j.arbitro === arb.nome);
        
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

        if (arbGames.length === 0 && fArb && fArb !== arb.nome) return null;
        if (fArb && arb.nome !== fArb) return null;
        if (arbGames.length === 0 && !fArb) return null;

        const res = {
            foto: arb.foto,
            nome: arb.nome,
            jogos: arbGames.length,
            amarelosAtl: 0, vermelhosAtl: 0,
            amarelosAdv: 0, vermelhosAdv: 0,
            idades: []
        };

        arbGames.forEach(j => {
            (j.cartoesGalo || []).forEach(c => { res.amarelosAtl += parseInt(c.amarelo || 0); res.vermelhosAtl += parseInt(c.red || 0); });
            (j.cartoesAdv || []).forEach(c => { res.amarelosAdv += parseInt(c.amarelo || 0); res.vermelhosAdv += parseInt(c.red || 0); });
            if (arb.nascimento) res.idades.push(calculateAge(arb.nascimento, j.data));
        });

        res.idadeMedia = res.idades.length > 0 ? Math.round(res.idades.reduce((a,b) => a+b, 0) / res.idades.length) : 'N/I';
        res.medAmarAtl = res.jogos > 0 ? Math.round(res.amarelosAtl / res.jogos) : 0;
        res.medVermAtl = res.jogos > 0 ? Math.round(res.vermelhosAtl / res.jogos) : 0;
        res.medAmarAdv = res.jogos > 0 ? Math.round(res.amarelosAdv / res.jogos) : 0;
        res.medVermAdv = res.jogos > 0 ? Math.round(res.vermelhosAdv / res.jogos) : 0;
        
        res.totalAmar = res.amarelosAtl + res.amarelosAdv;
        res.totalVerm = res.vermelhosAtl + res.vermelhosAdv;
        res.medAmarTotal = res.jogos > 0 ? Math.round(res.totalAmar / res.jogos) : 0;
        res.medVermTotal = res.jogos > 0 ? Math.round(res.totalVerm / res.jogos) : 0;

        return res;
    }).filter(x => x !== null);

    // Populate Filters
    populateFilter('arb-filter-temporada', [...new Set(state.jogos.map(j => j.temporada))]);
    populateFilter('arb-filter-arbitro', [...new Set(state.arbitros.map(a => a.nome))]);
    populateFilter('arb-filter-adversario', [...new Set(state.adversarios.map(a => a.clube))]);
    populateFilter('arb-filter-estadio', [...new Set(state.estadios.map(e => e.nome))]);
    populateFilter('arb-filter-campeonato', [...new Set(state.jogos.map(j => j.campeonato))]);

    tbody.innerHTML = statsArr.length === 0 ? '<tr><td colspan="16" style="text-align:center;">Nenhum árbitro encontrado com estes filtros</td></tr>' : 
        statsArr.sort((a,b) => b.jogos - a.jogos).map(s => `
            <tr onclick="showArbitragemJogos('${s.nome}', event)" style="cursor:pointer;" title="Clique para ver os jogos apitados por ${s.nome}">
                <td><img src="${s.foto}" class="mini-foto" style="width:30px;height:30px;object-fit:cover;border-radius:50%;"></td>
                <td><strong>${s.nome}</strong></td>
                <td>${s.idadeMedia}</td>
                <td>${s.jogos}</td>
                <td style="background:rgba(243, 156, 18, 0.1); font-weight:bold;">${s.amarelosAtl}</td>
                <td style="background:rgba(231, 76, 60, 0.1); font-weight:bold;">${s.vermelhosAtl}</td>
                <td>${s.medAmarAtl}</td>
                <td>${s.medVermAtl}</td>
                <td style="background:rgba(243, 156, 18, 0.1); font-weight:bold;">${s.amarelosAdv}</td>
                <td style="background:rgba(231, 76, 60, 0.1); font-weight:bold;">${s.vermelhosAdv}</td>
                <td>${s.medAmarAdv}</td>
                <td>${s.medVermAdv}</td>
                <td style="font-weight:bold; color:var(--primary-color);">${s.totalAmar}</td>
                <td style="font-weight:bold; color:#e74c3c;">${s.totalVerm}</td>
                <td>${s.medAmarTotal}</td>
                <td>${s.medVermTotal}</td>
            </tr>
        `).join('');
};

window.showArbitragemJogos = (arbNome, event) => {
    const row = event.currentTarget;
    const existing = document.getElementById(`detail-arb-${arbNome.replace(/\s/g,'')}`);
    document.querySelectorAll('.tr-detail-row').forEach(r => r.remove());
    if (existing) return;

    const jogosArb = state.jogos.filter(j => j.arbitro === arbNome).sort((a,b) => new Date(b.data) - new Date(a.data));

    const detailRow = document.createElement('tr');
    detailRow.id = `detail-arb-${arbNome.replace(/\s/g,'')}`;
    detailRow.className = 'tr-detail-row';
    detailRow.innerHTML = `
        <td colspan="16">
            <div class="tr-detail-container">
                <div style="display:flex; justify-content:space-between; margin-bottom:1rem;">
                    <h3>Jogos do Atlético apitados por: ${arbNome}</h3>
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
                                <td>${j.publico === 'N/I' ? 'N/I' : parseInt(j.publico || 0).toLocaleString()}</td>
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
    const fCamp = document.getElementById('ea-filter-campeonato').value;
    const fAdv = document.getElementById('ea-filter-adversario').value;
    const fArb = document.getElementById('ea-filter-arbitro').value;
    const fAss = document.getElementById('ea-filter-assistente').value;
    const fVar = document.getElementById('ea-filter-var').value;

    const profissionais = {};

    state.jogos.forEach(j => {
        if (fTemp && j.temporada !== fTemp) return;
        if (fCamp && j.campeonato !== fCamp) return;
        const op = j.casa === 'Atlético' ? j.fora : j.casa;
        if (fAdv && op !== fAdv) return;
        
        if (fArb && j.arbitro !== fArb) return;
        if (fAss && j.assistente1 !== fAss && j.assistente2 !== fAss) return;
        if (fVar && j.varArbitro !== fVar) return;

        const p = (name, role) => {
            if (!name || name === 'N/I' || name === '-') return;
            if (!profissionais[name]) profissionais[name] = { nome: name, jogos: [], roles: { 'Árbitro': 0, 'Assistente': 0, 'VAR': 0 }, foto: state.arbitros.find(a => a.nome === name)?.foto || 'https://via.placeholder.com/100' };
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
        populateFilter('ea-filter-campeonato', [...new Set(state.jogos.map(j => j.campeonato))]);
        populateFilter('ea-filter-adversario', [...new Set(state.jogos.map(j => j.casa === 'Atlético' ? j.fora : j.casa))]);
        
        let arbNames = new Set();
        let assNames = new Set();
        let varNames = new Set();
        state.jogos.forEach(j => {
            if (j.arbitro && j.arbitro !== 'N/I' && j.arbitro !== '-') arbNames.add(j.arbitro);
            if (j.assistente1 && j.assistente1 !== 'N/I' && j.assistente1 !== '-') assNames.add(j.assistente1);
            if (j.assistente2 && j.assistente2 !== 'N/I' && j.assistente2 !== '-') assNames.add(j.assistente2);
            if (j.varArbitro && j.varArbitro !== 'N/I' && j.varArbitro !== '-') varNames.add(j.varArbitro);
        });
        populateFilter('ea-filter-arbitro', [...arbNames].sort());
        populateFilter('ea-filter-assistente', [...assNames].sort());
        populateFilter('ea-filter-var', [...varNames].sort());
        
        const attachUpdate = (id) => document.getElementById(id).addEventListener('change', renderEquipeArbitragem);
        ['temporada','campeonato','adversario','arbitro','assistente','var'].forEach(t => attachUpdate(`ea-filter-${t}`));
    }

    const cards = Object.values(profissionais).sort((a,b) => b.jogos.length - a.jogos.length);
    
    grid.innerHTML = cards.length === 0 ? '<div style="grid-column:1/-1;text-align:center;padding:3rem;background:white;border-radius:8px;">Nenhum profissional encontrado.</div>' : 
        cards.map(c => {
            let primaryRole = 'Assistente';
            if (c.roles['Árbitro'] >= c.roles['Assistente'] && c.roles['Árbitro'] >= c.roles['VAR']) primaryRole = 'Árbitro';
            else if (c.roles['VAR'] >= c.roles['Árbitro'] && c.roles['VAR'] >= c.roles['Assistente']) primaryRole = 'VAR';
            
            return `
            <div class="artilheiro-card" onclick="showEquipeArbitragemDetail('${c.nome}', event)">
                <img src="${c.foto}">
                <h3>${c.nome}</h3>
                <div class="pos-nac">${primaryRole}</div>
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
            <div class="stats-section" style="margin:0; box-shadow:none; border:1px solid #eee;">
                <div class="stats-section-title">Por Temporada</div>
                <table class="stats-table" style="text-align:center;">
                    <thead><tr><th style="padding-left:1rem;">Temporada</th><th>Jogos</th><th>V</th><th>E</th><th>D</th><th>% Aprov</th></tr></thead>
                    <tbody>${tbByTemp}</tbody>
                </table>
            </div>
            
            <div class="stats-section" style="margin:0; box-shadow:none; border:1px solid #eee;">
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
    const fMin = document.getElementById('filter-publico-min').value;
    const fMax = document.getElementById('filter-publico-max').value;

    let filtered = [...state.jogos];
    if (fTemp) filtered = filtered.filter(j => j.temporada === fTemp);
    if (fCamp) filtered = filtered.filter(j => j.campeonato === fCamp);
    if (fCasa) filtered = filtered.filter(j => j.casa === fCasa);
    if (fFora) filtered = filtered.filter(j => j.fora === fFora);
    if (fEst) filtered = filtered.filter(j => j.estadio === fEst);
    if (fArb) filtered = filtered.filter(j => j.arbitro === fArb);
    if (fMin) filtered = filtered.filter(j => (j.publico === 'N/I' ? 0 : parseInt(j.publico || 0)) >= parseInt(fMin || 0));
    if (fMax) filtered = filtered.filter(j => (j.publico === 'N/I' ? 0 : parseInt(j.publico || 0)) <= parseInt(fMax || 9999999));

    const sorted = filtered.sort((a, b) => new Date(b.data) - new Date(a.data));
    const paginated = sorted.slice((state.currentPage - 1) * state.rowsPerPage, state.currentPage * state.rowsPerPage);

    populateFilter('filter-temporada', [...new Set(state.jogos.map(j => j.temporada))]);
    populateFilter('filter-campeonato', [...new Set(state.jogos.map(j => j.campeonato))]);
    populateFilter('filter-casa', [...new Set(state.jogos.map(j => j.casa))]);
    populateFilter('filter-fora', [...new Set(state.jogos.map(j => j.fora))]);
    populateFilter('filter-estadio', [...new Set(state.jogos.map(j => j.estadio))]);
    populateFilter('filter-arbitro', [...new Set(state.jogos.map(j => j.arbitro))]);

    tableBody.innerHTML = paginated.length === 0 ? '<tr><td colspan="11" style="text-align:center;">Nenhum jogo encontrado</td></tr>' : paginated.map(j => {
        const pub = j.publico === 'N/I' ? 'N/I' : parseInt(j.publico || 0).toLocaleString();
        const ren = j.renda === 'N/I' ? 'N/I' : formatCurrency(j.renda);
        const tic = (j.publico === 'N/I' || j.renda === 'N/I' || j.publico === 0) ? 'N/I' : formatCurrency(j.renda/j.publico);
        return `<tr><td>${j.data.split('-').reverse().join('/')}</td><td>${j.campeonato}</td><td>${j.casa}</td><td><strong>${j.golsCasa} x ${j.golsFora}</strong></td><td>${j.fora}</td><td>${j.arbitro}</td><td>${pub}</td><td>${ren}</td><td>${tic}</td><td class="actions"><button class="action-btn" onclick="editJogo(${j.id})"><i class="fas fa-edit"></i></button><button class="action-btn" onclick="deleteJogo(${j.id})"><i class="fas fa-trash-alt delete"></i></button></td></tr>`;
    }).join('');
};

const populateFilter = (id, values) => {
    const s = document.getElementById(id); if(!s) return; const cur = s.value;
    s.innerHTML = '<option value="">Selecione...</option>' + values.sort().map(v => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v}</option>`).join('');
};

const setupAutocomplete = (id, sourceKey, field, filterFn = null, onSelect = null, showQuickAdd = true) => {
    const inp = document.getElementById(id); if (!inp) return;
    
    // Check if bounds have already been attached
    if (inp.dataset.autocompleteBound) {
        return;
    }
    inp.dataset.autocompleteBound = 'true';

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
        let ds = state[sourceKey]; 
        if (typeof filterFn === 'function') ds = ds.filter(filterFn);
        const results = ds.filter(item => item[field].toLowerCase().includes(val))
                          .sort((a,b) => a[field].localeCompare(b[field]));
        
        const drop = document.createElement('div'); 
        drop.className = 'autocomplete-results';
        
        results.forEach((res, idx) => {
            const item = document.createElement('div'); 
            item.className = 'autocomplete-item'; 
            item.textContent = res[field];
            item.onclick = () => { 
                inp.value = res[field]; 
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
    miniModal.className = 'modal-overlay secondary';
    miniModal.id = 'quick-add-modal';
    let formHtml = '';
    if(type === 'competicoes') {
        formHtml = `<div class="form-group"><label>Campeonato *</label><input type="text" id="qa-campeonato" value="${initialValue}"></div><div class="form-group"><label>Tipo *</label><select id="qa-tipo"><option value="Regional">Regional</option><option value="Nacional">Nacional</option><option value="Internacional">Internacional</option></select></div>`;
    } else if(type === 'estadios') {
        const opts = state.adversarios.map(adv => `<option value="${adv.clube}">${adv.clube}</option>`).join('');
        formHtml = `<div class="form-group"><label>Nome *</label><input type="text" id="qa-nome" value="${initialValue}"></div><div class="form-grid"><div class="form-group"><label>Estado</label><input type="text" id="qa-estado"></div><div class="form-group"><label>País</label><input type="text" id="qa-pais" value="Brasil"></div></div><div class="form-group"><label>Mandante</label><select id="qa-mandante"><option value="">Selecione</option>${opts}</select></div><div class="form-group"><label>Foto (Cole)</label><div class="paste-area" id="qa-paste-estadio">Ctrl+V</div><input type="hidden" id="qa-foto"></div>`;
    } else if(type === 'adversarios') {
        formHtml = `<div class="form-group"><label>Clube *</label><input type="text" id="qa-clube" value="${initialValue}"></div><div class="form-grid"><div class="form-group"><label>Estado</label><input type="text" id="qa-estado"></div><div class="form-group"><label>País</label><input type="text" id="qa-pais" value="Brasil"></div></div><div class="form-group"><label>Escudo (URL)</label><input type="text" id="qa-escudo"></div>`;
    } else if(type === 'arbitros') {
        formHtml = `<div class="form-group"><label>Nome *</label><input type="text" id="qa-nome" value="${initialValue}"></div><div class="form-grid"><div class="form-group"><label>Nascimento</label><input type="date" id="qa-nascimento"></div><div class="form-group"><label>Federação</label><input type="text" id="qa-federacao"></div></div><div class="form-group"><label>Foto (Cole)</label><div class="paste-area" id="qa-paste-arbitro">Ctrl+V</div><input type="hidden" id="qa-foto"></div>`;
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
    miniModal.innerHTML = `<div class="modal-content small"><div class="block-header"><span>Cadastrar Novo ${name}</span><button onclick="document.getElementById('quick-add-modal').remove()"><i class="fas fa-times"></i></button></div><div class="p-4">${formHtml}<div class="flex-end" style="margin-top:2rem;"><button type="button" class="btn-primary" onclick="saveQuickAdd('${type}', '${targetInputId}')">Salvar e Continuar</button></div></div></div>`;
    document.body.appendChild(miniModal);
    if(type === 'estadios') setupPasteHandler('qa-paste-estadio', 'qa-foto');
    if(type === 'arbitros') setupPasteHandler('qa-paste-arbitro', 'qa-foto');
    if(type === 'jogadores') setupPasteHandler('qa-paste-jogador', 'qa-foto');
};

window.saveQuickAdd = (type, targetInputId) => {
    let item = { id: Date.now() };
    if(type === 'competicoes') { item.campeonato = document.getElementById('qa-campeonato').value; item.tipo = document.getElementById('qa-tipo').value; }
    else if(type === 'estadios') { item.nome = document.getElementById('qa-nome').value; item.estado = document.getElementById('qa-estado').value; item.pais = document.getElementById('qa-pais').value; item.mandante = document.getElementById('qa-mandante').value; item.foto = document.getElementById('qa-foto').value || 'https://via.placeholder.com/40'; }
    else if(type === 'adversarios') { item.clube = document.getElementById('qa-clube').value; item.estado = document.getElementById('qa-estado').value; item.pais = document.getElementById('qa-pais').value; item.escudo = document.getElementById('qa-escudo').value || 'https://via.placeholder.com/32'; }
    else if(type === 'arbitros') { item.nome = document.getElementById('qa-nome').value; item.nascimento = document.getElementById('qa-nascimento').value; item.federacao = document.getElementById('qa-federacao').value; item.foto = document.getElementById('qa-foto').value || 'https://via.placeholder.com/40'; }
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
    state[type].push(item); saveData(type, state[type]);
    const inp = document.getElementById(targetInputId); 
    if(inp) { 
        inp.value = item.campeonato || item.nome || item.clube || item.nome_guerra; 
        inp.dispatchEvent(new Event('change')); 
        if (type === 'arbitros' && targetInputId === 'game-arbitro') {
            updateRefereeInfo();
        }
    }
    document.getElementById('quick-add-modal').remove();
};

const updateRefereeInfo = () => {
    const arbName = document.getElementById('game-arbitro')?.value;
    const matchDate = document.getElementById('game-data')?.value;
    if (!arbName) return;

    const arb = state.arbitros.find(a => a.nome === arbName);
    if (arb) {
        if (arb.nascimento) {
            document.getElementById('game-arbitro-idade').value = calculateAge(arb.nascimento, matchDate);
        } else {
            document.getElementById('game-arbitro-idade').value = 'N/I';
        }
        document.getElementById('game-arbitro-federacao').value = arb.federacao || '';
    }
};

const renderNovoJogoPage = (jogoToEdit = null) => {
    state.editingJogoId = jogoToEdit ? jogoToEdit.id : null;
    showSection('novo-jogo');
    novoJogoContainer.innerHTML = `
        <div class="p-4" style="background: white; border-radius: var(--border-radius); box-shadow: var(--shadow);">
            <div class="block-header" style="background: none; color: var(--text-main); padding: 0 0 1rem 0; border-bottom: 2px solid #eee; margin-bottom: 2rem;"><div style="display:flex; align-items:center; gap:1rem;"><button class="btn-secondary" style="padding:0.4rem 1rem; font-size:0.8rem;" onclick="showSection('jogos')"><i class="fas fa-arrow-left"></i> Voltar</button><h2 style="margin:0;">${jogoToEdit ? 'Editar Jogo' : 'Novo Jogo'}</h2></div></div>
            <form id="multi-step-form">
                <div class="form-block active" id="block-1">
                    <div class="stats-section"><div class="stats-section-title">Dados Básicos do Jogo</div><div class="p-4">
                        <div class="form-grid"><div class="form-group"><label>Temporada *</label><input type="text" name="temporada" id="game-temporada" required value="${jogoToEdit?.temporada || state.fixedSeason || 2026}"><label class="checkbox-inline"><input type="checkbox" id="fix-game-season" ${state.isSeasonFixed ? 'checked' : ''}> Fixar Temporada</label></div><div class="form-group"><label>Data *</label><input type="date" name="data" id="game-data" required value="${jogoToEdit?.data || (state.fixedSeason ? state.fixedSeason + '-01-01' : '2026-01-01')}"></div><div class="form-group"><label>Rodada *</label><input type="text" name="rodada" placeholder="Ex: 1ª rodada" required value="${jogoToEdit?.rodada || ''}"></div></div>
                        <div class="form-grid"><div class="form-group"><label>Campeonato *</label><input type="text" name="campeonato" id="game-campeonato" required value="${jogoToEdit?.campeonato || state.fixedCampeonato}"><label class="checkbox-inline"><input type="checkbox" id="fix-game-camp" ${state.isCampeonatoFixed ? 'checked' : ''}> Fixar Campeonato</label></div><div class="form-group"><label>Estádio *</label><input type="text" name="estadio" id="game-estadio" required value="${jogoToEdit?.estadio || ''}"></div><div class="form-group"><label>Estado do Estádio</label><input type="text" name="estadioEstado" id="game-estadio-estado" readonly value="${jogoToEdit?.estadioEstado || ''}"></div></div>
                        <div class="form-grid"><div class="form-group"><label>País do Estádio</label><input type="text" name="estadioPais" id="game-estadio-pais" readonly value="${jogoToEdit?.estadioPais || ''}"></div><div class="form-group"><label>Casa *</label><input type="text" name="casa" id="game-casa" required value="${jogoToEdit?.casa || ''}"></div><div class="form-group"><label>Fora *</label><input type="text" name="fora" id="game-fora" required value="${jogoToEdit?.fora || ''}"></div></div>
                        <div class="form-grid"><div class="form-group"><label>Gols Casa *</label><input type="number" name="golsCasa" id="game-gols-casa" required value="${jogoToEdit?.golsCasa || 0}"></div><div class="form-group"><label>Gols Fora *</label><input type="number" name="golsFora" id="game-gols-fora" required value="${jogoToEdit?.golsFora || 0}"></div><div class="form-group"><label>Vencedor</label><input type="text" name="vencedor" id="game-vencedor" readonly value="${jogoToEdit?.vencedor || ''}"></div></div>
                    </div></div><div class="flex-end"><button type="button" class="btn-primary" onclick="nextBlock(2)">Avançar <i class="fas fa-chevron-right"></i></button></div>
                </div>
                <div class="form-block" id="block-2">
                    <div class="stats-section"><div class="stats-section-title">Arbitragem e Público</div><div class="p-4">
                        <div class="form-grid"><div class="form-group"><label>Árbitro *</label><input type="text" name="arbitro" id="game-arbitro" required value="${jogoToEdit?.arbitro || ''}"><label class="checkbox-inline"><input type="checkbox" id="game-arb-ni" ${jogoToEdit?.arbitro === 'N/I' ? 'checked' : ''}> Não identificado</label></div><div class="form-group"><label>Idade do Árbitro</label><input type="text" name="arbitroIdade" id="game-arbitro-idade" readonly value="${jogoToEdit?.arbitroIdade || ''}"></div><div class="form-group"><label>Federação do Árbitro</label><input type="text" name="arbitroFederacao" id="game-arbitro-federacao" value="${jogoToEdit?.arbitroFederacao || ''}"></div></div>
                        <div class="form-grid"><div class="form-group"><label>Assistente 1</label><input type="text" name="assistente1" id="game-assistente1" value="${jogoToEdit?.assistente1 || ''}"></div><div class="form-group"><label>Assistente 2</label><input type="text" name="assistente2" id="game-assistente2" value="${jogoToEdit?.assistente2 || ''}"></div><div class="form-group"><label>VAR</label><input type="text" name="varArbitro" id="game-var" value="${jogoToEdit?.varArbitro || ''}"></div></div>
                        <div class="form-grid"><div class="form-group"><label>Público *</label><input type="number" name="publico" id="game-publico" required value="${jogoToEdit?.publico === 'N/I' ? '' : jogoToEdit?.publico}"><label class="checkbox-inline"><input type="checkbox" id="game-pub-ni" ${jogoToEdit?.publico === 'N/I' ? 'checked' : ''}> Não identificado</label></div><div class="form-group"><label>Renda (R$) *</label><input type="number" name="renda" id="game-renda" step="0.01" required value="${jogoToEdit?.renda === 'N/I' ? '' : jogoToEdit?.renda}"><label class="checkbox-inline"><input type="checkbox" id="game-ren-ni" ${jogoToEdit?.renda === 'N/I' ? 'checked' : ''}> Não identificada</label></div><div class="form-group"><label>Ticket Médio</label><input type="text" name="ticketMedio" id="game-ticket-label" readonly value="N/I"></div></div>
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
                    <div class="flex-end">
                        <button type="button" class="btn-secondary" onclick="nextBlock(4)">Voltar</button>
                        <button type="button" class="btn-primary" onclick="saveNewJogo()">${jogoToEdit ? 'Atualizar' : 'Cadastrar Jogo'}</button>
                    </div>
                </div>
            </form>
        </div>
    `;
    setupAutocomplete('game-campeonato', 'competicoes', 'campeonato');
    setupAutocomplete('game-estadio', 'estadios', 'nome');
    setupAutocomplete('game-arbitro', 'arbitros', 'nome');
    document.getElementById('game-arbitro').addEventListener('change', updateRefereeInfo);
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
        }
    });
    
    setupAutocomplete('game-assistente1', 'arbitros', 'nome');
    setupAutocomplete('game-assistente2', 'arbitros', 'nome');
    setupAutocomplete('game-var', 'arbitros', 'nome');
    setupAutocomplete('game-fora', 'adversarios', 'clube');
    const estInp = document.getElementById('game-estadio'); estInp.addEventListener('change', () => { const est = state.estadios.find(e => e.nome === estInp.value); if (est) { document.getElementById('game-estadio-estado').value = est.estado; document.getElementById('game-estadio-pais').value = est.pais; if (est.mandante && est.mandante !== 'Atlético') { document.getElementById('game-casa').value = est.mandante; document.getElementById('game-fora').value = 'Atlético'; } else document.getElementById('game-casa').value = 'Atlético'; }});
    const updWinner = () => { const c = parseInt(document.getElementById('game-gols-casa').value)||0, f = parseInt(document.getElementById('game-gols-fora').value)||0; const casa = document.getElementById('game-casa').value, fora = document.getElementById('game-fora').value; const venced = document.getElementById('game-vencedor'); if (c > f) venced.value = casa || 'Casa'; else if (f > c) venced.value = fora || 'Fora'; else venced.value = 'Empate'; };
    ['game-gols-casa', 'game-gols-fora', 'game-casa', 'game-fora'].forEach(id => document.getElementById(id).addEventListener('input', updWinner));
    const updTicket = () => { const renCk = document.getElementById('game-ren-ni').checked; const pubCk = document.getElementById('game-pub-ni').checked; const label = document.getElementById('game-ticket-label'); if (renCk || pubCk) { label.value = 'N/I'; return; } const r = parseFloat(document.getElementById('game-renda').value) || 0; const p = parseInt(document.getElementById('game-publico').value) || 0; label.value = (p > 0) ? formatCurrency(r/p) : 'N/I'; };
    ['game-renda', 'game-publico', 'game-ren-ni', 'game-pub-ni'].forEach(id => document.getElementById(id)?.addEventListener('input', updTicket));
    ['game-ren-ni', 'game-pub-ni'].forEach(id => document.getElementById(id)?.addEventListener('change', updTicket));
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
    document.getElementById('game-penaltis-toggle').addEventListener('change', (e) => { document.getElementById('penaltis-placar').style.display = e.target.value === 'Sim' ? 'grid' : 'none'; });
    if(!jogoToEdit) {
        for(let i=0; i<16; i++) addLineupRow('galo');
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
    row.innerHTML = `<td class="col-player">${isAdv ? '<input type="text" placeholder="Adversário" class="card-player-inp" value="Adversário" required>' : `<div class="autocomplete-container"><input type="text" placeholder="Jogador" class="card-player-inp" value="${data?.jogador || ''}" required></div>`}</td>${isAdv ? '' : `<td><input type="text" class="pos-inp" readonly value="${data?.posicao || '-' }" required></td>`}<td><select class="yellow-sel" required><option value="0" ${yellowVal == 0 ? 'selected' : '' }>0</option><option value="1" ${yellowVal == 1 ? 'selected' : '' }>1</option></select></td><td><select class="red-sel" required><option value="0" ${data?.red == 0 ? 'selected' : '' }>0</option><option value="1" ${data?.red == 1 ? 'selected' : '' }>1</option></select></td><td><button type="button" class="btn-icon" onclick="this.closest('tr').remove()"><i class="fas fa-trash-alt" style="color:#dc3545;"></i></button></td>`;
    if(!isAdv) { 
        const inp = row.querySelector('.card-player-inp'); 
        const id = 'cq-'+Date.now()+Math.random(); 
        inp.id = id; 
        setTimeout(() => { 
            setupAutocomplete(id, 'jogadores', 'nome_guerra', p => String(p.temporada) === String(season)); 
            
            // Vertical Tab Navigation Logic
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const targetTr = e.shiftKey ? row.previousElementSibling : row.nextElementSibling;
                    if (targetTr) {
                        const targetInp = targetTr.querySelector('.card-player-inp');
                        if (targetInp) {
                            targetInp.focus();
                            setTimeout(() => targetInp.select(), 0);
                        }
                    }
                }
            });

            inp.addEventListener('blur', () => { 
                const p = state.jogadores.find(j => j.nome_guerra === inp.value && j.temporada === season); 
                if(p) row.querySelector('.pos-inp').value = p.posicao; 
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
        <td class="col-mini"><input type="text" class="age-inp" readonly style="width:40px;" value="${data?.idade || '-'}"></td>
        <td class="col-mini"><input type="number" class="goals-inp" value="${data?.golsCount || 0}" style="width:40px;" required></td>
        <td class="min-goals-td col-small"></td>
        <td class="tempo-goals-td col-small"></td>
        <td class="col-mini"><input type="number" class="gs-inp" value="${data?.gsCount || 0}" style="width:40px;" required></td>
        <td class="min-gs-td col-small"></td>
        <td class="tempo-gs-td col-small"></td>
        <td class="col-mini"><input type="checkbox" class="titular-ck" ${(data ? data.titular : true) ? 'checked' : ''}></td>
        <td class="col-mini"><input type="checkbox" class="sub-ck" ${(data ? data.substituido : false) ? 'checked' : ''}></td>
        <td class="col-mini"><button type="button" class="btn-icon" onclick="this.closest('tr').remove()"><i class="fas fa-trash-alt" style="color:#dc3545;"></i></button></td>
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
            setupAutocomplete(id, 'jogadores', 'nome_guerra', p => String(p.temporada) === String(season)); 
            
            // Vertical Tab Navigation Logic
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const targetTr = e.shiftKey ? row.previousElementSibling : row.nextElementSibling;
                    if (targetTr) {
                        const targetInp = targetTr.querySelector('.line-player-inp');
                        if (targetInp) {
                            targetInp.focus();
                            setTimeout(() => targetInp.select(), 0);
                        }
                    }
                }
            });

            inp.addEventListener('blur', () => { 
                const p = state.jogadores.find(j => j.nome_guerra === inp.value && j.temporada === season); 
                if(p) { 
                    row.querySelector('.mini-foto').src = p.foto; 
                    row.querySelector('.pos-inp').value = p.posicao; 
                    row.querySelector('.age-inp').value = calculateAge(p.nascimento, document.getElementById('game-data').value); 
                } 
            }); 
        }, 10); 
    }
    tbody.appendChild(row);
};

const saveNewJogo = () => {
    const fd = new FormData(document.getElementById('multi-step-form'));
    const jogo = { id: state.editingJogoId || Date.now() }; fd.forEach((v, k) => jogo[k] = v);
    if(document.getElementById('game-arb-ni').checked) jogo.arbitro = 'N/I';
    if(document.getElementById('game-pub-ni').checked) jogo.publico = 'N/I';
    if(document.getElementById('game-ren-ni').checked) jogo.renda = 'N/I';
    state.isSeasonFixed = document.getElementById('fix-game-season').checked; state.fixedSeason = jogo.temporada;
    state.isCampeonatoFixed = document.getElementById('fix-game-camp').checked; state.fixedCampeonato = jogo.campeonato;
    state.isTecnicoFixed = document.getElementById('fix-game-tec').checked; state.fixedTecnicoAtle = jogo.tecnicoGalo;
    saveData('fixedSeason', state.fixedSeason); saveData('isSeasonFixed', state.isSeasonFixed);
    saveData('fixedCampeonato', state.fixedCampeonato); saveData('isCampeonatoFixed', state.isCampeonatoFixed);
    saveData('fixedTecnicoAtle', state.fixedTecnicoAtle); saveData('isTecnicoFixed', state.isTecnicoFixed);
    jogo.cartoesGalo = Array.from(document.querySelectorAll('#cards-galo-body tr')).map(row => ({ jogador: row.querySelector('.card-player-inp')?.value, posicao: row.querySelector('.pos-inp')?.value, amarelo: row.querySelector('.yellow-sel').value, red: row.querySelector('.red-sel').value, minAmarelo: '', tempoAmarelo: '1', minVermelho: '', tempoVermelho: '1' }));
    jogo.cartoesAdv = Array.from(document.querySelectorAll('#cards-adv-body tr')).map(row => ({ jogador: row.querySelector('.card-player-inp')?.value || 'Adversário', amarelo: row.querySelector('.yellow-sel').value, red: row.querySelector('.red-sel').value, minAmarelo: '', tempoAmarelo: '1', minVermelho: '', tempoVermelho: '1' }));
    
    jogo.lineupGalo = [];
    Array.from(document.querySelectorAll('#lineup-galo-body tr')).forEach(r => {
        const l = r.querySelector('.line-player-inp')?.value || r.querySelector('input[placeholder="Jogador"]')?.value;
        if (!l) return;
        const gsInps = r.querySelectorAll('.gs-inp');
        const gsCnt = gsInps.length > 0 ? parseInt(gsInps[0].value || 0) : 0;
        
        jogo.lineupGalo.push({
            foto: r.querySelector('img').src,
            jogador: l,
            posicao: r.querySelector('.pos-inp').value,
            idade: r.querySelector('.age-inp').value,
            golsCount: parseInt(r.querySelector('.goals-inp').value || 0),
            golsMin: Array.from(r.querySelectorAll('.min-g-inp')).map(i => i.value),
            golsTempo: Array.from(r.querySelectorAll('.tempo-goals-td select')).map(i => i.value),
            gsCount: gsCnt,
            gsMin: Array.from(r.querySelectorAll('.min-gs-inp')).map(i => i.value),
            gsTempo: Array.from(r.querySelectorAll('.tempo-gs-td select')).map(i => i.value),
            titular: r.querySelector('.titular-ck').checked,
            substituido: r.querySelector('.sub-ck').checked
        });
    });

    const titularesCount = jogo.lineupGalo.filter(l => l.titular).length;
    if (titularesCount > 11) {
        alert(`Erro de Validação: Você marcou ${titularesCount} jogadores como titulares. O máximo permitido é 11.`);
        return;
    }

    const gsTotal = jogo.lineupGalo.reduce((acc, obj) => acc + obj.gsCount, 0);
    const advGols = parseInt(jogo.casa === 'Atlético' ? jogo.golsFora : jogo.golsCasa) || 0;
    if (gsTotal !== advGols) {
        alert(`Erro de Validação: A quantidade de Gols Sofridos informada na escalação (${gsTotal}) não confere com os gols marcados pelo adversário (${advGols}). Ajuste os valores para salvar o jogo.`);
        return;
    }

    state.jogos.find(j => j.id === jogo.id) ? state.jogos[state.jogos.findIndex(j => j.id === jogo.id)] = jogo : state.jogos.push(jogo);
    saveData('jogos', [jogo]);
    renderJogos();
    showSection('jogos');
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
        const colors = ['#d4af37', '#27ae60', '#2980b9', '#8e44ad', '#e67e22'];

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
    document.getElementById('stats-filters-coletivas').classList.toggle('hidden', tab !== 'coletivas');
    document.getElementById('stats-filters-individuais').classList.toggle('hidden', tab !== 'individuais');
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
    } else {
        renderStatsIndividuais(container);
    }
};

const renderStatsColetivas = (container) => {
    const fTemp = document.getElementById('stc-filter-temporada').value;
    const fCamp = document.getElementById('stc-filter-campeonato').value;
    const fTec  = document.getElementById('stc-filter-tecnico').value;
    const fTipo = document.getElementById('stc-filter-tipo').value;

    const filteredJogos = state.jogos.filter(j => {
        const comp = state.competicoes.find(c => c.campeonato === j.campeonato);
        if (fTemp && j.temporada !== fTemp) return false;
        if (fCamp && j.campeonato !== fCamp) return false;
        if (fTec && j.tecnicoGalo !== fTec) return false;
        if (fTipo && comp?.tipo !== fTipo) return false;
        return true;
    });

    // Populate Filters
    populateFilter('stc-filter-temporada', [...new Set(state.jogos.map(j => j.temporada))]);
    populateFilter('stc-filter-campeonato', [...new Set(state.jogos.map(j => j.campeonato))]);
    populateFilter('stc-filter-tecnico', [...new Set(state.jogos.map(j => j.tecnicoGalo))]);
    populateFilter('stc-filter-tipo', [...new Set(state.competicoes.map(c => c.tipo))].filter(Boolean));

    const stats = {};
    filteredJogos.forEach(j => {

        if (!stats[j.campeonato]) stats[j.campeonato] = { nome: j.campeonato, pontos: 0, jogos: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, yellowAtl: 0, redAtl: 0, yellowAdv: 0, redAdv: 0 };
        
        const s = stats[j.campeonato];
        s.jogos++;
        s.gp += parseInt(j.golsCasa === 'Atlético' || j.casa === 'Atlético' ? j.golsCasa : j.golsFora);
        s.gc += parseInt(j.casa === 'Atlético' ? j.golsFora : j.golsCasa);
        
        const galoGols = j.casa === 'Atlético' ? parseInt(j.golsCasa) : parseInt(j.golsFora);
        const advGols = j.casa === 'Atlético' ? parseInt(j.golsFora) : parseInt(j.golsCasa);
        
        if (galoGols > advGols) { s.v++; s.pontos += 3; }
        else if (galoGols === advGols) { s.e++; s.pontos += 1; }
        else s.d++;

        (j.cartoesGalo || []).forEach(c => { s.yellowAtl += parseInt(c.amarelo || 0); s.redAtl += parseInt(c.red || 0); });
        (j.cartoesAdv || []).forEach(c => { s.yellowAdv += parseInt(c.amarelo || 0); s.redAdv += parseInt(c.red || 0); });
    });

    const list = Object.values(stats);
    const total = list.reduce((acc, c) => {
        acc.pontos += c.pontos; acc.jogos += c.jogos; acc.v += c.v; acc.e += c.e; acc.d += c.d; acc.gp += c.gp; acc.gc += c.gc;
        acc.yellowAtl += c.yellowAtl; acc.redAtl += c.redAtl; acc.yellowAdv += c.yellowAdv; acc.redAdv += c.redAdv;
        return acc;
    }, { nome: 'TOTAL', pontos: 0, jogos: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, yellowAtl: 0, redAtl: 0, yellowAdv: 0, redAdv: 0 });

    const calcRow = (s) => {
        const sg = s.gp - s.gc;
        const aprove = s.jogos > 0 ? ((s.pontos / (s.jogos * 3)) * 100).toFixed(2) : "0.00";
        const mgm = s.jogos > 0 ? (s.gp / s.jogos).toFixed(2) : "0.00";
        const mgs = s.jogos > 0 ? (s.gc / s.jogos).toFixed(2) : "0.00";
        return `<tr><td style="text-align:left;"><strong>${s.nome}</strong></td><td>${s.pontos}</td><td>${s.jogos}</td><td>${s.v}</td><td>${s.e}</td><td>${s.d}</td><td>${s.gp}</td><td>${s.gc}</td><td>${sg}</td><td>${aprove}%</td><td>${mgm}</td><td>${mgs}</td><td style="color:#f39c12;">${s.yellowAtl}</td><td style="color:#e74c3c;">${s.redAtl}</td><td style="color:#f39c12; border-left:1px solid #eee;">${s.yellowAdv}</td><td style="color:#e74c3c;">${s.redAdv}</td></tr>`;
    };


    container.innerHTML = `
        <table class="data-table" style="text-align:center;">
            <thead>
                <tr><th style="text-align:left;">Campeonato</th><th>Pts</th><th>J</th><th>V</th><th>E</th><th>D</th><th>GP</th><th>GC</th><th>SG</th><th>%</th><th>MGm</th><th>MGs</th><th title="Amarelos Galo">CA(G)</th><th title="Vermelhos Galo">CV(G)</th><th title="Amarelos Adv">CA(A)</th><th title="Vermelhos Adv">CV(A)</th></tr>
            </thead>
            <tbody>
                ${list.map(calcRow).join('')}
                <tr style="background:#f9f9f9; font-weight:bold; border-top:2px solid #ddd;">${calcRow(total)}</tr>
            </tbody>
        </table>
    `;

    // Render Charts
    renderGoalDistributionCharts(filteredJogos);
};

let goalsMarkedChart = null;
let goalsConcededChart = null;

const renderGoalDistributionCharts = (filteredJogos) => {
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
};

const renderStatsIndividuais = (container) => {
    const fTemp = document.getElementById('sti-filter-temporada').value;
    const fJog = document.getElementById('sti-filter-jogador').value;
    const fPos = document.getElementById('sti-filter-posicao').value;
    const fCamp = document.getElementById('sti-filter-campeonato').value;

    const stats = {};
    state.jogos.forEach(j => {
        if (fTemp && j.temporada !== fTemp) return;
        if (fCamp && j.campeonato !== fCamp) return;

        j.lineupGalo?.forEach(l => {
            const player = state.jogadores.find(p => p.nome_guerra === l.jogador && p.temporada === j.temporada);
            if (!stats[l.jogador]) stats[l.jogador] = { nome: l.jogador, foto: l.foto, posicao: l.posicao, jogos: 0, v: 0, d: 0, gols: 0, gs: 0, yellow: 0, red: 0, pontos: 0 };
            
            const s = stats[l.jogador];
            s.jogos++;
            s.gols += parseInt(l.golsCount || 0);
            s.gs += parseInt(l.gsCount || 0);

            const galoGols = j.casa === 'Atlético' ? parseInt(j.golsCasa) : parseInt(j.golsFora);
            const advGols = j.casa === 'Atlético' ? parseInt(j.golsFora) : parseInt(j.golsCasa);
            
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
    if (fJog) list = list.filter(l => l.nome === fJog);
    if (fPos) list = list.filter(l => l.posicao === fPos);

    // Cascading Filter Logic
    const availableJogadores = fTemp 
        ? state.jogadores.filter(p => p.temporada === fTemp)
        : state.jogadores;
    const availableCampeonatos = fTemp
        ? [...new Set(state.jogos.filter(j => j.temporada === fTemp).map(j => j.campeonato))]
        : [...new Set(state.jogos.map(j => j.campeonato))];
    const availablePosicoes = [...new Set(state.jogadores.map(p => p.posicao))].filter(p => p);

    populateFilter('sti-filter-temporada', [...new Set(state.jogos.map(j => j.temporada))]);
    populateFilter('sti-filter-posicao', availablePosicoes);
    populateFilter('sti-filter-campeonato', availableCampeonatos);

    // Setup Autocomplete for Player
    state.jogadoresStatsIndividuais = availableJogadores;
    setupAutocomplete('sti-filter-jogador', 'jogadoresStatsIndividuais', 'nome_guerra', null, () => {
        renderStatsIndividuais(container);
    }, false);

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
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
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
const prepareEdit = (tab, id) => { state.editingId = id; renderTab(tab); const item = state[tab].find(i => i.id === id); const form = document.querySelector(`#form-${tab}`); if(!form) return; Object.keys(item).forEach(k => { const inp = form.querySelector(`[name="${k}"]`); if (inp && k !== 'foto') inp.value = item[k]; }); window.scrollTo(0,0); };
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
const setupAutofillHandler = () => {
    const nameInp = document.getElementById('input-nome-completo');
    if(nameInp) nameInp.addEventListener('blur', (e) => {
        const j = state.jogadores.find(p => p.nome_completo.toLowerCase() === e.target.value.toLowerCase());
        if (j) {
            ['nome_guerra', 'posicao', 'nacionalidade', 'nascimento', 'numero', 'observacao'].forEach(k => {
                const inp = document.getElementById(`input-${k.replace('_','-')}`);
                if(inp) inp.value = j[k];
            });
            // Filling photo as well
            const fotoInp = document.getElementById('foto-input-jogador');
            const pasteArea = document.getElementById('paste-area-jogador');
            if(fotoInp && j.foto) {
                fotoInp.value = j.foto;
                pasteArea.innerHTML = `<img src="${j.foto}" style="max-height:80px;">`;
            }
            if(j.foraDoElenco) document.getElementById('input-fora-do-elenco').checked = true;
        }
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
    if (['adversarios', 'estadios', 'competicoes', 'arbitros', 'jogadores', 'cadastros'].includes(page)) {
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
        renderArtilheiros();
    } else if (page === 'cartoes') {
        showSection('cartoes');
        renderCartoes();
    } else if (page === 'arbitragem') {
        showSection('arbitragem');
        renderArbitragem();
    } else if (page === 'estatisticas') {
        showSection('estatisticas');
        renderEstatisticas();
    } else {
        showSection(page);
    }
}));
document.getElementById('btn-novo-jogo')?.addEventListener('click', () => renderNovoJogoPage());
['filter-temporada', 'filter-campeonato', 'filter-casa', 'filter-fora', 'filter-estadio', 'filter-arbitro', 'filter-publico-min', 'filter-publico-max'].forEach(id => { document.getElementById(id)?.addEventListener('change', renderJogos); if(id.includes('publico')) document.getElementById(id)?.addEventListener('input', renderJogos); });
['elenco-filter-temporada', 'elenco-filter-posicao', 'elenco-filter-status', 'elenco-filter-nome', 'elenco-filter-nacionalidade'].forEach(id => document.getElementById(id)?.addEventListener('change', renderElenco));
['elenco-filter-idade-min', 'elenco-filter-idade-max'].forEach(id => document.getElementById(id)?.addEventListener('input', renderElenco));
['art-filter-temporada', 'art-filter-jogador', 'art-filter-posicao', 'art-filter-adversario', 'art-filter-estadio', 'art-filter-campeonato', 'art-filter-tipo', 'art-filter-nacionalidade'].forEach(id => document.getElementById(id)?.addEventListener('change', renderArtilheiros));
['cart-filter-temporada', 'cart-filter-time', 'cart-filter-posicao'].forEach(id => document.getElementById(id)?.addEventListener('change', renderCartoes));
['arb-filter-temporada', 'arb-filter-arbitro', 'arb-filter-adversario', 'arb-filter-estadio', 'arb-filter-campeonato', 'arb-filter-tipo'].forEach(id => document.getElementById(id)?.addEventListener('change', renderArbitragem));
    ['stc-filter-temporada', 'stc-filter-campeonato', 'stc-filter-tecnico', 'stc-filter-tipo'].forEach(id => document.getElementById(id)?.addEventListener('change', renderEstatisticas));
['sti-filter-temporada', 'sti-filter-jogador', 'sti-filter-posicao', 'sti-filter-campeonato'].forEach(id => document.getElementById(id)?.addEventListener('change', renderEstatisticas));

document.getElementById('export-csv')?.addEventListener('click', () => { let csv = 'Data,Campeonato,Casa,Placar,Fora,Árbitro,Público,Renda\n'; state.jogos.forEach(j => { csv += `${j.data},${j.campeonato},${j.casa},${j.golsCasa}x${j.golsFora},${j.fora},${j.arbitro},${j.publico},${j.renda}\n`; }); const blob = new Blob([csv], { type: 'text/csv' }); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'jogos.csv'; a.click(); });
document.getElementById('export-artilheiros-csv')?.addEventListener('click', () => {
    // Basic export for artilheiros
    alert('Artilheiros exportados com sucesso! (Funcionalidade demonstrativa)');
});

// DASHBOARD & DATA MGMT
const renderDashboard = () => {
    const isCurrentYearOnly = document.getElementById('dash-filtro-ano')?.checked;
    const currentYear = new Date().getFullYear().toString();
    
    let jogos = state.jogos || [];
    if (isCurrentYearOnly) {
        jogos = jogos.filter(j => j.temporada === currentYear || j.data?.includes(currentYear));
    }
    
    let jogosTotal = jogos.length;
    let v = 0, e = 0, d = 0;
    let publicoTotal = 0, jogosComPublico = 0;
    let rendaTotal = 0, jogosComRenda = 0;
    let gm = 0, gs = 0;
    
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
        
        // Público e Renda
        if (j.publico) {
            let p = parseInt(j.publico.replace(/\D/g, ''));
            if (!isNaN(p)) { publicoTotal += p; jogosComPublico++; }
        }
        if (j.renda) {
            let r = parseFloat(j.renda.replace(/[^\d,]/g, '').replace(',', '.'));
            if (!isNaN(r)) { rendaTotal += r; jogosComRenda++; }
        }
        
        // Artilheiros
        if(Array.isArray(j.lineupGalo)) {
            j.lineupGalo.forEach(x => {
                if(x.gols > 0) {
                    artilheirosMap[x.id] = (artilheirosMap[x.id] || 0) + x.gols;
                }
            });
        }
        
        // Cartões
        if(Array.isArray(j.cartoesGalo)) {
            j.cartoesGalo.forEach(c => {
                const pId = c.jogadorId;
                if(c.tipo === 'Amarelo') amarelosMap[pId] = (amarelosMap[pId] || 0) + 1;
                else if(c.tipo === 'Vermelho' || c.tipo === '2º Amarelo') vermelhosMap[pId] = (vermelhosMap[pId] || 0) + 1;
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
        const sorted = Object.entries(mapHash).sort((a,b) => b[1] - a[1]).slice(0, 5);
        const container = document.getElementById(containerId);
        if(!container) return;
        container.innerHTML = '';
        if(sorted.length === 0) {
            container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhum registro.</span>';
            return;
        }
        sorted.forEach((item, index) => {
            const player = state.jogadores.find(p => p.id === parseInt(item[0]));
            if(!player) return;
            const photo = player.foto ? `<img src="${player.foto}" style="width: 30px; height: 30px; border-radius: 50%; object-fit: cover;">` : `<div style="width:30px;height:30px;border-radius:50%;background:#eee;display:flex;align-items:center;justify-content:center;font-size:0.7rem;"><i class="fas fa-user"></i></div>`;
            container.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
                    <div style="display: flex; align-items: center; gap: 0.8rem;">
                        <span style="color: #bdc3c7; font-weight: bold; width: 20px;">#${index+1}</span>
                        ${photo}
                        <span style="font-weight: 500; color: var(--text-main);">${player.nomeVulgar || player.nome}</span>
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

const clearAllData = () => {
    if (confirm('ATENÇÃO: Isso excluirá TODOS os seus dados salvos (Jogos, Jogadores, Adversários, etc). Deseja continuar?') &&
        confirm('TEM CERTEZA? Esta ação não pode ser desfeita.')) {
        localStorage.clear();
        location.reload();
    }
};

const exportData = () => {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estatletico_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
};

// showSection('dashboard');
