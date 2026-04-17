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
    <footer className="bg-primary text-white pt-20 pb-12 px-6 mt-32 relative">
      <div className="max-w-7xl mx-auto grid md:grid-cols-4 lg:grid-cols-5 gap-12">
        {/* Column 1: Brand Story */}
        <div className="col-span-2 space-y-6">
          <div className="flex items-center gap-2">
            <img src="https://www.belayet.pro.bd/wp-content/uploads/2026/03/SL-Logo.png" alt="SwiftLine Logo" className="w-40 h-40 object-contain" referrerPolicy="no-referrer" />
          </div>
          <p className="text-slate-400 max-w-sm leading-relaxed">
            SwiftLine is a premium bus ticketing and fleet management system. We are committed to passenger safety and comfortable travel.
          </p>
          <div className="flex items-center gap-4 pt-4">
            <a href="#" className="p-2 bg-white/10 rounded-xl hover:bg-accent transition-colors"><Facebook size={20} /></a>
            <a href="#" className="p-2 bg-white/10 rounded-xl hover:bg-accent transition-colors"><Youtube size={20} /></a>
            <a href="#" className="p-2 bg-white/10 rounded-xl hover:bg-accent transition-colors"><Linkedin size={20} /></a>
          </div>
        </div>

        {/* Columns 2-4: Quick Links */}
        {columns.map((col, idx) => (
          <div key={idx}>
            <h4 className="text-lg font-bold mb-6 text-white">{col.title}</h4>
            <ul className="space-y-3">
              {col.items.map((item, i) => (
                <li key={i}>
                  <Link 
                    to={item.path}
                    className="text-slate-400 hover:text-white transition-colors text-sm text-left"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {/* Column 5: Contact Info & App Badges */}
        <div className="space-y-6">
          <h4 className="text-lg font-bold mb-6 text-white">Contact Info</h4>
          <ul className="space-y-4 text-sm text-slate-400">
            <li className="flex items-start gap-3">
              <Phone size={18} className="text-accent shrink-0" />
              <span>+880 1234-567890</span>
            </li>
            <li className="flex items-start gap-3">
              <Mail size={18} className="text-accent shrink-0" />
              <span>support@swiftline.com</span>
            </li>
            <li className="flex items-start gap-3">
              <MapPin size={18} className="text-accent shrink-0" />
              <span>123 Bus Stand Road, Dhaka, Bangladesh</span>
            </li>
          </ul>
          <div className="pt-6 space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Download App</p>
            <div className="flex flex-wrap gap-2">
              <button className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl hover:bg-white/20 transition-colors">
                <Download size={16} />
                <span className="text-xs font-bold">Play Store</span>
              </button>
              <button className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl hover:bg-white/20 transition-colors">
                <Download size={16} />
                <span className="text-xs font-bold">App Store</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto mt-20 pt-8 border-t border-white/10 text-center text-slate-500 text-sm">
        © 2026 SwiftLine Bus Ticketing. All rights reserved.
      </div>
    </footer>
  );
};
