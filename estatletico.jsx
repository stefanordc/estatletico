import { useState, useMemo } from "react";

// ─── DATA ────────────────────────────────────────────────────────────────────

const initialAdversarios = [
  { id: 1, clube: "Lanús", estado: "Argentina", pais: "Argentina" },
  { id: 2, clube: "Avaí", estado: "SC", pais: "Brasil" },
  { id: 3, clube: "Emelec", estado: "Equador", pais: "Equador" },
  { id: 4, clube: "Tolima", estado: "Colômbia", pais: "Colômbia" },
  { id: 5, clube: "Brasiliense", estado: "DF", pais: "Brasil" },
  { id: 6, clube: "Uberlândia", estado: "MG", pais: "Brasil" },
  { id: 7, clube: "Goiás", estado: "GO", pais: "Brasil" },
  { id: 8, clube: "Coritiba", estado: "PR", pais: "Brasil" },
  { id: 9, clube: "Brasil de Pelotas", estado: "RS", pais: "Brasil" },
  { id: 10, clube: "Vasco", estado: "RJ", pais: "Brasil" },
  { id: 11, clube: "Flamengo", estado: "RJ", pais: "Brasil" },
  { id: 12, clube: "Palmeiras", estado: "SP", pais: "Brasil" },
  { id: 13, clube: "Fortaleza", estado: "CE", pais: "Brasil" },
  { id: 14, clube: "Bragantino", estado: "SP", pais: "Brasil" },
  { id: 15, clube: "Sport", estado: "PE", pais: "Brasil" },
  { id: 16, clube: "Bahia", estado: "BA", pais: "Brasil" },
  { id: 17, clube: "Internacional", estado: "RS", pais: "Brasil" },
  { id: 18, clube: "Independiente del Valle", estado: "Equador", pais: "Equador" },
  { id: 19, clube: "Ceará", estado: "CE", pais: "Brasil" },
];

const initialEstadios = [
  { id: 1, nome: "Arena MRV", cidade: "Belo Horizonte", capacidade: 46000 },
  { id: 2, nome: "Mineirão", cidade: "Belo Horizonte", capacidade: 61846 },
  { id: 3, nome: "Maracanã", cidade: "Rio de Janeiro", capacidade: 73531 },
];

const initialCompeticoes = [
  { id: 1, nome: "Brasileiro", tipo: "Nacional", edicao: "2025" },
  { id: 2, nome: "Copa do Brasil", tipo: "Nacional", edicao: "2025" },
  { id: 3, nome: "Sul-Americana", tipo: "Internacional", edicao: "2025" },
  { id: 4, nome: "Mineiro", tipo: "Estadual", edicao: "2025" },
];

const initialArbitros = [
  { id: 1, nome: "Rafael Rodrigo Klein", estado: "RS" },
  { id: 2, nome: "Lucas Paulo Torezin", estado: "PR" },
  { id: 3, nome: "Davi de Oliveira Lacerda", estado: "ES" },
  { id: 4, nome: "Piero Daniel Maza", estado: "Chile" },
  { id: 5, nome: "Marcelo de Lima Henrique", estado: "RJ" },
  { id: 6, nome: "Sávio Pereira Sampaio", estado: "DF" },
  { id: 7, nome: "Matheus Delgado Candançan", estado: "SP" },
  { id: 8, nome: "Alex Gomes Stefano", estado: "RJ" },
  { id: 9, nome: "Esteban Daniel Ostojich Vegah", estado: "Uruguai" },
  { id: 10, nome: "Bruno Arleu de Araújo", estado: "ES" },
  { id: 11, nome: "Carlos Andrés Betancur", estado: "Colômbia" },
];

const initialJogadores = [
  { id: 1, nome: "Hulk", posicao: "Atacante", nacionalidade: "Brasil" },
  { id: 2, nome: "Paulinho", posicao: "Atacante", nacionalidade: "Brasil" },
  { id: 3, nome: "Vargas", posicao: "Atacante", nacionalidade: "Chile" },
  { id: 4, nome: "Rony", posicao: "Atacante", nacionalidade: "Brasil" },
  { id: 5, nome: "Eduardo Sasha", posicao: "Atacante", nacionalidade: "Brasil" },
  { id: 6, nome: "Everson", posicao: "Goleiro", nacionalidade: "Brasil" },
  { id: 7, nome: "Guilherme Arana", posicao: "Lateral", nacionalidade: "Brasil" },
  { id: 8, nome: "Jemerson", posicao: "Zagueiro", nacionalidade: "Brasil" },
  { id: 9, nome: "Lyanco", posicao: "Zagueiro", nacionalidade: "Brasil" },
  { id: 10, nome: "Júnior Alonso", posicao: "Zagueiro", nacionalidade: "Paraguai" },
  { id: 11, nome: "Mariano", posicao: "Lateral", nacionalidade: "Brasil" },
  { id: 12, nome: "Igor Rabello", posicao: "Zagueiro", nacionalidade: "Brasil" },
];

