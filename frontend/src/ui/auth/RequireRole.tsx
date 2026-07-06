import { Navigate } from 'react-router-dom'
import { useRole, type Role } from '@/ui/auth/RoleProvider'

// Gates a route to a set of roles. A disallowed role is bounced to /app, where
// RoleRedirect sends them to their own home (pending -> /app/pending). RLS and
// the capability system remain the source of truth for data/actions; this only
// stops users loading pages meant for another role (notably 'pending' users).
export default function RequireRole({ allow, children }: { allow: Role[]; children: JSX.Element }) {
  const { role, loading } = useRole()
  if (loading) return <div style={{ padding: 24 }}>Loading...</div>
  if (!role || !allow.includes(role)) return <Navigate to="/app" replace />
  return children
}
