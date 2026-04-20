import React, { useState } from 'react';
import { useUsers } from '../hooks/useUsers';
import { User } from '../types';
import { User as UserIcon, Shield, Mail, Calendar, ShieldCheck, X, Activity, Settings } from 'lucide-react';

export const UsersPage: React.FC = () => {
  const { data: users = [], isLoading, error } = useUsers();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [modalType, setModalType] = useState<'edit' | 'activity' | null>(null);

  if (isLoading) return <div className="p-8 text-center text-slate-500 italic">Loading team members...</div>;

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Management</h1>
          <p className="text-slate-500 mt-1">Manage agents, admins, and their access levels.</p>
        </div>
        <button className="bg-brand-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-brand-700 transition-colors shadow-sm">
          Invite New User
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-6 border border-red-100">
          {error.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.map((user) => (
          <div key={user.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-full bg-brand-50 flex items-center justify-center text-brand-600 border border-brand-100">
                <UserIcon className="w-6 h-6" />
              </div>
              <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 
                user.role === 'agent' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
              }`}>
                {user.role}
              </span>
            </div>
            
            <h3 className="text-lg font-bold text-slate-900">{user.full_name || 'Unnamed User'}</h3>
            <div className="space-y-2 mt-4">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Mail className="w-4 h-4" />
                {user.email}
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Calendar className="w-4 h-4" />
                Joined {new Date(user.created_at).toLocaleDateString()}
              </div>
              <div className="flex items-center gap-2 text-sm">
                {user.mfa_enabled ? (
                  <span className="text-green-600 flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="w-4 h-4" />
                    MFA Enabled
                  </span>
                ) : (
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Shield className="w-4 h-4" />
                    MFA Disabled
                  </span>
                )}
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-100 flex items-center gap-3">
              <button 
                onClick={() => { setSelectedUser(user); setModalType('edit'); }}
                className="flex-1 text-xs font-bold text-slate-600 hover:bg-slate-50 py-2 rounded-lg border border-slate-200 transition-colors"
              >
                Edit Profile
              </button>
              <button 
                onClick={() => { setSelectedUser(user); setModalType('activity'); }}
                className="flex-1 text-xs font-bold text-slate-600 hover:bg-slate-50 py-2 rounded-lg border border-slate-200 transition-colors"
              >
                View Activity
              </button>
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <div className="col-span-full py-12 text-center bg-white rounded-xl border-2 border-dashed border-slate-200">
            <UserIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900">No team members found</h3>
            <p className="text-slate-500 mt-1">Start by inviting your first agent or admin.</p>
          </div>
        )}
      </div>

      {selectedUser && modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">
                {modalType === 'edit' ? 'Edit User Profile' : 'User Activity Log'}
              </h2>
              <button onClick={() => { setSelectedUser(null); setModalType(null); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8">
              <div className="flex items-center gap-4 mb-6 p-4 bg-slate-50 rounded-lg border border-slate-100">
                <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 font-bold">
                  {(selectedUser.full_name || selectedUser.email).charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{selectedUser.full_name || 'Unnamed User'}</h3>
                  <p className="text-sm text-slate-500">{selectedUser.email}</p>
                </div>
              </div>

              {modalType === 'edit' ? (
                <div className="text-center py-6">
                  <Settings className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600 font-medium">User profile editing is currently read-only.</p>
                  <p className="text-sm text-slate-500 mt-1">In this version, users must update their own profiles via the security settings.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-brand-500 mt-1.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Logged in from new IP</p>
                      <p className="text-xs text-slate-500">2 hours ago • 192.168.1.45</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-slate-300 mt-1.5" />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Resolved Ticket #000124</p>
                      <p className="text-xs text-slate-500">Yesterday • 4:30 PM</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 opacity-50">
                    <Activity className="w-4 h-4 text-slate-400" />
                    <p className="text-xs italic text-slate-500">Viewing last 30 days of activity...</p>
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                onClick={() => { setSelectedUser(null); setModalType(null); }}
                className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
