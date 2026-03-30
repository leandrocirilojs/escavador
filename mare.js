import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, doc, addDoc, getDocs, getDoc, setDoc, updateDoc, deleteDoc, query, where }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDLcp4-GaFIFJJRvueJSlIZzqyB_ohM2AE",
  authDomain: "mare-app-f4b0a.firebaseapp.com",
  projectId: "mare-app-f4b0a",
  storageBucket: "mare-app-f4b0a.firebasestorage.app",
  messagingSenderId: "45784368367",
  appId: "1:45784368367:web:e7ef7c2f5aca246b31c71a"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

let usuarioAtual  = null;
let imovelAtual   = null;
let datasOcupadas = new Set();
let reservas      = [];
let mesVis = new Date().getMonth(), anoVis = new Date().getFullYear();
let pubMes = new Date().getMonth(), pubAno = new Date().getFullYear();
let calMode = 'bloquear', rangeInicio = null, rangeHover = null;
let fotoBase64 = null, editandoId = null;
let veioDeVitrine = false;

// ─── UI ────────────────────────────────────────────────────────
function showScreen(name) {
  ['login','cadastro','dashboard','calendario','publico','vitrine'].forEach(s =>
    document.getElementById('screen-'+s)?.classList.remove('active'));
  document.getElementById('screen-'+name)?.classList.add('active');
  const autenticado = ['dashboard','calendario','publico'].includes(name);
  const logado = !!usuarioAtual;
  document.getElementById('bottomNav').style.display = (autenticado && logado) ? 'flex' : 'none';
  document.getElementById('floatingHeader').style.display = (autenticado && logado) ? 'flex' : 'none';
}

function switchNav(i) {
  document.querySelectorAll('.bottom-nav-item').forEach((el,j) => el.classList.toggle('active', i===j));
}

