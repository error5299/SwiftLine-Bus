import React from 'react';
import { motion } from 'motion/react';

export const LoadingSpinner: React.FC = () => (
  <div className="h-screen flex flex-col items-center justify-center bg-bg-off">
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full mb-4"
    />
    <h2 className="text-2xl font-black text-primary animate-pulse">SwiftLine Loading...</h2>
  </div>
);
