'use client'
import { useState, useEffect, useCallback } from 'react'
import ReservationModal from './ReservationModal'

const STATUS_LABEL  = { confirmed:'확정', pending:'대기', cancelled:'취소', consult:'상담필요' }
const STATUS_COLOR  = { confirmed:'#5cb85c', pending:'#f7c948', cancelled:'#e05c5c', consult:'#8a9ab0' }

export default function ReservationsPage({ packages, zones }) {
  const [reservations, setReservations] = useState([])
  const [loading, setLoading]           = useState(true)
  const [modalOpen, setModalOpen]       = useState(false)
  const [editData, setEditData]         = useState(null)
  const [search, setSearch]             = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMonth, setFilterMonth]   = useState('')
  const [detailNo, setDetailNo]         = useState(null)

  const fetchReservations = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/reservations')
    const data = await res.json()
    setReservations(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchReservations() }, [fetchReservations])

  const handleSave = async (form) => {
    if (editData) {
      await fetch(`/api/reservations/${editData.no}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
    } else {
      await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
    }
    await fetchReservations()
  }

  const handleDelete = async (no) => {
    if (!confirm(`#${no} 예약을 삭제하시겠습니까?`)) return
    await fetch(`/api/reservations/${no}`, { method: 'DELETE' })
    setDetailNo(null)
    await fetchReservations()
  }

  const openNew = () => { setEditData(null); setModalOpen(true) }
  const openEdit = (r) => { setEditData(r); setModalOpen(true) }

  // 필터
  const filtered = reservations.filter(r => {
    const kwOk = !search || r.customer?.includes(search) || r.no?.includes(search) || r.pkg?.includes(search)
    const stOk = !filterStatus || r.type === filterStatus
    const moOk = !filterMonth || r.date?.startsWith(filterMonth)
    return kwOk && stOk && moOk
  })

  const detail = detailNo ? reservations.find(r => r.no === detailNo) : null

  return (
    <div>
      {/* 검색바 */}
      <div style={{ display:'flex', gap:'8px', marginBottom:'16px', flexWrap:'wrap', alignItems:'center' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="고객명, NO, 패키지 검색..."
          style={{
            height:'36px', padding:'0 14px', background:'#1a2535',
            border:'1px solid #2a3a4a', borderRadius:'8px',
            color:'#e8eaed', fontSize:'13px', outline:'none', minWidth:'200px',
            fontFamily:'Noto Sans KR, sans-serif'
          }}
        />
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
          style={{
            height:'36px', padding:'0 10px', background:'#1a2535',
            border:'1px solid #2a3a4a', borderRadius:'8px',
            color:'#e8eaed', fontSize:'13px', outline:'none',
            fontFamily:'Noto Sans KR, sans-serif'
          }}>
          <option value="">전체 상태</option>
          <option value="confirmed">확정</option>
          <option value="pending">대기</option>
          <option value="cancelled">취소</option>
          <option value="consult">상담필요</option>
        </select>
        <input type="month" value={filterMonth} onChange={e=>setFilterMonth(e.target.value)}
          style={{
            height:'36px', padding:'0 10px', background:'#1a2535',
            border:'1px solid #2a3a4a', borderRadius:'8px',
            color:'#e8eaed', fontSize:'13px', outline:'none',
            fontFamily:'Noto Sans KR, sans-serif'
          }}
        />
        <div style={{ marginLeft:'auto', display:'flex', gap:'8px', alignItems:'center' }}>
          <span style={{ fontSize:'12px', color:'#8a9ab0' }}>총 {filtered.length}건</span>
          <button onClick={openNew} style={{
            height:'36px', padding:'0 16px', background:'#4ecdc4',
            border:'none', borderRadius:'8px', color:'#0f1923',
            fontSize:'13px', fontWeight:'700', cursor:'pointer',
            fontFamily:'Noto Sans KR, sans-serif'
          }}>+ 예약 등록</button>
        </div>
      </div>

      <div style={{ display:'flex', gap:'14px' }}>
        {/* 목록 */}
        <div style={{ flex:1, background:'#1a2535', border:'1px solid #2a3a4a', borderRadius:'12px', overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
              <thead>
                <tr style={{ background:'#0f1923' }}>
                  {['NO','날짜','고객명','패키지','인원','상태','1인판매가','총결제','결제처','운영'].map(h=>(
                    <th key={h} style={{ padding:'11px 14px', textAlign:'left', color:'#8a9ab0', fontSize:'11px', fontWeight:'600', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={10} style={{ padding:'40px', textAlign:'center', color:'#8a9ab0' }}>불러오는 중...</td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={10} style={{ padding:'40px', textAlign:'center', color:'#8a9ab0' }}>예약이 없습니다</td></tr>
                )}
                {!loading && filtered.map(r => (
                  <tr key={r.id}
                    onClick={() => setDetailNo(r.no === detailNo ? null : r.no)}
                    style={{
                      borderTop:'1px solid #2a3a4a', cursor:'pointer',
                      background: detailNo === r.no ? 'rgba(78,205,196,0.08)' : 'transparent'
                    }}
                    onMouseEnter={e => { if(detailNo!==r.no) e.currentTarget.style.background='rgba(78,205,196,0.04)' }}
                    onMouseLeave={e => { if(detailNo!==r.no) e.currentTarget.style.background='transparent' }}
                  >
                    <td style={{ padding:'13px 14px', color:'#8a9ab0', fontFamily:'monospace' }}>#{r.no}</td>
                    <td style={{ padding:'13px 14px', whiteSpace:'nowrap' }}>{r.date}</td>
                    <td style={{ padding:'13px 14px', fontWeight:'600' }}>{r.customer}</td>
                    <td style={{ padding:'13px 14px', color:'#8a9ab0' }}>{r.pkg}</td>
                    <td style={{ padding:'13px 14px' }}>{r.pax}명</td>
                    <td style={{ padding:'13px 14px' }}>
                      <span style={{
                        padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'600',
                        background:(STATUS_COLOR[r.type]||'#8a9ab0')+'22',
                        color: STATUS_COLOR[r.type]||'#8a9ab0'
                      }}>{STATUS_LABEL[r.type]||r.type}</span>
                    </td>
                    <td style={{ padding:'13px 14px', fontFamily:'monospace' }}>₩{(r.price||0).toLocaleString()}</td>
                    <td style={{ padding:'13px 14px', fontFamily:'monospace', fontWeight:'600', color:'#4ecdc4' }}>₩{(r.total||0).toLocaleString()}</td>
                    <td style={{ padding:'13px 14px', color:'#8a9ab0', fontSize:'12px' }}>{r.payto}</td>
                    <td style={{ padding:'13px 14px', color: r.op==='사업비'?'#f7c948':'#8a9ab0', fontSize:'12px' }}>{r.op}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 상세 패널 */}
        {detail && (
          <div style={{
            width:'280px', flexShrink:0, background:'#1a2535',
            border:'1px solid #2a3a4a', borderRadius:'12px',
            padding:'18px', fontSize:'13px'
          }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px' }}>
              <div style={{ fontWeight:'700', color:'#e8eaed' }}>#{detail.no} 상세</div>
              <div style={{ display:'flex', gap:'6px' }}>
                <button onClick={() => openEdit(detail)} style={{
                  height:'28px', padding:'0 12px', background:'rgba(78,205,196,0.1)',
                  border:'1px solid rgba(78,205,196,0.3)', borderRadius:'6px',
                  color:'#4ecdc4', fontSize:'11px', fontWeight:'700', cursor:'pointer',
                  fontFamily:'Noto Sans KR, sans-serif'
                }}>✎ 수정</button>
                <button onClick={() => handleDelete(detail.no)} style={{
                  height:'28px', padding:'0 10px', background:'rgba(224,92,92,0.1)',
                  border:'1px solid rgba(224,92,92,0.3)', borderRadius:'6px',
                  color:'#e05c5c', fontSize:'11px', cursor:'pointer',
                  fontFamily:'Noto Sans KR, sans-serif'
                }}>삭제</button>
              </div>
            </div>
            {[
              ['고객명', detail.customer],
              ['연락처', detail.tel||'-'],
              ['날짜', detail.date+(detail.end_date&&detail.end_date!==detail.date?' ~ '+detail.end_date:'')],
              ['인원', detail.pax+'명'],
              ['패키지', detail.pkg||'-'],
              ['구역', detail.zone||'-'],
              ['상태', STATUS_LABEL[detail.type]||detail.type],
              ['운영구분', detail.op||'-'],
              ['1인판매가', '₩'+(detail.price||0).toLocaleString()],
              ['픽업비', detail.pickup?'₩'+detail.pickup.toLocaleString():'없음'],
              ['총결제', '₩'+(detail.total||0).toLocaleString()],
              ['결제처', detail.payto||'-'],
              ['메모', detail.memo||'-'],
            ].map(([k,v])=>(
              <div key={k} style={{ padding:'7px 0', borderBottom:'1px solid #2a3a4a', display:'flex', gap:'8px' }}>
                <span style={{ fontSize:'11px', color:'#8a9ab0', minWidth:'70px', flexShrink:0 }}>{k}</span>
                <span style={{ color:'#e8eaed', wordBreak:'break-all' }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <ReservationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        editData={editData}
        packages={packages}
        zones={zones}
      />
    </div>
  )
}
