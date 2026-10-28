const $=s=>document.querySelector(s), MAN='Other (type manually)';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt=d=>{if(!d)return'—';const[y,m,x]=d.split('-');return `${x} ${MON[m-1]} ${y}`};
let S,person,tasks=[],visibleTasks=[],editId=null,formPerson=null;

async function api(p,m='GET',b){
  const r=await fetch(p,{method:m,headers:{'Content-Type':'application/json'},body:b?JSON.stringify(b):undefined});
  const j=await r.json(); if(!r.ok) throw new Error(j.error||'Error'); return j;
}
const opts=(el,a)=>el.innerHTML=a.map(x=>`<option>${esc(x)}</option>`).join('');
const KEY=location.pathname.startsWith('/leadership/')?decodeURIComponent(location.pathname.split('/')[2]||''):'';
if(KEY){opts($('#lName'),['Bana','Shanto']);$('#login h1').textContent='Leadership sign in';}

async function boot(){
  try{ S=await api('/api/me'); if((S.role==='member')===!!KEY){ await api('/api/logout','POST'); throw 0; } start(); }
  catch(e){ $('#login').hidden=false; $('#app').hidden=true; }
}
function start(){
  $('#login').hidden=true; $('#app').hidden=false;
  $('#who').textContent=(S.role=='admin'?'Admin · ':S.role=='viewer'?'Viewer · ':'')+S.user; $('#add').hidden=!S.canEdit;
  opts($('#mDept'),S.departments); opts($('#mReq'),[...S.reqFrom,MAN]);
  opts($('#mPerson'),S.people);
  $('#tabs').hidden=false;
  $('#tabs').innerHTML=(S.role!=='member'?'<button class="tab" data-p="__sum">Summary</button>':'')
    +'<button class="tab" data-p="__today">Today</button>'+S.people.map(p=>`<button class="tab" data-p="${p}">${p}</button>`).join('');
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>pick(b.dataset.p));
  pick(S.role==='member'?S.people[0]:'__sum');
}
function pick(p){
  person=p; const sm=p==='__sum';
  const td=p==='__today';
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.p===p));
  $('#sheet').hidden=sm; $('#stats').hidden=sm; $('#sum').hidden=!sm;
  $('#personHead').hidden=!td;
  $('#actionHead').hidden=td;
  $('#download').hidden=S.role!=='admin'||sm;
  $('#add').hidden=!S.canEdit||td;
  sm?summary():td?loadToday():load();
}
async function summary(){
  const rows=(await api('/api/summary')).rows;
  const agg=(key,order)=>{const m={};order.forEach(k=>m[k]={t:0,c:0});
    rows.forEach(r=>{const k=r[key]||'—';const o=m[k]??={t:0,c:0};o.t++;if(r.status==='Completed')o.c++});return Object.entries(m)};
  const tbl=(title,list,first)=>`<div class="glass sumc"><h3>${title}</h3><div class="tw"><table><thead><tr><th>${first}</th><th>Total</th><th>Completed</th><th>Pending</th><th>Progress</th></tr></thead><tbody>${
    list.map(([k,o])=>`<tr><td><b>${esc(k)}</b></td><td>${o.t}</td><td>${o.c}</td><td>${o.t-o.c}</td><td><div class="bar"><i style="width:${o.t?Math.round(o.c/o.t*100):0}%"></i></div></td></tr>`).join('')}</tbody></table></div></div>`;
  const C=rows.filter(r=>r.status==='Completed').length;
  $('#sum').innerHTML=`<div class="stats">${[['Total tasks',rows.length],['Pending',rows.length-C],['Completed',C]].map(([l,v])=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>`
    +tbl('Team',agg('person',S.people),'Member')+tbl('Department',agg('department',S.departments),'Department')+tbl('Requested From',agg('req_from',S.reqFrom),'Req from');
}
async function load(){ tasks=(await api('/api/tasks?person='+encodeURIComponent(person))).tasks; render(); }
async function loadToday(){ tasks=(await api('/api/today')).tasks; render(); }

