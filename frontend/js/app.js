const $=s=>document.querySelector(s), MAN='Other (type manually)';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const taskLabel=s=>String(s??'').toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase()).replace(/\b(ai|csv|crm|rm)\b/gi,c=>c.toUpperCase());
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt=d=>{if(!d)return'—';const[y,m,x]=d.split('-');return `${x} ${MON[m-1]} ${y}`};
let S,person,tasks=[],visibleTasks=[],columnFilters=new Map(),sortState=null,filterDraft=null,editId=null,formPerson=null;
const TABLE_COLUMNS=[
  {field:'date',label:'Date'},
  {field:'task',label:'Task'},
  {field:'department',label:'Department'},
  {field:'req_from',label:'Req from'},
  {field:'status',label:'Status'},
  {field:'completed_date',label:'Completed'}
];

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
  opts($('#mDept'),[...S.departments,MAN]); opts($('#mReq'),[MAN]);
  opts($('#mPerson'),S.people);
  $('#tabs').hidden=false;
  $('#tabs').innerHTML=(S.role!=='member'?'<button class="tab" data-p="__sum">Summary</button>':'')
    +'<button class="tab" data-p="__today">Today</button>'+S.people.map(p=>`<button class="tab" data-p="${p}">${p}</button>`).join('');
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>pick(b.dataset.p));
  pick(S.role==='member'?S.people[0]:'__sum');
}
function pick(p){
  closeColumnFilter(); columnFilters.clear(); sortState=null;
  person=p; const sm=p==='__sum';
  const td=p==='__today';
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.p===p));
  $('#sheet').hidden=sm; $('#stats').hidden=sm; $('#sum').hidden=!sm;
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
function columnValue(row,field){ return String(row[field]??''); }
function columnDisplay(field,value){
  if(!value) return '(Blanks)';
  if(field==='date'||field==='completed_date') return fmt(value);
  return field==='task'?taskLabel(value):value;
}
function visibleColumns(todayView){
  return todayView?[{field:'person',label:'Member'},...TABLE_COLUMNS]:TABLE_COLUMNS;
}
function closeColumnFilter(){
  const menu=$('#columnFilterMenu');
  if(menu) menu.hidden=true;
  filterDraft=null;
}
function openColumnFilter(field,button){
  const values=[...new Set(tasks.map(task=>columnValue(task,field)))]
    .sort((a,b)=>columnDisplay(field,a).localeCompare(columnDisplay(field,b)));
  filterDraft={field,values,selected:new Set(columnFilters.get(field)||values)};
  const menu=$('#columnFilterMenu');
  menu.innerHTML=`<div class="column-filter-sort">
      <button type="button" data-sort="asc">Sort Ascending</button>
      <button type="button" data-sort="desc">Sort Descending</button>
    </div>
    <input id="columnFilterSearch" type="search" placeholder="Search values..." aria-label="Search filter values">
    <label class="column-select-all"><input id="columnSelectAll" type="checkbox">Select all</label>
    <div id="columnFilterValues"></div>
    <div class="column-filter-actions">
      <button type="button" data-action="clear">Clear filter</button>
      <span><button type="button" data-action="cancel">Cancel</button><button type="button" data-action="apply">OK</button></span>
    </div>`;
  menu.hidden=false;
  renderColumnFilterValues();
  const rect=button.getBoundingClientRect();
  menu.style.left=`${Math.max(8,Math.min(rect.left,window.innerWidth-286))}px`;
  menu.style.top='8px';
  const menuHeight=menu.offsetHeight;
  const below=rect.bottom+4;
  menu.style.top=`${below+menuHeight<=window.innerHeight-8?below:Math.max(8,rect.top-menuHeight-4)}px`;
  menu.querySelector('[data-sort="asc"]').onclick=()=>sortColumn(field,'asc');
  menu.querySelector('[data-sort="desc"]').onclick=()=>sortColumn(field,'desc');
  menu.querySelector('[data-action="clear"]').onclick=()=>{
    columnFilters.delete(field); closeColumnFilter(); render();
  };
  menu.querySelector('[data-action="cancel"]').onclick=closeColumnFilter;
  menu.querySelector('[data-action="apply"]').onclick=()=>{
    if(filterDraft.selected.size===filterDraft.values.length) columnFilters.delete(field);
    else columnFilters.set(field,new Set(filterDraft.selected));
    closeColumnFilter(); render();
  };
  $('#columnFilterSearch').oninput=renderColumnFilterValues;
  $('#columnSelectAll').onchange=()=>{
    const visibleFilterValues=filteredColumnValues();
    visibleFilterValues.forEach(value=>{
      if($('#columnSelectAll').checked) filterDraft.selected.add(value);
      else filterDraft.selected.delete(value);
    });
    renderColumnFilterValues();
  };
}
function filteredColumnValues(){
  const search=$('#columnFilterSearch').value.trim().toLowerCase();
  return filterDraft.values.filter(value=>columnDisplay(filterDraft.field,value).toLowerCase().includes(search));
}
function renderColumnFilterValues(){
  const values=filteredColumnValues();
  $('#columnFilterValues').innerHTML=values.map(value=>`<label><input type="checkbox" value="${esc(value)}"${filterDraft.selected.has(value)?' checked':''}>${esc(columnDisplay(filterDraft.field,value))}</label>`).join('')
    ||'<div class="muted column-no-values">No matching values</div>';
  $('#columnFilterValues').querySelectorAll('input').forEach(input=>input.onchange=()=>{
    if(input.checked) filterDraft.selected.add(input.value);
    else filterDraft.selected.delete(input.value);
    renderColumnFilterValues();
  });
  const selectAll=$('#columnSelectAll');
  const selectedCount=values.filter(value=>filterDraft.selected.has(value)).length;
  selectAll.checked=values.length>0&&selectedCount===values.length;
  selectAll.indeterminate=selectedCount>0&&selectedCount<values.length;
  selectAll.disabled=values.length===0;
}
function sortColumn(field,direction){
  sortState={field,direction}; closeColumnFilter(); render();
}
async function load(){ tasks=(await api('/api/tasks?person='+encodeURIComponent(person))).tasks; render(); }
async function loadToday(){ tasks=(await api('/api/today')).tasks; render(); }

