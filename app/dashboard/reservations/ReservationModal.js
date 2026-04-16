'use client'
import { useState, useEffect } from 'react'

const STATUS_OPTIONS = [
  { value: 'confirmed', label: '확정' },
  { value: 'pending',   label: '대기' },
  { value: 'cancelled', label: '취소' },
  { value: 'consult',   label: '상담필요' },
]

const s = {
  width: '100%', height: '38px', background: '#0f1923',
  border: '1px solid #2a3a4a', borderRadius: '7px',
  padding: '0 12px', fontSize: '13px', color: '#e8eaed', outline: 'none',
  fontFamily: 'Noto Sans KR, sans-serif'
}
const lbl = {
  fontSize: '11px', color: '#8a9ab0', display: 'block', marginBottom: '5px', fontWeight: '600'
}

export default function ReservationModal({ isOpen, onClose, onSave, editData, initialDate, packages, zones }) {
  const [form, setForm] = useState({
    type: 'pending', date: '', end_date: '', zone: '', pkg: '',
    customer: '', tel: '', pax: 1, price: 0, discount: 0,
    pickup: 0, burden: 0, total: 0, payto: '', inflow: '',
    platform: '', plat_fee: 0, agency: '', ag_fee: 0,
    op: '일반', biz: '', driver: '', memo: ''
  })
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState(0)

  // 기준정보에서 동적으로 불러오는 목록
  const [platforms, setPlatforms] = useState([])  // type=플랫폼
  const [agencies,  setAgencies]  = useState([])  // type=여행사
  const [drivers,   setDrivers]   = useState([])
  const [bizList,   setBizList]   = useState([])

  useEffect(() => {
    fetch('/api/master-config')
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return
        setPlatforms(data.filter(c => c.category === 'platform' && c.data?.type === '플랫폼').map(c => c.data))
        setAgencies( data.filter(c => c.category === 'platform' && c.data?.type === '여행사').map(c => c.data))
        setDrivers(  data.filter(c => c.category === 'driver').map(c => c.data))
        setBizList(  data.filter(c => c.category === 'biz_project').map(c => c.data))
      })
      .catch(() => {})
  }, [isOpen])

  useEffect(() => {
    if (editData) {
      setForm({ driver: '', ...editData })
    } else {
      setForm({
        type: 'pending', date: initialDate || '', end_date: '', zone: '', pkg: '',
        customer: '', tel: '', pax: 1, price: 0, discount: 0,
        pickup: 0, burden: 0, total: 0, payto: '', inflow: '',
        platform: '', plat_fee: 0, agency: '', ag_fee: 0,
        op: '일반', biz: '', driver: '', memo: ''
      })
    }
    setTab(0)
  }, [editData, isOpen, initialDate])

  const set = (k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v }
      const price  = parseInt(next.price)    || 0
      const pax    = parseInt(next.pax)      || 0
      const disc   = parseInt(next.discount) || 0
      const pickup = parseInt(next.pickup)   || 0
      next.total = price * pax - disc + pickup
      return next
    })
  }

  // 플랫폼 선택 시 수수료 자동입력
  const onPlatformChange = (name) => {
    set('platform', name)
    const p = platforms.find(x => x.name === name)
    if (p) {
      const isGroup = (parseInt(form.pax) || 1) >= 10
      set('plat_fee', isGroup ? p.grp : p.ind)
    }
  }

  // 여행사 선택 시 수수료 자동입력
  const onAgencyChange = (name) => {
    set('agency', name)
    const a = agencies.find(x => x.name === name)
    if (a) {
      const isGroup = (parseInt(form.pax) || 1) >= 10
      set('ag_fee', isGroup ? a.grp : a.ind)
    }
  }

  const handleSave = async () => {
    if (!form.date)     { alert('예약날짜를 입력해주세요.'); return }
    if (!form.customer) { alert('고객명을 입력해주세요.'); return }
    if (!form.pax)      { alert('인원을 입력해주세요.'); return }
    setSaving(true)
    await onSave(form)
    setSaving(false)
    onClose()
  }

  if (!isOpen) return null

  // 고객결제처: 플랫폼 이름 + 기본 옵션
  const paytoOptions = ['계좌이체', '현금', ...platforms.map(p => p.name)]

  const tabs = ['기본정보 · 결제', '픽업 · 기타']

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'20px' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:'#1a2535', border:'1px solid #2a3a4a', borderRadius:'16px',
        width:'100%', maxWidth:'560px', maxHeight:'90vh', display:'flex', flexDirection:'column' }}>

        {/* 헤더 */}
        <div style={{ padding:'18px 20px', borderBottom:'1px solid #2a3a4a',
          display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:'15px', fontWeight:'700', color:'#e8eaed' }}>
            {editData ? `✎ 예약 수정 — #${editData.no}` : '신규 예약 등록'}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#8a9ab0', fontSize:'18px', cursor:'pointer' }}>✕</button>
        </div>

        {/* 탭 */}
        <div style={{ display:'flex', borderBottom:'1px solid #2a3a4a' }}>
          {tabs.map((t, i) => (
            <button key={i} onClick={() => setTab(i)} style={{
              flex:1, height:'40px', background:'none', border:'none',
              borderBottom: tab===i ? '2px solid #4ecdc4' : '2px solid transparent',
              color: tab===i ? '#4ecdc4' : '#8a9ab0', fontSize:'13px',
              fontWeight: tab===i ? '700' : '400', cursor:'pointer',
              fontFamily:'Noto Sans KR, sans-serif'
            }}>{t}</button>
          ))}
        </div>

        {/* 바디 */}
        <div style={{ flex:1, overflowY:'auto', padding:'20px' }}>

          {tab === 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>

              {/* 예약구분 + 날짜 */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px' }}>
                <div>
                  <label style={lbl}>예약구분 *</label>
                  <select value={form.type} onChange={e => set('type', e.target.value)} style={s}>
                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>예약날짜 *</label>
                  <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={s} />
                </div>
                <div>
                  <label style={lbl}>체험종료</label>
                  <input type="date" value={form.end_date || ''} onChange={e => set('end_date', e.target.value)} style={s} />
                </div>
              </div>

              {/* 구역 + 패키지 + 인원 */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px', gap:'10px' }}>
                <div>
                  <label style={lbl}>구역</label>
                  <select value={form.zone} onChange={e => set('zone', e.target.value)} style={s}>
                    <option value="">선택</option>
                    {(zones||[]).map(z => <option key={z.id} value={z.code}>{z.code} · {z.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>패키지</label>
                  <select value={form.pkg} onChange={e => set('pkg', e.target.value)} style={s}>
                    <option value="">선택</option>
                    {(packages||[])
                      .filter(p => !form.zone || p.zone === form.zone || !p.zone)
                      .map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>인원 *</label>
                  <input type="number" value={form.pax} min="1"
                    onChange={e => set('pax', e.target.value)} style={s} />
                </div>
              </div>

              {/* 고객명 + 연락처 */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <div>
                  <label style={lbl}>고객명 *</label>
                  <input type="text" value={form.customer} placeholder="고객명"
                    onChange={e => set('customer', e.target.value)} style={s} />
                </div>
                <div>
                  <label style={lbl}>연락처</label>
                  <input type="text" value={form.tel || ''} placeholder="010-0000-0000"
                    onChange={e => set('tel', e.target.value)} style={s} />
                </div>
              </div>

              {/* 결제 박스 */}
              <div style={{ padding:'14px', background:'#0f1923', borderRadius:'10px', border:'1px solid #2a3a4a' }}>
                <div style={{ fontSize:'11px', color:'#4ecdc4', fontWeight:'700', marginBottom:'12px', letterSpacing:'.5px' }}>
                  결제 · 수수료
                </div>

                {/* 1인판매가 + 할인 + 결제처 */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'10px' }}>
                  <div>
                    <label style={lbl}>1인판매가 *</label>
                    <input type="number" value={form.price}
                      onChange={e => set('price', e.target.value)} style={s} placeholder="원" />
                  </div>
                  <div>
                    <label style={lbl}>할인금액</label>
                    <input type="number" value={form.discount}
                      onChange={e => set('discount', e.target.value)} style={s} />
                  </div>
                  <div>
                    <label style={lbl}>고객결제처</label>
                    <select value={form.payto || ''} onChange={e => set('payto', e.target.value)} style={s}>
                      <option value="">선택</option>
                      {paytoOptions.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                </div>

                {/* 유입처 + 운영구분 */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px' }}>
                  <div>
                    <label style={lbl}>예약유입처</label>
                    <select value={form.inflow || ''} onChange={e => set('inflow', e.target.value)} style={s}>
                      <option value="">선택</option>
                      {['플랫폼','여행사','직접문의'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>운영구분</label>
                    <select value={form.op} onChange={e => set('op', e.target.value)} style={s}>
                      <option>일반</option>
                      <option>사업비</option>
                    </select>
                  </div>
                </div>

                {/* 플랫폼 (유입처=플랫폼일 때 강조) */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px' }}>
                  <div>
                    <label style={lbl}>
                      플랫폼명
                      {platforms.length === 0 && <span style={{ color:'#5A7080', fontWeight:'400', marginLeft:'4px' }}>(기준정보에서 등록)</span>}
                    </label>
                    <select value={form.platform || ''} onChange={e => onPlatformChange(e.target.value)} style={s}>
                      <option value="">선택</option>
                      {platforms.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>플랫폼수수료 (%) <span style={{ color:'#4ecdc4', fontSize:'10px' }}>자동</span></label>
                    <input type="number" value={form.plat_fee || 0}
                      onChange={e => set('plat_fee', e.target.value)} style={s} />
                  </div>
                </div>

                {/* 여행사 */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px' }}>
                  <div>
                    <label style={lbl}>
                      여행사명
                      {agencies.length === 0 && <span style={{ color:'#5A7080', fontWeight:'400', marginLeft:'4px' }}>(기준정보에서 등록)</span>}
                    </label>
                    <select value={form.agency || ''} onChange={e => onAgencyChange(e.target.value)} style={s}>
                      <option value="">선택</option>
                      {agencies.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>여행사수수료 (%) <span style={{ color:'#4ecdc4', fontSize:'10px' }}>자동</span></label>
                    <input type="number" value={form.ag_fee || 0}
                      onChange={e => set('ag_fee', e.target.value)} style={s} />
                  </div>
                </div>

                {/* 사업명 (운영구분=사업비일 때 강조) */}
                <div style={{ marginBottom:'10px' }}>
                  <label style={{ ...lbl, color: form.op === '사업비' ? '#B8B8FF' : '#8a9ab0' }}>
                    사업명 {form.op === '사업비' && <span style={{ color:'#B8B8FF' }}>*</span>}
                  </label>
                  <select value={form.biz || ''} onChange={e => set('biz', e.target.value)}
                    style={{ ...s, borderColor: form.op === '사업비' ? 'rgba(184,184,255,.4)' : '#2a3a4a' }}>
                    <option value="">선택</option>
                    {bizList.map(b => <option key={b.name} value={b.name}>{b.name}{b.period ? ` (${b.period})` : ''}</option>)}
                  </select>
                </div>

                {/* 총결제 */}
                <div style={{ padding:'10px 14px', background:'#1a2535', borderRadius:'8px',
                  display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:'12px', color:'#8a9ab0' }}>총결제금액 (자동계산)</span>
                  <span style={{ fontSize:'18px', fontWeight:'700', color:'#4ecdc4', fontFamily:'monospace' }}>
                    ₩{(form.total || 0).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* 메모 */}
              <div>
                <label style={lbl}>메모</label>
                <input type="text" value={form.memo || ''} placeholder=""
                  onChange={e => set('memo', e.target.value)} style={s} />
              </div>
            </div>
          )}

          {tab === 1 && (
            <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>

              {/* 픽업비 + 숙소부담금 */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
                <div>
                  <label style={lbl}>픽업비</label>
                  <input type="number" value={form.pickup || 0}
                    onChange={e => set('pickup', e.target.value)} style={s} placeholder="원" />
                </div>
                <div>
                  <label style={lbl}>숙소부담금</label>
                  <input type="number" value={form.burden || 0}
                    onChange={e => set('burden', e.target.value)} style={s} placeholder="원" />
                </div>
              </div>

              {/* 픽업수행자 */}
              <div>
                <label style={lbl}>
                  픽업수행자
                  {drivers.length === 0 && <span style={{ color:'#5A7080', fontWeight:'400', marginLeft:'4px' }}>(기준정보에서 등록)</span>}
                </label>
                <select value={form.driver || ''} onChange={e => set('driver', e.target.value)} style={s}>
                  <option value="">선택</option>
                  {drivers.map(d => <option key={d.name} value={d.name}>{d.name} ({d.affil})</option>)}
                </select>
              </div>

              {/* 안내 */}
              <div style={{ padding:'12px 14px', background:'rgba(247,201,72,.05)',
                border:'1px solid rgba(247,201,72,.2)', borderRadius:'8px',
                fontSize:'12px', color:'#F7C948' }}>
                💡 픽업비는 총결제금액에 포함됩니다.<br/>
                픽업수행자는 기준정보 &gt; 픽업수행자에서 관리하세요.
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div style={{ padding:'14px 20px', borderTop:'1px solid #2a3a4a',
          display:'flex', justifyContent:'flex-end', gap:'8px' }}>
          <button onClick={onClose} style={{ height:'38px', padding:'0 18px', background:'none',
            border:'1px solid #2a3a4a', borderRadius:'8px', color:'#8a9ab0',
            fontSize:'13px', cursor:'pointer', fontFamily:'Noto Sans KR, sans-serif' }}>닫기</button>
          <button onClick={handleSave} disabled={saving} style={{ height:'38px', padding:'0 22px',
            background:'#4ecdc4', border:'none', borderRadius:'8px', color:'#0f1923',
            fontSize:'13px', fontWeight:'700', cursor:'pointer', opacity: saving ? 0.6 : 1,
            fontFamily:'Noto Sans KR, sans-serif' }}>
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
