import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/client';
import { User } from '../types';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const data = await dashboardApi.get<{ users: User[], page: number, limit: number }>('/users');
      return data.users;
    },
  });
}
