import React, { useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { motion } from 'motion/react';
import { Mail, Phone, MapPin, Send, MessageSquare, Facebook, Twitter, Instagram } from 'lucide-react';

export const Contact: React.FC = () => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 5000);
  };

  return (
    <div className="space-y-20 pb-20">
      {/* Hero */}
      <section className="relative py-24 px-8 rounded-[2.5rem] overflow-hidden bg-primary text-center">
        <div className="absolute inset-0 opacity-20">
          <img src="https://picsum.photos/seed/contact/1920/1080" alt="Contact" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <div className="relative max-w-4xl mx-auto space-y-6">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-black tracking-tighter text-white"
          >
            Contact Us
          </motion.h1>
          <p className="text-white/70 text-xl font-medium">
            We are always ready for any of your questions or feedback.
          </p>
        </div>
      </section>

      <div className="grid lg:grid-cols-3 gap-12">
        {/* Contact Info */}
        <div className="lg:col-span-1 space-y-8">
          <div className="card-premium space-y-8">
            <h3 className="text-2xl font-black text-primary">Contact Information</h3>
            
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="bg-accent/10 p-3 rounded-xl">
                  <Phone className="text-accent" size={20} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Phone Number</p>
                  <p className="text-lg font-bold text-primary">+880 1234 567890</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="bg-accent/10 p-3 rounded-xl">
                  <Mail className="text-accent" size={20} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Email Address</p>
                  <p className="text-lg font-bold text-primary">support@swiftline.com</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="bg-accent/10 p-3 rounded-xl">
                  <MapPin className="text-accent" size={20} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Office Address</p>
                  <p className="text-lg font-bold text-primary">Level 12, Tech Tower, Banani, Dhaka-1213</p>
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-slate-100 space-y-4">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Follow Us</p>
              <div className="flex gap-4">
                {[Facebook, Twitter, Instagram].map((Icon, i) => (
                  <button key={i} className="p-3 bg-slate-50 rounded-xl text-slate-400 hover:text-accent hover:bg-accent/5 transition-all">
                    <Icon size={20} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div className="lg:col-span-2">
          <div className="card-premium">
            {submitted ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-20 text-center space-y-6"
              >
                <div className="bg-emerald-500/10 w-24 h-24 rounded-full flex items-center justify-center mx-auto">
                  <MessageSquare className="text-emerald-500" size={48} />
                </div>
                <h3 className="text-3xl font-black text-primary">Thank You!</h3>
                <p className="text-slate-500 text-lg max-w-md mx-auto">
                  Your message has been successfully sent. We will contact you very soon.
                </p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-8">
                <h3 className="text-2xl font-black text-primary">Send a Message</h3>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Your Name</label>
                    <input 
                      required
                      type="text" 
                      className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-primary outline-none focus:ring-2 focus:ring-accent transition-all"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Email Address</label>
                    <input 
                      required
                      type="email" 
                      className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-primary outline-none focus:ring-2 focus:ring-accent transition-all"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Subject</label>
                  <input 
                    required
                    type="text" 
                    className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-primary outline-none focus:ring-2 focus:ring-accent transition-all"
                    value={formData.subject}
                    onChange={e => setFormData({ ...formData, subject: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Message</label>
                  <textarea 
                    required
                    rows={6}
                    className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl font-bold text-primary outline-none focus:ring-2 focus:ring-accent transition-all resize-none"
                    value={formData.message}
                    onChange={e => setFormData({ ...formData, message: e.target.value })}
                  />
                </div>

                <button type="submit" className="btn-primary !py-5 w-full rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-primary/20">
                  <Send size={20} />
                  <span className="text-lg">Send Message</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
