<!-- ══ Supabase 통합 레이어 ═══════════════════════════════════════ -->
<script>
(async function _supabaseIntegration() {
  const SUPA_URL = 'https://guocaxlcibrpleigkuwx.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1b2NheGxjaWJycGxlaWdrdXd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3MjM3MTIsImV4cCI6MjA5MTI5OTcxMn0.GGrHXPxefDZVAV8J04IbSeAlRasZq1kRlpMtHvNP-qE';
  window._sb = supabase.createClient(SUPA_URL, SUPA_KEY);

  // 구 sessionStorage 세션 방식 비활성화
  sessionStorage.removeItem('_sess');
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';

  // ── initApp: Supabase → in-memory 동기화
  window.initApp = async function() {
    try {
      const [vR,zR,pkR,lgR,rvR,vcR,lcR,cfR] = await Promise.all([
        _sb.from('vendors').select('*').order('key'),
        _sb.from('zones').select('*').order('code'),
        _sb.from('packages').select('*, programs(*)').order('name'),
        _sb.from('lodges').select('*').order('id'),
        _sb.from('reservations').select('*').order('no'),
        _sb.from('vendor_confirms').select('*'),
        _sb.from('lodge_confirms').select('*'),
        _sb.from('master_config').select('*').order('created_at'),
      ]);

      masterData.vendors = (vR.data||[]).map(v=>({
        _id:v.id, key:v.key||'', name:v.name||'', contact:v.contact||'',
        tel:v.tel||'', color:v.color||'#4ECDC4', note:v.note||'',
        programs:((v.vendor_programs||[]).map(p=>({
          progName:p.prog_name||p.progName||'', unitPrice:p.unit_price||p.unitPrice||0,
          settleType:p.settle_type||p.settleType||'per_person'
        })))
      }));

      masterData.zones = (zR.data||[]).map(z=>({_id:z.id, code:z.code, name:z.name}));

      masterData.packages = (pkR.data||[]).map(p=>({
        _id:p.id, zone:p.zone||'', name:p.name, paxLimit:p.pax_limit||null,
        programs:((p.programs||[]).map(pr=>({
          _id:pr.id, vendorKey:pr.vendor_key, progName:pr.prog_name,
          defaultStart:pr.default_start||'', defaultEnd:pr.default_end||'',
          place:pr.place||'', overridePrice:pr.override_price||''
        })))
      }));

      const lgData = lgR.data||[];
      masterData.lodges = lgData;
      Object.keys(lodgeMaster).forEach(k=>delete lodgeMaster[k]);
      lgData.forEach(l=>{
        const rooms = l.rooms || l.spaces || {};
        if(Array.isArray(rooms)){
          const obj={};
          rooms.forEach(r=>{ if(r.name) obj[r.name]=r.price||0; });
          if(Object.keys(obj).length) lodgeMaster[l.name]=obj;
        } else if(typeof rooms==='object' && Object.keys(rooms).length){
          lodgeMaster[l.name]=rooms;
        }
      });

      reservations.length = 0;
      (rvR.data||[]).forEach(r=>reservations.push({
        no:r.no, type:r.type||'pending', date:r.date,
        end:r.end_date||r.end||r.date,
        zone:r.zone||'', pkg:r.pkg||'', customer:r.customer||'',
        tel:r.tel||'', pax:r.pax||0, price:r.price||0,
        discount:r.discount||0, pickup:r.pickup||0, burden:r.burden||0,
        total:r.total||0, payto:r.payto||'', inflow:r.inflow||'',
        platform:r.platform||'', platFee:r.plat_fee||0,
        agency:r.agency||'', agFee:r.ag_fee||0,
        op:r.op||'일반', biz:r.biz||'', memo:r.memo||''
      }));

      Object.keys(vendorConfirm).forEach(k=>delete vendorConfirm[k]);
      (vcR.data||[]).forEach(vc=>{
        if(!vendorConfirm[vc.reservation_no]) vendorConfirm[vc.reservation_no]={};
        vendorConfirm[vc.reservation_no][vc.vendor_key]={status:vc.status||'wait'};
      });

      Object.keys(lodgeConfirm).forEach(k=>delete lodgeConfirm[k]);
      (lcR.data||[]).forEach(lc=>{
        lodgeConfirm[lc.reservation_no]={
          checked:lc.checked||false, lodge:lc.lodge||'', room:lc.room||'', note:lc.note||''
        };
      });

      const cfgData = cfR.data||[];
      masterData.platforms = cfgData.filter(c=>c.category==='platform').map(c=>({_id:c.id,...(c.payload||{})}));
      masterData.drivers   = cfgData.filter(c=>c.category==='driver').map(c=>({_id:c.id,...(c.payload||{})}));
      masterData.bizNames  = cfgData.filter(c=>c.category==='biz_project').map(c=>({_id:c.id,...(c.payload||{})}));

      rebuildTtEvents(); rebuildVendorColors(); _syncKkVendors();
      const today=new Date();
      calYear=today.getFullYear(); calMonth=today.getMonth()+1;
      calSelectedDate=today.toISOString().slice(0,10);
      ttDate=today;
    } catch(e){ console.error('[initApp]', e); }
  };

  // ── doLogin
  window.doLogin = async function() {
    const now=Date.now();
    if(now<_loginState.lockedUntil){
      const sec=Math.ceil((_loginState.lockedUntil-now)/1000);
      _setLoginError('⛔ 로그인 시도가 너무 많습니다. '+sec+'초 후 다시 시도하세요.'); return;
    }
    const email=(document.getElementById('li-email').value||'').trim().toLowerCase();
    const pw=(document.getElementById('li-pw').value||'');
    if(!email||!pw){_setLoginError('이메일과 비밀번호를 입력하세요.');return;}
    _setLoginBtnState(true); _clearLoginError();
    try {
      const {data,error}=await _sb.auth.signInWithPassword({email,password:pw});
      if(error) throw error;
      _loginState.fails=0;
      const uname=data.user.email.split('@')[0];
      document.getElementById('sb-avatar').textContent=uname[0].toUpperCase();
      document.getElementById('sb-username').textContent=uname;
      document.getElementById('sb-userrole').textContent='운영팀';
      await initApp();
      document.getElementById('li-pw').value=''; _clearLoginError();
      document.getElementById('login-screen').style.display='none';
      document.getElementById('app').style.display='block';
      showPage('dashboard',document.querySelector('.nav-item'));
      clearTimeout(window._sessTimer);
      window._sessTimer=setTimeout(()=>{alert('⏰ 세션이 만료되었습니다.');doLogout();},8*60*60*1000);
    } catch(err) {
      _loginState.fails++;
      if(_loginState.fails>=MAX_FAILS){
        _loginState.lockedUntil=now+LOCK_MS; _loginState.fails=0;
        _setLoginError('⛔ '+MAX_FAILS+'회 실패로 30초간 잠금됩니다.');
      } else {
        _setLoginError('❌ 이메일 또는 비밀번호가 올바르지 않습니다. ('+_loginState.fails+'/'+MAX_FAILS+')');
      }
      document.getElementById('li-pw').value='';
    } finally { _setLoginBtnState(false); }
  };

  // ── doLogout
  window.doLogout = async function() {
    await _sb.auth.signOut();
    clearTimeout(window._sessTimer);
    document.getElementById('app').style.display='none';
    document.getElementById('login-screen').style.display='flex';
    document.getElementById('li-email').value='';
    document.getElementById('li-pw').value='';
    _clearLoginError();
  };

  // ── saveMasterModal
  window.saveMasterModal = async function() {
    const type=_masterModalType, isEdit=_masterModalIdx>=0;
    const srcMap={vendor:'vendors',zone:'zones',package:'packages',
                  platform:'platforms',driver:'drivers',lodge:'lodges',biz:'bizNames'};
    const src=masterData[srcMap[type]];
    const gv=id=>{const el=document.getElementById(id);return el?el.value.trim():'';};
    let body={}, category='', isConfig=false;
    const existing=isEdit?src[_masterModalIdx]:null;

    if(type==='vendor'){
      if(!gv('mm-v-name')){alert('업체명을 입력하세요.');return;}
      body={key:gv('mm-v-key'),name:gv('mm-v-name'),contact:gv('mm-v-contact'),
            tel:gv('mm-v-tel'),color:gv('mm-v-color')||'#4ECDC4',note:gv('mm-v-note')};
    } else if(type==='zone'){
      if(!gv('mm-z-code')||!gv('mm-z-name')){alert('구역코드와 구역명을 입력하세요.');return;}
      body={code:gv('mm-z-code'),name:gv('mm-z-name')};
    } else if(type==='package'){
      if(!gv('mm-p-name')){alert('패키지명을 입력하세요.');return;}
      body={zone:gv('mm-p-zone'),name:gv('mm-p-name')};
    } else if(type==='platform'){
      if(!gv('mm-pl-name')){alert('이름을 입력하세요.');return;}
      isConfig=true; category='platform';
      body={type:gv('mm-pl-type')||'플랫폼',name:gv('mm-pl-name'),contact:gv('mm-pl-contact'),
            tel:gv('mm-pl-tel'),ind:parseFloat(gv('mm-pl-ind'))||0,grp:parseFloat(gv('mm-pl-grp'))||0};
    } else if(type==='driver'){
      if(!gv('mm-d-name')){alert('성함을 입력하세요.');return;}
      isConfig=true; category='driver';
      body={name:gv('mm-d-name'),tel:gv('mm-d-tel'),affil:gv('mm-d-affil')};
    } else if(type==='lodge'){
      if(!gv('mm-l-name')){alert('숙소명을 입력하세요.');return;}
      body={name:gv('mm-l-name'),vendor:gv('mm-l-vendor')};
    } else if(type==='biz'){
      if(!gv('mm-b-name')){alert('사업명을 입력하세요.');return;}
      isConfig=true; category='biz_project';
      body={name:gv('mm-b-name'),period:gv('mm-b-period')};
    }

    try {
      let err2;
      if(isConfig){
        if(isEdit&&existing?._id){
          ({error:err2}=await _sb.from('master_config').update({payload:body}).eq('id',existing._id));
        } else {
          ({error:err2}=await _sb.from('master_config').insert([{category,payload:body}]));
        }
      } else {
        const tbl=(type==='package')?'packages':(type+'s');
        if(isEdit&&existing?._id){
          ({error:err2}=await _sb.from(tbl).update(body).eq('id',existing._id));
        } else {
          ({error:err2}=await _sb.from(tbl).insert([body]));
        }
      }
      if(err2){alert('저장 실패: '+err2.message);return;}
    } catch(e){alert('저장 실패: '+e.message);return;}

    closeModal('master-modal');
    await initApp();
    const cont=document.getElementById('content');
    if(cont) cont.innerHTML=renderMaster();
    _toast('✅ '+(isEdit?'수정':'추가')+' 완료되었습니다.');
  };

  // ── deleteMasterItem
  window.deleteMasterItem = async function() {
    if(_vpVendorIdx>=0&&_vpProgIdx>=0){deleteVendorProg();return;}
    const type=_masterModalType;
    const srcMap={vendor:'vendors',zone:'zones',package:'packages',
                  platform:'platforms',driver:'drivers',lodge:'lodges',biz:'bizNames'};
    const src=masterData[srcMap[type]];
    if(_masterModalIdx<0||!src) return;
    const item=src[_masterModalIdx];
    const label=item.name||item.code||item.key||'';
    if(!confirm('"'+label+'" 항목을 삭제하시겠습니까?')) return;
    try {
      let err2;
      const isConfig=(type==='platform'||type==='driver'||type==='biz');
      if(isConfig&&item._id){
        ({error:err2}=await _sb.from('master_config').delete().eq('id',item._id));
      } else if(item._id){
        const tbl=(type==='package')?'packages':(type+'s');
        ({error:err2}=await _sb.from(tbl).delete().eq('id',item._id));
      }
      if(err2){alert('삭제 실패: '+err2.message);return;}
    } catch(e){alert('삭제 실패: '+e.message);return;}
    closeModal('master-modal');
    await initApp();
    const cont=document.getElementById('content');
    if(cont) cont.innerHTML=renderMaster();
    _toast('🗑 삭제되었습니다.');
  };

  // ── savePkgProgModal
  window.savePkgProgModal = async function() {
    const vendorKey=document.getElementById('pp-vendor')?.value||'';
    const progName=(document.getElementById('pp-name')?.value||'').trim();
    const start=document.getElementById('pp-start')?.value||'';
    const endT=document.getElementById('pp-end')?.value||'';
    const overrideRaw=(document.getElementById('pp-override-price')?.value||'').trim();
    const overridePrice=overrideRaw?parseInt(overrideRaw):null;
    if(!progName){alert('프로그램명을 입력하세요.');return;}
    const pkg=masterData.packages[_pkgProgPkgIdx];
    if(!pkg){alert('패키지를 찾을 수 없습니다.');return;}
    const progBody={vendor_key:vendorKey,prog_name:progName,default_start:start,default_end:endT};
    if(overridePrice!==null) progBody.override_price=overridePrice;
    try {
      let err2;
      if(_pkgProgProgIdx>=0){
        const ex=pkg.programs[_pkgProgProgIdx];
        if(ex?._id){({error:err2}=await _sb.from('programs').update(progBody).eq('id',ex._id));}
      } else {
        ({error:err2}=await _sb.from('programs').insert([{package_id:pkg._id,...progBody}]));
      }
      if(err2){alert('저장 실패: '+err2.message);return;}
    } catch(e){alert('저장 실패: '+e.message);return;}
    rebuildTtEvents();
    if(typeof buildVendorShareData==='function') vendorShareData=buildVendorShareData();
    closeModal('master-modal');
    document.querySelector('#master-modal .modal-footer .btn-primary').onclick=saveMasterModal;
    await initApp();
    const cont=document.getElementById('content');
    if(cont) cont.innerHTML=renderMaster();
    if(typeof togglePkgAccordion==='function') setTimeout(()=>togglePkgAccordion(_pkgProgPkgIdx),50);
    _toast('✅ 프로그램이 '+(_pkgProgProgIdx>=0?'수정':'추가')+'되었습니다.');
  };

  // ── deletePkgProg
  window.deletePkgProg = async function(pkgIdx, progIdx) {
    const pkg=masterData.packages[pkgIdx];
    const prog=pkg.programs[progIdx];
    if(!confirm('"'+prog.progName+'" 프로그램을 삭제하시겠습니까?')) return;
    try {
      if(prog._id){
        const {error:err2}=await _sb.from('programs').delete().eq('id',prog._id);
        if(err2){alert('삭제 실패: '+err2.message);return;}
      }
    } catch(e){alert('삭제 실패: '+e.message);return;}
    await initApp();
    const cont=document.getElementById('content');
    if(cont) cont.innerHTML=renderMaster();
    if(typeof togglePkgAccordion==='function') setTimeout(()=>togglePkgAccordion(pkgIdx),50);
    _toast('🗑 삭제되었습니다.');
  };

  // ── saveVendorProgModal
  window.saveVendorProgModal = async function() {
    const progName=(document.getElementById('vp-name')?.value||'').trim();
    const unitPrice=parseInt(document.getElementById('vp-price')?.value||'0')||0;
    const settleType=document.getElementById('vp-settle')?.value||'per_person';
    if(!progName){alert('프로그램명을 입력하세요.');return;}
    if(!unitPrice){alert('단가를 입력하세요.');return;}
    const vendor=masterData.vendors[_vpVendorIdx];
    if(!vendor) return;
    const progs=[...(vendor.programs||[])];
    if(_vpProgIdx>=0) progs[_vpProgIdx]={progName,unitPrice,settleType};
    else progs.push({progName,unitPrice,settleType});
    const vpArr=progs.map(p=>({prog_name:p.progName,unit_price:p.unitPrice,settle_type:p.settleType}));
    try {
      if(vendor._id){
        const {error:err2}=await _sb.rpc('update_vendor_programs',{p_id:vendor._id,p_programs:vpArr});
        if(err2){alert('저장 실패: '+err2.message);return;}
      }
    } catch(e){alert('저장 실패: '+e.message);return;}
    closeModal('master-modal');
    document.querySelector('#master-modal .modal-footer .btn-primary').onclick=saveMasterModal;
    await initApp();
    const cont=document.getElementById('content');
    if(cont) cont.innerHTML=renderMaster();
    _toast('✅ 단가가 저장되었습니다.');
  };

  // ── deleteVendorProg
  window.deleteVendorProg = async function() {
    const vendor=masterData.vendors[_vpVendorIdx];
    if(!vendor) return;
    const progs=[...(vendor.programs||[])];
    const prog=progs[_vpProgIdx];
    if(!confirm('"'+(prog?.progName||'')+'" 단가를 삭제하시겠습니까?')) return;
    progs.splice(_vpProgIdx,1);
    const vpArr=progs.map(p=>({prog_name:p.progName,unit_price:p.unitPrice,settle_type:p.settleType}));
    try {
      if(vendor._id){
        const {error:err2}=await _sb.rpc('update_vendor_programs',{p_id:vendor._id,p_programs:vpArr});
        if(err2){alert('삭제 실패: '+err2.message);return;}
      }
    } catch(e){alert('삭제 실패: '+e.message);return;}
    closeModal('master-modal');
    await initApp();
    const cont=document.getElementById('content');
    if(cont) cont.innerHTML=renderMaster();
    _toast('🗑 삭제되었습니다.');
  };

  // ── saveReservation
  window.saveReservation = async function() {
    const g=id=>document.getElementById(id);
    const gv=id=>{const el=g(id);return el?el.value.trim():'';};
    const dateVal=gv('inp-date'), customerVal=gv('inp-customer');
    const paxVal=parseInt(gv('inp-pax'))||0;
    if(!dateVal){alert('예약날짜를 입력해 주세요.');g('inp-date')?.focus();return;}
    if(!customerVal){alert('고객명을 입력해 주세요.');g('inp-customer')?.focus();return;}
    if(!paxVal){alert('인원을 입력해 주세요.');g('inp-pax')?.focus();return;}
    const typeMap={'확정':'confirmed','대기':'pending','취소':'cancelled','상담필요':'consult'};
    const selTypeEl=g('sel-type');
    const typeRaw=selTypeEl?selTypeEl.value:'pending';
    const typeCode=typeMap[typeRaw]||typeRaw;
    const editNo=document.getElementById('reserve-modal').dataset.editNo||'';
    const payload={
      type:typeCode, date:dateVal, end_date:gv('inp-end')||dateVal,
      zone:gv('sel-zone')||'', pkg:gv('sel-pkg')||'', customer:customerVal,
      tel:gv('inp-tel'), pax:paxVal, price:parseInt(gv('inp-price'))||0,
      discount:parseInt(gv('inp-discount'))||0,
      total:parseInt(gv('inp-total'))||0,
      payto:gv('sel-payto'), inflow:gv('sel-inflow'),
      platform:gv('sel-platform'), plat_fee:parseFloat(gv('inp-platform-fee'))||0,
      agency:gv('sel-agency'), ag_fee:parseFloat(gv('inp-agency-fee'))||0,
      op:gv('sel-op')||'일반', biz:gv('sel-biz'), memo:gv('inp-memo'),
    };
    try {
      let toastNo=editNo;
      if(editNo){
        const {error:err2}=await _sb.from('reservations').update(payload).eq('no',editNo);
        if(err2){alert('저장 실패: '+err2.message);return;}
      } else {
        const {data:lastArr}=await _sb.from('reservations').select('no').order('no',{ascending:false}).limit(1);
        const lastNo=lastArr?.[0]?.no?parseInt(lastArr[0].no):0;
        toastNo=String(lastNo+1).padStart(3,'0');
        const {error:err2}=await _sb.from('reservations').insert([{...payload,no:toastNo}]);
        if(err2){alert('저장 실패: '+err2.message);return;}
        await _sb.from('lodge_confirms').upsert(
          {reservation_no:toastNo,checked:false,lodge:'',room:'',note:''},
          {onConflict:'reservation_no'}
        );
      }
      closeModal('reserve-modal');
      await initApp(); rebuildTtEvents();
      if(typeof _refreshDashPanel==='function') _refreshDashPanel();
      const cont=document.getElementById('content');
      if(cont&&cont.querySelector('.list-header')) showPage('reservations',null);
      _toast('✅ #'+toastNo+' 예약이 '+(editNo?'수정':'등록')+'되었습니다.');
    } catch(e){alert('저장 실패: '+e.message);}
  };

  // ── openMasterModal: package zone 필드를 select 드롭다운으로 교체
  const _origOpenMasterModal = window.openMasterModal;
  window.openMasterModal = function(type, idx) {
    _origOpenMasterModal(type, idx);
    if(type === 'package') {
      const zoneInput = document.getElementById('mm-p-zone');
      if(zoneInput && zoneInput.tagName === 'INPUT') {
        const currentVal = zoneInput.value;
        const sel = document.createElement('select');
        sel.id = 'mm-p-zone';
        sel.className = zoneInput.className || 'form-control';
        sel.style.cssText = zoneInput.style.cssText || '';
        sel.innerHTML = '<option value="">-- 구역 선택 --</option>' +
          (masterData.zones||[]).map(z =>
            `<option value="${z.code}"${currentVal===z.code?' selected':''}>${z.code} · ${z.name}</option>`
          ).join('');
        zoneInput.parentNode.replaceChild(sel, zoneInput);
      }
    }
  };

  // ── 세션 자동 복원
  const {data:{session}} = await _sb.auth.getSession();
  if(session){
    try {
      const uname=session.user.email.split('@')[0];
      document.getElementById('sb-avatar').textContent=uname[0].toUpperCase();
      document.getElementById('sb-username').textContent=uname;
      document.getElementById('sb-userrole').textContent='운영팀';
      await initApp();
      document.getElementById('login-screen').style.display='none';
      document.getElementById('app').style.display='block';
      showPage('dashboard',document.querySelector('.nav-item'));
      clearTimeout(window._sessTimer);
      window._sessTimer=setTimeout(()=>{alert('⏰ 세션이 만료되었습니다.');doLogout();},8*60*60*1000);
    } catch(e){ console.error('[session restore]',e); }
  }
})();
</script>
