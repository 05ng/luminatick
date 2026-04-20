import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { SettingsLayout } from './components/layout/SettingsLayout';
import { LoginPage } from './pages/LoginPage';
import { MfaPage } from './pages/MfaPage';
import { TicketListPage } from './pages/TicketListPage';
import { TicketDetailPage } from './pages/TicketDetailPage';
import { ApiKeyPage } from './pages/ApiKeyPage';
import { AutomationPage } from './pages/AutomationPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { KnowledgeEditorPage } from './pages/KnowledgeEditorPage';
import { EmailChannelPage } from './pages/EmailChannelPage';
import { WidgetChannelPage } from './pages/WidgetChannelPage';
import { UsersPage } from './pages/UsersPage';
import { GroupsPage } from './pages/GroupsPage';
import { SettingsPage } from './pages/SettingsPage';
import { AgentPermissionsPage } from './pages/AgentPermissionsPage';
import { DashboardPage } from './pages/DashboardPage';
import { TicketFieldsPage } from './pages/TicketFieldsPage';
import { FiltersSettingsPage } from './pages/FiltersSettingsPage';
import { SecurityProfilePage } from './pages/SecurityProfilePage';
import { UsagePage } from './pages/UsagePage';
import { useAuthStore } from './store/authStore';

function ProtectedRoute({ children, requireMfa = true }: { children: React.ReactNode, requireMfa?: boolean }) {
  const { token, mfaRequired, user } = useAuthStore();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireMfa && mfaRequired) {
    return <Navigate to="/mfa" replace />;
  }

  // MFA Enforcement: Force agents and admins to set up MFA
  if (user && ['agent', 'admin'].includes(user.role) && !user.mfa_enabled) {
    if (location.pathname !== '/profile/security' && location.pathname !== '/mfa') {
      return <Navigate to="/profile/security" replace />;
    }
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/mfa"
          element={
            <ProtectedRoute requireMfa={false}>
              <MfaPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="tickets" element={<TicketListPage />} />
          <Route path="tickets/:id" element={<TicketDetailPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="knowledge/new" element={<KnowledgeEditorPage />} />
          <Route path="knowledge/edit/:id" element={<KnowledgeEditorPage />} />
          <Route path="profile/security" element={<SecurityProfilePage />} />

          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="general" replace />} />
            <Route path="general" element={<SettingsPage />} />
            <Route path="agent-permissions" element={<AgentPermissionsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="groups" element={<GroupsPage />} />
            <Route path="ticket-fields" element={<TicketFieldsPage />} />
            <Route path="filters" element={<FiltersSettingsPage />} />
            <Route path="automations" element={<AutomationPage />} />
            <Route path="api-keys" element={<ApiKeyPage />} />
            <Route path="usage" element={<UsagePage />} />
            <Route path="channels/email" element={<EmailChannelPage />} />
            <Route path="channels/widget" element={<WidgetChannelPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
