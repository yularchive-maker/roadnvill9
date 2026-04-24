import { Suspense } from 'react'
import ReservationsPage from './ReservationsPage'

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <Suspense>
      <ReservationsPage />
    </Suspense>
  )
}
