import { Route, Routes, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Login from '@/pages/Login'
import ResetPassword from '@/pages/ResetPassword'
import Dashboard from '@/pages/Dashboard'
import Attendance from '@/pages/Attendance'
import Updates from '@/pages/Updates'
import Messages from '@/pages/Messages'
import Reports from '@/pages/Reports'
import Announcements from '@/pages/Announcements'
import Classes from '@/pages/Classes'
import Students from '@/pages/Students'
import Settings from '@/pages/Settings'
import BulkImport from '@/pages/BulkImport'
import Search from '@/pages/Search'
import Grades from '@/pages/Grades'
import ReportCards from '@/pages/ReportCards'
import Teachers from '@/pages/Teachers'
import Parents from '@/pages/Parents'
import PendingApproval from '@/pages/PendingApproval'
import Helpdesk from '@/pages/Helpdesk'
import FeatureMatrix from '@/pages/FeatureMatrix'
import ProtectedLayout from '@/ui/auth/ProtectedLayout'
import RoleRedirect from '@/ui/auth/RoleRedirect'
import RequireRole from '@/ui/auth/RequireRole'
import AdminDashboard from '@/pages/AdminDashboard'
import TeacherDashboard from '@/pages/TeacherDashboard'
import ParentDashboard from '@/pages/ParentDashboard'
import SuperAdminDashboard from '@/pages/SuperAdminDashboard'
import type { Role } from '@/ui/auth/RoleProvider'

// Any provisioned (non-'pending') role. Shared operational pages allow these.
const PROVISIONED: Role[] = ['super_admin', 'school_admin', 'teacher', 'parent']

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected app routes under /app.
          Role home dashboards are gated to their own role; shared operational
          pages are open to any provisioned role (super_admin/school_admin/
          teacher/parent) but closed to 'pending' users. RLS + capabilities
          still gate the data and actions within each page. */}
      <Route path="/app" element={<ProtectedLayout />}>
        <Route index element={<RoleRedirect />} />
        <Route path="super" element={<RequireRole allow={['super_admin']}><SuperAdminDashboard /></RequireRole>} />
        <Route path="features" element={<RequireRole allow={['super_admin']}><FeatureMatrix /></RequireRole>} />
        <Route path="admin" element={<RequireRole allow={['school_admin', 'super_admin']}><AdminDashboard /></RequireRole>} />
        <Route path="teacher" element={<RequireRole allow={['teacher']}><TeacherDashboard /></RequireRole>} />
        <Route path="parent" element={<RequireRole allow={['parent']}><ParentDashboard /></RequireRole>} />
        <Route path="classes" element={<RequireRole allow={PROVISIONED}><Classes /></RequireRole>} />
        <Route path="students" element={<RequireRole allow={PROVISIONED}><Students /></RequireRole>} />
        <Route path="attendance" element={<RequireRole allow={PROVISIONED}><Attendance /></RequireRole>} />
        <Route path="updates" element={<RequireRole allow={PROVISIONED}><Updates /></RequireRole>} />
        <Route path="announcements" element={<RequireRole allow={PROVISIONED}><Announcements /></RequireRole>} />
        <Route path="messages" element={<RequireRole allow={PROVISIONED}><Messages /></RequireRole>} />
        <Route path="reports" element={<RequireRole allow={PROVISIONED}><Reports /></RequireRole>} />
        <Route path="grades" element={<RequireRole allow={PROVISIONED}><Grades /></RequireRole>} />
        <Route path="report-cards" element={<RequireRole allow={PROVISIONED}><ReportCards /></RequireRole>} />
        <Route path="search" element={<RequireRole allow={PROVISIONED}><Search /></RequireRole>} />
        <Route path="import" element={<RequireRole allow={PROVISIONED}><BulkImport /></RequireRole>} />
        <Route path="teachers" element={<RequireRole allow={PROVISIONED}><Teachers /></RequireRole>} />
        <Route path="parents" element={<RequireRole allow={PROVISIONED}><Parents /></RequireRole>} />
        <Route path="pending" element={<PendingApproval />} />
        <Route path="helpdesk" element={<RequireRole allow={PROVISIONED}><Helpdesk /></RequireRole>} />
        <Route path="settings" element={<RequireRole allow={PROVISIONED}><Settings /></RequireRole>} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
