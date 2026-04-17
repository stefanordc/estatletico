
const parseCurrency = (val) => {
    if (val === undefined || val === null || val === 'N/I' || val === '') return 0;
    if (typeof val === 'number') return val;
    let clean = String(val).replace('R$', '').replace('%', '').replace(/\s/g, '');
    if (clean.includes(',') && clean.includes('.')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
        clean = clean.replace(',', '.');
    }
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
};

const formatRenda = (val) => {
    if (val === 'N/I' || val === null || val === undefined || val === '') return 'N/I';
    const num = parseCurrency(val);
    if (isNaN(num)) return 'N/I';
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

console.log("TESTING formatRenda:");
console.log("649317.5 ->", formatRenda(649317.5)); // Expected: 649.317,50
console.log("'649.317,50' ->", formatRenda('649.317,50')); // Expected: 649.317,50
console.log("2479840.13 ->", formatRenda(2479840.13)); // Expected: 2.479.840,13

console.log("\nTESTING formatPublico:");
console.log("22800 ->", formatPublico(22800)); // Expected: 22.800
console.log("'22.800' ->", formatPublico('22.800')); // Expected: 22.800
console.log("22800.8 ->", formatPublico(22800.8)); // Expected: 22.800