const jogosData = [
  { id: 1, data: "07/12/2025", campeonato: "Brasileiro", casa: "Atlético", placar: "5 x 0", fora: "Vasco", arbitro: "Lucas Paulo Torezin", publico: 20622, renda: 897255.52, ticketMedio: 43.51 },
  { id: 2, data: "03/12/2025", campeonato: "Brasileiro", casa: "Atlético", placar: "0 x 3", fora: "Palmeiras", arbitro: "Rafael Rodrigo Klein", publico: 13878, renda: 535000.17, ticketMedio: 38.55 },
  { id: 3, data: "30/11/2025", campeonato: "Brasileiro", casa: "Fortaleza", placar: "1 x 0", fora: "Atlético", arbitro: "Davi de Oliveira Lacerda", publico: 50749, renda: 886176.00, ticketMedio: 17.46 },
  { id: 4, data: "25/11/2025", campeonato: "Brasileiro", casa: "Atlético", placar: "1 x 1", fora: "Flamengo", arbitro: "Rafael Rodrigo Klein", publico: 18321, renda: 850004.51, ticketMedio: 46.40 },
  { id: 5, data: "22/11/2025", campeonato: "Sul-Americana", casa: "Lanús", placar: "0 x 0 (5-4 pen.)", fora: "Atlético", arbitro: "Piero Daniel Maza", publico: 38000, renda: null, ticketMedio: null },
  { id: 6, data: "16/11/2025", campeonato: "Brasileiro", casa: "Bragantino", placar: "2 x 0", fora: "Atlético", arbitro: "Marcelo de Lima Henrique", publico: 4472, renda: 135710.00, ticketMedio: 30.35 },
  { id: 7, data: "12/11/2025", campeonato: "Brasileiro", casa: "Atlético", placar: "3 x 3", fora: "Fortaleza", arbitro: "Sávio Pereira Sampaio", publico: 39246, renda: 1765397.14, ticketMedio: 44.98 },
  { id: 8, data: "08/11/2025", campeonato: "Brasileiro", casa: "Sport", placar: "2 x 4", fora: "Atlético", arbitro: "Matheus Delgado Candançan", publico: 5095, renda: 124805.00, ticketMedio: 24.50 },
  { id: 9, data: "05/11/2025", campeonato: "Brasileiro", casa: "Atlético", placar: "3 x 0", fora: "Bahia", arbitro: "Davi de Oliveira Lacerda", publico: 25506, renda: 1102674.50, ticketMedio: 43.23 },
  { id: 10, data: "02/11/2025", campeonato: "Brasileiro", casa: "Internacional", placar: "0 x 0", fora: "Atlético", arbitro: "Alex Gomes Stefano", publico: 29945, renda: 306556.99, ticketMedio: 10.24 },
  { id: 11, data: "28/10/2025", campeonato: "Sul-Americana", casa: "Atlético", placar: "3 x 1", fora: "Independiente del Valle", arbitro: "Esteban Daniel Ostojich Vegah", publico: 40185, renda: 2615194.39, ticketMedio: 65.08 },
  { id: 12, data: "25/10/2025", campeonato: "Brasileiro", casa: "Atlético", placar: "1 x 0", fora: "Ceará", arbitro: "Bruno Arleu de Araújo", publico: 33694, renda: 1576358.69, ticketMedio: 46.78 },
  { id: 13, data: "21/10/2025", campeonato: "Sul-Americana", casa: "Independiente del Valle", placar: "1 x 1", fora: "Atlético", arbitro: "Carlos Andrés Betancur", publico: 8000, renda: null, ticketMedio: null },
];

const artilheiros = [
  { pos: 1, nome: "Hulk", gols: 102 },
  { pos: 2, nome: "Paulinho", gols: 50 },
  { pos: 3, nome: "Vargas", gols: 19 },
  { pos: 4, nome: "Rony", gols: 13 },
  { pos: 5, nome: "Eduardo Sasha", gols: 13 },
];

const cartoesAmarelos = [
  { pos: 1, nome: "Hulk", cartoes: 56 },
  { pos: 2, nome: "Everson", cartoes: 38 },
  { pos: 3, nome: "Guilherme Arana", cartoes: 33 },
  { pos: 4, nome: "Jemerson", cartoes: 30 },
  { pos: 5, nome: "Lyanco", cartoes: 30 },
];

const cartoesVermelhos = [
  { pos: 1, nome: "Júnior Alonso", cartoes: 3 },
  { pos: 2, nome: "Hulk", cartoes: 3 },
  { pos: 3, nome: "Lyanco", cartoes: 3 },
  { pos: 4, nome: "Mariano", cartoes: 2 },
  { pos: 5, nome: "Igor Rabello", cartoes: 2 },
];

// ─── STYLES ──────────────────────────────────────────────────────────────────

const S = {
  gold: "#C9952A",
  goldLight: "#D4A843",
  darkBg: "#1a1a1a",
  darkBg2: "#222222",
  white: "#ffffff",
  lightBg: "#f4f4f4",
  border: "#e5e5e5",
  text: "#1a1a1a",
  textMuted: "#666",
  green: "#16a34a",
  red: "#dc2626",
  amber: "#d97706",
};

