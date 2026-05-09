import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export function createServerSupabase() {
  return createRouteHandlerClient({ cookies })
}

export const supabase = new Proxy({}, {
  get(_target, prop) {
    const client = createServerSupabase()
    const value = client[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
