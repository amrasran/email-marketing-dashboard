'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-forest font-heading tracking-tight">BROC SHOT</h1>
          <p className="text-sm text-charcoal-light mt-1">Email Marketing Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white border border-muted rounded-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-charcoal uppercase tracking-wider">
            {mode === 'login' ? 'Sign In' : 'Create Account'}
          </h2>

          {error && (
            <div className="text-xs text-alert bg-alert/10 p-2 rounded-sm">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-charcoal-light mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-sage"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-charcoal-light mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 border border-muted rounded-sm text-sm text-charcoal focus:outline-none focus:border-sage"
              placeholder="Min 6 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-sage text-charcoal font-medium text-sm rounded-sm hover:bg-sage-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          <p className="text-xs text-center text-charcoal-light">
            {mode === 'login' ? (
              <>No account? <button type="button" onClick={() => setMode('signup')} className="text-forest hover:underline">Sign up</button></>
            ) : (
              <>Have an account? <button type="button" onClick={() => setMode('login')} className="text-forest hover:underline">Sign in</button></>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
