
/* ════════════════════════════════════════════════════════
   POKEMON CARD INVENTORY  —  app.js
   Flow: user types "142/142"
         → extract num=142, total=142
         → search sets with printedTotal=142
         → user picks set (or auto-pick if only 1)
         → fetch card by number+setId
         → autocomplete fields (all editable)
════════════════════════════════════════════════════════ */

const API_BASE  = 'https://api.pokemontcg.io/v2';
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days ms

/* ── State ── */
let entries    = JSON.parse(localStorage.getItem('pki-v2') || '[]');
let curOwner   = 'Carito';
let ddSets     = [];       // set results in dropdown
let ddIdx      = -1;       // keyboard nav index
let debounceT  = null;
let currentNum = null;     // parsed card number string (e.g. "142")
let currentPage = 1;
let pageSize   = 100;
/* ─────────────────────────────────────────────────────
   NO CACHE & NO API STATUS REQUIRED (OFFLINE MODE)
───────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────
   OWNER TOGGLE
───────────────────────────────────────────────────── */
function setOwner(o){
  curOwner = o;
  document.getElementById('btn-carito').classList.toggle('active', o === 'Carito');
  document.getElementById('btn-infe'  ).classList.toggle('active', o === 'Infe');
}

/* ─────────────────────────────────────────────────────
   CODE INPUT  (main entry point)
───────────────────────────────────────────────────── */
function onCodeInput(val){
  clearTimeout(debounceT);
  hideCardResult();
  hideMsg();
  closeDd();

  const trimmed = val.trim();
  if (!trimmed) return;

  // Parse format: "142/142" or "079/088" or just "142"
  const parts = trimmed.split('/');
  const numRaw   = parts[0].trim();
  const totalRaw = parts[1] ? parts[1].trim() : null;
  const num = parseInt(numRaw, 10);

  if (isNaN(num) || num < 1) return;
  currentNum = String(num); // bare number, no leading zeros for API query

  if (totalRaw !== null) {
    const total = parseInt(totalRaw, 10);
    if (isNaN(total) || total < 1) return;
    // We have num/total: search sets by printedTotal locally
    debounceT = setTimeout(() => searchSetsByTotal(total, num), 150);
  } else {
    // Only number typed: wait for more input (no slash yet)
    showMsg('Escribe el codigo completo: ej. ' + numRaw + '/088', 'info');
  }
}

/* ─────────────────────────────────────────────────────
   SEARCH SETS BY printedTotal
───────────────────────────────────────────────────── */
function searchSetsByTotal(total, cardNum){
  // Check local offline database
  const sets = TCG_DB.sets.filter(s => parseInt(s.printedTotal, 10) === total);
  showSetDropdown(sets, cardNum);
}

/* ─────────────────────────────────────────────────────
   DROPDOWN: show sets
───────────────────────────────────────────────────── */
function showSetDropdown(sets, cardNum){
  ddSets = sets;
  ddIdx  = -1;
  const dd = document.getElementById('set-dropdown');

  if (!sets.length) {
    dd.innerHTML = '<div class="dd-info">No se encontraron sets con ese total</div>';
    dd.classList.add('open');
    return;
  }

  // If exactly one match → auto-pick
  if (sets.length === 1) {
    dd.classList.remove('open');
    fetchCardFromSet(sets[0], cardNum);
    return;
  }

  dd.innerHTML = sets.map((s, i) => `
    <div class="dd-item" data-i="${i}" onclick="pickSet(${i})">
      <img src="${s.images?.symbol || ''}" onerror="this.style.display='none'" alt=""/>
      <div class="dd-meta">
        <div class="dd-name">${esc(s.name)}</div>
        <div class="dd-sub">${esc(s.series)} &bull; ${s.printedTotal}/${s.total} cartas &bull; ${(s.releaseDate||'').slice(0,4)}</div>
      </div>
    </div>
  `).join('');
  dd.classList.add('open');
}

function pickSet(i){
  const s = ddSets[i];
  closeDd();
  fetchCardFromSet(s, currentNum);
}

