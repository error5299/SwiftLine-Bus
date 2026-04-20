import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../hooks/useLanguage';
import { Facebook, Youtube, Linkedin, Phone, Mail, MapPin, MessageCircle, Download } from 'lucide-react';

export const Footer = () => {
  const { t } = useLanguage();

  const columns = [
    {
      title: 'Links',
      items: [
        { label: 'About Us', path: '/about' },
        { label: 'Contact', path: '/contact' },
        { label: 'Terms', path: '/terms' },
        { label: 'Privacy Policy', path: '/privacy' },
        { label: 'Refund Policy', path: '/refund' },
      ]
    },
    {
      title: 'Support',
      items: [
        { label: 'Support Centre', path: '/help' },
        { label: 'Cancel Ticket', path: '/help' },
        { label: 'Tracking', path: '/track' },
        { label: 'FAQ', path: '/help' },
      ]
    },
    {
      title: 'Popular Routes',
      items: [
        { label: 'Dhaka - Kushtia', path: '#' },
        { label: 'Dhaka - Sylhet', path: '#' },
        { label: 'Dhaka - Chittagong', path: '#' },
        { label: 'Dhaka - Rajshahi', path: '#' },
      ]
    }
  ];

  return (
    <footer className="bg-primary text-white pt-24 pb-16 px-6 mt-32 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div className="max-w-7xl mx-auto grid md:grid-cols-4 lg:grid-cols-5 gap-16">
        {/* Column 1: Brand Story */}
        <div className="col-span-2 space-y-8">
          <Link to="/" className="flex items-center gap-3">
             <img src="https://www.belayet.pro.bd/wp-content/uploads/2026/03/SwiftLine.png" alt="SwiftLine Logo" className="w-16 h-16 object-contain" referrerPolicy="no-referrer" />
             <div className="flex flex-col">
                <span className="text-3xl font-black tracking-tighter">SwiftLine</span>
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-accent">Premium Fleet</span>
             </div>
          </Link>
          <p className="text-slate-400 max-w-sm leading-relaxed text-sm">
            SwiftLine is a premium bus ticketing and fleet management system. We are committed to passenger safety, punctuality, and an unparalleled travel experience.
          </p>
          <div className="flex items-center gap-3 pt-2">
            {[Facebook, Youtube, Linkedin].map((Icon, i) => (
              <a key={i} href="#" className="p-3 bg-white/5 rounded-2xl border border-white/5 hover:bg-accent hover:border-accent transition-all hover:scale-110 active:scale-95">
                <Icon size={18} />
              </a>
            ))}
          </div>
        </div>

        {/* Columns 2-4: Quick Links */}
        {columns.map((col, idx) => (
          <div key={idx} className="space-y-6">
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">{col.title}</h4>
            <ul className="space-y-4">
              {col.items.map((item, i) => (
                <li key={i}>
                  <Link 
                    to={item.path}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-all text-sm group"
                  >
                    <span className="w-1 h-1 rounded-full bg-slate-600 group-hover:bg-accent transition-colors" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Column 5: Contact Info */}
        <div className="space-y-8">
          <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-300">Get In Touch</h4>
          <ul className="space-y-6 text-sm">
            {[
              { icon: Phone, text: '+880 1234-567890' },
              { icon: Mail, text: 'support@swiftline.com' },
              { icon: MapPin, text: '123 Bus Stand Road, Dhaka' }
            ].map((item, i) => (
              <li key={i} className="flex items-center gap-4 text-slate-400">
                <div className="p-2.5 bg-white/5 rounded-xl text-accent border border-white/5">
                  <item.icon size={16} />
                </div>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Copyright */}
      <div className="max-w-7xl mx-auto mt-24 pt-10 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6 text-slate-500 text-xs font-bold uppercase tracking-widest">
        <p>© 2026 SwiftLine. All rights reserved.</p>
        <div className="flex gap-8">
          <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
        </div>
      </div>
    </footer>
  );
};