function render(){
  const todayView=person==='__today';
  const n=s=>tasks.filter(t=>t.status===s).length;
  $('#stats').innerHTML=[['Total',tasks.length],['Pending',n('Pending')],['Completed',n('Completed')]]
    .map(([l,v])=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  const q=$('#q').value.toLowerCase(), fs=$('#fs').value;
  const list=tasks.filter(t=>(!fs||t.status===fs)&&(!q||(t.task+t.department+t.req_from+(todayView?t.person:'')).toLowerCase().includes(q)));
  visibleTasks=list;
  $('#empty').hidden=list.length>0;
  $('#body').innerHTML=list.map(t=>`<tr>${todayView?`<td>${esc(t.person)}</td>`:''}<td>${fmt(t.date)}</td><td class="t">${esc(t.task)}</td><td>${esc(t.department)}</td>
    <td>${esc(t.req_from)}</td><td>${S.canEdit&&!todayView?`<select class="stsel ${t.status}" onchange="quickStatus(${t.id},this.value)"><option${t.status==='Pending'?' selected':''}>Pending</option><option${t.status==='Completed'?' selected':''}>Completed</option></select>`:`<span class="badge ${t.status}">${t.status}</span>`}</td><td>${fmt(t.completed_date)}</td>
    ${todayView?'':`<td>${S.canEdit?`<button class="edit" onclick="openForm(${t.id})">Edit</button>`:''}</td>`}</tr>`).join('');
}

function downloadCsv(){
  const headers=['Member','Date','Task','Department','Req from','Status','Completed'];
  const cell=value=>{
    let text=String(value??'');
    if(/^[\t\r\n ]*[=+\-@]/.test(text)) text="'"+text;
    return `"${text.replace(/"/g,'""')}"`;
  };
  const rows=visibleTasks.map(t=>[t.person||person,t.date,t.task,t.department,t.req_from,t.status,t.completed_date]);
  const csv='\uFEFF'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');
  link.href=url;
  link.download=`tasks-${person==='__today'?'today':person.toLowerCase()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function downloadPdf(){
  const params=new URLSearchParams({
    person,
    status:$('#fs').value,
    search:$('#q').value
  });
  const response=await fetch(`/api/tasks/export.pdf?${params}`);
  if(!response.ok){
    let message='Unable to download PDF';
    try{ message=(await response.json()).error||message; }catch(e){ /* Keep the download error message. */ }
    throw new Error(message);
  }
  const url=URL.createObjectURL(await response.blob());
  const link=document.createElement('a');
  link.href=url;
  link.download=`tasks-${person==='__today'?'today':person.toLowerCase()}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

async function downloadSelected(){
  const format=$('#download').value;
  $('#download').value='';
  try{
    if(format==='csv') downloadCsv();
    if(format==='pdf') await downloadPdf();
  }catch(e){ alert(e.message); }
}

async function quickStatus(id,v){
  if(person==='__today') return;
  const t=tasks.find(x=>x.id===id);
  try{ await api('/api/tasks','POST',{id,person:t.person||person,date:t.date,task:t.task,department:t.department,req_from:t.req_from,
    status:v,completed_date:v==='Completed'?(t.completed_date||''):''}); }catch(e){ alert(e.message); }
  person==='__today'?loadToday():load();
}
function reqUI(){ $('#mMan').hidden=$('#mReq').value!==MAN; }
function stUI(){
  const done=$('#mSt').value==='Completed'; $('#dBox').hidden=!done;
  if(done&&!$('#mDone').value) $('#mDone').value=S.today; if(!done) $('#mDone').value='';
}
function openForm(id){
  if(person==='__today') return;
  editId=id||null; const t=id?tasks.find(x=>x.id===id):null;
  formPerson=t?t.person:(person==='__today'?(S.role==='member'?S.user:S.people[0]):person);
  $('#mT').textContent=t?'Edit task':'Add task';
  $('#personBox').hidden=!(person==='__today'&&S.role==='admin'&&!t);
  $('#mPerson').value=formPerson;
  $('#mDate').value=t?t.date:S.today; $('#mTask').value=t?t.task:'';
  $('#mDept').value=t?t.department:S.departments[0]; $('#mSt').value=t?t.status:'Pending';
  $('#mDone').value=t?t.completed_date:'';
  const manual=t&&t.req_from&&!S.reqFrom.includes(t.req_from);
  $('#mReq').value=manual?MAN:(t?t.req_from:S.reqFrom[0]); $('#mMan').value=manual?t.req_from:'';
  $('#mDel').hidden=!t; $('#mErr').textContent=''; reqUI(); stUI(); $('#modal').hidden=false;
}
async function save(){
  const req=$('#mReq').value===MAN?$('#mMan').value.trim():$('#mReq').value;
  if(!$('#mTask').value.trim()) return $('#mErr').textContent='Please enter the task';
  if(!req) return $('#mErr').textContent='Please enter who requested it';
  try{
    formPerson=person==='__today'&&S.role==='admin'&&!editId?$('#mPerson').value:formPerson;
    await api('/api/tasks','POST',{id:editId,person:formPerson,date:$('#mDate').value,task:$('#mTask').value,department:$('#mDept').value,
      req_from:req,status:$('#mSt').value,completed_date:$('#mDone').value});
    $('#modal').hidden=true; person==='__today'?loadToday():load();
  }catch(e){ $('#mErr').textContent=e.message; }
}

$('#lGo').onclick=async()=>{ try{ await api('/api/login','POST',{name:$('#lName').value,key:KEY}); $('#lErr').textContent=''; boot(); }
  catch(e){ $('#lErr').textContent=e.message; } };
$('#out').onclick=async()=>{ await api('/api/logout','POST'); boot(); };
$('#add').onclick=()=>openForm(); $('#mX').onclick=()=>$('#modal').hidden=true; $('#mSave').onclick=save;
$('#download').onchange=downloadSelected;
$('#mDel').onclick=async()=>{ if(confirm('Delete this task?')){ await api(`/api/tasks/${editId}?person=${encodeURIComponent(formPerson)}`,'DELETE'); $('#modal').hidden=true; person==='__today'?loadToday():load(); } };
$('#mReq').onchange=reqUI; $('#mSt').onchange=stUI; $('#q').oninput=render; $('#fs').onchange=render;
boot();