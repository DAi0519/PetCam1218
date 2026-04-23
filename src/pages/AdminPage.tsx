import { useState } from 'react';
import { apiFetch } from '../lib/client';

export function AdminPage() {
  const [secret, setSecret] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const handleBan = async (ban: boolean) => {
    try {
      const res = await apiFetch('/api/public/admin/ban', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': secret
        },
        body: JSON.stringify({ email, ban })
      });
      const data = await res.json() as { content?: string };
      setMessage(data.content ?? "Request completed.");
    } catch (e: any) {
      setMessage("Error: " + e.message);
    }
  };

  return (
    <div className="app-viewport app-safe-frame bg-neutral-900 text-white font-mono">
      <h1 className="text-2xl font-bold mb-4 text-green-400">Admin Panel</h1>
      <div className="space-y-4 max-w-md">
        <div>
          <label className="block mb-1 text-gray-400">Admin Secret</label>
          <input 
            type="password" 
            value={secret} 
            onChange={e => setSecret(e.target.value)}
            className="w-full p-2 rounded bg-neutral-800 border border-neutral-700 focus:border-green-500 outline-none"
          />
        </div>
        <div>
          <label className="block mb-1 text-gray-400">User Email</label>
          <input 
            type="email" 
            value={email} 
            onChange={e => setEmail(e.target.value)}
            className="w-full p-2 rounded bg-neutral-800 border border-neutral-700 focus:border-green-500 outline-none"
          />
        </div>
        <div className="flex gap-4 pt-4">
          <button 
            onClick={() => handleBan(true)}
            className="px-6 py-2 bg-red-600 rounded hover:bg-red-700 transition-colors font-bold"
          >
            BAN USER
          </button>
          <button 
            onClick={() => handleBan(false)}
            className="px-6 py-2 bg-green-600 rounded hover:bg-green-700 transition-colors font-bold"
          >
            UNBAN USER
          </button>
        </div>
        {message && <div className="mt-4 p-4 bg-neutral-800 rounded border border-neutral-700">{message}</div>}
      </div>
    </div>
  );
}