function showToast(msg, erro=false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = erro ? 'var(--coral)' : 'var(--ocean-deep)';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function setBtn(id, loading) {
  const b = document.getElementById(id);
  if (b) { b.disabled = loading; b.style.opacity = loading ? '0.6' : '1'; }
}

window.showScreen = showScreen;
window.switchNav  = switchNav;

// ─── FLOATING HEADER ───────────────────────────────────────────
document.getElementById('btnLogoutHeader').onclick = () => signOut(auth);

// ─── CAL MODE ──────────────────────────────────────────────────
window.setCalMode = function(mode) {
  calMode = mode; rangeInicio = null; rangeHover = null;
  document.getElementById('tabBloquear').classList.toggle('active', mode==='bloquear');
  document.getElementById('tabReservar').classList.toggle('active', mode==='reservar');
  document.getElementById('reservaForm').style.display = mode==='reservar' ? 'block' : 'none';
  document.getElementById('rangeInfo').textContent = 'Selecione a data de entrada no calendário';
  document.getElementById('inputHospede').value = '';
  document.getElementById('inputTelHospede').value = '';
  const btn = document.getElementById('btnSalvarReserva');
  delete btn.dataset.inicio; delete btn.dataset.fim; delete btn.dataset.datas;
  renderGrid();
};

// ─── AUTH ──────────────────────────────────────────────────────
onAuthStateChanged(auth, async user => {
  usuarioAtual = user;
  const handled = await verificarDeepLink();
  if (handled) return;
  if (user) { await carregarDashboard(); initAvatarUpload(); showScreen('dashboard'); switchNav(0); }
  else showScreen('login');
});

document.getElementById('btnLogin').onclick = async () => {
  const email = document.getElementById('inputEmail').value.trim();
  const senha = document.getElementById('inputSenha').value;
  if (!email || !senha) { showToast('Preencha e-mail e senha', true); return; }
  setBtn('btnLogin', true);
  try { await signInWithEmailAndPassword(auth, email, senha); }
  catch { showToast('E-mail ou senha incorretos', true); }
  setBtn('btnLogin', false);
};

document.getElementById('btnIrCadastro').onclick = () => showScreen('cadastro');
document.getElementById('btnVoltarLogin').onclick = () => showScreen('login');
document.getElementById('btnLogout').onclick = () => signOut(auth);

// Vitrine → Login → Vitrine
document.getElementById('btnVerVitrine').onclick = () => carregarVitrineEMostrar();
document.getElementById('btnVitrineLogin').onclick = () => showScreen('login');

// Voltar da página pública para vitrine
document.getElementById('btnVoltarVitrine').onclick = () => {
  showScreen('vitrine');
  document.getElementById('btnVoltarVitrine').style.display = 'none';
};

document.getElementById('btnCadastrar').onclick = async () => {
  const nome  = document.getElementById('inputNome').value.trim();
  const email = document.getElementById('inputEmailCad').value.trim();
  const senha = document.getElementById('inputSenhaCad').value;
  if (!nome || !email || !senha) { showToast('Preencha todos os campos', true); return; }
  if (senha.length < 6) { showToast('Senha mínimo 6 caracteres', true); return; }
  setBtn('btnCadastrar', true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    try { await setDoc(doc(db,'usuarios',cred.user.uid), { nome, email, plano:'gratis', criadoEm:new Date() }); }
    catch(e2) { showToast('Auth ok, erro Firestore: '+e2.code, true); }
  } catch(e) {
    const msgs = {
      'auth/email-already-in-use': 'E-mail já cadastrado',
      'auth/invalid-email': 'E-mail inválido',
      'auth/weak-password': 'Senha muito fraca',
      'auth/network-request-failed': 'Sem conexão'
    };
    showToast(msgs[e.code] || 'Erro: '+e.code, true);
  }
  setBtn('btnCadastrar', false);
};

// ─── DASHBOARD ─────────────────────────────────────────────────
async function carregarDashboard() {
  try {
    const snap = await getDoc(doc(db,'usuarios',usuarioAtual.uid));
    const dados = snap.exists() ? snap.data() : {};
    const nome = dados.nome || usuarioAtual.email.split('@')[0];
    document.getElementById('nomeUsuario').textContent = `Olá, ${nome.split(' ')[0]}`;
    // Avatar no greeting
    const avatarEl = document.getElementById('greetingAvatar');
    if (avatarEl) {
      if (dados.avatar) {
        avatarEl.style.backgroundImage = `url(${dados.avatar})`;
        avatarEl.style.backgroundSize = 'cover';
        avatarEl.innerHTML = '';
      } else {
        avatarEl.style.backgroundImage = '';
        avatarEl.innerHTML = `<span class="material-icons-round" style="font-size:22px;color:var(--ocean-light)">person</span>`;
      }
    }
  } catch { document.getElementById('nomeUsuario').textContent = 'Olá!'; }
  await carregarImoveis();
}

// Upload avatar
function initAvatarUpload() {
  const avatarEl = document.getElementById('greetingAvatar');
  if (!avatarEl) return;
  avatarEl.style.cursor = 'pointer';
  avatarEl.title = 'Toque para trocar foto de perfil';
  avatarEl.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      if (file.size > 2*1024*1024) { showToast('Foto maior que 2MB', true); return; }
      const reader = new FileReader();
      reader.onload = async ev => {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          const size = 200;
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          const min = Math.min(img.width, img.height);
          const sx = (img.width - min)/2, sy = (img.height - min)/2;
          ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
          const avatar = canvas.toDataURL('image/jpeg', 0.7);
          try {
            await updateDoc(doc(db,'usuarios',usuarioAtual.uid), { avatar });
            avatarEl.style.backgroundImage = `url(${avatar})`;
            avatarEl.style.backgroundSize = 'cover';
            avatarEl.innerHTML = '';
            showToast('Foto de perfil atualizada!');
          } catch { showToast('Erro ao salvar foto', true); }
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };
}

async function carregarImoveis() {
  const lista = document.getElementById('listaImoveis');
  lista.innerHTML = '<div class="loading-spinner"><span class="material-icons-round" style="font-size:32px;display:block;margin-bottom:8px">hourglass_top</span>Carregando...</div>';
  try {
    const snap = await getDocs(query(collection(db,'imoveis'), where('uid','==',usuarioAtual.uid)));
    lista.innerHTML = '';
    if (snap.empty) {
      lista.innerHTML = '<div class="empty-state"><span class="material-icons-round">home_work</span><p>Nenhum imóvel ainda.<br>Adicione seu primeiro imóvel abaixo.</p></div>';
      document.getElementById('statImoveis').textContent = '0';
      return;
    }
    document.getElementById('statImoveis').textContent = snap.size;
    snap.forEach(d => lista.appendChild(criarCardImovel(d.id, d.data())));
  } catch(e) {
    lista.innerHTML = `<p style="color:var(--coral);font-size:14px;padding:8px">Erro: ${e.code||e.message}</p>`;
  }
}

function criarCardImovel(id, data) {
  const div = document.createElement('div'); div.className = 'imovel-card';
  const icone = data.tipo==='casa' ? 'cottage' : (data.tipo==='studio' ? 'meeting_room' : 'apartment');
  const classeImg = data.tipo==='casa' ? 'casa' : (data.tipo==='studio' ? 'studio' : '');
  const temFoto = data.foto
    ? `<img src="${data.foto}" alt="${data.nome}"><div class="img-overlay"></div>`
    : `<span class="material-icons-round">${icone}</span>`;
  div.innerHTML = `
    <div class="imovel-img ${classeImg}">${temFoto}<div class="badge">Disponível</div></div>
    <div class="imovel-body">
      <h3>${data.nome}</h3>
      <div class="location"><span class="material-icons-round" style="font-size:14px">place</span>${data.cidade} · ${data.quartos} quarto${data.quartos>1?'s':''}</div>
      <div class="imovel-actions">
        <button class="btn-sm ocean" data-action="calendario"><span class="material-icons-round">calendar_month</span> Calendário</button>
        <button class="btn-sm outline" data-action="publico"><span class="material-icons-round">link</span> Público</button>
        <button class="btn-sm seaweed" data-action="editar"><span class="material-icons-round">edit</span> Editar</button>
      </div>
    </div>`;
  div.querySelectorAll('[data-action]').forEach(btn => {
    btn.onclick = async () => {
      const snap = await getDoc(doc(db,'imoveis',id));
      imovelAtual = { id, data: snap.data() };
      if (btn.dataset.action==='calendario') { await abrirCalendario(); showScreen('calendario'); switchNav(1); }
      else if (btn.dataset.action==='publico') { await abrirPublico(); showScreen('publico'); switchNav(2); }
      else abrirModalEditar(id, snap.data());
    };
  });
  return div;
}

// ─── MODAL ─────────────────────────────────────────────────────
function limparModal() {
  fotoBase64 = null;
  document.getElementById('fotoPreview').style.display = 'none';
  document.getElementById('fotoUploadLabel').style.display = 'flex';
  document.getElementById('fotoInput').value = '';
  ['modalNome','modalCidade','modalPreco','modalTel'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('modalTipo').value = 'apto';
  document.getElementById('modalQuartos').value = '1';
}

function abrirModalNovo() {
  editandoId = null; limparModal();
  document.getElementById('modalTitulo').textContent = 'Novo imóvel';
  document.getElementById('btnExcluirImovel').style.display = 'none';
  document.getElementById('modalImovel').classList.add('open');
}

function abrirModalEditar(id, data) {
  editandoId = id; limparModal(); fotoBase64 = data.foto || null;
  document.getElementById('modalTitulo').textContent = 'Editar imóvel';
  document.getElementById('btnExcluirImovel').style.display = 'flex';
  document.getElementById('modalNome').value    = data.nome || '';
  document.getElementById('modalCidade').value  = data.cidade || '';
  document.getElementById('modalTipo').value    = data.tipo || 'apto';
  document.getElementById('modalQuartos').value = String(data.quartos || 1);
  document.getElementById('modalPreco').value   = data.preco || '';
  document.getElementById('modalTel').value     = data.tel || '';
  if (data.foto) {
    document.getElementById('fotoPreview').src = data.foto;
    document.getElementById('fotoPreview').style.display = 'block';
    document.getElementById('fotoUploadLabel').style.display = 'none';
  }
  document.getElementById('modalImovel').classList.add('open');
}

document.getElementById('btnAbrirModal').onclick  = abrirModalNovo;
document.getElementById('btnFecharModal').onclick = () => document.getElementById('modalImovel').classList.remove('open');

document.getElementById('fotoInput').onchange = (e) => {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 2*1024*1024) { showToast('Foto muito grande. Use menos de 2MB.', true); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > 600) { h = Math.round(h*600/w); w = 600; }
      if (h > 450) { w = Math.round(w*450/h); h = 450; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      fotoBase64 = canvas.toDataURL('image/jpeg', 0.65);
      document.getElementById('fotoPreview').src = fotoBase64;
      document.getElementById('fotoPreview').style.display = 'block';
      document.getElementById('fotoUploadLabel').style.display = 'none';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
};

document.getElementById('fotoPreview').onclick = () => {
  fotoBase64 = null;
  document.getElementById('fotoPreview').style.display = 'none';
  document.getElementById('fotoUploadLabel').style.display = 'flex';
  document.getElementById('fotoInput').value = '';
};

document.getElementById('btnSalvarImovel').onclick = async () => {
  const nome    = document.getElementById('modalNome').value.trim();
  const cidade  = document.getElementById('modalCidade').value.trim();
  const tipo    = document.getElementById('modalTipo').value;
  const quartos = parseInt(document.getElementById('modalQuartos').value);
  const preco   = parseFloat(document.getElementById('modalPreco').value) || 0;
  const tel     = document.getElementById('modalTel').value.trim();
  if (!nome || !cidade || !tel) { showToast('Preencha nome, cidade e WhatsApp', true); return; }
  setBtn('btnSalvarImovel', true);
  try {
    const payload = { nome, cidade, tipo, quartos, preco, tel, foto: fotoBase64||null };
    if (editandoId) {
      await updateDoc(doc(db,'imoveis',editandoId), payload);
      showToast('Imóvel atualizado!');
    } else {
      payload.uid = usuarioAtual.uid; payload.status = 'disponivel'; payload.criadoEm = new Date();
      payload.slug = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'-')+'-'+Date.now();
      await addDoc(collection(db,'imoveis'), payload);
      showToast('Imóvel adicionado!');
    }
    document.getElementById('modalImovel').classList.remove('open');
    await carregarImoveis();
  } catch(e) { showToast('Erro: '+(e.code||e.message), true); }
  setBtn('btnSalvarImovel', false);
};

document.getElementById('btnExcluirImovel').onclick = async () => {
  if (!editandoId || !confirm('Excluir este imóvel? Não pode ser desfeito.')) return;
  try {
    await deleteDoc(doc(db,'imoveis',editandoId));
    (await getDocs(query(collection(db,'bloqueios'), where('imovelId','==',editandoId)))).forEach(d => deleteDoc(d.ref));
    (await getDocs(query(collection(db,'reservas'),  where('imovelId','==',editandoId)))).forEach(d => deleteDoc(d.ref));
    document.getElementById('modalImovel').classList.remove('open');
    showToast('Imóvel excluído');
    await carregarImoveis();
  } catch(e) { showToast('Erro: '+(e.code||e.message), true); }
};

// ─── CALENDÁRIO ────────────────────────────────────────────────
async function abrirCalendario() {
  if (!imovelAtual) return;
  mesVis = new Date().getMonth(); anoVis = new Date().getFullYear();
  calMode = 'bloquear'; rangeInicio = null;
  document.getElementById('tabBloquear').classList.add('active');
  document.getElementById('tabReservar').classList.remove('active');
  document.getElementById('reservaForm').style.display = 'none';
  document.getElementById('inputHospede').value = '';
  document.getElementById('inputTelHospede').value = '';
  document.getElementById('rangeInfo').textContent = 'Selecione a data de entrada no calendário';
  const btn = document.getElementById('btnSalvarReserva');
  delete btn.dataset.inicio; delete btn.dataset.fim; delete btn.dataset.datas;
  document.getElementById('calTitulo').textContent = imovelAtual.data.nome;
  document.getElementById('linkPublicoSpan').textContent = `leandrocirilojs.github.io/mare-app?p=${imovelAtual.data.slug||imovelAtual.id}`;
  await carregarDadosCalendario();
  renderGrid();
  renderListaReservas();
}

async function carregarDadosCalendario() {
  datasOcupadas = new Set(); reservas = [];
  try {
    (await getDocs(query(collection(db,'bloqueios'), where('imovelId','==',imovelAtual.id)))).forEach(d => datasOcupadas.add(d.data().data));
    (await getDocs(query(collection(db,'reservas'),  where('imovelId','==',imovelAtual.id)))).forEach(d => reservas.push({ id:d.id, ...d.data() }));
    reservas.forEach(r => (r.datas||[]).forEach(dt => datasOcupadas.add(dt)));
  } catch {}
}

function renderGrid() {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  document.getElementById('calMesAno').textContent = `${meses[mesVis]} ${anoVis}`;
  const grid = document.getElementById('calGrid');
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const hojeStr = toDateStr(hoje);
  const primeiro = new Date(anoVis, mesVis, 1).getDay();
  const totalDias = new Date(anoVis, mesVis+1, 0).getDate();
  for (let i=0; i<primeiro; i++) { const el=document.createElement('div'); el.className='cal-day empty'; grid.appendChild(el); }
  for (let d=1; d<=totalDias; d++) {
    const dateStr = `${anoVis}-${String(mesVis+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el = document.createElement('div'); el.className='cal-day'; el.textContent=d;
    const dataObj = new Date(anoVis, mesVis, d);
    if (dateStr===hojeStr) el.classList.add('hoje');
    else if (dataObj < hoje) el.classList.add('passado');
    else if (isReservado(dateStr)) {
      el.classList.add('reservado');
      const r = reservas.find(r => (r.datas||[]).includes(dateStr));
      if (r) el.dataset.tooltip = r.hospede;
    }
    else if (datasOcupadas.has(dateStr)) el.classList.add('ocupado');
    // Highlight do range em preview
    if (calMode==='reservar') {
      const fimPreview = rangeHover || null;
      if (rangeInicio) {
        if (dateStr === rangeInicio) {
          el.classList.add('range-start');
        } else if (fimPreview && dateStr > rangeInicio && dateStr < fimPreview && !datasOcupadas.has(dateStr)) {
          el.classList.add('range-middle');
        } else if (fimPreview && dateStr === fimPreview && dateStr > rangeInicio) {
          el.classList.add('range-end');
        }
      } else {
        // período já confirmado — mostrar salvo
        const btn = document.getElementById('btnSalvarReserva');
        const inicio = btn.dataset.inicio, fim = btn.dataset.fim;
        if (inicio && fim) {
          if (dateStr === inicio) el.classList.add('range-start');
          else if (dateStr > inicio && dateStr < fim && !datasOcupadas.has(dateStr)) el.classList.add('range-middle');
          else if (dateStr === fim) el.classList.add('range-end');
        }
      }
    }
    const naoClicavel = el.classList.contains('passado') || el.classList.contains('hoje');
    if (!naoClicavel) {
      el.onclick = () => handleDiaClick(dateStr);
      if (calMode === 'reservar') {
        el.addEventListener('mouseenter', () => { if (rangeInicio) { rangeHover = dateStr; renderGrid(); } });
        el.addEventListener('mouseleave', () => { if (rangeInicio) { rangeHover = null; renderGrid(); } });
        el.addEventListener('touchmove', (e) => {
          const touch = e.touches[0];
          const target = document.elementFromPoint(touch.clientX, touch.clientY);
          if (target && target.classList.contains('cal-day') && target.dataset.date) {
            if (rangeInicio && target.dataset.date !== rangeHover) {
              rangeHover = target.dataset.date; renderGrid();
            }
          }
        }, {passive:true});
      }
    }
    el.dataset.date = dateStr;
    if (el.dataset.tooltip) {
      el.addEventListener('mouseenter', showCalTooltip);
      el.addEventListener('mouseleave', hideCalTooltip);
      el.addEventListener('touchstart', showCalTooltip, {passive:true});
      el.addEventListener('touchend', hideCalTooltip);
    }
    grid.appendChild(el);
  }
}

function isReservado(dateStr) { return reservas.some(r => (r.datas||[]).includes(dateStr)); }

// ─── TOOLTIP CALENDÁRIO ────────────────────────────────────────
let tooltipEl = null;
function showCalTooltip(e) {
  const el = e.currentTarget;
  if (!el.dataset.tooltip) return;
  hideCalTooltip();
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'cal-tooltip';
  tooltipEl.textContent = el.dataset.tooltip;
  document.body.appendChild(tooltipEl);
  const rect = el.getBoundingClientRect();
  tooltipEl.style.left = (rect.left + rect.width/2 - tooltipEl.offsetWidth/2) + 'px';
  tooltipEl.style.top  = (rect.top - tooltipEl.offsetHeight - 6 + window.scrollY) + 'px';
}
function hideCalTooltip() {
  if (tooltipEl) { tooltipEl.remove(); tooltipEl = null; }
}

async function handleDiaClick(dateStr) {
  if (!imovelAtual) return;
  if (calMode==='bloquear') {
    await toggleBloqueio(dateStr);
  } else {
    if (!rangeInicio) {
      if (datasOcupadas.has(dateStr)) { showToast('Data já ocupada', true); return; }
      rangeInicio = dateStr;
      document.getElementById('rangeInfo').textContent = `Entrada: ${formatarData(dateStr)} — selecione a saída`;
      renderGrid();
    } else {
      if (dateStr <= rangeInicio) { showToast('Saída deve ser após a entrada', true); rangeInicio=null; renderGrid(); return; }
      const datas = datasEntre(rangeInicio, dateStr);
      if (datas.some(dt => datasOcupadas.has(dt))) { showToast('Período com datas ocupadas', true); rangeInicio=null; rangeHover=null; renderGrid(); return; }
      document.getElementById('rangeInfo').textContent = `${formatarData(rangeInicio)} → ${formatarData(dateStr)} (${datas.length} noite${datas.length>1?'s':''})`;
      const btn = document.getElementById('btnSalvarReserva');
      btn.dataset.inicio = rangeInicio; btn.dataset.fim = dateStr; btn.dataset.datas = JSON.stringify(datas);
      rangeInicio = null; rangeHover = null; renderGrid();
    }
  }
}

async function toggleBloqueio(dateStr) {
  const ref = doc(db,'bloqueios',`${imovelAtual.id}_${dateStr}`);
  try {
    if (datasOcupadas.has(dateStr) && !isReservado(dateStr)) {
      await deleteDoc(ref); datasOcupadas.delete(dateStr); showToast('Data liberada');
    } else if (!datasOcupadas.has(dateStr)) {
      await setDoc(ref, { imovelId:imovelAtual.id, data:dateStr }); datasOcupadas.add(dateStr); showToast('Data bloqueada');
    }
    renderGrid();
  } catch { showToast('Erro ao salvar', true); }
}

document.getElementById('btnSalvarReserva').onclick = async () => {
  const hospede = document.getElementById('inputHospede').value.trim();
  if (!hospede) { showToast('Informe o nome do hóspede', true); return; }
  const btn = document.getElementById('btnSalvarReserva');
  const inicio = btn.dataset.inicio, fim = btn.dataset.fim;
  const datas = JSON.parse(btn.dataset.datas || '[]');
  if (!inicio || datas.length===0) { showToast('Selecione o período no calendário', true); return; }
  const tel = document.getElementById('inputTelHospede').value.trim();
  setBtn('btnSalvarReserva', true);
  try {
    const ref = await addDoc(collection(db,'reservas'), {
      imovelId:imovelAtual.id, uid:usuarioAtual.uid, hospede, tel, inicio, fim, datas, criadoEm:new Date()
    });
    datas.forEach(dt => datasOcupadas.add(dt));
    reservas.push({ id:ref.id, hospede, tel, inicio, fim, datas });
    showToast(`Reserva de ${hospede} salva!`);
    document.getElementById('inputHospede').value = '';
    document.getElementById('inputTelHospede').value = '';
    document.getElementById('rangeInfo').textContent = 'Selecione a data de entrada no calendário';
    delete btn.dataset.inicio; delete btn.dataset.fim; delete btn.dataset.datas;
    renderGrid(); renderListaReservas();
  } catch(e) { showToast('Erro: '+(e.code||e.message), true); }
  setBtn('btnSalvarReserva', false);
};

function renderListaReservas() {
  const lista = document.getElementById('listaReservas');
  if (!reservas.length) { lista.innerHTML = '<p style="font-size:13px;color:var(--text-soft);text-align:center;padding:8px">Nenhuma reserva ainda.</p>'; return; }
  lista.innerHTML = '';
  reservas.slice().sort((a,b) => a.inicio.localeCompare(b.inicio)).forEach(r => {
    const div = document.createElement('div'); div.className='reserva-item';
    div.innerHTML = `
      <div class="reserva-info">
        <h4>${r.hospede}</h4>
        <p>${formatarData(r.inicio)} → ${formatarData(r.fim)} · ${(r.datas||[]).length} noite${(r.datas||[]).length>1?'s':''}</p>
        ${r.tel ? `<p style="color:var(--ocean)">${r.tel}</p>` : ''}
      </div>
      <button class="reserva-del" title="Cancelar"><span class="material-icons-round">delete_outline</span></button>`;
    div.querySelector('.reserva-del').onclick = async () => {
      if (!confirm(`Cancelar reserva de ${r.hospede}?`)) return;
      try {
        if (r.id) await deleteDoc(doc(db,'reservas',r.id));
        (r.datas||[]).forEach(dt => datasOcupadas.delete(dt));
        reservas = reservas.filter(x => x !== r);
        renderGrid(); renderListaReservas(); showToast('Reserva cancelada');
      } catch { showToast('Erro ao cancelar', true); }
    };
    lista.appendChild(div);
  });
}

// ─── EXPORTAR RESERVAS CSV ────────────────────────────────────
function exportarReservasCSV() {
  if (!reservas.length) { showToast('Nenhuma reserva para exportar', true); return; }
  const linhas = [['Hóspede','Telefone','Entrada','Saída','Noites']];
  reservas.slice().sort((a,b) => a.inicio.localeCompare(b.inicio)).forEach(r => {
    linhas.push([
      r.hospede,
      r.tel || '',
      formatarData(r.inicio),
      formatarData(r.fim),
      (r.datas||[]).length
    ]);
  });
  const csv = linhas.map(l => l.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `reservas-${imovelAtual?.data?.nome||'imovel'}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast('CSV exportado!');
}
window.exportarReservasCSV = exportarReservasCSV;

function navMes(delta) {
  mesVis += delta;
  if (mesVis < 0) { mesVis = 11; anoVis--; }
  if (mesVis > 11) { mesVis = 0; anoVis++; }
  // Se estava selecionando período, cancela para evitar período entre meses
  if (calMode === 'reservar' && rangeInicio) {
    rangeInicio = null; rangeHover = null;
    document.getElementById('rangeInfo').textContent = 'Mês alterado — selecione a data de entrada';
    const btn = document.getElementById('btnSalvarReserva');
    delete btn.dataset.inicio; delete btn.dataset.fim; delete btn.dataset.datas;
  }
  renderGrid();
}
document.getElementById('calPrev').onclick = () => navMes(-1);
document.getElementById('calNext').onclick = () => navMes(1);

document.getElementById('btnCopiarLink').onclick = () => {
  const link = 'https://'+document.getElementById('linkPublicoSpan').textContent;
  navigator.clipboard?.writeText(link).then(() => showToast('Link copiado!')).catch(() => showToast('Copie manualmente', true));
};

// ─── PÁGINA PÚBLICA ────────────────────────────────────────────
async function abrirPublico(mostrarVoltar=false) {
  if (!imovelAtual) return;
  const d = imovelAtual.data;
  document.getElementById('pubNome').textContent   = d.nome;
  document.getElementById('pubCidade').textContent = d.cidade;
  document.getElementById('pubPreco').textContent  = d.preco ? `R$ ${d.preco.toLocaleString('pt-BR')}` : '—';
  const fotoHero = document.getElementById('pubFotoHero');
  if (d.foto) { fotoHero.src = d.foto; fotoHero.style.display='block'; } else fotoHero.style.display='none';
  document.getElementById('pubTags').innerHTML = `
    <span class="pub-tag"><span class="material-icons-round" style="font-size:13px">bed</span> ${d.quartos} quarto${d.quartos>1?'s':''}</span>
    <span class="pub-tag"><span class="material-icons-round" style="font-size:13px">${d.tipo==='casa'?'cottage':'apartment'}</span> ${d.tipo==='casa'?'Casa':d.tipo==='studio'?'Studio':'Apartamento'}</span>`;
  document.getElementById('btnWhatsapp').onclick = () => {
    const msg = encodeURIComponent(`Olá! Vi o imóvel "${d.nome}" no Maré e tenho interesse.`);
    window.open(`https://wa.me/55${d.tel}?text=${msg}`, '_blank');
  };
  // Avatar do proprietário na página pública
  try {
    const userSnap = await getDoc(doc(db,'usuarios', imovelAtual.data.uid || ''));
    const userData = userSnap.exists() ? userSnap.data() : {};
    const pubOwner = document.getElementById('pubOwner');
    if (pubOwner) {
      const avatarHtml = userData.avatar
        ? `<div class="pub-owner-avatar" style="background-image:url(${userData.avatar});background-size:cover"></div>`
        : `<div class="pub-owner-avatar"><span class="material-icons-round" style="font-size:22px;color:var(--ocean-light)">person</span></div>`;
      pubOwner.innerHTML = `${avatarHtml}<div><div class="pub-owner-name">${userData.nome||'Proprietário'}</div><div class="pub-owner-sub">Proprietário</div></div>`;
      pubOwner.style.display = 'flex';
    }
  } catch {}
  // Botão voltar visível só se veio da vitrine
  document.getElementById('btnVoltarVitrine').style.display = mostrarVoltar ? 'inline-flex' : 'none';
  await carregarDadosCalendario();
  pubMes = new Date().getMonth(); pubAno = new Date().getFullYear();
  renderGridPublico();
}

function renderGridPublico() {
  const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  document.getElementById('pubCalMesAno').textContent = `${meses[pubMes]} ${pubAno}`;
  const grid = document.getElementById('calGridPublico');
  while (grid.children.length > 7) grid.removeChild(grid.lastChild);
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const hojeStr = toDateStr(hoje);
  const primeiro = new Date(pubAno, pubMes, 1).getDay();
  const totalDias = new Date(pubAno, pubMes+1, 0).getDate();
  for (let i=0; i<primeiro; i++) { const el=document.createElement('div'); el.className='cal-day empty'; grid.appendChild(el); }
  for (let d=1; d<=totalDias; d++) {
    const dateStr = `${pubAno}-${String(pubMes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el = document.createElement('div'); el.className='cal-day'; el.textContent=d; el.style.cursor='default';
    if (dateStr===hojeStr) el.classList.add('hoje');
    else if (datasOcupadas.has(dateStr)) el.classList.add('ocupado');
    grid.appendChild(el);
  }
}

document.getElementById('pubCalPrev').onclick = () => { pubMes--; if(pubMes<0){pubMes=11;pubAno--;} renderGridPublico(); };
document.getElementById('pubCalNext').onclick = () => { pubMes++; if(pubMes>11){pubMes=0;pubAno++;} renderGridPublico(); };

// ─── VITRINE ───────────────────────────────────────────────────
async function carregarVitrineEMostrar() {
  showScreen('vitrine');
  await carregarVitrine();
}

async function carregarVitrine() {
  const grid = document.getElementById('vitrineGrid');
  grid.innerHTML = '<div class="loading-spinner"><span class="material-icons-round" style="font-size:32px;display:block;margin-bottom:8px">hourglass_top</span>Carregando imóveis...</div>';
  try {
    const snap = await getDocs(collection(db,'imoveis'));
    let imoveis = [];
    snap.forEach(d => imoveis.push({ id:d.id, ...d.data() }));

    function renderVitrine(lista) {
      grid.innerHTML = '';
      if (!lista.length) {
        grid.innerHTML = '<div class="empty-state"><span class="material-icons-round">home_work</span><p>Nenhum imóvel encontrado.</p></div>';
        return;
      }
      lista.forEach(d => {
        const classeImg = d.tipo==='casa' ? 'casa' : (d.tipo==='studio' ? 'studio' : '');
        const icone = d.tipo==='casa' ? 'cottage' : (d.tipo==='studio' ? 'meeting_room' : 'apartment');
        const temFoto = d.foto
          ? `<img src="${d.foto}" alt="${d.nome}"><div class="img-overlay"></div>`
          : `<span class="material-icons-round" style="font-size:48px;opacity:0.5;color:white">${icone}</span>`;
        const card = document.createElement('div');
        card.className = 'vitrine-card';
        card.innerHTML = `
          <div class="vitrine-card-img ${classeImg}">${temFoto}</div>
          <div class="vitrine-card-body">
            <h3>${d.nome}</h3>
            <div class="vc-loc"><span class="material-icons-round" style="font-size:14px">place</span>${d.cidade}</div>
            <div class="vc-tags">
              <span class="vc-tag"><span class="material-icons-round" style="font-size:13px">bed</span>${d.quartos} quarto${d.quartos>1?'s':''}</span>
              <span class="vc-tag"><span class="material-icons-round" style="font-size:13px">${d.tipo==='casa'?'cottage':'apartment'}</span>${d.tipo==='casa'?'Casa':d.tipo==='studio'?'Studio':'Apartamento'}</span>
            </div>
            <div class="vc-footer">
              <div class="vc-preco">${d.preco ? `R$ ${Number(d.preco).toLocaleString('pt-BR')}` : '—'} <span>/ diária</span></div>
              <div class="vc-btns">
                <button class="btn-ver-sm" data-slug="${d.slug||d.id}">
                  <span class="material-icons-round" style="font-size:14px">calendar_month</span> Ver
                </button>
                <button class="btn-wpp-sm" data-tel="${d.tel}" data-nome="${d.nome}">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                  WhatsApp
                </button>
              </div>
            </div>
          </div>`;

        // ── Ver imóvel SEM recarregar a página ──
        card.querySelector('.btn-ver-sm').onclick = async () => {
          const slug = card.querySelector('.btn-ver-sm').dataset.slug;
          try {
            const snap = await getDocs(query(collection(db,'imoveis'), where('slug','==',slug)));
            if (snap.empty) { showToast('Imóvel não encontrado', true); return; }
            const d2 = snap.docs[0];
            imovelAtual = { id:d2.id, data:d2.data() };
            await abrirPublico(true); // true = mostrar botão voltar
            showScreen('publico');
          } catch { showToast('Erro ao carregar imóvel', true); }
        };

        card.querySelector('.btn-wpp-sm').onclick = () => {
          const b = card.querySelector('.btn-wpp-sm');
          const msg = encodeURIComponent(`Olá! Vi o imóvel "${b.dataset.nome}" no Maré e tenho interesse.`);
          window.open(`https://wa.me/55${b.dataset.tel}?text=${msg}`, '_blank');
        };

        grid.appendChild(card);
      });
    }

    renderVitrine(imoveis);

    document.getElementById('vitrineSearch').oninput = (e) => {
      const q = e.target.value.toLowerCase();
      renderVitrine(imoveis.filter(d =>
        d.nome.toLowerCase().includes(q) || d.cidade.toLowerCase().includes(q)
      ));
    };
  } catch(e) {
    grid.innerHTML = `<p style="color:var(--coral);font-size:14px;padding:8px">Erro ao carregar: ${e.message}</p>`;
  }
}

