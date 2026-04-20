import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api/client';

export interface TicketField {
  id: string;
  name: string;
  label: string;
  field_type: 'text' | 'textarea' | 'select' | 'checkbox';
  options: string | null;
  is_active: boolean;
}

export function useTicketFields() {
  return useQuery<TicketField[]>({
    queryKey: ['ticket-fields'],
    queryFn: () => dashboardApi.get('/ticket-fields'),
  });
}
