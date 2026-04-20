import React, { useEffect, useState, useRef } from 'react';
import { Link, useNavigate, useLocation, Outlet } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Ticket as TicketIcon, 
  Users, 
  Key,
  Settings, 
  LogOut, 
  Search,
  Book,
  Menu,
  X,
  Wifi,
  WifiOff,
  Bell,
  ChevronDown,
  RefreshCw,
  Activity,
  MousePointer2,
  FileText
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useRealtime } from '../../hooks/useRealtime';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

interface Toast {
  id: string;
  type: string;
  title: string;
  message: string;
  ticketId?: string;
}

function UserMenu() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="relative mt-2" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        title={user?.full_name || 'User'}
        className="w-10 h-10 rounded-full bg-slate-700 text-white flex items-center justify-center font-bold border border-slate-600 hover:ring-2 hover:ring-brand-500 transition-all focus:outline-none"
      >
        {user?.full_name?.[0] || 'A'}
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-lg py-1 z-50 animate-in fade-in slide-in-from-bottom-2">
          <div className="px-4 py-2 border-b border-slate-700">
            <p className="text-sm font-medium text-white truncate">{user?.full_name}</p>
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          </div>
          <Link
            to="/profile/security"
            onClick={() => setIsOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <Key className="w-4 h-4" />
            Security Profile
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const { isConnected, lastMessage, connectionDetails, manualReconnect } = useRealtime();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showConnDetails, setShowConnDetails] = useState(false);
  const connDetailsRef = useRef<HTMLDivElement>(null);
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const search = params.get('search');
    if (location.pathname === '/tickets' && search) {
      setSearchInput(search);
    } else if (location.pathname !== '/tickets') {
      setSearchInput('');
    }
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (connDetailsRef.current && !connDetailsRef.current.contains(event.target as Node)) {
        setShowConnDetails(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    if (!lastMessage) return;

    if (lastMessage.type === 'ticket.created' || lastMessage.type === 'ticket.updated') {
      const isCreated = lastMessage.type === 'ticket.created';
      const toast: Toast = {
        id: Math.random().toString(36).substring(2),
        type: lastMessage.type,
        title: isCreated ? 'New Ticket' : 'Ticket Updated',
        message: lastMessage.payload.subject,
        ticketId: lastMessage.payload.id,
      };
      
      // Avoid duplicate toasts for the same event if multiple updates happen fast
      setToasts(prev => [toast, ...prev].slice(0, 5));
      
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== toast.id));
      }, 8000);
    }
  }, [lastMessage]);

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div 
            key={toast.id}
            className="bg-white border border-slate-200 shadow-xl rounded-lg p-4 w-80 pointer-events-auto transform transition-all animate-in slide-in-from-right hover:scale-[1.02] cursor-pointer"
            onClick={() => {
              if (toast.ticketId) navigate(`/tickets/${toast.ticketId}`);
              setToasts(prev => prev.filter(t => t.id !== toast.id));
            }}
          >
            <div className="flex items-start gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                toast.type === 'ticket.created' ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
              )}>
                <Bell className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900">{toast.title}</p>
                <p className="text-xs text-slate-500 truncate">{toast.message}</p>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setToasts(prev => prev.filter(t => t.id !== toast.id));
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Mobile sidebar backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-16 bg-slate-900 border-r border-slate-800 transform transition-transform duration-200 lg:translate-x-0 lg:static lg:inset-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full items-center py-4">
          <Link to="/" className="w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center text-white font-bold text-xl mb-8 shadow-sm hover:bg-brand-400 transition-colors">
            L
          </Link>

          <nav className="flex-1 w-full px-2 space-y-2">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  title={item.name}
                  className={cn(
                    "flex items-center justify-center w-full aspect-square rounded-xl transition-all group relative",
                    isActive 
                      ? "bg-slate-800 text-white shadow-inner" 
                      : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
                  )}
                >
                  <item.icon className="w-6 h-6" />
                </Link>
              );
            })}
          </nav>

          <div className="w-full px-2 space-y-2 mt-auto pb-4 border-t border-slate-800/50 pt-4 flex flex-col items-center relative">
            <Link
              to="/settings"
              title="Settings"
              className={cn(
                "flex items-center justify-center w-full aspect-square rounded-xl transition-all group relative",
                location.pathname.startsWith('/settings')
                  ? "bg-slate-800 text-white shadow-inner"
                  : "text-slate-400 hover:bg-slate-800/50 hover:text-white"
              )}
            >
              <Settings className="w-6 h-6" />
            </Link>

            <UserMenu />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8">
          <button 
            className="lg:hidden p-2 text-slate-600"
            onClick={() => setIsSidebarOpen(true)}
          >
            <Menu className="w-6 h-6" />
          </button>
          
          <div className="max-w-md w-full relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search tickets..." 
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (searchInput.trim()) {
                    navigate(`/tickets?search=${encodeURIComponent(searchInput.trim())}`);
                  } else {
                    navigate('/tickets');
                  }
                }
              }}
              className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-full text-sm focus:ring-2 focus:ring-brand-500 transition-all focus:bg-white focus:shadow-inner"
            />
          </div>

          <div className="flex items-center gap-4 relative" ref={connDetailsRef}>
            <button 
              onClick={() => setShowConnDetails(!showConnDetails)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border shadow-sm hover:shadow",
                isConnected 
                  ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100" 
                  : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
              )}
            >
              {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span>{isConnected ? 'Real-time' : 'Disconnected'}</span>
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showConnDetails && "rotate-180")} />
            </button>

            {showConnDetails && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 shadow-xl rounded-xl p-4 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-slate-900">Connection Status</h3>
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    isConnected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-red-500"
                  )} />
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Activity className="w-3 h-3" /> Latency
                    </span>
                    <span className="font-mono text-slate-900">{connectionDetails.latency}ms</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <RefreshCw className="w-3 h-3" /> Reconnects
                    </span>
                    <span className="font-mono text-slate-900">{connectionDetails.reconnectCount}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100">
                  <button 
                    onClick={() => {
                      manualReconnect();
                      setShowConnDetails(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Force Reconnect
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        <main className={cn("flex-1 overflow-auto", !location.pathname.startsWith('/settings') && "p-4 lg:p-8")}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Filters', href: '/tickets', icon: TicketIcon },
  { name: 'Knowledge Base', href: '/knowledge', icon: Book },
];
