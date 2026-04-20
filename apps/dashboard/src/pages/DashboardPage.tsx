import React from 'react';
import { useStats } from '../hooks/useStats';
import { 
  BarChart3, 
  Users, 
  Ticket, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Users2
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { data: stats, isLoading } = useStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500 font-medium italic">
        Loading dashboard metrics...
      </div>
    );
  }

  const getStatusCount = (status: string) => 
    stats?.ticketsByStatus.find(s => s.status === status)?.count || 0;

  const totalTickets = stats?.ticketsByStatus.reduce((acc, curr) => acc + curr.count, 0) || 0;

  const cards = [
    {
      label: 'Total Tickets',
      value: totalTickets,
      icon: Ticket,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Open Tickets',
      value: getStatusCount('open'),
      icon: AlertCircle,
      color: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Pending Tickets',
      value: getStatusCount('pending'),
      icon: Clock,
      color: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Resolved Tickets',
      value: getStatusCount('resolved') + getStatusCount('closed'),
      icon: CheckCircle2,
      color: 'bg-slate-50 text-slate-600',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 text-sm">Welcome back to Luminatick. Here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((card, idx) => (
          <div key={idx} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-lg ${card.color}`}>
                <card.icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Metrics</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">{card.label}</p>
                <h3 className="text-3xl font-bold text-slate-900 mt-1">{card.value}</h3>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="w-5 h-5 text-slate-400" />
            <h3 className="font-bold text-slate-900">Tickets by Priority</h3>
          </div>
          <div className="space-y-4">
            {['urgent', 'high', 'normal', 'low'].map((priority) => {
              const count = stats?.ticketsByPriority.find(p => p.priority === priority)?.count || 0;
              const percentage = totalTickets > 0 ? (count / totalTickets) * 100 : 0;
              return (
                <div key={priority} className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="capitalize text-slate-600 font-medium">{priority}</span>
                    <span className="text-slate-900 font-bold">{count}</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        priority === 'urgent' ? 'bg-red-500' :
                        priority === 'high' ? 'bg-orange-500' :
                        priority === 'normal' ? 'bg-blue-500' : 'bg-slate-400'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Users2 className="w-5 h-5 text-slate-400" />
            <h3 className="font-bold text-slate-900">System Overview</h3>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-4 h-4 text-brand-600" />
                <span className="text-sm font-medium text-slate-600">Total Users</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{stats?.totalUsers || 0}</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
              <div className="flex items-center gap-3 mb-2">
                <Users2 className="w-4 h-4 text-brand-600" />
                <span className="text-sm font-medium text-slate-600">Active Groups</span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{stats?.totalGroups || 0}</p>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t border-slate-100">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">System Status</span>
              <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Operational
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