// ─── UTILS ─────────────────────────────────────────────────────
function toDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function datasEntre(inicio, fim) {
  const datas=[], cur=new Date(inicio+'T00:00:00'), end=new Date(fim+'T00:00:00');
  while (cur<end) { datas.push(toDateStr(cur)); cur.setDate(cur.getDate()+1); }
  return datas;
}
function formatarData(str) { if(!str) return ''; const [y,m,d]=str.split('-'); return `${d}/${m}/${y}`; }

// ─── DEEP LINK ─────────────────────────────────────────────────
async function verificarDeepLink() {
  const params = new URLSearchParams(window.location.search);

  // ── Vitrine pública ──
  if (params.get('vitrine') !== null) {
    await carregarVitrine();
    showScreen('vitrine');
    document.getElementById('bottomNav').style.display = 'none';
    document.getElementById('floatingHeader').style.display = 'none';
    return true;
  }

  // ── Imóvel específico ──
  const slug = params.get('p');
  if (!slug) return false;
  try {
    const snap = await getDocs(query(collection(db,'imoveis'), where('slug','==',slug)));
    if (snap.empty) return false;
    const d = snap.docs[0];
    imovelAtual = { id:d.id, data:d.data() };
    await abrirPublico(false);
    showScreen('publico');
    document.getElementById('bottomNav').style.display = 'none';
    document.getElementById('floatingHeader').style.display = 'none';
    return true;
  } catch { return false; }
}
