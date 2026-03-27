import React, { useState } from 'react';
import { ShieldCheck, User, Lock, AlertCircle } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

interface LoginProps {
  onLogin: (id: string, pass: string) => void;
  error?: string | null;
  title: string;
}

export const Login: React.FC<LoginProps> = ({ onLogin, error, title }) => {
  const { t } = useLanguage();
  const [id, setId] = useState('');
  const [pass, setPass] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin(id, pass);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-12 border border-slate-100">
        <div className="text-center space-y-4 mb-10">
          <div className="bg-primary w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-primary/20">
            <ShieldCheck className="text-white" size={32} />
          </div>
          <div className="space-y-1">
            <h2 className="text-3xl font-black text-primary">{title}</h2>
            <p className="text-slate-500 font-medium">Login with your ID and Password</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">ID</label>
            <div className="relative group">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
              <input
                type="text"
                required
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all font-bold text-primary"
                placeholder="Enter your ID"
                value={id}
                onChange={e => setId(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Password</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
              <input
                type="password"
                required
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all font-bold text-primary"
                placeholder="Enter your password"
                value={pass}
                onChange={e => setPass(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-bold animate-shake">
              <AlertCircle size={18} />
              {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full btn-primary !py-5 rounded-2xl text-lg shadow-xl shadow-accent/20 hover:scale-[1.02] active:scale-95 transition-all"
          >
            Login Now
          </button>
        </form>
      </div>
    </div>
  );
};
