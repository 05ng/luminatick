import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/client';

export interface Stats {
  ticketsByStatus: { status: string; count: number }[];
  ticketsByPriority: { priority: string; count: number }[];
  totalUsers: number;
  totalGroups: number;
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: () => dashboardApi.get<Stats>('/stats'),
  });
}
