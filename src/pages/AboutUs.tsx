import React from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { motion } from 'motion/react';
import { Shield, Zap, Users, Globe, Award, Clock } from 'lucide-react';

export const AboutUs: React.FC = () => {
  const { t } = useLanguage();

  const stats = [
    { label: t('সন্তুষ্ট যাত্রী', 'Happy Passengers'), value: '1M+', icon: Users },
    { label: t('বাস পার্টনার', 'Bus Partners'), value: '50+', icon: BusIcon },
    { label: t('রুট সংখ্যা', 'Total Routes'), value: '200+', icon: Globe },
    { label: t('সেবার বছর', 'Years of Service'), value: '5+', icon: Clock },
  ];

  return (
    <div className="space-y-20 pb-20">
      {/* Hero */}
      <section className="relative py-24 px-8 rounded-[2.5rem] overflow-hidden bg-primary text-center">
        <div className="absolute inset-0 opacity-20">
          <img src="https://picsum.photos/seed/about/1920/1080" alt="About" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <div className="relative max-w-4xl mx-auto space-y-6">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-black tracking-tighter text-white"
          >
            {t('সুইফটলাইন সম্পর্কে জানুন', 'About SwiftLine')}
          </motion.h1>
          <p className="text-white/70 text-xl font-medium">
            {t('আমরা বাংলাদেশের যাতায়াত ব্যবস্থাকে ডিজিটাল এবং সহজতর করার লক্ষ্যে কাজ করছি।', 'We are working to digitize and simplify the transportation system in Bangladesh.')}
          </p>
        </div>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className="card-premium text-center space-y-2"
          >
            <div className="bg-accent/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
              <stat.icon className="text-accent" size={24} />
            </div>
            <p className="text-3xl font-black text-primary">{stat.value}</p>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      {/* Mission & Vision */}
      <div className="grid md:grid-cols-2 gap-12">
        <div className="space-y-6">
          <h2 className="text-4xl font-black text-primary tracking-tighter">{t('আমাদের লক্ষ্য', 'Our Mission')}</h2>
          <p className="text-slate-500 leading-relaxed text-lg">
            {t('প্রযুক্তির সঠিক ব্যবহারের মাধ্যমে প্রত্যেক যাত্রীর জন্য একটি নিরাপদ, নির্ভরযোগ্য এবং আনন্দদায়ক ভ্রমণ অভিজ্ঞতা নিশ্চিত করা। আমরা বিশ্বাস করি যাতায়াত হওয়া উচিত ঝামেলামুক্ত এবং সাশ্রয়ী।', 'To ensure a safe, reliable, and enjoyable travel experience for every passenger through the correct use of technology. We believe transportation should be hassle-free and affordable.')}
          </p>
          <div className="space-y-4">
            {[
              t('১০০% ডিজিটাল টিকিট ব্যবস্থা', '100% Digital Ticketing'),
              t('লাইভ বাস ট্র্যাকিং সুবিধা', 'Live Bus Tracking'),
              t('নিরাপদ পেমেন্ট গেটওয়ে', 'Secure Payment Gateway'),
              t('২৪/৭ কাস্টমার সাপোর্ট', '24/7 Customer Support')
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="bg-emerald-500/10 p-1 rounded-full">
                  <Shield className="text-emerald-500" size={16} />
                </div>
                <span className="font-bold text-primary">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[2.5rem] overflow-hidden shadow-2xl">
          <img src="https://picsum.photos/seed/mission/800/600" alt="Mission" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
      </div>
    </div>
  );
};

const BusIcon = ({ className, size }: { className?: string, size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M8 6v6" />
    <path d="M15 6v6" />
    <path d="M2 12h19.6" />
    <path d="M18 18h3s1-1 1-2V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v9c0 1 1 2 1 2h3" />
    <circle cx="7" cy="18" r="2" />
    <path d="M9 18h5" />
    <circle cx="17" cy="18" r="2" />
  </svg>
);