/* ─────────────────────────────────────────────────────
   FETCH CARD from set
───────────────────────────────────────────────────── */
function fetchCardFromSet(set, cardNumStr){
  hideMsg();
  
  // Look up card in the local database
  const card = TCG_DB.cards.find(c => 
    String(c.number) === String(cardNumStr) && c.setId === set.id
  );

  if (!card) {
    showMsg(`No se encontro el numero ${cardNumStr} en "${set.name}"`, 'error');
    return;
  }
  
  applyCard(card, set);
}

/* ─────────────────────────────────────────────────────
   APPLY CARD → fill form fields
───────────────────────────────────────────────────── */
function applyCard(card, set){
  const rawNum   = String(card.number);
  const padded   = rawNum.padStart(3, '0');
  const setTotal = String(set?.printedTotal || card.set?.printedTotal || '???').padStart(3,'0');
  const code     = `${padded}/${setTotal}`;
  const setName  = card.set?.name || set?.name || '';

  // Fill fields
  fillField('f-nombre',  card.name);
  fillField('f-codigo',  code);
  fillField('f-edicion', setName);

  // Rareza: map + set select (user can change)
  const rarityMapped = mapRarity(card.rarity);
  setSelect('f-rareza', rarityMapped);

  // Tipo
  const tipoMapped = mapTipo(card.supertype, card.subtypes, card.types);
  setSelect('f-tipo', tipoMapped);

  // Card preview
  const imgEl = document.getElementById('card-img');
  const phEl  = document.getElementById('card-img-ph');
  const imgUrl = card.images?.small;
  if (imgUrl) {
    imgEl.src = imgUrl;
    imgEl.style.display = '';
    phEl.style.display  = 'none';
  } else {
    imgEl.style.display = 'none';
    phEl.style.display  = 'flex';
  }

  document.getElementById('cr-name').textContent = card.name;
  document.getElementById('cr-set').textContent  = `${setName} · ${code}`;
  document.getElementById('cr-badges').innerHTML =
    `<span class="cr-badge rarity">${esc(card.rarity || '?')}</span>` +
    (card.subtypes || []).map(s => `<span class="cr-badge subtype">${esc(s)}</span>`).join('');
  document.getElementById('card-result').classList.add('show');
  hideMsg();
}

function fillField(id, val){
  const el = document.getElementById(id);
  el.value = val;
  el.classList.add('autofilled');
}
function setSelect(id, val){
  const sel = document.getElementById(id);
  const opt = [...sel.options].find(o => o.value.toLowerCase() === val.toLowerCase());
  if (opt) { sel.value = opt.value; return; }
  const newOpt = document.createElement('option');
  newOpt.value = val; newOpt.textContent = val;
  sel.appendChild(newOpt);
  sel.value = val;
}

