/* ============================================================
   SIS — Sistema Interno Safári
   Arquivo: app.js (toda a lógica do sistema)
   ------------------------------------------------------------
   COMO ESTÁ ORGANIZADO:
   1) Utilidades (atalhos de DOM, escape, números, etc)
   2) Storage & Constantes (chaves, perfis, usuários padrão)
   3) Dados padrão (Checklists)
   4) Propostas (Comercial/Diretoria) — CRUD em localStorage
   5) Navegação / Renderização de páginas
   6) Admin (Dashboard, Visualizar área, Acessos e Aprovadores)
   7) Checklists: render, edição, CSV
   8) Comercial: envio e listagem de propostas
   9) Diretoria: ver proposta completa + aprovar/negar com PIN
   10) Inicialização (listeners e initUI)
============================================================ */

/* =============== 1) UTILIDADES =============== */
const $ = (id)=>document.getElementById(id);
const show = (id)=>$(id)?.classList.remove('hide');
const hide = (id)=>$(id)?.classList.add('hide');
const esc = (s)=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const csvEsc=(s)=>{const x=String(s??'');return /[",\n]/.test(x)?`"${x.replace(/"/g,'""')}"`:x};
const num = (v)=>Number(v)||0;

/* Estrelinhas do fundo do login */
(function(){
  const wrap=$('twinkle'); if(!wrap) return;
  let h='';
  for(let i=0;i<80;i++){
    h+=`<span class="dot" style="left:${Math.random()*100}%;top:${Math.random()*100}%;animation-duration:${(2+Math.random()*3).toFixed(2)}s;animation-delay:${(Math.random()*3).toFixed(2)}s"></span>`;
  }
  wrap.innerHTML=h;
})();

/* =============== 2) STORAGE & CONSTANTES =============== */
const KEY_SESSION='sis_session';
const KEY_DATA='sis_checklists';
const KEY_USERS='sis_users';
const KEY_PROPS='sis_propostas';
const KEY_DIR_APPROVERS='sis_dir_approvers';

const ROLES = {
  ADMIN:'ADMIN', COMERCIAL:'COMERCIAL', DIRETORIA:'DIRETORIA',
  PROJETOS:'PROJETOS', ESTOQUE:'ESTOQUE', FABRICACAO:'FABRICACAO',
  PRODUCAO:'PRODUCAO', MARKETING:'MARKETING', GRAFICA:'GRAFICA', LOGISTICA:'LOGISTICA'
};

/* Session helpers */
function getUser(){ try{return JSON.parse(localStorage.getItem(KEY_SESSION))}catch{return null} }
function setUser(u){ localStorage.setItem(KEY_SESSION, JSON.stringify(u)) }
function logout(){ localStorage.removeItem(KEY_SESSION); initUI(); }
function resetSession(){
  localStorage.removeItem(KEY_SESSION);
  localStorage.removeItem(KEY_USERS);
  localStorage.removeItem(KEY_DATA);
  localStorage.removeItem(KEY_PROPS);
  localStorage.removeItem(KEY_DIR_APPROVERS);
  location.reload();
}

/* Usuários iniciais (seed) */
const SEED_USERS = [
  {name:'Administrador', username:'admin', password:'123456', role:ROLES.ADMIN},
  {name:'Comercial', username:'comercial', password:'123', role:ROLES.COMERCIAL},
  {name:'Diretoria', username:'diretoria', password:'0000', role:ROLES.DIRETORIA}, // login geral
  {name:'Diretoria 1', username:'diretoria1', password:'7410', role:ROLES.DIRETORIA},
  {name:'Diretoria 2', username:'diretoria2', password:'8520', role:ROLES.DIRETORIA},
  {name:'Diretoria 3', username:'diretoria3', password:'9630', role:ROLES.DIRETORIA},
  {name:'Diretoria 4', username:'diretoria4', password:'1590', role:ROLES.DIRETORIA},
  {name:'Projetos', username:'projetos', password:'123', role:ROLES.PROJETOS},
  {name:'Estoque', username:'estoque', password:'123', role:ROLES.ESTOQUE},
  {name:'Fabricação', username:'fabricacao', password:'123', role:ROLES.FABRICACAO},
  {name:'Produção', username:'producao', password:'123', role:ROLES.PRODUCAO},
  {name:'Marketing', username:'marketing', password:'123', role:ROLES.MARKETING},
  {name:'Gráfica', username:'grafica', password:'123', role:ROLES.GRAFICA},
  {name:'Logística', username:'logistica', password:'123', role:ROLES.LOGISTICA},
];

/* CRUD usuários no localStorage */
function getUsers(){
  try{
    const raw=localStorage.getItem(KEY_USERS);
    if(raw){
      const arr=JSON.parse(raw);
      if(Array.isArray(arr)) return seedUsers(arr);
    }
  }catch{}
  localStorage.setItem(KEY_USERS, JSON.stringify(SEED_USERS));
  return JSON.parse(localStorage.getItem(KEY_USERS));
}
function setUsers(list){ localStorage.setItem(KEY_USERS, JSON.stringify(list)) }
function seedUsers(arr){
  const map=new Map(arr.map(u=>[u.username.toLowerCase(),u]));
  SEED_USERS.forEach(s=>{ if(!map.has(s.username.toLowerCase())) arr.push(s); });
  localStorage.setItem(KEY_USERS, JSON.stringify(arr));
  return arr;
}

/* Diretores (aprovadores) — Nome + PIN pessoal (para assinar) */
const SEED_APPROVERS = [
  {name:'Diretor A', pin:'7410'},
  {name:'Diretor B', pin:'8520'},
  {name:'Diretor C', pin:'9630'},
  {name:'Diretor D', pin:'1590'},
];
function getApprovers(){
  try{
    const raw=localStorage.getItem(KEY_DIR_APPROVERS);
    if(raw){ const arr=JSON.parse(raw); if(Array.isArray(arr) && arr.length) return arr; }
  }catch{}
  localStorage.setItem(KEY_DIR_APPROVERS, JSON.stringify(SEED_APPROVERS));
  return JSON.parse(localStorage.getItem(KEY_DIR_APPROVERS));
}
function setApprovers(list){ localStorage.setItem(KEY_DIR_APPROVERS, JSON.stringify(list)) }

/* =============== 3) DADOS PADRÃO (CHECKLISTS) =============== */
/* cada linha tem campos para ida/volta e cálculos automáticos */
const row = (item,desc='') => ({
  item, desc,
  antigo:0, novo:0, enviar:0, sobra:0,   // IDA (enviar/sobra calculados)
  voltou:0, faltou:0,                     // VOLTA (faltou calculado)
  apIda:false, apVolta:false              // aprovações de ida/volta
});
const DEFAULT_DATA = {
  [ROLES.PROJETOS]: [row('Briefing aprovado'), row('Planta 2D'), row('Modelagem 3D/Render'), row('Memorial descritivo'), row('Aprovação cliente')],
  [ROLES.ESTOQUE]: [row('Mesinha'),row('Tampo mesinha'),row('Assento mesinha'),row('Cavalinhos'),row('Escorregadores')],
  [ROLES.FABRICACAO]: [row('Módulo 1'),row('Módulo 2'),row('Personagem 01'),row('Cama elástica')],
  [ROLES.PRODUCAO]: [row('Escada'),row('Travessa 1m'),row('Travessa 2m')],
  [ROLES.MARKETING]: [row('Arte final'),row('Posts/divulgação')],
  [ROLES.GRAFICA]: [row('Impressão'),row('Refile/laminação')],
  [ROLES.LOGISTICA]: [row('Veículo definido'),row('Rota & janela de doca')],
};
function getData(){
  try{ const v=JSON.parse(localStorage.getItem(KEY_DATA)); if(v && typeof v==='object') return v; }catch{}
  const copy=JSON.parse(JSON.stringify(DEFAULT_DATA));
  localStorage.setItem(KEY_DATA, JSON.stringify(copy));
  return copy;
}
function setData(o){ localStorage.setItem(KEY_DATA, JSON.stringify(o)) }

/* =============== 4) PROPOSTAS (COMERCIAL/DIRETORIA) =============== */
function getProps(){ try{const p=JSON.parse(localStorage.getItem(KEY_PROPS)); return Array.isArray(p)?p:[]}catch{return[]} }
function setProps(a){ localStorage.setItem(KEY_PROPS, JSON.stringify(a)) }

/* =============== 5) NAVEGAÇÃO / RENDERIZAÇÃO =============== */
/* Decide qual tela mostrar com base no usuário logado */
function initUI(){
  // some tudo
  ['pageLogin','pageAdmin','pageDiretoria','pageComercial','pageArea'].forEach(hide);

  const u=getUser();
  $('userNav')?.classList.toggle('hide', !u);

  if(!u){
    show('pageLogin');
    return;
  }

  // Preenche nav com nome/role
  $('userName').textContent=u.name||u.username;
  $('userRole').textContent=u.role;

  // Desenha cada módulo conforme o perfil
  if(u.role===ROLES.ADMIN){
    show('pageAdmin');
    bindAdminTabs();
    fillAreaSelect();
    renderDashboard();
    prepareAccessTab();
    return;
  }
  if(u.role===ROLES.DIRETORIA){
    show('pageDiretoria');
    renderDirProps();
    return;
  }
  if(u.role===ROLES.COMERCIAL){
    show('pageComercial');
    bindComercialTabs();
    renderMyProps();
    return;
  }

  // Demais áreas => checklist da própria área
  $('areaTitle').textContent=`Checklist da área — ${u.role}`;
  show('pageArea');
  renderAreaTable(u.role,'areaTable');
}

/* =============== 6) ADMIN (TABS/ACESSOS/APROVADORES/DASH) =============== */
/* Login: valida usuário e troca a UI */
function doLogin(event){
  event?.preventDefault();
  const un=$('inUser').value.trim().toLowerCase();
  const pw=$('inPass').value.trim();
  const user=getUsers().find(u=>u.username.toLowerCase()===un && u.password===pw);
  if(!user){ alert('Usuário ou senha inválidos'); return false; }
  setUser({username:user.username,name:user.name,role:user.role});
  initUI(); // troca da tela de login para o módulo correspondente
  return false;
}

/* Tabs do Admin */
function bindAdminTabs(){
  const container=$('adminTabs');
  container.querySelectorAll('.tab').forEach(btn=>{
    btn.onclick=()=>{
      container.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      hide('panel-dash'); hide('panel-area'); hide('panel-access');
      if(btn.dataset.tab==='dash'){ show('panel-dash'); renderDashboard(); }
      if(btn.dataset.tab==='area'){ show('panel-area'); renderAdminAreaView($('areaSelect').value); }
      if(btn.dataset.tab==='access'){ show('panel-access'); prepareAccessTab(); }
    };
  });
}

/* Dashboard — cartões por área */
function progressOf(area){
  const data=getData()[area]||[]; const total=data.length||1;
  const done=data.filter(r=>r.apIda || r.apVolta).length;
  return {pct:Math.round(100*done/total), done, total};
}
function renderDashboard(){
  const areas=Object.values(ROLES).filter(r=>![ROLES.ADMIN,ROLES.DIRETORIA,ROLES.COMERCIAL].includes(r));
  $('dashCards').innerHTML = areas.map(a=>{
    const p=progressOf(a);
    return `<div class="card" style="min-width:280px">
      <div class="row" style="gap:16px;align-items:center">
        <div class="progress" style="width:120px;height:12px"><div class="bar" style="width:${p.pct}%"></div></div>
        <div>
          <div style="font-weight:900">${a}</div>
          <div class="row"><span class="pill">Concl.: ${p.done}</span><span class="pill">Pend.: ${p.total-p.done}</span></div>
        </div>
        <div class="pill">${p.pct}%</div>
      </div>
    </div>`;
  }).join('');
}

/* Acessos (criar/editar/remover) + aprovadores (diretoria) */
function prepareAccessTab(){
  const sel=$('accRole');
  sel.innerHTML=Object.values(ROLES).map(r=>`<option>${r}</option>`).join('');
  renderAccessList();
  ensureApproverBox(); renderApprovers();
}
function renderAccessList(){
  const users=getUsers();
  $('userList').innerHTML = users.length? `
  <div style="overflow:auto"><table>
    <thead><tr><th>NOME</th><th>USUÁRIO</th><th>PERFIL</th><th></th></tr></thead>
    <tbody>
      ${users.map(u=>`
        <tr>
          <td>${esc(u.name)}</td>
          <td><code>${esc(u.username)}</code></td>
          <td>${esc(u.role)}</td>
          <td style="text-align:right">
            <button class="btn xs ghost" onclick="resetPassword('${u.username}')">Redefinir senha</button>
            <button class="btn xs warn" onclick="changeRole('${u.username}')">Mudar perfil</button>
            ${u.username==='admin'?'':`<button class="btn xs danger" onclick="deleteUser('${u.username}')">Excluir</button>`}
          </td>
        </tr>`).join('')}
    </tbody>
  </table></div>` : `<p class="muted">Nenhum usuário.</p>`;
}
function createAccess(){
  const name=$('accName').value.trim();
  const username=$('accUser').value.trim().toLowerCase();
  const password=$('accPass').value.trim();
  const role=$('accRole').value;
  if(!name||!username||!password||!role) return alert('Preencha todos os campos.');
  const users=getUsers();
  if(users.some(u=>u.username.toLowerCase()===username)) return alert('Login já existe.');
  users.push({name,username,password,role}); setUsers(users);
  ['accName','accUser','accPass'].forEach(id=>$(id).value=''); $('accRole').selectedIndex=0;
  renderAccessList(); alert('Acesso criado!');
}
function deleteUser(username){
  if(!confirm(`Excluir o usuário "${username}"?`)) return;
  const users=getUsers().filter(u=>u.username!==username);
  setUsers(users); renderAccessList();
}
function resetPassword(username){
  const np=prompt(`Nova senha para "${username}":`,''); if(np===null) return;
  const users=getUsers(); const u=users.find(x=>x.username===username); if(!u) return;
  u.password=(np||'').trim(); if(!u.password) return alert('Senha vazia.');
  setUsers(users); alert('Senha atualizada!');
}
function changeRole(username){
  const roles=Object.values(ROLES).join(', ');
  const choice=prompt(`Novo perfil para "${username}"\nOpções: ${roles}`, ROLES.COMERCIAL);
  if(choice===null) return;
  if(!Object.values(ROLES).includes(choice)) return alert('Perfil inválido.');
  const users=getUsers(); const u=users.find(x=>x.username===username); if(!u) return;
  u.role=choice; setUsers(users); renderAccessList();
}

/* Bloco de aprovadores (diretoria) injetado abaixo da tabela de acessos */
function ensureApproverBox(){
  const panel=$('panel-access');
  if(!panel.querySelector('#dirApproversBox')){
    const div=document.createElement('div');
    div.id='dirApproversBox';
    div.className='card';
    div.style.marginTop='14px';
    panel.appendChild(div);
  }
}
function renderApprovers(){
  const box=$('dirApproversBox'); const list=getApprovers();
  box.innerHTML = `
    <h2 style="margin:6px 0 12px">Diretoria — Aprovadores (Nome + PIN para assinatura)</h2>
    <div style="overflow:auto">
      <table>
        <thead><tr><th>#</th><th>Nome</th><th>PIN (4–8 dígitos)</th><th></th></tr></thead>
        <tbody>
          ${list.map((a,i)=>`
            <tr>
              <td>${i+1}</td>
              <td><input id="ap_name_${i}" value="${esc(a.name)}"></td>
              <td><input id="ap_pin_${i}" value="${esc(a.pin)}" maxlength="8"></td>
              <td style="text-align:right">
                <button class="btn xs ok" onclick="saveApprover(${i})">Salvar</button>
                <button class="btn xs danger" onclick="deleteApprover(${i})">Remover</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <div class="row" style="justify-content:flex-end;margin-top:10px">
      <button class="btn sm" onclick="addApprover()">Adicionar aprovador</button>
    </div>`;
}
function saveApprover(i){
  const list=getApprovers();
  const name=$('ap_name_'+i).value.trim();
  const pin=($('ap_pin_'+i).value||'').trim();
  if(!name||!pin) return alert('Informe nome e PIN.');
  if(!/^[0-9]{4,8}$/.test(pin)) return alert('PIN deve ter 4 a 8 dígitos numéricos.');
  list[i]={name,pin}; setApprovers(list); alert('Aprovador salvo!');
  renderApprovers();
}
function deleteApprover(i){
  const list=getApprovers(); list.splice(i,1); setApprovers(list); renderApprovers();
}
function addApprover(){
  const list=getApprovers(); list.push({name:'Novo Diretor', pin:'0000'}); setApprovers(list); renderApprovers();
}

/* =============== 7) CHECKLISTS (render/editar/CSV) =============== */
function fillAreaSelect(){
  const sel=$('areaSelect');
  sel.innerHTML = Object.values(ROLES)
    .filter(r=>![ROLES.ADMIN,ROLES.DIRETORIA,ROLES.COMERCIAL].includes(r))
    .map(r=>`<option>${r}</option>`).join('');
  sel.onchange=()=>renderAdminAreaView(sel.value);
  renderAdminAreaView(sel.value);
}
function renderAdminAreaView(area){ renderAreaTable(area,'areaWrap',true); }

function renderAreaTable(area, targetId, adminView=false){
  const db=getData(); const items=db[area]||[];
  const p=progressOf(area); const target=$(targetId);
  const header=`<div class="row" style="justify-content:space-between;margin-bottom:8px">
    <div class="kpi"><strong>${area}</strong><span>${p.pct}%</span></div>
    <div style="min-width:220px" class="progress"><div class="bar" style="width:${p.pct}%"></div></div>
  </div>`;
  const tools = adminView?`
    <div class="row" style="justify-content:flex-end;margin-bottom:8px">
      <button class="btn xs ok" onclick="markAll(true,'${area}')">Marcar todos</button>
      <button class="btn xs ghost" onclick="markAll(false,'${area}')">Desmarcar</button>
      <button class="btn xs" onclick="saveChecks()">Salvar</button>
      <button class="btn xs ghost" onclick="downloadCSV('${area}')">Exportar CSV</button>
    </div>`:'';
  const table=`
  <div style="overflow:auto">
    <table>
      <thead>
        <tr>
          <th style="min-width:220px">ITEM</th>
          <th style="min-width:200px">DESCRIÇÃO</th>
          <th colspan="4" style="text-align:center">IDA</th>
          <th colspan="2" style="text-align:center">VOLTA</th>
          <th style="min-width:160px">AP.</th>
        </tr>
        <tr>
          <th></th><th></th>
          <th>ANTIGO</th><th>NOVO</th><th>ENVIAR</th><th>SOBRA</th>
          <th>VOLTOU</th><th>FALTOU</th>
          <th>Ida / Volta</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((r,i)=>`
          <tr>
            <td>${esc(r.item)}</td>
            <td><input data-k="desc" data-i="${i}" value="${esc(r.desc||'')}" oninput="editRow(this,'${area}')"></td>

            <td><input type="number" min="0" data-k="antigo" data-i="${i}" value="${num(r.antigo)}" oninput="editRow(this,'${area}')"></td>
            <td><input type="number" min="0" data-k="novo"   data-i="${i}" value="${num(r.novo)}"   oninput="editRow(this,'${area}')"></td>
            <td style="text-align:center"><strong>${num(r.enviar)}</strong></td>
            <td style="text-align:center"><strong>${num(r.sobra)}</strong></td>

            <td><input type="number" min="0" data-k="voltou" data-i="${i}" value="${num(r.voltou)}" oninput="editRow(this,'${area}')"></td>
            <td style="text-align:center"><strong>${num(r.faltou)}</strong></td>

            <td>
              <label class="pill" style="display:inline-flex;gap:6px;align-items:center">
                <input type="checkbox" ${r.apIda?'checked':''} onchange="setAp('${area}',${i},'ida',this)"> Ida
              </label>
              <label class="pill" style="display:inline-flex;gap:6px;align-items:center">
                <input type="checkbox" ${r.apVolta?'checked':''} onchange="setAp('${area}',${i},'volta',this)"> Volta
              </label>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>`;
  target.innerHTML = header + tools + table;
}
/* Regra de cálculo:
   - ENVIAR = max(NOVO - ANTIGO, 0)
   - SOBRA  = max(ANTIGO - NOVO, 0)
   - FALTOU = max(ENVIAR - VOLTOU, 0)
*/
function editRow(el,area){
  const i=+el.dataset.i, k=el.dataset.k;
  const v=(el.type==='number')?Math.max(0,Number(el.value||0)):el.value;
  const db=getData(); const r=db[area][i];
  r[k]=v;

  r.enviar=Math.max(0, num(r.novo)-num(r.antigo));
  r.sobra =Math.max(0, num(r.antigo)-num(r.novo));
  r.faltou=Math.max(0, num(r.enviar)-num(r.voltou));

  setData(db);
  if($('areaTable')) renderAreaTable(area,'areaTable');
  if($('areaWrap'))  renderAreaTable(area,'areaWrap',true);
  renderDashboard();
}
function setAp(area,i,which,el){
  const db=getData(); const r=db[area][i];
  if(which==='ida')  r.apIda   = el.checked;
  if(which==='volta')r.apVolta = el.checked;
  setData(db);
  if($('areaTable')) renderAreaTable(area,'areaTable');
  if($('areaWrap'))  renderAreaTable(area,'areaWrap',true);
  renderDashboard();
}
function markAll(val,areaOpt){
  const area=areaOpt || (getUser()?.role);
  const db=getData(); (db[area]||[]).forEach(r=>{r.apIda=!!val; r.apVolta=val? r.apVolta : false;});
  setData(db);
  if($('areaTable')) renderAreaTable(area,'areaTable');
  if($('areaWrap'))  renderAreaTable(area,'areaWrap',true);
  renderDashboard();
}
function saveChecks(){ alert('Checklist salvo!'); }

/* CSV */
function toCSV(rows){
  const head=['ITEM','DESCRICAO','ANTIGO','NOVO','ENVIAR','SOBRA','VOLTOU','FALTOU','AP_IDA','AP_VOLTA'];
  const lines=rows.map(r=>[
    csvEsc(r.item), csvEsc(r.desc||''), num(r.antigo), num(r.novo), num(r.enviar), num(r.sobra),
    num(r.voltou), num(r.faltou), r.apIda?1:0, r.apVolta?1:0
  ].join(','));
  return head.join(',')+'\n'+lines.join('\n');
}
function downloadCSV(area){
  const db=getData(); const rows=db[area]||[];
  const blob=new Blob([toCSV(rows)],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`checklist_${area.toLowerCase()}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
}
function exportAreaCSV(){ const area=$('areaSelect').value; downloadCSV(area); }
function exportMyCSV(){ const u=getUser(); if(!u) return; downloadCSV(u.role); }

/* =============== 8) COMERCIAL — PROPOSTAS =============== */
function bindComercialTabs(){
  const sec=$('pageComercial');
  sec.querySelectorAll('.tab').forEach(btn=>{
    btn.onclick=()=>{
      sec.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
      sec.querySelectorAll('.panel').forEach(p=>p.classList.add('hide'));
      btn.classList.add('active');
      sec.querySelector(`#panel-${btn.dataset.tab}`).classList.remove('hide');
      if(btn.dataset.tab==='prop-my') renderMyProps();
    };
  });
}
function enviarProposta(){
  const u=getUser(); if(!u || u.role!==ROLES.COMERCIAL){ alert('Apenas Comercial.'); return; }
  const p={
    id:'P'+Date.now(), createdAt:new Date().toISOString(),
    createdBy:u.username, createdByName:u.name,
    dados:{
      ini:$('pIni').value, vendedor:$('pVend').value,
      shop:$('pShop').value, totalLojas:$('pTotalLojas').value, crm:$('pCRM').value,
      vagas:$('pVagas').value, adm:$('pAdm').value, rank:$('pRank').value, exec:$('pExec').value,
      tel:$('pTel').value, end:$('pEnd').value,
      montNoite:$('pMontNoite').value, desmNoite:$('pDesmNoite').value, dias:$('pDias').value, feriados:$('pFeriados').value,
      tema:$('pTema').value, m2:$('pM2').value, lic:$('pLic').value, pisos:$('pPisos').value, valor:$('pValor').value,
      pe:$('pPe').value, pracaProp:$('pPracaProp').value, qtdPracas:$('pQtdPracas').value,
      conc:$('pConc').value, bilheteConc:$('pBilheteConc').value,
      temaAnt:$('pTemaAnt').value, refParque:$('pRefParque').value, periodo:$('pPeriodo').value,
      aluguel:$('pAluguel').value, faturamento:$('pFaturamento').value,
      cp1:$('pCP1').value, cp2:$('pCP2').value, cp3:$('pCP3').value, cp4:$('pCP4').value,
      consider:$('pConsider').value, exig:$('pExig').value, cond:$('pCond').value, gold:$('pGold').value, comissao:$('pComissao').value
    },
    status:'PENDENTE',
    decision:null
  };
  if(!p.dados.shop || !p.dados.tema){ alert('Preencha ao menos: Nome do Shopping e Tema.'); return; }
  const all=getProps(); all.unshift(p); setProps(all);
  alert('Proposta enviada à Diretoria!');
  // abre a aba "Minhas Propostas"
  const sec=$('pageComercial');
  sec.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  sec.querySelector('[data-tab="prop-my"]').classList.add('active');
  $('panel-prop-new').classList.add('hide');
  $('panel-prop-my').classList.remove('hide');
  renderMyProps();
}
function statusBadge(st){ const c={PENDENTE:'#9ca3af',APROVADO:'#22c55e',NEGADO:'#ef4444'}[st]||'#9ca3af'; return `<span class="pill" style="color:${c};border-color:#2a3b66">${st}</span>`}
function propsTable(list, canAct){
  if(!list.length) return `<p class="muted">Nenhuma proposta.</p>`;
  const rows=list.map(p=>{
    const d=p.dados, dt=new Date(p.createdAt).toLocaleString();
    const dec=p.decision?`<div class="s muted">Por: <b>${esc(p.decision.name)}</b> em ${new Date(p.decision.when).toLocaleString()}<br>Obs.: ${esc(p.decision.obs||'-')}</div>`:'';
    return `<tr>
      <td><strong>${esc(p.id)}</strong><br><span class="s muted">${dt}</span></td>
      <td><b>${esc(d.shop)}</b><br><span class="s muted">${esc(d.tema)} • ${esc(d.periodo||'-')}</span></td>
      <td>${statusBadge(p.status)}${dec}</td>
      <td style="text-align:right">${canAct?dirActions(p.id):''}</td>
    </tr>`;
  }).join('');
  return `<div style="overflow:auto"><table>
    <thead><tr><th>ID</th><th>Resumo</th><th>Status</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
function renderMyProps(){ const u=getUser(); if(!u) return; $('myPropsWrap').innerHTML=propsTable(getProps().filter(p=>p.createdBy===u.username), false); }

/* =============== 9) DIRETORIA — VER/DECIDIR PROPOSTAS =============== */
function renderDirProps(){
  $('dirPropsWrap').innerHTML = propsTable(getProps(), true);
  $('dirPropDetail').innerHTML = '';
}
function dirActions(id){
  return `<div class="row" style="justify-content:flex-end">
    <button class="btn xs ghost" onclick="verProposta('${id}')">Abrir</button>
    <button class="btn xs ok" onclick="aprovarProposta('${id}')">Aprovar</button>
    <button class="btn xs danger" onclick="negarProposta('${id}')">Negar</button>
  </div>`;
}
function verProposta(id){
  const p=getProps().find(x=>x.id===id); if(!p) return;
  const d=p.dados;
  $('dirPropDetail').innerHTML = `
    <div class="card" style="margin-top:12px">
      <h3 style="margin:0 0 10px">Proposta ${esc(p.id)} — ${esc(d.shop)}</h3>

      <h4>Início & Responsável</h4>
      <div class="grid-3">
        <div class="field"><label>Início</label><input readonly value="${esc(d.ini||'')}"></div>
        <div class="field"><label>Vendedor</label><input readonly value="${esc(d.vendedor||'')}"></div>
        <div class="field"><label>CRM</label><input readonly value="${esc(d.crm||'')}"></div>
      </div>

      <h4 style="margin-top:10px">Dados do Shopping</h4>
      <div class="grid-3">
        <div class="field"><label>Shopping</label><input readonly value="${esc(d.shop||'')}"></div>
        <div class="field"><label>Total de Lojas</label><input readonly value="${esc(d.totalLojas||'')}"></div>
        <div class="field"><label>Administração</label><input readonly value="${esc(d.adm||'')}"></div>
        <div class="field"><label>Ranking Google</label><input readonly value="${esc(d.rank||'')}"></div>
        <div class="field"><label>Executivo</label><input readonly value="${esc(d.exec||'')}"></div>
        <div class="field"><label>Telefones</label><input readonly value="${esc(d.tel||'')}"></div>
        <div class="field" style="grid-column:1/-1"><label>Endereço</label><input readonly value="${esc(d.end||'')}"></div>
      </div>

      <h4 style="margin-top:10px">Proposta do Shopping</h4>
      <div class="grid-3">
        <div class="field"><label>Tema</label><input readonly value="${esc(d.tema||'')}"></div>
        <div class="field"><label>Metragem (m²)</label><input readonly value="${esc(d.m2||'')}"></div>
        <div class="field"><label>Valor</label><input readonly value="${esc(d.valor||'')}"></div>
        <div class="field"><label>Pé direito</label><input readonly value="${esc(d.pe||'')}"></div>
        <div class="field"><label>Praça proposta</label><input readonly value="${esc(d.pracaProp||'')}"></div>
        <div class="field"><label>Qtd praças</label><input readonly value="${esc(d.qtdPracas||'')}"></div>
        <div class="field"><label>Licenciado</label><input readonly value="${esc(d.lic||'')}"></div>
        <div class="field"><label>Quantos pisos</label><input readonly value="${esc(d.pisos||'')}"></div>
        <div class="field"><label>Feriados no período</label><input readonly value="${esc(d.feriados||'')}"></div>
        <div class="field"><label>Períodos em dias</label><input readonly value="${esc(d.dias||'')}"></div>
        <div class="field"><label>Noite da montagem</label><input readonly value="${esc(d.montNoite||'')}"></div>
        <div class="field"><label>Noite da desmontagem</label><input readonly value="${esc(d.desmNoite||'')}"></div>
        <div class="field"><label>Concorrência</label><input readonly value="${esc(d.conc||'')}"></div>
        <div class="field"><label>Bilheteria concorrente</label><input readonly value="${esc(d.bilheteConc||'')}"></div>
      </div>

      <h4 style="margin-top:10px">Referências de Faturamento</h4>
      <div class="grid-3">
        <div class="field"><label>Tema (se já operamos)</label><input readonly value="${esc(d.temaAnt||'')}"></div>
        <div class="field"><label>Referência (se não operamos)</label><input readonly value="${esc(d.refParque||'')}"></div>
        <div class="field"><label>Período</label><input readonly value="${esc(d.periodo||'')}"></div>
        <div class="field"><label>Aluguel</label><input readonly value="${esc(d.aluguel||'')}"></div>
        <div class="field" style="grid-column:1/-1"><label>Faturamento total</label><input readonly value="${esc(d.faturamento||'')}"></div>
      </div>

      <h4 style="margin-top:10px">Negociação</h4>
      <div class="grid-3">
        <div class="field"><label>1ª contraproposta</label><input readonly value="${esc(d.cp1||'')}"></div>
        <div class="field"><label>2ª contraproposta</label><input readonly value="${esc(d.cp2||'')}"></div>
        <div class="field"><label>3ª contraproposta</label><input readonly value="${esc(d.cp3||'')}"></div>
        <div class="field"><label>4ª contraproposta</label><input readonly value="${esc(d.cp4||'')}"></div>
      </div>

      <h4 style="margin-top:10px">Condições & Observações</h4>
      <div class="grid-3">
        <div class="field"><label>Condições</label><input readonly value="${esc(d.cond||'')}"></div>
        <div class="field"><label>Negociação GOLD</label><input readonly value="${esc(d.gold||'Não')}"></div>
        <div class="field"><label>Comissão</label><input readonly value="${esc(d.comissao||'')}"></div>
        <div class="field" style="grid-column:1/-1"><label>Exigências do shopping</label><textarea rows="3" readonly>${esc(d.exig||'')}</textarea></div>
        <div class="field" style="grid-column:1/-1"><label>Considerações finais</label><textarea rows="3" readonly>${esc(d.consider||'')}</textarea></div>
      </div>
    </div>`;
}
function aprovarProposta(id){ decidirProposta(id,true); }
function negarProposta(id){ decidirProposta(id,false); }
function decidirProposta(id,isApprove){
  const u=getUser(); if(!u || u.role!==ROLES.DIRETORIA){ alert('Apenas Diretoria.'); return; }

  const list=getApprovers();
  if(!list.length) return alert('Nenhum aprovador cadastrado. Cadastre no Admin > Acessos.');
  const nomes=list.map(a=>a.name).join('\n - ');
  const nome=prompt(`Digite seu NOME exatamente como cadastrado:\n - ${nomes}\n\nNome:`,'');

  if(nome===null) return;
  const ap=list.find(a=>a.name.trim().toLowerCase()===String(nome).trim().toLowerCase());
  if(!ap) return alert('Nome não encontrado nos aprovadores.');

  const pin=prompt(`Olá, ${ap.name}. Digite seu PIN para ${isApprove?'aprovar':'negar'}:`,'');

  if(pin===null) return;
  if(ap.pin!==String(pin)) return alert('PIN inválido.');

  const obs=prompt('Observação (opcional):','')||'';
  const all=getProps(); const p=all.find(x=>x.id===id); if(!p) return;
  p.status=isApprove?'APROVADO':'NEGADO';
  p.decision={ by:ap.name, name:ap.name, when:new Date().toISOString(), obs };
  setProps(all);
  alert(isApprove?'Proposta aprovado!':'Proposta negada.');
  renderDirProps();
}

/* =============== 10) INICIALIZAÇÃO (listeners + initUI) =============== */
/* Garante que eventos estão conectados e a UI inicial renderiza */
function wireEvents(){
  // Login form (evita depender do onsubmit inline)
  const form = $('loginForm');
  if(form) form.addEventListener('submit', doLogin);

  // Botão "Resetar sessão"
  const btnReset = $('btnReset');
  if(btnReset) btnReset.addEventListener('click', resetSession);

  // Comercial
  const btnEnviar = $('btnEnviarProposta');
  if(btnEnviar) btnEnviar.addEventListener('click', enviarProposta);

  // Área (botoes de topo)
  $('btnMarkAll')?.addEventListener('click', ()=>markAll(true));
  $('btnUnmarkAll')?.addEventListener('click', ()=>markAll(false));
  $('btnSaveChecks')?.addEventListener('click', saveChecks);
  $('btnExportMy')?.addEventListener('click', exportMyCSV);

  // Admin > Acessos: criar
  $('btnCreateAccess')?.addEventListener('click', createAccess);
}

/* Dispara quando o HTML terminou de carregar */
document.addEventListener('DOMContentLoaded', ()=>{
  try{
    wireEvents();
    initUI();
  }catch(err){
    console.error('Erro ao inicializar:', err);
    alert('Erro ao iniciar a aplicação. Veja o console (F12).');
  }
});

/* Fallback (em alguns navegadores abrindo arquivo local, o DOMContentLoaded pode falhar) */
if (document.readyState !== 'loading') {
  try{
    wireEvents();
    initUI();
  }catch(e){
    console.error('Fallback init error:', e);
  }
}
