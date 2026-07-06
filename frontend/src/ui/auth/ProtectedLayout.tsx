import React from 'react'
import { Outlet } from 'react-router-dom'
import RequireAuth from '@/ui/auth/RequireAuth'
import { RoleProvider } from '@/ui/auth/RoleProvider'
import { AppShell } from '@/ui/layout/AppShell'

export default function ProtectedLayout() {
  return (
    <RequireAuth>
      <RoleProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </RoleProvider>
    </RequireAuth>
  )
}
