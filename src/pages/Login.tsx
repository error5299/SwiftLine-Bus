import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useLanguage } from '../hooks/useLanguage';
import { motion, AnimatePresence } from 'motion/react';
import { Bus, Mail, Lock as LockIcon, LogIn, Chrome, UserPlus, User } from 'lucide-react';

interface LoginProps {
  onSuccess?: () => void;
  defaultRole?: 'admin' | 'operator' | 'supervisor' | 'driver';
  onLogin?: (id: string, pass: string) => Promise<void>;
  title?: string;
  error?: string | null;
}

export const Login: React.FC<LoginProps> = ({ onSuccess, defaultRole, onLogin, title, error: externalError }) => {
  const { t } = useLanguage();
  const isStaffLogin = defaultRole === 'operator' || defaultRole === 'supervisor' || defaultRole === 'admin' || defaultRole === 'driver';
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [customId, setCustomId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(externalError || '');
  const [loading, setLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'email' | 'id'>(isStaffLogin ? 'id' : 'email');

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      onSuccess?.();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    setResetLoading(true);
    setResetMessage(null);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMessage({ type: 'success', text: 'Password reset email sent! Please check your inbox.' });
      setTimeout(() => {
        setShowForgotPassword(false);
        setResetMessage(null);
        setResetEmail('');
      }, 3000);
    } catch (error: any) {
      setResetMessage({ type: 'error', text: error.message || 'Failed to send reset email.' });
    } finally {
      setResetLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    if (onLogin && loginMethod === 'id') {
      try {
        await onLogin(customId, password);
        onSuccess?.();
      } catch (err: any) {
        setError(err.message || 'Login failed');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      if (isLogin) {
        if (loginMethod === 'email') {
          await signInWithEmailAndPassword(auth, email, password);
        } else {
          // Custom ID login
          const { collection, query, where, getDocs } = await import('firebase/firestore');
          const { db } = await import('../firebase');
          const q = query(collection(db, 'staff_credentials'), where('id', '==', customId));
          const snapshot = await getDocs(q);
          if (snapshot.empty || snapshot.docs[0].data().password !== password) {
            throw new Error(t('আইডি বা পাসওয়ার্ড ভুল।', 'Invalid ID or password.'));
          }
          
          const staffData = snapshot.docs[0].data();
          if (defaultRole && staffData.role !== defaultRole && defaultRole !== 'admin') {
            throw new Error(t(`এই আইডিটি ${staffData.role} হিসেবে অনুমোদিত, ${defaultRole} হিসেবে নয়।`, `This ID is authorized as ${staffData.role}, not ${defaultRole}.`));
          }

          localStorage.setItem('customStaffId', customId);
          
          // Use provided email or fallback to a generated one
          const staffEmail = staffData.email || `${customId}@swiftline.staff`;
          
          // Try to sign in with the email and password from staff_credentials
          try {
            const userCredential = await signInWithEmailAndPassword(auth, staffEmail, password);
            // Ensure users doc exists for staff
            await setDoc(doc(db, 'users', userCredential.user.uid), {
              email: staffEmail,
              role: staffData.role,
              profileId: staffData.id || customId,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          } catch (authErr: any) {
            // If user doesn't exist in Auth, create them (since we already verified in Firestore)
            if (authErr.code === 'auth/user-not-found' || authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/invalid-email') {
              try {
                const userCredential = await createUserWithEmailAndPassword(auth, staffEmail, password);
                // Create users doc for staff
                await setDoc(doc(db, 'users', userCredential.user.uid), {
                  email: staffEmail,
                  role: staffData.role,
                  profileId: staffData.id || customId,
                  createdAt: new Date().toISOString()
                });
              } catch (createErr: any) {
                if (createErr.code === 'auth/email-already-in-use') {
                  throw new Error(t('আইডি বা পাসওয়ার্ড ভুল।', 'Invalid ID or password.'));
                }
                throw new Error(createErr.message);
              }
            } else {
              throw authErr;
            }
          }
        }
      } else {
        // Sign up logic (only for passengers)
        if (isStaffLogin) return;

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: name });
        
        const { doc, setDoc } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          email: userCredential.user.email,
          role: 'passenger',
          createdAt: new Date().toISOString()
        });
      }
      onSuccess?.();
    } catch (err: any) {
      console.error("Login error details:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setError(t('ইমেইল/পাসওয়ার্ড সাইন-ইন পদ্ধতি নিষ্ক্রিয়। দয়া করে ফায়ারবেস কনসোল থেকে এটি সক্রিয় করুন।', 'Email/Password sign-in is disabled. Please enable it in the Firebase Console under Authentication > Sign-in method.'));
      } else if (isLogin) {
        setError(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    if (defaultRole === 'operator') return t('অপারেটর লগইন', 'Operator Login');
    if (defaultRole === 'supervisor') return t('সুপারভাইজার লগইন', 'Supervisor Login');
    if (defaultRole === 'driver') return t('ড্রাইভার লগইন', 'Driver Login');
    if (defaultRole === 'admin') return t('অ্যাডমিন লগইন', 'Admin Login');
    return isLogin ? t('লগইন করুন', 'Login to SwiftLine') : t('নিবন্ধন করুন', 'Join SwiftLine');
  };

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-premium space-y-8"
      >
        <div className="text-center space-y-2">
          <div className="bg-primary w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-xl shadow-primary/20">
            <Bus className="text-white" size={32} />
          </div>
          <h2 className="text-3xl font-black text-primary tracking-tighter">
            {getTitle()}
          </h2>
          <p className="text-slate-500 font-medium">
            {isStaffLogin ? t('আপনার আইডি ও পাসওয়ার্ড দিয়ে লগইন করুন', 'Login with your ID & Password') : 
             isLogin ? t('আপনার অ্যাকাউন্ট অ্যাক্সেস করুন', 'Access your account') : t('নতুন অ্যাকাউন্ট তৈরি করুন', 'Create a new account')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <AnimatePresence mode="wait">
            {!isLogin && !isStaffLogin && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t('নাম', 'Full Name')}</label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
                  <input 
                    required
                    type="text" 
                    placeholder="John Doe"
                    className="input-field pl-12"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isStaffLogin && (
            <div className="flex gap-4 mb-4">
              <button 
                type="button"
                onClick={() => setLoginMethod('email')}
                className={`flex-1 py-3 rounded-xl font-bold text-sm ${loginMethod === 'email' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}
              >
                {t('ইমেইল', 'Email')}
              </button>
              <button 
                type="button"
                onClick={() => setLoginMethod('id')}
                className={`flex-1 py-3 rounded-xl font-bold text-sm ${loginMethod === 'id' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'}`}
              >
                {t('আইডি', 'Custom ID')}
              </button>
            </div>
          )}

          {loginMethod === 'email' ? (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t('ইমেইল', 'Email Address')}</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
                <input 
                  required
                  type="email" 
                  placeholder="example@mail.com"
                  className="input-field pl-12"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t('আইডি', 'Custom ID')}</label>
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
                <input 
                  required
                  type="text" 
                  placeholder="bt132023"
                  className="input-field pl-12"
                  value={customId}
                  onChange={e => setCustomId(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">{t('পাসওয়ার্ড', 'Password')}</label>
            <div className="relative group">
              <LockIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
              <input 
                required
                type="password" 
                placeholder="••••••••"
                className="input-field pl-12"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            {isLogin && loginMethod === 'email' && (
              <div className="flex justify-end px-2">
                <button 
                  type="button" 
                  onClick={() => setShowForgotPassword(true)}
                  className="text-xs font-bold text-accent hover:underline"
                >
                  {t('পাসওয়ার্ড ভুলে গেছেন?', 'Forgot Password?')}
                </button>
              </div>
            )}
          </div>

          {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}

          <button 
            type="submit" 
            disabled={loading}
            className="btn-primary !py-5 w-full rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-primary/20 disabled:opacity-50"
          >
            {loading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (isLogin ? <LogIn size={20} /> : <UserPlus size={20} />)}
            <span className="text-lg">{isLogin ? t('লগইন', 'Login') : t('নিবন্ধন', 'Sign Up')}</span>
          </button>
        </form>

        {!isStaffLogin && (
          <>
            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-slate-400 font-bold tracking-widest">{t('অথবা', 'Or Continue With')}</span></div>
            </div>

            <button 
              onClick={handleGoogleLogin}
              className="w-full py-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50 transition-all flex items-center justify-center gap-3 shadow-sm"
            >
              <Chrome size={20} className="text-red-500" />
              <span>Google {t('দিয়ে লগইন', 'Login with Google')}</span>
            </button>

            <p className="text-center text-sm text-slate-500">
              {isLogin ? t('অ্যাকাউন্ট নেই?', "Don't have an account?") : t('ইতিমধ্যে অ্যাকাউন্ট আছে?', "Already have an account?")} 
              <button 
                onClick={() => setIsLogin(!isLogin)}
                className="text-accent font-bold hover:underline ml-1"
              >
                {isLogin ? t('নিবন্ধন করুন', 'Sign Up') : t('লগইন করুন', 'Login')}
              </button>
            </p>
          </>
        )}
      </motion.div>
      {/* Forgot Password Modal */}
      <AnimatePresence>
        {showForgotPassword && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl space-y-6"
            >
              <div className="text-center space-y-2">
                <h3 className="text-2xl font-black text-primary">Reset Password</h3>
                <p className="text-slate-500 text-sm">Enter your email and we'll send you a link to reset your password.</p>
              </div>

              {resetMessage && (
                <div className={`p-4 rounded-xl text-sm font-bold ${resetMessage.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                  {resetMessage.text}
                </div>
              )}

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-2">Email Address</label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-accent transition-colors" size={20} />
                    <input 
                      type="email" 
                      required
                      placeholder="your@email.com"
                      className="input-field pl-12"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-4 pt-2">
                  <button 
                    type="button"
                    onClick={() => setShowForgotPassword(false)} 
                    className="flex-1 py-4 bg-slate-100 text-slate-600 font-black uppercase tracking-widest text-xs rounded-2xl"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    disabled={resetLoading}
                    className="flex-1 py-4 bg-accent text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-accent/20 disabled:opacity-50"
                  >
                    {resetLoading ? 'Sending...' : 'Send Link'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
