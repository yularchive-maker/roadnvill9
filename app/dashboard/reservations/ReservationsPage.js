'use client'
import { useState, useEffect, useCallback } from 'react'
import ReservationModal from './ReservationModal'
import ReservationDetail from './ReservationDetail'

const STATUS_LABEL = { confirmed:'확정', pending:'대기', cancelled:'취소', consult:'상담필요' }
const STATUS_COLOR = { confirmed:'#5cb85c', pending:'#f7c948', cancelled:'#e05c5c', consult:'#8a9ab0' }

export default function ReservationsPage({ packages, zones, vendors, initialNewDate, initialDetailRes, onClearNew }) {
  const [reservations, setReservations] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editData,     setEditData]     = useState(null)
  const [detailRes,    setDetailRes]    = useState(null)
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMonth,  setFilterMonth]  = useState('')

  const fetchReservations = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/reservations')
    const data = await res.json()
    setReservations(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchReservations() }, [fetchReservations])

  // Open new reservation modal when triggered from calendar
  useEffect(() => {
    if (initialNewDate) {
      setEditData(null)
      setModalOpen(true)
      onClearNew?.()
    }
  }, [initialNewDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Open detail when triggered from calendar
  useEffect(() => {
    if (initialDetailRes) {
      setDetailRes(initialDetailRes)
      onClearNew?.()
    }
  }, [initialDetailRes]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setDetailRes(null)
    await fetchReservations()
  }

  const openNew  = () => { setEditData(null); setModalOpen(true) }
  const openEdit = (r) => { setEditData(r); setModalOpen(true) }

  const filtered = reservations.filter(r => {
    const kwOk = !search || r.customer?.includes(search) || r.no?.includes(search) || r.pkg?.includes(search)
    const stOk = !filterStatus || r.type === filterStatus
    const moOk = !filterMonth  || r.date?.startsWith(filterMonth)
    return kwOk && stOk && moOk
  })

  return (
    <div>
      {/* 검색바 */}
      <div style={{ display:'flex', gap:'8px', marginBottom:'16px', flexWrap:'wrap', alignItems:'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="고객명, NO, 패키지 검색..."
          style={{
            height:'36px', padding:'0 14px', background:'#1a2535',
            border:'1px solid #2a3a4a', borderRadius:'8px',
            color:'#e8eaed', fontSize:'13px', outline:'none', minWidth:'200px',
            fontFamily:'Noto Sans KR, sans-serif'
          }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
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
        <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
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

      <div style={{ display:'flex', gap:'14px', alignItems:'flex-start' }}>
        {/* 목록 */}
        <div style={{
          flex:1, background:'#1a2535', border:'1px solid #2a3a4a',
          borderRadius:'12px', overflow:'hidden', minWidth:0
        }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
              <thead>
                <tr style={{ background:'#0f1923' }}>
                  {['NO','날짜','고객명','패키지','인원','상태','1인판매가','총결제','결제처','운영'].map(h=>(
                    <th key={h} style={{
                      padding:'11px 14px', textAlign:'left', color:'#8a9ab0',
                      fontSize:'11px', fontWeight:'600', whiteSpace:'nowrap'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={10} style={{ padding:'40px', textAlign:'center', color:'#8a9ab0' }}>
                    불러오는 중...
                  </td></tr>
                )}
                {!loading && filtered.length === 0 && (
                  <tr><td colSpan={10} style={{ padding:'40px', textAlign:'center', color:'#8a9ab0' }}>
                    예약이 없습니다
                  </td></tr>
                )}
                {!loading && filtered.map(r => (
                  <tr key={r.id}
                    onClick={() => setDetailRes(prev => prev?.no === r.no ? null : r)}
                    style={{
                      borderTop:'1px solid #2a3a4a', cursor:'pointer',
                      background: detailRes?.no===r.no ? 'rgba(78,205,196,0.08)' : 'transparent'
                    }}
                    onMouseEnter={e => { if(detailRes?.no!==r.no) e.currentTarget.style.background='rgba(78,205,196,0.04)' }}
                    onMouseLeave={e => { if(detailRes?.no!==r.no) e.currentTarget.style.background='transparent' }}
                  >
                    <td style={{ padding:'14px', color:'#8a9ab0', fontFamily:'monospace' }}>#{r.no}</td>
                    <td style={{ padding:'14px', whiteSpace:'nowrap' }}>{r.date}</td>
                    <td style={{ padding:'14px', fontWeight:'600' }}>{r.customer}</td>
                    <td style={{ padding:'14px', color:'#8a9ab0' }}>{r.pkg}</td>
                    <td style={{ padding:'14px' }}>{r.pax}명</td>
                    <td style={{ padding:'14px' }}>
                      <span style={{
                        padding:'3px 10px', borderRadius:'20px', fontSize:'11px', fontWeight:'600',
                        background:(STATUS_COLOR[r.type]||'#8a9ab0')+'22',
                        color: STATUS_COLOR[r.type]||'#8a9ab0'
                      }}>{STATUS_LABEL[r.type]||r.type}</span>
                    </td>
                    <td style={{ padding:'14px', fontFamily:'monospace' }}>₩{(r.price||0).toLocaleString()}</td>
                    <td style={{ padding:'14px', fontFamily:'monospace', fontWeight:'600', color:'#4ecdc4' }}>₩{(r.total||0).toLocaleString()}</td>
                    <td style={{ padding:'14px', color:'#8a9ab0', fontSize:'12px' }}>{r.payto}</td>
                    <td style={{ padding:'14px', color:r.op==='사업비'?'#f7c948':'#8a9ab0', fontSize:'12px' }}>{r.op}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 상세 패널 */}
        {detailRes && (
          <ReservationDetail
            reservation={detailRes}
            vendors={vendors}
            packages={packages}
            onEdit={(r) => { openEdit(r) }}
            onDelete={handleDelete}
            onClose={() => setDetailRes(null)}
          />
        )}
      </div>

      <ReservationModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        editData={editData}
        initialDate={initialNewDate || undefined}
        packages={packages}
        zones={zones}
      />
    </div>
  )
}
