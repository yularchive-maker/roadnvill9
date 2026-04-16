import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createServerComponentClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const [
    { data: reservations },
    { data: vendors },
    { data: zones },
    { data: packages },
  ] = await Promise.all([
    supabase.from('reservations').select('*').order('date', { ascending: false }),
    supabase.from('vendors').select('*').order('key'),
    supabase.from('zones').select('*').order('code'),
    supabase.from('packages').select('*, programs(*)').order('name'),
  ])

  return (
    <DashboardClient
      user={session.user}
      initialReservations={reservations || []}
      vendors={vendors || []}
      zones={zones || []}
      packages={packages || []}
    />
  )
}