const styles = {
  app: { display: "flex", height: "100vh", fontFamily: "'Segoe UI', sans-serif", background: S.lightBg, overflow: "hidden" },
  sidebar: { width: 200, minWidth: 200, background: S.darkBg, display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" },
  sidebarHeader: { padding: "20px 16px 16px", borderBottom: "1px solid #333" },
  sidebarTitle: { color: S.gold, fontSize: 18, fontWeight: 700, margin: 0 },
  sidebarSub: { color: "#888", fontSize: 11, margin: "2px 0 0" },
  sidebarNav: { flex: 1, padding: "8px 0", overflowY: "auto" },
  navItem: (active) => ({
    display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
    cursor: "pointer", color: active ? S.darkBg : "#ccc",
    background: active ? S.gold : "transparent",
    borderRadius: active ? "6px" : 0,
    margin: active ? "2px 8px" : "1px 0",
    fontSize: 13, fontWeight: active ? 600 : 400,
    transition: "all .15s",
  }),
  sidebarFooter: { padding: "12px 16px", borderTop: "1px solid #333" },
  footerUser: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 },
  avatar: { width: 32, height: 32, borderRadius: "50%", background: S.gold, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: S.darkBg },
  userName: { color: "#ddd", fontSize: 12, fontWeight: 600 },
  userEmail: { color: "#888", fontSize: 10 },
  btnSair: { width: "100%", background: "transparent", border: "1px solid #444", color: "#ccc", borderRadius: 6, padding: "7px 0", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 },
  content: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  pageWrap: { flex: 1, overflowY: "auto", padding: "28px 32px" },
  pageTitle: { fontSize: 26, fontWeight: 700, color: S.text, margin: "0 0 4px" },
  pageSub: { fontSize: 13, color: S.textMuted, margin: "0 0 20px" },
  // Cards
  statsRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 },
  statCard: { background: S.white, borderRadius: 10, padding: "18px 20px", border: `1px solid ${S.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  statLabel: { fontSize: 11, color: S.textMuted, marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: 700, color: S.text },
  // Two-col info row
  infoRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 },
  infoCard: { background: S.white, borderRadius: 10, padding: "18px 20px", border: `1px solid ${S.border}` },
  infoCardTitle: { fontSize: 14, fontWeight: 600, color: S.text, marginBottom: 12 },
  infoLine: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 14 },
  // Top 5
  top5Row: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 },
  top5Card: { background: S.white, borderRadius: 10, border: `1px solid ${S.border}`, overflow: "hidden" },
  top5Header: (bg) => ({ background: bg, padding: "12px 16px", fontSize: 13, fontWeight: 700, color: S.white }),
  top5Item: { display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: `1px solid #f0f0f0`, gap: 10 },
  top5Pos: (gold) => ({ fontSize: 12, fontWeight: 700, color: gold ? S.gold : S.textMuted, width: 22 }),
  shieldIcon: { width: 32, height: 32, borderRadius: "50%", background: "#222", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  top5Name: { flex: 1, fontSize: 13, color: S.text },
  top5Val: (color) => ({ fontSize: 14, fontWeight: 700, color }),
  // Cadastros
  tabRow: { display: "flex", gap: 0, border: `1px solid ${S.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 20, background: S.white },
  tab: (active) => ({ padding: "10px 18px", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, background: active ? S.gold : "transparent", color: active ? S.white : S.textMuted, display: "flex", alignItems: "center", gap: 6, transition: "all .15s", border: "none", outline: "none" }),
  formCard: { background: S.white, borderRadius: 10, border: `1px solid ${S.border}`, overflow: "hidden", marginBottom: 20 },
  formHeader: { background: S.gold, padding: "12px 20px", fontSize: 14, fontWeight: 600, color: S.white, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" },
  formBody: { padding: 20 },
  fieldRow: { display: "grid", gap: 16, marginBottom: 16 },
  label: { fontSize: 12, fontWeight: 600, color: S.text, marginBottom: 4, display: "block" },
  input: { width: "100%", border: `1px solid ${S.border}`, borderRadius: 6, padding: "9px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit", color: S.text, background: S.white },
  btnPrimary: { background: S.gold, color: S.white, border: "none", borderRadius: 6, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  tableCard: { background: S.white, borderRadius: 10, border: `1px solid ${S.border}`, overflow: "hidden" },
  tableHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${S.border}` },
  tableHeadTitle: { fontSize: 14, fontWeight: 600, color: S.text },
  searchInput: { border: `1px solid ${S.border}`, borderRadius: 6, padding: "7px 12px 7px 30px", fontSize: 13, outline: "none", width: 180 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { padding: "10px 16px", textAlign: "left", fontSize: 11, color: S.textMuted, fontWeight: 600, borderBottom: `1px solid ${S.border}`, background: "#fafafa", whiteSpace: "nowrap" },
  td: { padding: "12px 16px", fontSize: 13, color: S.text, borderBottom: `1px solid #f5f5f5` },
  iconBtn: (color) => ({ background: "none", border: "none", cursor: "pointer", color, padding: "0 4px", fontSize: 14 }),
  // Jogos filters
  filterCard: { background: S.white, borderRadius: 10, border: `1px solid ${S.border}`, padding: 20, marginBottom: 20 },
  filterTitle: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: S.text, marginBottom: 16 },
  filterGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 14 },
  select: { width: "100%", border: `1px solid ${S.border}`, borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none", background: S.white, color: S.text, fontFamily: "inherit" },
  pageHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  btnGroup: { display: "flex", gap: 8 },
  btnOutline: { background: S.white, color: S.text, border: `1px solid ${S.border}`, borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 },
  comingSoon: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, color: S.textMuted, gap: 12 },
};

// ─── ICONS (SVG inline) ───────────────────────────────────────────────────────

const Icon = {
  dashboard: () => <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" rx="1" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" rx="1" strokeWidth="2"/><rect x="14" y="14" width="7" height="7" rx="1" strokeWidth="2"/></svg>,
  cadastros: () => <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4" strokeWidth="2"/><path strokeWidth="2" d="M23 21v-2a4 4 0 0 0-3-3.87"/><path strokeWidth="2" d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  jogos: () => <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2"/><path strokeWidth="2" d="M16 2v4M8 2v4M3 10h18"/></svg>,
  elenco: () => <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path strokeWidth="2" d="M12 8v4l3 3"/></svg>,
  artilheiros: () => <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
  cartoes: () => <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2" strokeWidth="2"/></svg>,
  arbitragem: () => <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M3 6h18M3 12h18M3 18h18"/></svg>,
  estatisticas: () => <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M18 20V10M12 20V4M6 20v-6"/></svg>,
  comparativo: () => <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>,
  relatorios: () => <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path strokeWidth="2" d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>,
  trophy: () => <svg width="28" height="28" fill="none" stroke={S.gold} viewBox="0 0 24 24"><path strokeWidth="2" d="M6 9H4a2 2 0 0 0-2 2v1a6 6 0 0 0 6 6h8a6 6 0 0 0 6-6v-1a2 2 0 0 0-2-2h-2"/><path strokeWidth="2" d="M6 9V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4"/><path strokeWidth="2" d="M12 18v3M9 21h6"/></svg>,
  trend: () => <svg width="28" height="28" fill="none" stroke={S.green} viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" strokeWidth="2"/><polyline points="17 6 23 6 23 12" strokeWidth="2"/></svg>,
  people: () => <svg width="28" height="28" fill="none" stroke="#6b7280" viewBox="0 0 24 24"><path strokeWidth="2" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4" strokeWidth="2"/><path strokeWidth="2" d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  dollar: () => <svg width="28" height="28" fill="none" stroke={S.green} viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23" strokeWidth="2"/><path strokeWidth="2" d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  filter: () => <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" strokeWidth="2"/></svg>,
  edit: () => <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path strokeWidth="2" d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  trash: () => <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6" strokeWidth="2"/><path strokeWidth="2" d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path strokeWidth="2" d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  search: () => <svg width="14" height="14" fill="none" stroke={S.textMuted} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" strokeWidth="2"/><line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2"/></svg>,
  plus: () => <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19" strokeWidth="2"/><line x1="5" y1="12" x2="19" y2="12" strokeWidth="2"/></svg>,
  download: () => <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10" strokeWidth="2"/><line x1="12" y1="15" x2="12" y2="3" strokeWidth="2"/></svg>,
  shield: () => <svg width="18" height="18" fill="#888" viewBox="0 0 24 24"><path d="M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6l-8-4z"/></svg>,
  sort: () => <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>,
  logout: () => <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7" strokeWidth="2"/><line x1="21" y1="12" x2="9" y2="12" strokeWidth="2"/></svg>,
  location: () => <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3" strokeWidth="2"/></svg>,
  competition: () => <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="8" r="6" strokeWidth="2"/><path strokeWidth="2" d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>,
  flag: () => <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15" strokeWidth="2"/></svg>,
  player: () => <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" strokeWidth="2"/><path strokeWidth="2" d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
};

