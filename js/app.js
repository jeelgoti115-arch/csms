// Simple client-side app to simulate workflow using localStorage
(function(){
  // Minimal compatibility: current user kept in localStorage, all persistent data stored on backend.
  const LS_CUR='vs_current';

  function id(){return Math.random().toString(36).slice(2,9)}

  async function load(){
    const res = await fetch('/api/data');
    if(!res.ok) return {users:[],vehicles:[],contacts:[]};
    return await res.json();
  }

  // keep current user client-side (no sessions implemented)
  function currentUser(){return JSON.parse(localStorage.getItem(LS_CUR)||'null')}
  function setCurrent(u){localStorage.setItem(LS_CUR,JSON.stringify(u))}
  function clearCurrent(){localStorage.removeItem(LS_CUR)}

  // Notifications
  function ensureNotify(){
    let n = document.getElementById('vs-notify')
    if(!n){ n = document.createElement('div'); n.id='vs-notify'; document.body.appendChild(n) }
    return n
  }
  function notify(msg,type='info',timeout=3000){
    const n = ensureNotify();
    n.textContent = msg;
    n.className = 'notify '+(type||'info');
    clearTimeout(n._t);
    n.style.display='block';
    n._t = setTimeout(()=>{ n.style.display='none' }, timeout);
  }

  // Auth
  async function register(name,email,password,role){
    // Registration via public endpoints is disabled. User creation must be performed by an Admin.
    return {ok:false,msg:'Registration disabled. Contact administrator or use Admin panel.'}
  }

  async function login(email,password){
    try{
      const res = await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})})
      if(res.status===401) return {ok:false,msg:'Invalid credentials'}
      if(!res.ok) return {ok:false,msg:'Login failed'}
      const j = await res.json();
      if(currentUser()) return {ok:false,msg:'Another user already logged in. Logout first.'}
      setCurrent(j.user);
      return {ok:true,user:j.user}
    }catch(e){ return {ok:false,msg:e.message} }
  }

  // Vehicles
  async function addVehicle(plate,owner,by){
    try{
      const res = await fetch('/api/vehicles',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({plate,owner,createdBy:by})})
      if(!res.ok) throw new Error('Failed to add vehicle')
      return await res.json()
    }catch(e){ return null }
  }

  async function updateVehicle(id,changes,actor,note){
    try{
      const res = await fetch('/api/vehicles/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({changes,actor,note})})
      if(!res.ok) return null
      return await res.json()
    }catch(e){ return null }
  }

  // UI helpers
  function el(q){return document.querySelector(q)}
  function elAll(q){return Array.from(document.querySelectorAll(q))}

  // Page renderers
  async function renderAuth(){
    const cur=currentUser();
    const navAuth=el('#nav-auth');
    if(navAuth) {
      navAuth.textContent = cur? `${cur.name} (${cur.role})`:'Login'
      navAuth.href = 'logreg.html'
    }
    // show role-specific links
    const nav = document.querySelector('nav')
    if(nav){
      // remove any existing role links
      elAll('.role-link').forEach(n=>n.remove())
      if(cur){
        const rolePage = {guard:'guard.html',receptionist:'receptionist.html',advisor:'advisor.html',technician:'technician.html',qc:'qc.html',admin:'admin.html'}[cur.role]
        if(rolePage){
          const a = document.createElement('a'); a.href=rolePage; a.className='role-link'; a.textContent='Dashboard'; nav.appendChild(a)
        }
        // add logout quick link
        const logoutQuick = document.createElement('a'); logoutQuick.href='#'; logoutQuick.className='role-link'; logoutQuick.textContent='Logout'; logoutQuick.onclick=function(e){e.preventDefault(); logout();}
        nav.appendChild(logoutQuick)
      }
    }
    // login form
    const loginForm=el('#loginForm');
    if(loginForm){
      loginForm.onsubmit=async function(e){
        e.preventDefault();
        const emailEl = el('#loginEmail'), pwEl = el('#loginPassword')
        if(!emailEl || !pwEl) return notify('Missing login fields','error')
        const r=await login(emailEl.value.trim(), pwEl.value)
        if(r.ok){ notify('Welcome '+r.user.name,'success'); await renderAuth(); setTimeout(()=>location.href='index.html',600) } else notify(r.msg,'error')
      }
    }
    const regForm=el('#regForm');
    if(regForm){
      regForm.onsubmit=async function(e){
        e.preventDefault();
        const nameEl = el('#regName'), emailEl = el('#regEmail'), pwEl = el('#regPassword'), roleEl = el('#regRole')
        if(!nameEl || !emailEl || !pwEl || !roleEl) return notify('Missing registration fields','error')
        if(pwEl.value.length < 4) return notify('Password too short','warn')
        const r=await register(nameEl.value.trim(), emailEl.value.trim(), pwEl.value, roleEl.value)
        if(r.ok) notify('Registered. Please login.','success'); else notify(r.msg||'Registration failed','error')
      }
    }
    const logoutBtn=el('#logoutBtn');
    if(logoutBtn){
      logoutBtn.onclick=function(){ logout() }
      if(currentUser()) logoutBtn.classList.remove('hidden'); else logoutBtn.classList.add('hidden')
    }
  }

  function logout(){ clearCurrent(); renderAuth(); notify('Logged out','info'); setTimeout(()=>location.href='index.html',400) }

  function renderIndex(){
    const f=el('#startForm');
    if(!f) return
    f.onsubmit=function(e){
      e.preventDefault();
      const plateEl = el('#vehiclePlate')
      if(!plateEl) return notify('Missing plate field','error')
      const plate = plateEl.value.trim()
      if(!plate) return notify('Enter plate','warn')
      localStorage.setItem('vs_pending_plate',plate);
      notify('Please login to record vehicle','info',1500);
      setTimeout(()=>location.href='logreg.html',600)
    }
  }

  function requireRole(roleList){
    const cur=currentUser();
    if(!cur){alert('Please login first');location.href='logreg.html';return false}
    if(!roleList.includes(cur.role) && cur.role!=='admin'){alert('Access denied for role: '+cur.role);location.href='index.html';return false}
    return true
  }

  function time(t){return new Date(t).toLocaleString()}

  async function renderGuard(){
    const list=el('#guardList');
    const form=el('#guardForm');
    // nothing to render on this page
    if(!list && !form) return
    if(!requireRole(['guard'])) return
    if(form){
      form.onsubmit=async function(e){
        e.preventDefault();
        const pEl = el('#g_plate'), oEl = el('#g_owner')
        if(!pEl || !oEl) return alert('Missing vehicle fields')
        const p = pEl.value.trim(), o = oEl.value.trim()
        if(!p || !o) return alert('Enter plate and owner')
        const cur=currentUser();
        await addVehicle(p,o,cur?cur.name:'guard');
        form.reset();
        await renderGuard();
      }
    }
    const vehicles=(await load()).vehicles.filter(v=>v.status==='entered' || v.status==='new')
    if(list) list.innerHTML=`<div class="counts">${vehicles.length} pending</div>`+vehicles.map(v=>`<div class="vehicle"><strong>${v.plate}</strong><div class="meta">Owner: ${v.owner} • ${v.status}</div><div class="actions"></div></div>`).join('')
  }

  async function renderReceptionist(){
    const container=el('#receptionList');
    if(!container) return
    if(!requireRole(['receptionist'])) return
    const vehicles=(await load()).vehicles.filter(v=>['entered','ready_for_delivery','delivered','with_advisor','with_technician','service_done','with_qc'].includes(v.status))
    container.innerHTML=`<div class="counts">Total: ${vehicles.length}</div>`+vehicles.map(v=>{
      const assignBtn=(v.status==='entered')?`<button data-action="assign" data-id="${v.id}">Assign to Advisor</button>`:''
      const deliverBtn=(v.status==='ready_for_delivery')?`<button data-action="deliver" data-id="${v.id}">Deliver</button>`:''
      return `<div class="vehicle"><strong>${v.plate}</strong><div class="meta">${v.owner} • ${v.status}</div><div class="actions">${assignBtn}${deliverBtn}<button data-id="${v.id}" class="toggle-h">History</button></div><div class="history" data-id="hist-${v.id}" style="display:none">${JSON.stringify(v.history||[],null,2)}</div></div>`
    }).join('')
    const btns = container.querySelectorAll('button[data-action]')
    if(btns.length) btns.forEach(b=>b.onclick=async function(){
      const id=b.dataset.id
      if(b.dataset.action==='assign'){ await updateVehicle(id,{status:'with_advisor'},(currentUser()||{}).name||'receptionist','Assigned to advisor'); notify('Assigned to advisor','success'); await renderReceptionist() }
      if(b.dataset.action==='deliver'){ await updateVehicle(id,{status:'delivered'},(currentUser()||{}).name||'receptionist','Delivered'); notify('Delivered','success'); await renderReceptionist() }
    })
    container.querySelectorAll('button.toggle-h').forEach(btn=>btn.onclick=function(){ const id=btn.dataset.id; const h = el(`[data-id=hist-${id}]`); if(!h) return; h.style.display = h.style.display==='none'?'block':'none' })
  }

  async function renderAdvisor(){
    const container=el('#advisorList');
    if(!container) return
    if(!requireRole(['advisor'])) return
    const vehicles=(await load()).vehicles.filter(v=>v.status==='with_advisor' || v.status==='service_done')
    container.innerHTML=`<div class="counts">${vehicles.length} assigned</div>`+vehicles.map(v=>{
      const toTech=(v.status==='with_advisor')?`<button data-id="${v.id}" data-act="toTech">Assign to Technician</button>`:''
      const toQc=(v.status==='service_done')?`<button data-id="${v.id}" data-act="toQc">Send to QC</button>`:''
      return `<div class="vehicle"><strong>${v.plate}</strong><div class="meta">${v.owner} • ${v.status}</div><div class="actions">${toTech}${toQc}<button data-id="${v.id}" class="toggle-h">History</button></div><div class="history" data-id="hist-${v.id}" style="display:none">${JSON.stringify(v.history||[],null,2)}</div></div>`
    }).join('')
    const acts = container.querySelectorAll('button[data-act]')
    if(acts.length) acts.forEach(b=>b.onclick=async function(){
      const id=b.dataset.id
      if(b.dataset.act==='toTech'){ await updateVehicle(id,{status:'with_technician'},(currentUser()||{}).name||'advisor','Assigned to technician'); notify('Assigned to technician','success'); await renderAdvisor() }
      if(b.dataset.act==='toQc'){ await updateVehicle(id,{status:'with_qc'},(currentUser()||{}).name||'advisor','Sent to QC'); notify('Sent to QC','success'); await renderAdvisor() }
    })
    container.querySelectorAll('button.toggle-h').forEach(btn=>btn.onclick=function(){ const id=btn.dataset.id; const h = el(`[data-id=hist-${id}]`); if(!h) return; h.style.display = h.style.display==='none'?'block':'none' })
  }

  async function renderTechnician(){
    const container=el('#technicianList');
    if(!container) return
    if(!requireRole(['technician'])) return
    const vehicles=(await load()).vehicles.filter(v=>v.status==='with_technician')
    container.innerHTML=`<div class="counts">${vehicles.length} in queue</div>`+vehicles.map(v=>`<div class="vehicle"><strong>${v.plate}</strong><div class="meta">${v.owner}</div><div class="actions"><button data-id="${v.id}" class="done">Mark Service Done</button><button data-id="${v.id}" class="toggle-h">History</button></div><div class="history" data-id="hist-${v.id}" style="display:none">${JSON.stringify(v.history||[],null,2)}</div></div>`).join('')
    const doneBtns = container.querySelectorAll('button.done')
    if(doneBtns.length) doneBtns.forEach(b=>b.onclick=async function(){ await updateVehicle(b.dataset.id,{status:'service_done'},(currentUser()||{}).name||'technician','Service completed'); notify('Service marked done','success'); await renderTechnician() })
    container.querySelectorAll('button.toggle-h').forEach(btn=>btn.onclick=function(){ const id=btn.dataset.id; const h = el(`[data-id=hist-${id}]`); if(!h) return; h.style.display = h.style.display==='none'?'block':'none' })
  }

  async function renderQC(){
    const container=el('#qcList');
    if(!container) return
    if(!requireRole(['qc'])) return
    const vehicles=(await load()).vehicles.filter(v=>v.status==='with_qc')
    container.innerHTML=`<div class="counts">${vehicles.length} to inspect</div>`+vehicles.map(v=>`<div class="vehicle"><strong>${v.plate}</strong><div class="meta">${v.owner}</div><div class="actions"><button data-id="${v.id}" class="pass">Mark Ready for Delivery</button><button data-id="${v.id}" class="toggle-h">History</button></div><div class="history" data-id="hist-${v.id}" style="display:none">${JSON.stringify(v.history||[],null,2)}</div></div>`).join('')
    const passBtns = container.querySelectorAll('button.pass')
    if(passBtns.length) passBtns.forEach(b=>b.onclick=async function(){ await updateVehicle(b.dataset.id,{status:'ready_for_delivery'},(currentUser()||{}).name||'qc','QC passed'); notify('QC approved','success'); await renderQC() })
    container.querySelectorAll('button.toggle-h').forEach(btn=>btn.onclick=function(){ const id=btn.dataset.id; const h = el(`[data-id=hist-${id}]`); if(!h) return; h.style.display = h.style.display==='none'?'block':'none' })
  }

  async function renderAdmin(){
    const container=el('#adminControls');
    if(!container) return
    if(!requireRole(['admin'])) return
    const data=await load()
    container.innerHTML=`<h3>Users</h3>`+data.users.map(u=>`<div>${u.name} (${u.role})</div>`).join('')+`<h3>Vehicles</h3>`+data.vehicles.map(v=>`<div class="vehicle"><strong>${v.plate}</strong><div class="meta">${v.owner} • ${v.status}</div><div class="history">${JSON.stringify(v.history||[],null,2)}</div></div>`).join('')+`<p><button id="adminReset">Reset Data</button></p>`
    const resetBtn = el('#adminReset')
    if(resetBtn) resetBtn.onclick=function(){ if(confirm('Clear all data?')){ localStorage.clear(); notify('Data cleared','info'); location.reload() } }
    renderAdminContactMessages()
  }

  async function renderAdminContactMessages(){
    const container=el('#contact-messages-container');
    if(!container) return
    const data=await load()
    const messages=data.contacts||[]
    
    if(messages.length===0){
      container.innerHTML='<p style="text-align:center;color:#999;">No contact messages yet</p>'
      return
    }
    
    container.innerHTML='<table style="width:100%;border-collapse:collapse;">'+
      '<thead><tr style="background:#f5f5f5;border-bottom:2px solid #ddd;">'+
        '<th style="padding:12px;text-align:left;">Name</th>'+
        '<th style="padding:12px;text-align:left;">Email</th>'+
        '<th style="padding:12px;text-align:left;">Type</th>'+
        '<th style="padding:12px;text-align:left;">Message</th>'+
        '<th style="padding:12px;text-align:left;">Status</th>'+
        '<th style="padding:12px;text-align:center;">Action</th>'+
      '</tr></thead>'+
      '<tbody>'+
      messages.map(m=>`
        <tr style="border-bottom:1px solid #eee;" id="msg-${m.id}">
          <td style="padding:12px;"><strong>${m.name}</strong></td>
          <td style="padding:12px;"><a href="mailto:${m.email}">${m.email}</a></td>
          <td style="padding:12px;"><span style="background:#3b82f6;color:white;padding:4px 8px;border-radius:4px;font-size:0.85rem;">${m.problemType}</span></td>
          <td style="padding:12px;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.description.substring(0,50)}...</td>
          <td style="padding:12px;"><span style="background:${m.status==='new'?'#fbbf24':m.status==='responded'?'#10b981':'#6b7280'};color:white;padding:4px 8px;border-radius:4px;font-size:0.85rem;">${m.status}</span></td>
          <td style="padding:12px;text-align:center;"><button onclick="viewContactMessage('${m.id}')" style="padding:6px 12px;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;">View</button></td>
        </tr>
      `).join('')+
      '</tbody></table>'
  }

  window.viewContactMessage=async function(msgId){
    const data=await load()
    const msg=data.contacts.find(c=>c.id==msgId)
    if(!msg){notify('Message not found','error');return}
    
    const response=prompt('Send response to '+msg.name+' ('+msg.email+'):\n\n--- ORIGINAL MESSAGE ---\n'+msg.description+'\n\n--- YOUR RESPONSE ---\nType your response below:','')
    if(response===null) return
    if(!response.trim()){notify('Response cannot be empty','error');return}

    const changes = { adminResponse: response, respondedAt: new Date().toISOString(), status: 'responded' }
    try{
      const res = await fetch('/api/contacts/'+msgId,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({changes})})
      if(!res.ok) return notify('Failed to save response','error')
      notify('Response saved! Email notification sent to '+msg.email,'success')
      await renderAdminContactMessages()
    }catch(e){ notify('Failed to save response: '+e.message,'error') }
  }

  // Auto-add pending plate from index redirect
  function handlePending(){
    const p=localStorage.getItem('vs_pending_plate');
    if(!p) return
    const cur=currentUser()
    if(!cur){alert('Please login to record vehicle');location.href='logreg.html';return}
    addVehicle(p,cur.name,cur.name);
    localStorage.removeItem('vs_pending_plate');
    alert('Vehicle recorded');
    location.href='index.html'
  }

  // Kick off render on DOMContentLoaded
  document.addEventListener('DOMContentLoaded',function(){ renderAuth(); renderIndex(); handlePending(); renderGuard(); renderReceptionist(); renderAdvisor(); renderTechnician(); renderQC(); renderAdmin(); })

})();
