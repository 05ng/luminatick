import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '../api/client';
import { TicketFilter } from '@luminatick/shared';

export function useFilters() {
  return useQuery({
    queryKey: ['filters'],
    queryFn: () => dashboardApi.get<TicketFilter[]>('/settings/filters'),
  });
}

export function useCreateFilter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<TicketFilter>) => dashboardApi.post<TicketFilter>('/settings/filters', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filters'] });
    },
  });
}

export function useUpdateFilter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<TicketFilter> & { id: string }) =>
      dashboardApi.put<TicketFilter>(`/settings/filters/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filters'] });
    },
  });
}

export function useDeleteFilter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dashboardApi.delete(`/settings/filters/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['filters'] });
    },
  });
}