function render(){
  const todayView=person==='__today', columns=visibleColumns(todayView);
  const n=s=>tasks.filter(t=>t.status===s).length;
  $('#stats').innerHTML=[['Total',tasks.length],['Pending',n('Pending')],['Completed',n('Completed')]]
    .map(([l,v])=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  $('#head').innerHTML=columns.map(({field,label})=>`<th><div class="column-heading"><span>${label}</span><button type="button" class="column-filter-trigger${columnFilters.has(field)?' active':''}" data-field="${field}" aria-label="Filter ${label}" title="Filter ${label}">
    <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12L9.5 8v4l-3 1V8L2 3z"></path></svg></button></div></th>`).join('')
    +(S.canEdit&&!todayView?'<th></th>':'');
  $('#head').querySelectorAll('.column-filter-trigger').forEach(button=>button.onclick=event=>{
    event.stopPropagation(); openColumnFilter(button.dataset.field,button);
  });
  const query=$('#q').value.trim().toLowerCase();
  let list=tasks.filter(task=>{
    const searchText=columns.map(({field})=>columnValue(task,field)).join(' ').toLowerCase();
    const matchesFilters=[...columnFilters].every(([field,values])=>values.has(columnValue(task,field)));
    return matchesFilters&&(!query||searchText.includes(query));
  });
  if(sortState&&columns.some(column=>column.field===sortState.field)){
    const {field,direction}=sortState;
    list=list.slice().sort((a,b)=>{
      const left=field==='date'||field==='completed_date'?columnValue(a,field):columnDisplay(field,columnValue(a,field));
      const right=field==='date'||field==='completed_date'?columnValue(b,field):columnDisplay(field,columnValue(b,field));
      const compared=left.localeCompare(right);
      return direction==='asc'?compared:-compared;
    });
  }
  visibleTasks=list;
  $('#empty').hidden=list.length>0;
  $('#body').innerHTML=list.map(task=>`<tr>${columns.map(({field})=>{
    const value=columnValue(task,field);
    if(field==='status'&&S.canEdit&&!todayView) return `<td><select class="stsel ${esc(value)}" onchange="quickStatus(${task.id},this.value)"><option${value==='Pending'?' selected':''}>Pending</option><option${value==='Completed'?' selected':''}>Completed</option></select></td>`;
    const display=field==='date'||field==='completed_date'?fmt(value):field==='task'?taskLabel(value):value||'—';
    return `<td${field==='task'?' class="t"':''}>${esc(display)}</td>`;
  }).join('')}${S.canEdit&&!todayView?`<td><button class="edit" onclick="openForm(${task.id})">Edit</button></td>`:''}</tr>`).join('');
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
  const params=new URLSearchParams({person,search:$('#q').value});
  columnFilters.forEach((values,field)=>{
    params.append('filter_field',field);
    values.forEach(value=>params.append(`filter_${field}`,value));
  });
  if(sortState){
    params.set('sort_field',sortState.field);
    params.set('sort_direction',sortState.direction);
  }
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
function activeDepartment(){
  return $('#mDept').value===MAN?$('#mDeptMan').value.trim():$('#mDept').value;
}
function reqUI(){ $('#mMan').hidden=$('#mReq').value!==MAN; }
function requesterOptions(preferred=''){
  const options=S.requestersByDepartment[activeDepartment()]||[];
  opts($('#mReq'),[...options,MAN]);
  if(options.includes(preferred)){
    $('#mReq').value=preferred;
    $('#mMan').value='';
  }else if(preferred){
    $('#mReq').value=MAN;
    $('#mMan').value=preferred;
  }else{
    $('#mReq').value=options[0]||MAN;
    $('#mMan').value='';
  }
  reqUI();
}
function deptUI(){
  $('#mDeptMan').hidden=$('#mDept').value!==MAN;
  requesterOptions();
}
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
  const manualDept=t&&t.department&&!S.departments.includes(t.department);
  $('#mDept').value=manualDept?MAN:(t?t.department:S.departments[0]);
  $('#mDeptMan').value=manualDept?t.department:'';
  $('#mSt').value=t?t.status:'Pending';
  $('#mDone').value=t?t.completed_date:'';
  $('#mDel').hidden=!t; $('#mErr').textContent=''; deptUI();
  requesterOptions(t?t.req_from:''); stUI(); $('#modal').hidden=false;
}
async function save(){
  const department=$('#mDept').value===MAN?$('#mDeptMan').value.trim():$('#mDept').value;
  const req=$('#mReq').value===MAN?$('#mMan').value.trim():$('#mReq').value;
  if(!$('#mTask').value.trim()) return $('#mErr').textContent='Please enter the task';
  if(!department) return $('#mErr').textContent='Please enter the department';
  if(!req) return $('#mErr').textContent='Please enter who requested it';
  try{
    formPerson=person==='__today'&&S.role==='admin'&&!editId?$('#mPerson').value:formPerson;
    const saved=await api('/api/tasks','POST',{id:editId,person:formPerson,date:$('#mDate').value,task:$('#mTask').value,department,
      req_from:req,status:$('#mSt').value,completed_date:$('#mDone').value});
    S.requestersByDepartment[department]??=[];
    if(!saved.requester_excluded&&!S.requestersByDepartment[department].includes(saved.req_from)){
      S.requestersByDepartment[department].push(saved.req_from);
      S.requestersByDepartment[department].sort((a,b)=>a.localeCompare(b));
    }
    $('#modal').hidden=true; person==='__today'?loadToday():load();
  }catch(e){ $('#mErr').textContent=e.message; }
}

$('#lGo').onclick=async()=>{ try{ await api('/api/login','POST',{name:$('#lName').value,key:KEY}); $('#lErr').textContent=''; boot(); }
  catch(e){ $('#lErr').textContent=e.message; } };
$('#out').onclick=async()=>{ await api('/api/logout','POST'); boot(); };
$('#add').onclick=()=>openForm(); $('#mX').onclick=()=>$('#modal').hidden=true; $('#mSave').onclick=save;
$('#download').onchange=downloadSelected;
$('#mDel').onclick=async()=>{ if(confirm('Delete this task?')){ await api(`/api/tasks/${editId}?person=${encodeURIComponent(formPerson)}`,'DELETE'); $('#modal').hidden=true; person==='__today'?loadToday():load(); } };
$('#mDept').onchange=deptUI; $('#mDeptMan').oninput=()=>requesterOptions(); $('#mReq').onchange=reqUI; $('#mSt').onchange=stUI; $('#q').oninput=render;
document.addEventListener('click',event=>{
  if(filterDraft&&!$('#columnFilterMenu').contains(event.target)&&!event.target.closest('.column-filter-trigger')) closeColumnFilter();
});
boot();