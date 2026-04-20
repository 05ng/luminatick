import React, { useState, useEffect } from 'react';
import TicketForm from './components/TicketForm';
import AiChat from './components/AiChat';
import { BASE_URL } from './api';

const App: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'ticket'>('chat');
  const [config, setConfig] = useState<any>(null);

  useEffect(() => {
    // Fetch widget configuration from the backend
    fetch(`${BASE_URL}/config`)
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(() => {
        // Fallback config if not found
        setConfig({
          primaryColor: '#3b82f6',
          title: 'How can we help?',
          features: {
            aiChat: true,
            ticketForm: true,
          }
        });
      });
  }, []);

  const toggleWidget = () => setIsOpen(!isOpen);

  if (!config) return null;

  return (
    <div className="flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 w-80 sm:w-96 bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[600px]">
          <div className="p-4 text-white flex justify-between items-center" style={{ backgroundColor: config.primaryColor }}>
            <h2 className="font-bold text-lg">{config.title}</h2>
            <button onClick={toggleWidget} className="hover:bg-white/10 rounded p-1 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex border-b border-gray-200 bg-gray-50">
            {config.features.aiChat && (
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${activeTab === 'chat' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                AI Chat
              </button>
            )}
            {config.features.ticketForm && (
              <button
                onClick={() => setActiveTab('ticket')}
                className={`flex-1 py-2 text-sm font-medium transition-colors ${activeTab === 'ticket' ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                New Ticket
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto bg-white p-4">
            {activeTab === 'chat' && <AiChat config={config} />}
            {activeTab === 'ticket' && <TicketForm config={config} />}
          </div>
          
          <div className="p-2 text-center text-[10px] text-gray-400 border-t border-gray-100">
            Powered by Luminatick
          </div>
        </div>
      )}

      <button
        onClick={toggleWidget}
        className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white transition-transform hover:scale-105 active:scale-95"
        style={{ backgroundColor: config.primaryColor }}
      >
        {isOpen ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        )}
      </button>
    </div>
  );
};

export default App;
