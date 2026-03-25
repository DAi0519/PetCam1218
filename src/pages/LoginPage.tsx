import { useRef, useEffect, useState } from 'react';
import { client } from '../lib/client';
import { useAuthStore } from '../store/authStore';

export function LoginPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const authRenderedRef = useRef(false);
  const [isReady, setIsReady] = useState(false);
  const { setUser } = useAuthStore();

  useEffect(() => {
    client.auth.getSession().then(session => {
      if (session.data?.user) {
        setUser({
          id: session.data.user.id,
          email: session.data.user.email,
          name: session.data.user.name || '',
        });
      } else {
        setIsReady(true);
      }
    });
  }, []);

  useEffect(() => {
    if (!isReady || authRenderedRef.current || !containerRef.current) return;
    authRenderedRef.current = true;

    client.auth.renderAuthUI(containerRef.current, {
      redirectTo: '/', 
      onLogin: (user) => {
        setUser({ id: user.id, email: user.email, name: user.name || '' });
      },
    });
  }, [isReady]);

  if (!isReady) {
    return <div className="min-h-screen bg-neutral-900 flex items-center justify-center text-white">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-4">
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div ref={containerRef} />
      </div>
    </div>
  );
}
