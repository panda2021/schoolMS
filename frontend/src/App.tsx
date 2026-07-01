import { Route, Routes, Navigate } from 'react-router-dom'
import Landing from './pages/Landing'
import Login from '@/pages/Login'
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
import Helpdesk from '@/pages/Helpdesk'
import FeatureMatrix from '@/pages/FeatureMatrix'
import ProtectedLayout from '@/ui/auth/ProtectedLayout'
import RoleRedirect from '@/ui/auth/RoleRedirect'
import AdminDashboard from '@/pages/AdminDashboard'
import TeacherDashboard from '@/pages/TeacherDashboard'
import ParentDashboard from '@/pages/ParentDashboard'
import SuperAdminDashboard from '@/pages/SuperAdminDashboard'

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />

      {/* Protected app routes under /app */}
      <Route path="/app" element={<ProtectedLayout />}>
        <Route index element={<RoleRedirect />} />
        <Route path="super" element={<SuperAdminDashboard />} />
        <Route path="features" element={<FeatureMatrix />} />
        <Route path="admin" element={<AdminDashboard />} />
        <Route path="teacher" element={<TeacherDashboard />} />
        <Route path="parent" element={<ParentDashboard />} />
        <Route path="classes" element={<Classes />} />
        <Route path="students" element={<Students />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="updates" element={<Updates />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="messages" element={<Messages />} />
        <Route path="reports" element={<Reports />} />
        <Route path="grades" element={<Grades />} />
        <Route path="report-cards" element={<ReportCards />} />
        <Route path="search" element={<Search />} />
        <Route path="import" element={<BulkImport />} />
        <Route path="teachers" element={<Teachers />} />
        <Route path="helpdesk" element={<Helpdesk />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
