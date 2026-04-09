import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const supabase = createServerComponentClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  // 예약 데이터 가져오기
  const { data: reservations } = await supabase
    .from('reservations')
    .select('*')
    .order('date', { ascending: false })

  // 업체 데이터
  const { data: vendors } = await supabase
    .from('vendors')
    .select('*')
    .order('key')

  // 구역 데이터
  const { data: zones } = await supabase
    .from('zones')
    .select('*')

  // 패키지 데이터
  const { data: packages } = await supabase
    .from('packages')
    .select('*, programs(*)')

  return (
    <DashboardClient
      user={session.user}
      reservations={reservations || []}
      vendors={vendors || []}
      zones={zones || []}
      packages={packages || []}
    />
  )
}
