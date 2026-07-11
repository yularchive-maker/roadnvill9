import { NextResponse } from 'next/server'
import { requireApiUser, unauthorizedResponse } from '@/lib/api-auth'
import { userDisplayProfile } from '@/lib/auth-roles'

export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await requireApiUser()
  if (!user) return unauthorizedResponse()

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
    },
    profile: userDisplayProfile(user),
  })
}
