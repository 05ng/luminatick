import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '../api/client';
import { Group, GroupMember, User } from '../types';

export function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: () => dashboardApi.get<Group[]>('/groups'),
  });
}

export function useCreateGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      dashboardApi.post<Group>('/groups', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useDeleteGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dashboardApi.delete(`/groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useGroupMembers(groupId: string) {
  return useQuery({
    queryKey: ['groups', groupId, 'members'],
    queryFn: () => dashboardApi.get<GroupMember[]>(`/groups/${groupId}/members`),
    enabled: !!groupId,
  });
}

export function useAddMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      dashboardApi.post(`/groups/${groupId}/members`, { userId }),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: ['groups', groupId, 'members'] });
    },
  });
}

export function useRemoveMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, userId }: { groupId: string; userId: string }) =>
      dashboardApi.delete(`/groups/${groupId}/members/${userId}`),
    onSuccess: (_, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: ['groups', groupId, 'members'] });
    },
  });
}

export function useAgents() {
  return useQuery({
    queryKey: ['users', 'agents'],
    queryFn: () => dashboardApi.get<User[]>('/users/agents'),
  });
}