// ─── SHIELD SVG (player avatar) ───────────────────────────────────────────────

function ShieldAvatar() {
  return (
    <div style={styles.shieldIcon}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#C9952A">
        <path d="M12 2L4 6v6c0 5.25 3.5 9.74 8 11 4.5-1.26 8-5.75 8-11V6l-8-4z"/>
        <path d="M9 12l2 2 4-4" stroke="#1a1a1a" strokeWidth="1.5" fill="none"/>
      </svg>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

function Dashboard() {
  const [apenasAtual, setApenasAtual] = useState(false);

  return (
    <div style={styles.pageWrap}>
      <h1 style={styles.pageTitle}>Dashboard - Estatlético</h1>
      <p style={styles.pageSub}>Resumo completo do Clube Atlético Mineiro</p>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: S.textMuted, marginBottom: 20, cursor: "pointer" }}>
        <input type="checkbox" checked={apenasAtual} onChange={e => setApenasAtual(e.target.checked)} />
        Apenas temporada atual (2026)
      </label>

      {/* Stat cards */}
      <div style={styles.statsRow}>
        {[
          { label: "Jogos", value: "281", icon: <Icon.trophy /> },
          { label: "Aproveitamento", value: "55.4%", icon: <Icon.trend /> },
          { label: "Média de Público", value: "28.182", icon: <Icon.people /> },
          { label: "Média de Renda", value: "R$ 1.398.521,66", icon: <Icon.dollar /> },
        ].map((c, i) => (
          <div key={i} style={styles.statCard}>
            <div>
              <div style={styles.statLabel}>{c.label}</div>
              <div style={styles.statValue}>{c.value}</div>
            </div>
            {c.icon}
          </div>
        ))}
      </div>

      {/* Resultados + Gols */}
      <div style={styles.infoRow}>
        <div style={styles.infoCard}>
          <div style={styles.infoCardTitle}>Resultados</div>
          <div style={styles.infoLine}>
            <span style={{ color: S.gold, fontWeight: 500 }}>Vitórias</span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>128</span>
          </div>
          <div style={{ ...styles.infoLine, borderTop: `1px solid ${S.border}` }}>
            <span style={{ color: S.amber, fontWeight: 500 }}>Empates</span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>83</span>
          </div>
          <div style={{ ...styles.infoLine, borderTop: `1px solid ${S.border}` }}>
            <span style={{ color: S.red, fontWeight: 500 }}>Derrotas</span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>70</span>
          </div>
        </div>

        <div style={styles.infoCard}>
          <div style={styles.infoCardTitle}>Gols e Cartões</div>
          {[
            { label: "Gols Marcados", value: 388, color: S.green },
            { label: "Gols Sofridos", value: 262, color: S.red },
            { label: "Média GM", value: "1.38", color: S.text },
            { label: "Média GS", value: "0.93", color: S.text },
            { label: "Amarelos", value: 712, color: S.amber },
            { label: "Vermelhos", value: 35, color: S.red },
          ].map((r, i) => (
            <div key={i} style={{ ...styles.infoLine, borderTop: i > 0 ? `1px solid ${S.border}` : "none" }}>
              <span style={{ color: r.color === S.text ? S.textMuted : r.color, fontWeight: r.color === S.text ? 400 : 500 }}>{r.label}</span>
              <span style={{ fontWeight: 700, fontSize: 15, color: r.color }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top 5 */}
      <div style={styles.top5Row}>
        <div style={styles.top5Card}>
          <div style={styles.top5Header("#B8860B")}>Top 5 Artilheiros</div>
          {artilheiros.map(p => (
            <div key={p.pos} style={styles.top5Item}>
              <span style={styles.top5Pos(true)}>#{p.pos}</span>
              <ShieldAvatar />
              <span style={styles.top5Name}>{p.nome}</span>
              <span style={styles.top5Val(S.text)}>{p.gols}</span>
            </div>
          ))}
        </div>

        <div style={styles.top5Card}>
          <div style={styles.top5Header("#d4b000")}>Top 5 Cartões Amarelos</div>
          {cartoesAmarelos.map(p => (
            <div key={p.pos} style={styles.top5Item}>
              <span style={styles.top5Pos(true)}>#{p.pos}</span>
              <ShieldAvatar />
              <span style={styles.top5Name}>{p.nome}</span>
              <span style={styles.top5Val(S.amber)}>{p.cartoes}</span>
            </div>
          ))}
        </div>

        <div style={styles.top5Card}>
          <div style={styles.top5Header("#c0392b")}>Top 5 Cartões Vermelhos</div>
          {cartoesVermelhos.map(p => (
            <div key={p.pos} style={styles.top5Item}>
              <span style={styles.top5Pos(false)}>#{p.pos}</span>
              <ShieldAvatar />
              <span style={styles.top5Name}>{p.nome}</span>
              <span style={styles.top5Val(S.red)}>{p.cartoes}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CADASTROS ────────────────────────────────────────────────────────────────

function Cadastros() {
  const [tab, setTab] = useState("adversarios");
  const [adversarios, setAdversarios] = useState(initialAdversarios);
  const [estadios, setEstadios] = useState(initialEstadios);
  const [competicoes, setCompeticoes] = useState(initialCompeticoes);
  const [arbitros, setArbitros] = useState(initialArbitros);
  const [jogadores, setJogadores] = useState(initialJogadores);
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(true);

  // Forms
  const [advForm, setAdvForm] = useState({ clube: "", estado: "", pais: "", escudo: "" });
  const [estForm, setEstForm] = useState({ nome: "", cidade: "", capacidade: "" });
  const [compForm, setCompForm] = useState({ nome: "", tipo: "", edicao: "" });
  const [arbForm, setArbForm] = useState({ nome: "", estado: "" });
  const [jogForm, setJogForm] = useState({ nome: "", posicao: "", nacionalidade: "" });

  const tabs = [
    { key: "adversarios", label: "Adversários", icon: <Icon.cadastros /> },
    { key: "estadios", label: "Estádios", icon: <Icon.location /> },
    { key: "competicoes", label: "Competições", icon: <Icon.competition /> },
    { key: "arbitros", label: "Árbitros", icon: <Icon.flag /> },
    { key: "jogadores", label: "Jogadores", icon: <Icon.player /> },
  ];

  const del = (list, setList, id) => setList(list.filter(i => i.id !== id));
  const add = (list, setList, item, resetForm) => {
    const newId = Math.max(0, ...list.map(i => i.id)) + 1;
    setList([...list, { id: newId, ...item }]);
    resetForm();
  };

  const filtered = (list, fields) =>
    list.filter(item => fields.some(f => String(item[f] || "").toLowerCase().includes(search.toLowerCase())));

  return (
    <div style={styles.pageWrap}>
      <h1 style={styles.pageTitle}>Cadastros</h1>
      <p style={styles.pageSub}>Gerencie todos os cadastros do Estatlético</p>

      {/* Tabs */}
      <div style={styles.tabRow}>
        {tabs.map(t => (
          <button key={t.key} style={styles.tab(tab === t.key)} onClick={() => { setTab(t.key); setSearch(""); }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Adversários ── */}
      {tab === "adversarios" && (
        <>
          <div style={styles.formCard}>
            <div style={styles.formHeader} onClick={() => setFormOpen(o => !o)}>
              <Icon.plus /> Cadastrar Novo Adversário
            </div>
            {formOpen && (
              <div style={styles.formBody}>
                <div style={{ ...styles.fieldRow, gridTemplateColumns: "1fr 1fr 1fr" }}>
                  {["clube", "estado", "pais"].map(f => (
                    <div key={f}>
                      <label style={styles.label}>{f === "clube" ? "Clube *" : f === "estado" ? "Estado *" : "País *"}</label>
                      <input style={styles.input} placeholder={`Digite o ${f === "pais" ? "país" : f}`} value={advForm[f]} onChange={e => setAdvForm({ ...advForm, [f]: e.target.value })} />
                    </div>
                  ))}
                </div>
                <div style={{ ...styles.fieldRow, gridTemplateColumns: "1fr", marginBottom: 16 }}>
                  <div>
                    <label style={styles.label}>Escudo (URL)</label>
                    <input style={styles.input} placeholder="Cole o link da imagem do escudo" value={advForm.escudo} onChange={e => setAdvForm({ ...advForm, escudo: e.target.value })} />
                  </div>
                </div>
                <button style={styles.btnPrimary} onClick={() => {
                  if (!advForm.clube) return;
                  add(adversarios, setAdversarios, { clube: advForm.clube, estado: advForm.estado, pais: advForm.pais }, () => setAdvForm({ clube: "", estado: "", pais: "", escudo: "" }));
                }}>Cadastrar</button>
              </div>
            )}
          </div>

          <div style={styles.tableCard}>
            <div style={styles.tableHead}>
              <span style={styles.tableHeadTitle}>Adversários Cadastrados ({adversarios.length})</span>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}><Icon.search /></span>
                <input style={styles.searchInput} placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>Clube</th><th style={styles.th}>Estado</th><th style={styles.th}>País</th><th style={styles.th}>Ações</th></tr></thead>
              <tbody>
                {filtered(adversarios, ["clube", "estado", "pais"]).map(a => (
                  <tr key={a.id}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{a.clube}</td>
                    <td style={styles.td}>{a.estado}</td>
                    <td style={styles.td}>{a.pais}</td>
                    <td style={styles.td}>
                      <button style={styles.iconBtn(S.text)}><Icon.edit /></button>
                      <button style={styles.iconBtn(S.red)} onClick={() => del(adversarios, setAdversarios, a.id)}><Icon.trash /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Estádios ── */}
      {tab === "estadios" && (
        <>
          <div style={styles.formCard}>
            <div style={styles.formHeader} onClick={() => setFormOpen(o => !o)}>
              <Icon.plus /> Cadastrar Novo Estádio
            </div>
            {formOpen && (
              <div style={styles.formBody}>
                <div style={{ ...styles.fieldRow, gridTemplateColumns: "1fr 1fr 1fr" }}>
                  {[["nome","Nome *","Digite o nome"],["cidade","Cidade *","Digite a cidade"],["capacidade","Capacidade","Digite a capacidade"]].map(([f,l,p]) => (
                    <div key={f}>
                      <label style={styles.label}>{l}</label>
                      <input style={styles.input} placeholder={p} value={estForm[f]} onChange={e => setEstForm({ ...estForm, [f]: e.target.value })} />
                    </div>
                  ))}
                </div>
                <button style={styles.btnPrimary} onClick={() => {
                  if (!estForm.nome) return;
                  add(estadios, setEstadios, { nome: estForm.nome, cidade: estForm.cidade, capacidade: Number(estForm.capacidade) }, () => setEstForm({ nome: "", cidade: "", capacidade: "" }));
                }}>Cadastrar</button>
              </div>
            )}
          </div>
          <div style={styles.tableCard}>
            <div style={styles.tableHead}>
              <span style={styles.tableHeadTitle}>Estádios Cadastrados ({estadios.length})</span>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}><Icon.search /></span>
                <input style={styles.searchInput} placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>Nome</th><th style={styles.th}>Cidade</th><th style={styles.th}>Capacidade</th><th style={styles.th}>Ações</th></tr></thead>
              <tbody>
                {filtered(estadios, ["nome", "cidade"]).map(e => (
                  <tr key={e.id}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{e.nome}</td>
                    <td style={styles.td}>{e.cidade}</td>
                    <td style={styles.td}>{e.capacidade?.toLocaleString("pt-BR")}</td>
                    <td style={styles.td}>
                      <button style={styles.iconBtn(S.text)}><Icon.edit /></button>
                      <button style={styles.iconBtn(S.red)} onClick={() => del(estadios, setEstadios, e.id)}><Icon.trash /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Competições ── */}
      {tab === "competicoes" && (
        <>
          <div style={styles.formCard}>
            <div style={styles.formHeader}><Icon.plus /> Cadastrar Nova Competição</div>
            <div style={styles.formBody}>
              <div style={{ ...styles.fieldRow, gridTemplateColumns: "1fr 1fr 1fr" }}>
                {[["nome","Nome *","Digite o nome"],["tipo","Tipo","Ex: Nacional"],["edicao","Edição","Ex: 2025"]].map(([f,l,p]) => (
                  <div key={f}>
                    <label style={styles.label}>{l}</label>
                    <input style={styles.input} placeholder={p} value={compForm[f]} onChange={e => setCompForm({ ...compForm, [f]: e.target.value })} />
                  </div>
                ))}
              </div>
              <button style={styles.btnPrimary} onClick={() => {
                if (!compForm.nome) return;
                add(competicoes, setCompeticoes, { nome: compForm.nome, tipo: compForm.tipo, edicao: compForm.edicao }, () => setCompForm({ nome: "", tipo: "", edicao: "" }));
              }}>Cadastrar</button>
            </div>
          </div>
          <div style={styles.tableCard}>
            <div style={styles.tableHead}>
              <span style={styles.tableHeadTitle}>Competições Cadastradas ({competicoes.length})</span>
            </div>
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>Nome</th><th style={styles.th}>Tipo</th><th style={styles.th}>Edição</th><th style={styles.th}>Ações</th></tr></thead>
              <tbody>
                {competicoes.map(c => (
                  <tr key={c.id}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{c.nome}</td>
                    <td style={styles.td}>{c.tipo}</td>
                    <td style={styles.td}>{c.edicao}</td>
                    <td style={styles.td}>
                      <button style={styles.iconBtn(S.text)}><Icon.edit /></button>
                      <button style={styles.iconBtn(S.red)} onClick={() => del(competicoes, setCompeticoes, c.id)}><Icon.trash /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Árbitros ── */}
      {tab === "arbitros" && (
        <>
          <div style={styles.formCard}>
            <div style={styles.formHeader}><Icon.plus /> Cadastrar Novo Árbitro</div>
            <div style={styles.formBody}>
              <div style={{ ...styles.fieldRow, gridTemplateColumns: "1fr 1fr" }}>
                {[["nome","Nome *","Digite o nome"],["estado","Estado/País","Digite o estado"]].map(([f,l,p]) => (
                  <div key={f}>
                    <label style={styles.label}>{l}</label>
                    <input style={styles.input} placeholder={p} value={arbForm[f]} onChange={e => setArbForm({ ...arbForm, [f]: e.target.value })} />
                  </div>
                ))}
              </div>
              <button style={styles.btnPrimary} onClick={() => {
                if (!arbForm.nome) return;
                add(arbitros, setArbitros, { nome: arbForm.nome, estado: arbForm.estado }, () => setArbForm({ nome: "", estado: "" }));
              }}>Cadastrar</button>
            </div>
          </div>
          <div style={styles.tableCard}>
            <div style={styles.tableHead}>
              <span style={styles.tableHeadTitle}>Árbitros Cadastrados ({arbitros.length})</span>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}><Icon.search /></span>
                <input style={styles.searchInput} placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>Nome</th><th style={styles.th}>Estado/País</th><th style={styles.th}>Ações</th></tr></thead>
              <tbody>
                {filtered(arbitros, ["nome", "estado"]).map(a => (
                  <tr key={a.id}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{a.nome}</td>
                    <td style={styles.td}>{a.estado}</td>
                    <td style={styles.td}>
                      <button style={styles.iconBtn(S.text)}><Icon.edit /></button>
                      <button style={styles.iconBtn(S.red)} onClick={() => del(arbitros, setArbitros, a.id)}><Icon.trash /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Jogadores ── */}
      {tab === "jogadores" && (
        <>
          <div style={styles.formCard}>
            <div style={styles.formHeader}><Icon.plus /> Cadastrar Novo Jogador</div>
            <div style={styles.formBody}>
              <div style={{ ...styles.fieldRow, gridTemplateColumns: "1fr 1fr 1fr" }}>
                {[["nome","Nome *","Digite o nome"],["posicao","Posição","Ex: Atacante"],["nacionalidade","Nacionalidade","Digite o país"]].map(([f,l,p]) => (
                  <div key={f}>
                    <label style={styles.label}>{l}</label>
                    <input style={styles.input} placeholder={p} value={jogForm[f]} onChange={e => setJogForm({ ...jogForm, [f]: e.target.value })} />
                  </div>
                ))}
              </div>
              <button style={styles.btnPrimary} onClick={() => {
                if (!jogForm.nome) return;
                add(jogadores, setJogadores, { nome: jogForm.nome, posicao: jogForm.posicao, nacionalidade: jogForm.nacionalidade }, () => setJogForm({ nome: "", posicao: "", nacionalidade: "" }));
              }}>Cadastrar</button>
            </div>
          </div>
          <div style={styles.tableCard}>
            <div style={styles.tableHead}>
              <span style={styles.tableHeadTitle}>Jogadores Cadastrados ({jogadores.length})</span>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}><Icon.search /></span>
                <input style={styles.searchInput} placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <table style={styles.table}>
              <thead><tr><th style={styles.th}>Nome</th><th style={styles.th}>Posição</th><th style={styles.th}>Nacionalidade</th><th style={styles.th}>Ações</th></tr></thead>
              <tbody>
                {filtered(jogadores, ["nome", "posicao", "nacionalidade"]).map(j => (
                  <tr key={j.id}>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{j.nome}</td>
                    <td style={styles.td}>{j.posicao}</td>
                    <td style={styles.td}>{j.nacionalidade}</td>
                    <td style={styles.td}>
                      <button style={styles.iconBtn(S.text)}><Icon.edit /></button>
                      <button style={styles.iconBtn(S.red)} onClick={() => del(jogadores, setJogadores, j.id)}><Icon.trash /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── JOGOS ────────────────────────────────────────────────────────────────────

function Jogos() {
  const [jogos, setJogos] = useState(jogosData);
  const [filtros, setFiltros] = useState({ temporada: "", campeonato: "", casa: "", fora: "", estadio: "", arbitro: "", pubMin: "", pubMax: "" });
  const [showNovo, setShowNovo] = useState(false);
  const [novoJogo, setNovoJogo] = useState({ data: "", campeonato: "", casa: "", placar: "", fora: "", arbitro: "", publico: "", renda: "" });

  const campeonatos = [...new Set(jogos.map(j => j.campeonato))];
  const times = [...new Set([...jogos.map(j => j.casa), ...jogos.map(j => j.fora)])].sort();
  const arbs = [...new Set(jogos.map(j => j.arbitro))].sort();

  const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));

  const filtered = useMemo(() => jogos.filter(j => {
    if (filtros.campeonato && j.campeonato !== filtros.campeonato) return false;
    if (filtros.casa && j.casa !== filtros.casa) return false;
    if (filtros.fora && j.fora !== filtros.fora) return false;
    if (filtros.arbitro && j.arbitro !== filtros.arbitro) return false;
    if (filtros.pubMin && j.publico < Number(filtros.pubMin)) return false;
    if (filtros.pubMax && j.publico > Number(filtros.pubMax)) return false;
    return true;
  }), [jogos, filtros]);

  const fmtRenda = v => v ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "N/I";
  const fmtTicket = v => v ? `R$ ${v.toFixed(2).replace(".", ",")}` : "N/I";

  const addJogo = () => {
    if (!novoJogo.data || !novoJogo.campeonato) return;
    const newId = Math.max(0, ...jogos.map(j => j.id)) + 1;
    setJogos([{ id: newId, ...novoJogo, publico: Number(novoJogo.publico) || 0, renda: Number(novoJogo.renda) || null, ticketMedio: null }, ...jogos]);
    setNovoJogo({ data: "", campeonato: "", casa: "", placar: "", fora: "", arbitro: "", publico: "", renda: "" });
    setShowNovo(false);
  };

  return (
    <div style={styles.pageWrap}>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.pageTitle}>Jogos</h1>
          <p style={styles.pageSub}>Gerencie os jogos do Atlético Mineiro</p>
        </div>
        <div style={styles.btnGroup}>
          <button style={styles.btnOutline}><Icon.download /> CSV</button>
          <button style={{ ...styles.btnPrimary, display: "flex", alignItems: "center", gap: 6 }} onClick={() => setShowNovo(o => !o)}>
            <Icon.plus /> Novo Jogo
          </button>
        </div>
      </div>

      {showNovo && (
        <div style={{ ...styles.formCard, marginBottom: 20 }}>
          <div style={styles.formHeader}><Icon.plus /> Cadastrar Novo Jogo</div>
          <div style={styles.formBody}>
            <div style={{ ...styles.fieldRow, gridTemplateColumns: "1fr 1fr 1fr 1fr", marginBottom: 14 }}>
              {[["data","Data","date"],["campeonato","Campeonato","text"],["casa","Casa","text"],["fora","Fora","text"]].map(([f,l,t]) => (
                <div key={f}>
                  <label style={styles.label}>{l}</label>
                  <input type={t} style={styles.input} value={novoJogo[f]} onChange={e => setNovoJogo(n => ({ ...n, [f]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div style={{ ...styles.fieldRow, gridTemplateColumns: "1fr 1fr 1fr 1fr", marginBottom: 14 }}>
              {[["placar","Placar","text"],["arbitro","Árbitro","text"],["publico","Público","number"],["renda","Renda (R$)","number"]].map(([f,l,t]) => (
                <div key={f}>
                  <label style={styles.label}>{l}</label>
                  <input type={t} style={styles.input} value={novoJogo[f]} onChange={e => setNovoJogo(n => ({ ...n, [f]: e.target.value }))} />
                </div>
              ))}
            </div>
            <button style={styles.btnPrimary} onClick={addJogo}>Salvar Jogo</button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div style={styles.filterCard}>
        <div style={styles.filterTitle}><Icon.filter /> Filtros</div>
        <div style={styles.filterGrid}>
          {[
            { label: "Temporada", key: "temporada", opts: ["2023","2024","2025","2026"] },
            { label: "Campeonato", key: "campeonato", opts: campeonatos },
            { label: "Casa", key: "casa", opts: times },
            { label: "Fora", key: "fora", opts: times },
          ].map(({ label, key, opts }) => (
            <div key={key}>
              <label style={{ ...styles.label, marginBottom: 6 }}>{label}</label>
              <select style={styles.select} value={filtros[key]} onChange={e => setF(key, e.target.value)}>
                <option value="">Selecione...</option>
                {opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          {[
            { label: "Estádio", key: "estadio", opts: ["Arena MRV","Mineirão"] },
            { label: "Árbitro", key: "arbitro", opts: arbs },
          ].map(({ label, key, opts }) => (
            <div key={key}>
              <label style={{ ...styles.label, marginBottom: 6 }}>{label}</label>
              <select style={styles.select} value={filtros[key]} onChange={e => setF(key, e.target.value)}>
                <option value="">Selecione...</option>
                {opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label style={{ ...styles.label, marginBottom: 6 }}>Público Mínimo</label>
            <input style={styles.input} placeholder="Mínimo..." type="number" value={filtros.pubMin} onChange={e => setF("pubMin", e.target.value)} />
          </div>
          <div>
            <label style={{ ...styles.label, marginBottom: 6 }}>Público Máximo</label>
            <input style={styles.input} placeholder="Máximo..." type="number" value={filtros.pubMax} onChange={e => setF("pubMax", e.target.value)} />
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div style={styles.tableCard}>
        <table style={styles.table}>
          <thead>
            <tr>
              {["Data ↕","Campeonato ↕","Casa","Placar","Fora","Árbitro","Público ↕","Renda","Ticket Médio","Ações"].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(j => (
              <tr key={j.id} style={{ transition: "background .1s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#fafafa"}
                onMouseLeave={e => e.currentTarget.style.background = ""}>
                <td style={styles.td}>{j.data}</td>
                <td style={styles.td}>{j.campeonato}</td>
                <td style={styles.td}>{j.casa}</td>
                <td style={{ ...styles.td, fontWeight: 700 }}>{j.placar}</td>
                <td style={styles.td}>{j.fora}</td>
                <td style={{ ...styles.td, fontSize: 12 }}>{j.arbitro}</td>
                <td style={styles.td}>{j.publico?.toLocaleString("pt-BR")}</td>
                <td style={{ ...styles.td, fontSize: 12 }}>{fmtRenda(j.renda)}</td>
                <td style={{ ...styles.td, fontSize: 12 }}>{fmtTicket(j.ticketMedio)}</td>
                <td style={styles.td}>
                  <button style={styles.iconBtn(S.text)}><Icon.edit /></button>
                  <button style={styles.iconBtn(S.red)} onClick={() => setJogos(jogos.filter(x => x.id !== j.id))}><Icon.trash /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── STUB PAGES ───────────────────────────────────────────────────────────────

function StubPage({ title, sub }) {
  return (
    <div style={styles.pageWrap}>
      <h1 style={styles.pageTitle}>{title}</h1>
      <p style={styles.pageSub}>{sub}</p>
      <div style={styles.comingSoon}>
        <svg width="48" height="48" fill="none" stroke={S.border} viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth="1.5"/>
          <path strokeWidth="1.5" d="M12 8v4l3 3"/>
        </svg>
        <span style={{ fontSize: 15 }}>Página em desenvolvimento</span>
        <span style={{ fontSize: 12, color: "#aaa" }}>Esta seção será implementada em breve</span>
      </div>
    </div>
  );
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────

const navItems = [
  { key: "dashboard", label: "Dashboard", icon: <Icon.dashboard /> },
  { key: "cadastros", label: "Cadastros", icon: <Icon.cadastros /> },
  { key: "jogos", label: "Jogos", icon: <Icon.jogos /> },
  { key: "elenco", label: "Elenco", icon: <Icon.elenco /> },
  { key: "artilheiros", label: "Artilheiros", icon: <Icon.artilheiros /> },
  { key: "cartoes", label: "Cartões", icon: <Icon.cartoes /> },
  { key: "arbitragem", label: "Arbitragem", icon: <Icon.arbitragem /> },
  { key: "estatisticas", label: "Estatísticas", icon: <Icon.estatisticas /> },
  { key: "comparativo", label: "Comparativo", icon: <Icon.comparativo /> },
  { key: "relatorios", label: "Relatórios", icon: <Icon.relatorios /> },
];

// ─── APP ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState("dashboard");

  const renderPage = () => {
    switch (page) {
      case "dashboard": return <Dashboard />;
      case "cadastros": return <Cadastros />;
      case "jogos": return <Jogos />;
      case "elenco": return <StubPage title="Elenco" sub="Gerencie o elenco do Atlético Mineiro" />;
      case "artilheiros": return <StubPage title="Artilheiros" sub="Ranking de artilheiros do Atlético Mineiro" />;
      case "cartoes": return <StubPage title="Cartões" sub="Histórico de cartões do Atlético Mineiro" />;
      case "arbitragem": return <StubPage title="Arbitragem" sub="Análise de arbitragem por jogo" />;
      case "estatisticas": return <StubPage title="Estatísticas" sub="Estatísticas detalhadas do Atlético Mineiro" />;
      case "comparativo": return <StubPage title="Comparativo" sub="Compare temporadas e competições" />;
      case "relatorios": return <StubPage title="Relatórios" sub="Gere relatórios completos" />;
      default: return <Dashboard />;
    }
  };

  return (
    <div style={styles.app}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.sidebarTitle}>Estatlético</div>
          <div style={styles.sidebarSub}>Portal de Estatísticas</div>
        </div>

        <nav style={styles.sidebarNav}>
          {navItems.map(n => (
            <div key={n.key} style={styles.navItem(page === n.key)} onClick={() => setPage(n.key)}>
              {n.icon} {n.label}
            </div>
          ))}
        </nav>

        <div style={styles.sidebarFooter}>
          <div style={styles.footerUser}>
            <div style={styles.avatar}>SB</div>
            <div>
              <div style={styles.userName}>Stéfano Bruno</div>
              <div style={styles.userEmail}>stefanobrunofaria@gmail.c...</div>
            </div>
          </div>
          <button style={styles.btnSair}><Icon.logout /> Sair</button>
        </div>
      </aside>

      {/* Content */}
      <main style={styles.content}>
        {renderPage()}
      </main>
    </div>
  );
}
