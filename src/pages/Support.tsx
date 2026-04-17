import React from 'react';
import { motion } from 'motion/react';
import { MessageCircle, ShieldCheck, HelpCircle, Phone, Mail, Clock } from 'lucide-react';

export const Support: React.FC = () => {
  return (
    <div className="space-y-20 pb-20">
      {/* Hero Section */}
      <section className="relative py-24 px-8 rounded-[2.5rem] overflow-hidden bg-primary text-center">
        <div className="absolute inset-0 opacity-20">
          <img 
            src="https://picsum.photos/seed/support/1920/1080" 
            alt="Support Center" 
            className="w-full h-full object-cover" 
            referrerPolicy="no-referrer" 
          />
        </div>
        <div className="relative max-w-4xl mx-auto space-y-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-20 h-20 bg-accent/20 rounded-3xl flex items-center justify-center mx-auto mb-8"
          >
            <HelpCircle className="text-accent" size={40} />
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl md:text-7xl font-black tracking-tighter text-white"
          >
            How can we help?
          </motion.h1>
          <p className="text-white/70 text-xl font-medium">
            SwiftLine Support Center is here implementation 24/7 to assist you.
          </p>
        </div>
      </section>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Quick Links */}
        <div className="card-premium space-y-6">
          <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center">
            <ShieldCheck className="text-accent" size={24} />
          </div>
          <h3 className="text-xl font-bold text-primary">Ticketing Policy</h3>
          <p className="text-slate-500 text-sm leading-relaxed">
            Learn about our cancellation, refund, and rescheduling policies for a smooth journey.
          </p>
          <button className="text-accent text-sm font-bold uppercase tracking-wider flex items-center gap-2 hover:gap-3 transition-all">
            View Policy
          </button>
        </div>

        <div className="card-premium space-y-6">
          <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center">
            <Clock className="text-amber-500" size={24} />
          </div>
          <h3 className="text-xl font-bold text-primary">Track Your Trip</h3>
          <p className="text-slate-500 text-sm leading-relaxed">
            Check live bus locations and estimated arrival times for any coach number or ticket.
          </p>
          <button className="text-amber-500 text-sm font-bold uppercase tracking-wider flex items-center gap-2 hover:gap-3 transition-all">
            Start Tracking
          </button>
        </div>

        {/* WhatsApp Support Button - STATIC */}
        <div className="card-premium space-y-6 border-2 border-[#25D366]/20 bg-[#25D366]/5">
          <div className="w-12 h-12 bg-[#25D366]/10 rounded-2xl flex items-center justify-center">
            <MessageCircle className="text-[#25D366]" size={24} />
          </div>
          <h3 className="text-xl font-bold text-primary">Direct WhatsApp Support</h3>
          <p className="text-slate-500 text-sm leading-relaxed">
            Chat directly with our support team for instant assistance with bookings or queries.
          </p>
          <a 
            href="https://wa.me/8801234567890" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-8 py-4 bg-[#25D366] text-white font-black rounded-2xl shadow-xl shadow-[#25D366]/20 hover:scale-105 active:scale-95 transition-all text-sm uppercase tracking-widest mt-2"
          >
            <MessageCircle size={20} />
            Chat on WhatsApp
          </a>
        </div>
      </div>

      {/* FAQ Section Placeholder */}
      <section className="max-w-4xl mx-auto space-y-12">
        <h2 className="text-3xl font-black text-primary text-center">Frequently Asked Questions</h2>
        <div className="space-y-4">
          {[
            { q: "How do I cancel my ticket?", a: "You can cancel your ticket through the 'Cancel Ticket' section in the support menu or by contacting our hotline." },
            { q: "What is the refund policy?", a: "Refunds are processed based on the time remaining before departure. See our policy section for details." },
            { q: "Can I book for others?", a: "Yes, you can toggle 'Others' in the passenger details section during booking." }
          ].map((item, i) => (
            <div key={i} className="p-6 bg-white border border-slate-100 rounded-2xl shadow-sm">
              <p className="font-bold text-primary mb-2">{item.q}</p>
              <p className="text-sm text-slate-500">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Direct Contact */}
      <div className="p-12 bg-primary rounded-[2.5rem] text-center text-white space-y-8">
        <h3 className="text-3xl font-black">Still have questions?</h3>
        <p className="text-white/70 text-lg">Our team is available 24/7 to help you.</p>
        <div className="flex flex-wrap justify-center gap-8">
          <div className="flex items-center gap-3">
            <Phone className="text-accent" size={24} />
            <span className="text-xl font-bold">+880 1234-567890</span>
          </div>
          <div className="flex items-center gap-3">
            <Mail className="text-accent" size={24} />
            <span className="text-xl font-bold">support@swiftline.com</span>
          </div>
        </div>
      </div>
    </div>
  );
};
