'use client'
import { useState, useEffect, useCallback } from 'react'

const STATUS_LABEL = { confirmed:'확정', pending:'대기', cancelled:'취소', consult:'상담필요' }
const STATUS_COLOR = { confirmed:'#5cb85c', pending:'#f7c948', cancelled:'#e05c5c', consult:'#8a9ab0' }

const LODGE_MASTER = {
  '길쌈':    ['국실','죽실','연실','난실','매실','송실','전실'],
  '만초고택': ['작은방','상방','사랑방','큰방','전실'],
  '유울재':  ['1실','2실','전실'],
  '귀농의집': ['1실','2실','전실'],
  '계와고택': ['1실','전실'],
  '서린당':  ['독채'],
  '경함정':  ['독채'],
  '스테이예인':['독채'],
  '금소애서': ['앞집','옆집'],
}

export default function ReservationDetail({ reservation, vendors, packages, onEdit, onDelete, onClose }) {
  const [vendorConfirms, setVendorConfirms] = useState([])
  const [lodgeConfirm,   setLodgeConfirm]   = useState(null)
  const [lodgeForm,      setLodgeForm]       = useState({ lodge:'', room:'', note:'' })
  const [loadingVC,      setLoadingVC]       = useState(false)
  const [loadingLC,      setLoadingLC]       = useState(false)
  const [showLodgeForm,  setShowLodgeForm]   = useState(false)

  const r = reservation

  // 이 패키지에 참여하는 업체 목록
  const pkg = packages?.find(p => p.name === r.pkg)
  const pkgVendors = pkg?.programs
    ? [...new Map(pkg.programs.map(pr => [pr.vendor_key, pr])).values()]
    : []

  const fetchConfirms = useCallback(async () => {
    if (!r?.no) return
    const [vc, lc] = await Promise.all([
      fetch(`/api/vendor-confirms?no=${r.no}`).then(res => res.json()),
      fetch(`/api/lodge-confirms?no=${r.no}`).then(res => res.json()),
    ])
    setVendorConfirms(Array.isArray(vc) ? vc : [])
    const lcData = Array.isArray(lc) ? lc[0] : lc
    setLodgeConfirm(lcData || null)
    if (lcData) setLodgeForm({ lodge: lcData.lodge||'', room: lcData.room||'', note: lcData.note||'' })
  }, [r?.no])

  useEffect(() => { fetchConfirms() }, [fetchConfirms])

  // 업체 확인 상태 변경
  const handleVendorConfirm = async (vendorKey, status) => {
    setLoadingVC(true)
    await fetch('/api/vendor-confirms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservation_no: r.no, vendor_key: vendorKey, status })
    })
    await fetchConfirms()
    setLoadingVC(false)
  }

  // 숙소 확인 저장
  const handleLodgeSave = async (checked) => {
    setLoadingLC(true)
    await fetch('/api/lodge-confirms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reservation_no: r.no,
        checked,
        lodge: lodgeForm.lodge,
        room:  lodgeForm.room,
        note:  lodgeForm.note,
      })
    })
    await fetchConfirms()
    setShowLodgeForm(false)
    setLoadingLC(false)
  }

  // 확정 상태 계산
  const getConfirmStatus = () => {
    if (!pkgVendors.length) return 'wait'
    const allOk  = pkgVendors.every(pv => vendorConfirms.find(vc => vc.vendor_key === pv.vendor_key)?.status === 'ok')
    const hasNo  = pkgVendors.some(pv  => vendorConfirms.find(vc => vc.vendor_key === pv.vendor_key)?.status === 'no')
    const lcOk   = lodgeConfirm?.checked
    if (allOk && lcOk) return 'confirmed'
    if (allOk || lcOk || vendorConfirms.length > 0) return 'partial'
    return 'wait'
  }

  const confirmStatus = getConfirmStatus()
  const confirmColor  = confirmStatus==='confirmed' ? '#5cb85c' : confirmStatus==='partial' ? '#f7c948' : '#8a9ab0'
  const confirmLabel  = confirmStatus==='confirmed' ? '✓ 완전 확정' : confirmStatus==='partial' ? '△ 일부 확인 완료' : '⏳ 확인 대기 중'

  const card = {
    background: '#0f1923', borderRadius: '8px', border: '1px solid #2a3a4a', padding: '12px 14px', marginBottom: '10px'
  }
  const sectionTitle = {
    fontSize: '11px', color: '#8a9ab0', fontWeight: '700',
    letterSpacing: '.5px', textTransform: 'uppercase', marginBottom: '8px'
  }

  return (
    <div style={{
      width: '300px', flexShrink: 0, background: '#1a2535',
      border: '1px solid #2a3a4a', borderRadius: '12px',
      display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 120px)',
      overflow: 'hidden'
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid #2a3a4a',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
      }}>
        <div style={{ fontWeight: '700', fontSize: '14px' }}>#{r.no} 상세</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => onEdit(r)} style={{
            height: '28px', padding: '0 10px', background: 'rgba(78,205,196,0.1)',
            border: '1px solid rgba(78,205,196,0.3)', borderRadius: '6px',
            color: '#4ecdc4', fontSize: '11px', fontWeight: '700', cursor: 'pointer',
            fontFamily: 'Noto Sans KR, sans-serif'
          }}>✎ 수정</button>
          <button onClick={() => onDelete(r.no)} style={{
            height: '28px', padding: '0 10px', background: 'rgba(224,92,92,0.1)',
            border: '1px solid rgba(224,92,92,0.3)', borderRadius: '6px',
            color: '#e05c5c', fontSize: '11px', cursor: 'pointer',
            fontFamily: 'Noto Sans KR, sans-serif'
          }}>삭제</button>
          <button onClick={onClose} style={{
            height: '28px', width: '28px', background: 'none',
            border: '1px solid #2a3a4a', borderRadius: '6px',
            color: '#8a9ab0', fontSize: '14px', cursor: 'pointer'
          }}>✕</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>

        {/* 확정 상태 배너 */}
        <div style={{
          padding: '10px 14px', borderRadius: '8px', marginBottom: '12px',
          background: confirmColor + '11', border: '1px solid ' + confirmColor + '44'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: confirmColor }}>{confirmLabel}</div>
          <div style={{ fontSize: '11px', color: '#8a9ab0', marginTop: '3px' }}>
            업체 전원 확인 + 숙소 확인 완료 시 완전 확정
          </div>
        </div>

        {/* 기본 정보 */}
        <div style={card}>
          <div style={sectionTitle}>기본 정보</div>
          {[
            ['고객명', r.customer],
            ['연락처', r.tel||'-'],
            ['날짜', r.date+(r.end_date&&r.end_date!==r.date?' ~ '+r.end_date:'')],
            ['인원', r.pax+'명'],
            ['패키지', r.pkg||'-'],
            ['구역', r.zone||'-'],
            ['상태', STATUS_LABEL[r.type]||r.type],
            ['운영', r.op||'-'],
            ['1인판매가', '₩'+(r.price||0).toLocaleString()],
            ['픽업비', r.pickup?'₩'+r.pickup.toLocaleString():'없음'],
            ['총결제', '₩'+(r.total||0).toLocaleString()],
            ['결제처', r.payto||'-'],
          ].map(([k,v])=>(
            <div key={k} style={{
              display: 'flex', gap: '8px', padding: '5px 0',
              borderBottom: '1px solid #2a3a4a', fontSize: '12px'
            }}>
              <span style={{ color: '#8a9ab0', minWidth: '68px', flexShrink: 0 }}>{k}</span>
              <span style={{ color: '#e8eaed' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* 체험 담당자 확인 */}
        <div style={card}>
          <div style={sectionTitle}>체험 담당자 확인</div>
          {pkgVendors.length === 0 && (
            <div style={{ fontSize: '12px', color: '#8a9ab0', textAlign: 'center', padding: '8px 0' }}>
              패키지 업체 매핑 없음
            </div>
          )}
          {pkgVendors.map(pv => {
            const vc  = vendorConfirms.find(x => x.vendor_key === pv.vendor_key)
            const st  = vc?.status || 'wait'
            const v   = vendors?.find(x => x.key === pv.vendor_key)
            const stColor = st==='ok'?'#5cb85c':st==='no'?'#e05c5c':'#f7c948'
            const stLabel = st==='ok'?'✓ 가능':st==='no'?'✗ 불가':'대기'
            return (
              <div key={pv.vendor_key} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 0', borderBottom: '1px solid #2a3a4a'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: v?.color||'#4ecdc4', flexShrink: 0
                  }}/>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#e8eaed' }}>
                      {v?.name||pv.vendor_key}
                    </div>
                    <div style={{ fontSize: '10px', color: '#8a9ab0' }}>{pv.prog_name}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', color: stColor, fontWeight: '700', minWidth: '36px', textAlign: 'right' }}>
                    {stLabel}
                  </span>
                  {['ok','no','wait'].map(s => (
                    <button key={s} onClick={() => handleVendorConfirm(pv.vendor_key, s)}
                      disabled={loadingVC}
                      style={{
                        height: '24px', padding: '0 7px',
                        background: st===s
                          ? s==='ok' ? 'rgba(92,184,92,.3)' : s==='no' ? 'rgba(224,92,92,.3)' : 'rgba(90,112,128,.3)'
                          : 'rgba(255,255,255,.05)',
                        border: '1px solid ' + (st===s
                          ? s==='ok' ? 'rgba(92,184,92,.5)' : s==='no' ? 'rgba(224,92,92,.5)' : 'rgba(90,112,128,.5)'
                          : '#2a3a4a'),
                        borderRadius: '5px', cursor: 'pointer', fontSize: '11px',
                        color: s==='ok'?'#5cb85c':s==='no'?'#e05c5c':'#8a9ab0',
                        fontFamily: 'Noto Sans KR, sans-serif'
                      }}>
                      {s==='ok'?'✓':s==='no'?'✗':'↺'}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* 숙소 확인 */}
        <div style={card}>
          <div style={sectionTitle}>숙소 확인</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: lodgeConfirm?.checked ? '#5cb85c' : '#f7c948'
              }}/>
              <span style={{ fontSize: '12px', fontWeight: '600', color: '#e8eaed' }}>
                {lodgeConfirm?.checked ? '확인 완료' : '미확인'}
              </span>
              {lodgeConfirm?.note && (
                <span style={{ fontSize: '11px', color: '#8a9ab0' }}>({lodgeConfirm.note})</span>
              )}
            </div>
            <button
              onClick={() => setShowLodgeForm(!showLodgeForm)}
              style={{
                height: '26px', padding: '0 10px',
                background: 'rgba(78,205,196,0.1)', border: '1px solid rgba(78,205,196,0.3)',
                borderRadius: '6px', color: '#4ecdc4', fontSize: '11px',
                cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif'
              }}>
              {showLodgeForm ? '닫기' : '📞 입력'}
            </button>
          </div>

          {lodgeConfirm?.lodge && !showLodgeForm && (
            <div style={{
              fontSize: '12px', color: '#8a9ab0', padding: '6px 10px',
              background: '#1a2535', borderRadius: '6px'
            }}>
              🏠 {lodgeConfirm.lodge} · {lodgeConfirm.room||'객실미정'}
            </div>
          )}

          {showLodgeForm && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              <select value={lodgeForm.lodge}
                onChange={e => setLodgeForm(f => ({ ...f, lodge: e.target.value, room: '' }))}
                style={{
                  height: '34px', background: '#1a2535', border: '1px solid #2a3a4a',
                  borderRadius: '6px', padding: '0 10px', color: '#e8eaed',
                  fontSize: '12px', fontFamily: 'Noto Sans KR, sans-serif'
                }}>
                <option value="">숙소 선택</option>
                {Object.keys(LODGE_MASTER).map(l => <option key={l}>{l}</option>)}
              </select>
              {lodgeForm.lodge && (
                <select value={lodgeForm.room}
                  onChange={e => setLodgeForm(f => ({ ...f, room: e.target.value }))}
                  style={{
                    height: '34px', background: '#1a2535', border: '1px solid #2a3a4a',
                    borderRadius: '6px', padding: '0 10px', color: '#e8eaed',
                    fontSize: '12px', fontFamily: 'Noto Sans KR, sans-serif'
                  }}>
                  <option value="">객실 선택</option>
                  {(LODGE_MASTER[lodgeForm.lodge]||[]).map(r => <option key={r}>{r}</option>)}
                </select>
              )}
              <input type="text" value={lodgeForm.note} placeholder="메모 (예: 전화확인 완료)"
                onChange={e => setLodgeForm(f => ({ ...f, note: e.target.value }))}
                style={{
                  height: '34px', background: '#1a2535', border: '1px solid #2a3a4a',
                  borderRadius: '6px', padding: '0 10px', color: '#e8eaed',
                  fontSize: '12px', fontFamily: 'Noto Sans KR, sans-serif'
                }}
              />
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => handleLodgeSave(true)} disabled={loadingLC} style={{
                  flex: 1, height: '32px', background: 'rgba(92,184,92,.15)',
                  border: '1px solid rgba(92,184,92,.3)', borderRadius: '6px',
                  color: '#5cb85c', fontSize: '12px', fontWeight: '700',
                  cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif'
                }}>✓ 확인 완료</button>
                <button onClick={() => handleLodgeSave(false)} disabled={loadingLC} style={{
                  flex: 1, height: '32px', background: 'rgba(224,92,92,.1)',
                  border: '1px solid rgba(224,92,92,.3)', borderRadius: '6px',
                  color: '#e05c5c', fontSize: '12px', cursor: 'pointer',
                  fontFamily: 'Noto Sans KR, sans-serif'
                }}>미확인으로 저장</button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
