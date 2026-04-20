import React, { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Settings, Users, Shield, Zap, Key, LayoutTemplate, FormInput, Mail, CreditCard } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useAuthStore } from '../../store/authStore';
import { dashboardApi } from '../../api/client';

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

const settingsNavigation = [
  { name: 'General', href: '/settings/general', icon: Settings, permissionKey: 'general' },
  { name: 'Users', href: '/settings/users', icon: Users, permissionKey: 'users' },
  { name: 'Groups', href: '/settings/groups', icon: Shield, permissionKey: 'groups' },
  { name: 'Ticket Fields', href: '/settings/ticket-fields', icon: FormInput, permissionKey: 'ticket_fields' },
  { name: 'Filters', href: '/settings/filters', icon: LayoutTemplate, permissionKey: 'filters' },
  { name: 'Automations', href: '/settings/automations', icon: Zap, permissionKey: 'automations' },
  { name: 'API Keys', href: '/settings/api-keys', icon: Key, permissionKey: 'api_keys' },
  { name: 'Usage & Costs', href: '/settings/usage', icon: CreditCard, permissionKey: 'usage' },
];

const channelsNavigation = [
  { name: 'Email', href: '/settings/channels/email', icon: Mail, permissionKey: 'channels_email' },
  { name: 'Widget', href: '/settings/channels/widget', icon: LayoutTemplate, permissionKey: 'channels_widget' },
];

export function SettingsLayout() {
  const { user } = useAuthStore();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (user?.role === 'agent') {
      dashboardApi.get('/permissions').then(data => setPermissions((data || {}) as Record<string, boolean>)).catch(console.error);
    }
  }, [user]);

  const hasPermission = (key: string) => {
    if (user?.role === 'admin') return true;
    return permissions[key] === true;
  };

  const filteredSettingsNav = settingsNavigation.filter(item => hasPermission(item.permissionKey));
  const filteredChannelsNav = channelsNavigation.filter(item => hasPermission(item.permissionKey));

  return (
    <div className="flex h-full">
      {/* Sub-sidebar */}
      <div className="w-64 bg-white border-r border-slate-200 h-full overflow-y-auto shrink-0 hidden md:block">
        <div className="p-4">
          <h2 className="text-lg font-bold text-slate-900 mb-4 px-2">Settings</h2>
          <nav className="space-y-1">
            {filteredSettingsNav.map((item) => (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  )
                }
              >
                <item.icon className="w-4 h-4" />
                {item.name}
              </NavLink>
            ))}
            
            {user?.role === 'admin' && (
              <NavLink
                to="/settings/agent-permissions"
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors mt-4 bg-slate-100",
                    isActive
                      ? "bg-brand-100 text-brand-800 ring-1 ring-brand-300"
                      : "text-slate-700 hover:bg-slate-200"
                  )
                }
              >
                <Shield className="w-4 h-4" />
                Agent Permissions
              </NavLink>
            )}
          </nav>

          {filteredChannelsNav.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-8 mb-3 px-2">
                Channels
              </h3>
              <nav className="space-y-1">
                {filteredChannelsNav.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                        isActive
                          ? "bg-brand-50 text-brand-700"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      )
                    }
                  >
                    <item.icon className="w-4 h-4" />
                    {item.name}
                  </NavLink>
                ))}
              </nav>
            </>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-slate-50">
        <div className="p-4 lg:p-8 w-full max-w-6xl mx-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