/* ─────────────────────────────────────────────────────
   KEYBOARD NAV for dropdown
───────────────────────────────────────────────────── */
function onCodeKeydown(e){
  const dd    = document.getElementById('set-dropdown');
  const items = dd.querySelectorAll('.dd-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); ddIdx = Math.min(ddIdx+1, items.length-1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); ddIdx = Math.max(ddIdx-1, 0); }
  else if (e.key === 'Enter' && ddIdx >= 0) { items[ddIdx].click(); return; }
  else if (e.key === 'Escape') { closeDd(); return; }
  else return;
  items.forEach((el,i) => el.classList.toggle('focused', i === ddIdx));
  items[ddIdx]?.scrollIntoView({block:'nearest'});
}

/* ─────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────── */
function closeDd(){ const dd = document.getElementById('set-dropdown'); dd.classList.remove('open'); dd.innerHTML=''; ddIdx=-1; }
function hideCardResult(){ document.getElementById('card-result').classList.remove('show'); }
function showSpinner(v){ document.getElementById('code-spinner').classList.toggle('active', v); }
function showMsg(msg, type){ const el=document.getElementById('card-msg'); el.textContent=msg; el.className='card-msg '+type; }
function hideMsg(){ document.getElementById('card-msg').className='card-msg'; document.getElementById('card-msg').textContent=''; }
function resetSearch(){
  document.getElementById('code-input').value = '';
  closeDd();
  hideCardResult();
  hideMsg();
  currentNum = null;
  ['f-nombre','f-codigo','f-edicion'].forEach(id =>
    document.getElementById(id).classList.remove('autofilled'));
}

/* ─────────────────────────────────────────────────────
   MAPPINGS
───────────────────────────────────────────────────── */
const RARITY_MAP = {
  // Standard
  'common':                       'Normal',
  'uncommon':                     'Normal',
  'rare':                         'Holo',
  'rare holo':                    'Holo',
  'rare holo v':                  'Holo',
  'rare holo vmax':               'Ultra Rare',
  'rare holo vstar':              'Ultra Rare',
  'rare ultra':                   'Ultra Rare',
  'ultra rare':                   'Ultra Rare',
  'double rare':                  'Ultra Rare',
  'illustration rare':            'Illustration Rare',
  'special illustration rare':    'Special Illustration Rare',
  'special illustration':         'Special Illustration',
  'special art rare':             'Special Art Rare',
  'hyper rare':                   'Hyper Rare',
  'shiny rare':                   'Shiny Rare',
  'radiant rare':                 'Shiny Rare',
  'ace spec rare':                'ACE SPEC Rare',
  'secret rare':                  'Secret Rare',
  'promo':                        'Promo',
  'full art':                     'Full Art',
  'mega rare':                    'Mega Attack Rare',
  'cosmos holo':                  'Cosmos Holo',
  'classic collection':           'Holo',
  // Ball Patterns (mapped from API subtype/variant info)
  'poke ball pattern':            'Poke Ball Pattern',
  'master ball pattern':          'Master Ball Pattern',
  'dusk ball pattern':            'Dusk Ball Pattern',
  'quick ball pattern':           'Quick Ball Pattern',
  'love ball pattern':            'Love Ball Pattern',
  'friend ball pattern':          'Friend Ball Pattern',
  'team rocket pattern':          'Team Rocket Pattern',
  'energy symbol':                'Energy Symbol',
  // Liga / promo variants
  'holo stamp':                   'Holo Stamp',
  'holo liga':                    'Holo Liga',
  'holo reverse liga':            'Holo Reverse Liga',
  'normal liga':                  'Normal Liga',
  'trick or trade':               'Normal Trick or Trade',
  'holo trick or trade':          'Holo Trick or Trade',
};
// If not in map, return the API value directly (user can edit)
function mapRarity(r){ return r ? (RARITY_MAP[r.toLowerCase()] || r) : 'Normal'; }

const TIPO_MAP = {
  'supporter':'Partidario','item':'Objeto',
  'pokemon tool':'Herramienta','pokémon tool':'Herramienta',
  'stadium':'Estadio','special energy':'Energia','basic energy':'Energia',
  'ace spec':'Herramienta','trainer':'Objeto','energy':'Energia',
  'fire':'Fuego','water':'Agua','grass':'Planta','lightning':'Electrico',
  'psychic':'Psiquico','fighting':'Lucha','darkness':'Oscuridad',
  'metal':'Metal','dragon':'Dragon','fairy':'Hada','colorless':'Incoloro',
};
function mapTipo(sup, subs, types){
  for (const s of (subs||[]))  { const m=TIPO_MAP[s.toLowerCase()]; if(m) return m; }
  if (sup) { const m=TIPO_MAP[sup.toLowerCase()]; if(m) return m; }
  for (const t of (types||[])) { const m=TIPO_MAP[t.toLowerCase()]; if(m) return m; }
  return 'Normal';
}

/* ─────────────────────────────────────────────────────
   PRICES
───────────────────────────────────────────────────── */
function recalc(){
  const qty  = parseFloat(document.getElementById('f-cantidad').value) || 0;
  const p    = parseFloat(document.getElementById('f-precio').value);
  const piva = parseFloat(document.getElementById('f-precioiva').value);
  document.getElementById('calc-v1').textContent = isNaN(p)   ? '—' : fmtN(qty*p);
  document.getElementById('calc-v2').textContent = isNaN(piva)? '—' : fmtN(qty*piva);
}

/* ─────────────────────────────────────────────────────
   ADD ENTRY
───────────────────────────────────────────────────── */
function addEntry(){
  const nombre = document.getElementById('f-nombre').value.trim();
  const codigo = document.getElementById('f-codigo').value.trim();
  if (!nombre || !codigo){ toast('⚠ Nombre y Codigo son requeridos', false); return; }

  const qty    = parseFloat(document.getElementById('f-cantidad').value)  || 1;
  const precio = parseFloat(document.getElementById('f-precio').value)    || 0;
  const piva   = parseFloat(document.getElementById('f-precioiva').value) || 0;

  entries.push({
    id:        Date.now(),
    nombre,    codigo,
    idioma:    document.getElementById('f-idioma').value,
    rareza:    document.getElementById('f-rareza').value,
    tipo:      document.getElementById('f-tipo').value,
    edicion:   document.getElementById('f-edicion').value.trim() || 'N/A',
    estado:    document.getElementById('f-estado').value,
    dueno:     curOwner,
    cantidad:  qty,
    precioIva: piva,
    precio,
    valor1:    qty * precio,
    valor2:    qty * piva,
  });

  save(); populateFilters(); renderTable(); updateStats();
  toast('✅ Carta agregada');

  // Partial reset (keep set context, owner, language, state)
  document.getElementById('f-nombre').value    = '';
  document.getElementById('f-codigo').value    = '';
  document.getElementById('f-cantidad').value  = '1';
  document.getElementById('f-precio').value    = '';
  document.getElementById('f-precioiva').value = '';
  ['f-nombre','f-codigo','f-edicion'].forEach(id =>
    document.getElementById(id).classList.remove('autofilled'));
  hideCardResult();
  document.getElementById('code-input').value  = '';
  currentNum = null;
  recalc();
  document.getElementById('code-input').focus();
}

/* ─────────────────────────────────────────────────────
   DELETE / CLEAR
───────────────────────────────────────────────────── */
function delEntry(id){ entries = entries.filter(e=>e.id!==id); save(); populateFilters(); renderTable(); updateStats(); }
function clearInventory(){
  if (!entries.length) return;
  if (!confirm(`Eliminar las ${entries.length} entradas?`)) return;
  entries = []; save(); populateFilters(); renderTable(); updateStats();
  toast('🗑 Inventario limpiado', false);
}

/* ─────────────────────────────────────────────────────
   FILTERS & PAGINATION
───────────────────────────────────────────────────── */
function populateFilters(){
  const getUnique = key => [...new Set(entries.map(e => String(e[key])))].filter(Boolean).sort();
  
  const fillSelect = (id, options, defaultText) => {
    const el = document.getElementById(id);
    const currentVal = el.value;
    el.innerHTML = `<option value="">${defaultText}</option>` + 
                   options.map(o => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
    if (options.includes(currentVal)) el.value = currentVal;
  };

  fillSelect('flt-dueno',  getUnique('dueno'),  'Todos los Dueños');
  fillSelect('flt-rareza', getUnique('rareza'), 'Todas las Rarezas');
  fillSelect('flt-tipo',   getUnique('tipo'),   'Todos los Tipos');
  fillSelect('flt-estado', getUnique('estado'), 'Todos los Estados');
  fillSelect('flt-idioma', getUnique('idioma'), 'Todos los Idiomas');
}

let lastFilterState = '';

function prevPage() { if(currentPage > 1){ currentPage--; renderTable(true); } }
function nextPage() { currentPage++; renderTable(true); }
function changePageSize() {
  pageSize = parseInt(document.getElementById('pag-size').value) || 100;
  currentPage = 1;
  renderTable(true);
}

/* ─────────────────────────────────────────────────────
   RENDER TABLE
───────────────────────────────────────────────────── */
function renderTable(keepPage = false){
  const q = document.getElementById('tbl-search').value.toLowerCase();
  const fDueno = document.getElementById('flt-dueno').value;
  const fRareza = document.getElementById('flt-rareza').value;
  const fTipo = document.getElementById('flt-tipo').value;
  const fEstado = document.getElementById('flt-estado').value;
  const fIdioma = document.getElementById('flt-idioma').value;

  const currentFilterState = [q, fDueno, fRareza, fTipo, fEstado, fIdioma].join('|');
  if (!keepPage && currentFilterState !== lastFilterState) {
    currentPage = 1;
    lastFilterState = currentFilterState;
  }

  const list = entries.filter(e => {
    if (fDueno  && e.dueno  !== fDueno) return false;
    if (fRareza && e.rareza !== fRareza) return false;
    if (fTipo   && e.tipo   !== fTipo) return false;
    if (fEstado && e.estado !== fEstado) return false;
    if (fIdioma && e.idioma !== fIdioma) return false;
    
    if (q) {
      const match = [e.nombre, e.codigo, e.edicion, e.tipo, e.rareza, e.dueno, e.idioma]
        .some(f => String(f).toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const tbody = document.getElementById('tbl-body');
  const empty = document.getElementById('empty-state');
  const pagBar = document.getElementById('pagination-bar');

  if (!list.length){ 
    tbody.innerHTML = ''; 
    empty.style.display = ''; 
    pagBar.style.display = 'none';
    updateStats(list);
    return; 
  }
  
  empty.style.display = 'none';
  pagBar.style.display = 'flex';

  const totalPages = Math.ceil(list.length / pageSize) || 1;
  if (currentPage > totalPages) currentPage = totalPages;

  const startIdx = (currentPage - 1) * pageSize;
  const pageList = list.slice(startIdx, startIdx + pageSize);

  tbody.innerHTML = pageList.map(e => `
    <tr id="row-${e.id}">
      <td><strong>${esc(e.nombre)}</strong></td>
      <td class="code-cell">${esc(e.codigo)}</td>
      <td><span class="badge b-lang">${esc(e.idioma)}</span></td>
      <td><span class="badge b-rarity">${esc(e.rareza)}</span></td>
      <td><span class="badge b-type">${esc(e.tipo)}</span></td>
      <td style="color:var(--text2)">${esc(e.edicion)}</td>
      <td style="color:var(--text2)">${esc(e.estado)}</td>
      <td><span class="badge ${e.dueno==='Carito'?'b-carito':'b-infe'}">${e.dueno==='Carito'?'💖':'⚡'} ${e.dueno}</span></td>
      <td class="qty-cell">${e.cantidad}</td>
      <td class="price-cell">${fmtN(e.precioIva)}</td>
      <td class="price-cell">${fmtN(e.precio)}</td>
      <td class="price-cell">${fmtN(e.valor1)}</td>
      <td class="price-cell">${fmtN(e.valor2)}</td>
      <td><button class="del-btn" onclick="delEntry(${e.id})" title="Eliminar">🗑</button></td>
    </tr>`).join('');

  // Update pagination UI
  document.getElementById('pag-text').textContent = `Página ${currentPage} de ${totalPages} (${list.length} cartas)`;
  document.getElementById('pag-prev').disabled = currentPage <= 1;
  document.getElementById('pag-next').disabled = currentPage >= totalPages;

  const last = entries[entries.length-1];
  const row  = document.getElementById(`row-${last?.id}`);
  if (row){ row.classList.add('row-new'); setTimeout(()=>row.classList.remove('row-new'),800); }
  
  updateStats(list);
}

/* ─────────────────────────────────────────────────────
   STATS
───────────────────────────────────────────────────── */
function updateStats(list = entries){
  document.getElementById('st-entries').textContent = list.length;
  document.getElementById('st-cards'  ).textContent = list.reduce((s,e)=>s+e.cantidad,0);
  document.getElementById('st-v1'     ).textContent = '$'+fmtN(list.reduce((s,e)=>s+e.valor1,0));
  document.getElementById('st-v2'     ).textContent = '$'+fmtN(list.reduce((s,e)=>s+e.valor2,0));
}

/* ─────────────────────────────────────────────────────
   EXPORT CSV
───────────────────────────────────────────────────── */
function exportCSV(){
  if (!entries.length){ toast('⚠ Sin entradas para exportar', false); return; }
  const hdr = 'Nombre;Codigo;Idioma;Rareza;Tipo;Edicion;Estado;Dueno;Cantidad;Precio IVA;Precio;Valor 1;Valor 2';
  const rows = entries.map(e =>
    [e.nombre,e.codigo,e.idioma,e.rareza,e.tipo,e.edicion,
     e.estado,e.dueno,e.cantidad,csvN(e.precioIva),csvN(e.precio),csvN(e.valor1),csvN(e.valor2)
    ].join(';'));
  const blob = new Blob(['\uFEFF'+[hdr,...rows].join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const a    = Object.assign(document.createElement('a'),{
    href:URL.createObjectURL(blob),
    download:`inventario_${new Date().toISOString().slice(0,10)}.csv`
  });
  a.click(); URL.revokeObjectURL(a.href);
  toast('⬇ CSV exportado');
}

/* ─────────────────────────────────────────────────────
   IMPORT CSV
───────────────────────────────────────────────────── */
function handleImportCSV(e){
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  
  // Parse numbers like "1.500,50" -> 1500.50
  const parseNum = str => {
    if (!str) return 0;
    const clean = str.replace(/\./g, '').replace(',', '.').trim();
    const val = parseFloat(clean);
    return isNaN(val) ? 0 : val;
  };

  reader.onload = function(evt) {
    const text = evt.target.result;
    // split by new lines
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length <= 1) {
      toast('⚠ Archivo CSV vacío o sin datos', false);
      e.target.value = '';
      return;
    }
    
    // We skip the header (lines[0]) and parse the rest
    let importedCount = 0;
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(';');
      if (parts.length < 13) continue; // Skip malformed rows
      
      const qty = parseNum(parts[8]);
      if (qty < 1) continue; // Basic validation
      
      entries.push({
        id:        Date.now() + i, // ensure unique ID
        nombre:    parts[0].trim(),
        codigo:    parts[1].trim(),
        idioma:    parts[2].trim(),
        rareza:    parts[3].trim(),
        tipo:      parts[4].trim(),
        edicion:   parts[5].trim(),
        estado:    parts[6].trim(),
        dueno:     parts[7].trim(),
        cantidad:  qty,
        precioIva: parseNum(parts[9]),
        precio:    parseNum(parts[10]),
        valor1:    parseNum(parts[11]),
        valor2:    parseNum(parts[12])
      });
      importedCount++;
    }
    
    if (importedCount > 0) {
      save();
      populateFilters();
      renderTable();
      updateStats();
      toast(`✅ ${importedCount} cartas importadas correctamente`);
    } else {
      toast('⚠ No se encontraron datos válidos en el CSV', false);
    }
    e.target.value = ''; // Reset input
  };
  
  // Read using latin1/iso-8859-1 to handle accents properly based on the provided CSV
  reader.readAsText(file, 'ISO-8859-1');
}

/* ─────────────────────────────────────────────────────
   UTILS
───────────────────────────────────────────────────── */
function fmtN(n){ return Number.isInteger(n)?n.toLocaleString('es-AR'):n.toLocaleString('es-AR',{minimumFractionDigits:0,maximumFractionDigits:2}); }
function csvN(n){ return n.toLocaleString('es-AR'); }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function save(){ localStorage.setItem('pki-v2', JSON.stringify(entries)); }

/* TOAST */
let toastT;
function toast(msg, ok=true){
  const el = document.getElementById('toast');
  document.getElementById('toast-msg').textContent = msg;
  el.style.borderColor = ok?'var(--green)':'var(--gold)';
  el.style.color       = ok?'var(--green)':'var(--gold)';
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(()=>el.classList.remove('show'), 2800);
}

/* CLOSE DROPDOWN ON OUTSIDE CLICK */
document.addEventListener('click', e => {
  if (!e.target.closest('.code-search-box')) closeDd();
});

/* CTRL+ENTER shortcut */
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key==='Enter') addEntry();
});

/* INIT */
populateFilters();
renderTable();
updateStats();
recalc();
