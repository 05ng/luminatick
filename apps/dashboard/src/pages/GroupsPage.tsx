import React, { useState } from 'react';
import { 
  Users, 
  Plus, 
  Trash2, 
  UserPlus, 
  X, 
  Shield, 
  Mail, 
  Search,
  AlertCircle
} from 'lucide-react';
import { 
  useGroups, 
  useCreateGroup, 
  useDeleteGroup, 
  useGroupMembers, 
  useAddMember, 
  useRemoveMember, 
  useAgents 
} from '../hooks/useGroups';
import { useAuthStore } from '../store/authStore';
import { Group, User } from '../types';

export const GroupsPage: React.FC = () => {
  const { user: currentUser } = useAuthStore();
  const isAdmin = currentUser?.role === 'admin';
  
  const { data: groups, isLoading: isLoadingGroups } = useGroups();
  const createGroupMutation = useCreateGroup();
  const deleteGroupMutation = useDeleteGroup();
  
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  
  const [managingGroupId, setManagingGroupId] = useState<string | null>(null);
  
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName) return;
    
    try {
      await createGroupMutation.mutateAsync({ 
        name: newGroupName, 
        description: newGroupDescription 
      });
      setNewGroupName('');
      setNewGroupDescription('');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create group', error);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm('Are you sure you want to delete this group? It must not have any active tickets.')) return;
    
    try {
      await deleteGroupMutation.mutateAsync(id);
    } catch (error: any) {
      alert(error.message || 'Failed to delete group. Ensure no tickets are assigned to it.');
    }
  };

  if (isLoadingGroups) return <div className="p-8 text-center text-slate-500">Loading groups...</div>;

  const managingGroup = groups?.find(g => g.id === managingGroupId);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Group Management</h1>
          <p className="text-slate-500 mt-1">Organize agents into teams to handle specific ticket categories.</p>
        </div>
        {isAdmin && (
          <button 
            onClick={() => setIsCreating(true)}
            className="bg-brand-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-brand-700 transition-colors shadow-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Group
          </button>
        )}
      </div>

      {isCreating && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-8 animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-900">New Support Group</h2>
            <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Group Name</label>
              <input
                type="text"
                required
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                placeholder="e.g., Technical Support"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Description (Optional)</label>
              <textarea
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                placeholder="Briefly describe what this group handles..."
                rows={2}
                value={newGroupDescription}
                onChange={e => setNewGroupDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createGroupMutation.isPending}
                className="bg-brand-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                {createGroupMutation.isPending ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <th className="px-6 py-4">Group Name</th>
              <th className="px-6 py-4">Description</th>
              <th className="px-6 py-4">Created</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {groups?.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-500 italic">
                  No groups found. Create one to start organizing your team.
                </td>
              </tr>
            ) : (
              groups?.map((group) => (
                <tr key={group.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-900">{group.name}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">{group.description || '-'}</td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(group.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      onClick={() => setManagingGroupId(group.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-brand-600 hover:bg-brand-50 rounded-lg transition-colors border border-brand-200"
                    >
                      <Users className="w-3.5 h-3.5" />
                      Members
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteGroup(group.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete Group"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {managingGroupId && managingGroup && (
        <ManageMembersModal 
          group={managingGroup} 
          onClose={() => setManagingGroupId(null)} 
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
};

interface ManageMembersModalProps {
  group: Group;
  onClose: () => void;
  isAdmin: boolean;
}

const ManageMembersModal: React.FC<ManageMembersModalProps> = ({ group, onClose, isAdmin }) => {
  const { data: members, isLoading: isLoadingMembers } = useGroupMembers(group.id);
  const { data: agents } = useAgents();
  const addMemberMutation = useAddMember();
  const removeMemberMutation = useRemoveMember();
  
  const [searchTerm, setSearchTerm] = useState('');

  const handleAddMember = async (userId: string) => {
    try {
      await addMemberMutation.mutateAsync({ groupId: group.id, userId });
    } catch (error: any) {
      alert(error.message || 'Failed to add member');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Remove this member from the group?')) return;
    try {
      await removeMemberMutation.mutateAsync({ groupId: group.id, userId });
    } catch (error: any) {
      alert(error.message || 'Failed to remove member');
    }
  };

  const availableAgents = agents?.filter(agent => 
    !members?.some(member => member.id === agent.id) &&
    (agent.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
     agent.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Manage Members: {group.name}</h2>
            <p className="text-sm text-slate-500">Add or remove agents from this group.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Current Members Section */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Current Members ({members?.length || 0})</h3>
            <div className="space-y-2">
              {isLoadingMembers ? (
                <div className="text-center py-4 text-slate-400 italic">Loading members...</div>
              ) : members?.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center text-slate-500 italic">
                  No members assigned yet.
                </div>
              ) : (
                members?.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-brand-200 transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center text-brand-700 font-bold border border-brand-100">
                        {member.full_name?.[0] || member.email[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          {member.full_name || 'Unnamed'}
                          {member.role === 'admin' && <Shield className="w-3 h-3 text-purple-500" />}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {member.email}
                        </div>
                      </div>
                    </div>
                    {isAdmin && (
                      <button 
                        onClick={() => handleRemoveMember(member.id)}
                        className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        title="Remove member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Add New Member Section (Admin Only) */}
          {isAdmin && (
            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Add Agent</h3>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search agents by name or email..." 
                  className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-brand-500 transition-all focus:bg-white border-transparent"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="max-h-60 overflow-auto space-y-1 pr-1">
                {availableAgents?.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => handleAddMember(agent.id)}
                    className="w-full flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg transition-colors group text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 text-xs font-bold">
                        {agent.full_name?.[0] || agent.email[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{agent.full_name || 'Unnamed'}</div>
                        <div className="text-[11px] text-slate-500">{agent.email}</div>
                      </div>
                    </div>
                    <UserPlus className="w-4 h-4 text-slate-300 group-hover:text-brand-600 transition-colors" />
                  </button>
                ))}
                {availableAgents?.length === 0 && searchTerm && (
                  <div className="text-center py-4 text-slate-400 text-sm italic">No matching agents found.</div>
                )}
                {availableAgents?.length === 0 && !searchTerm && (
                  <div className="text-center py-4 text-slate-400 text-sm italic">All available agents are already in this group.</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition-all shadow-sm active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
