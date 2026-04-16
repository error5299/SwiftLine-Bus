import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const images = [
  'https://www.belayet.pro.bd/wp-content/uploads/2026/03/Mockup-3.png',
  'https://www.belayet.pro.bd/wp-content/uploads/2026/03/coach_bus_2-scaled.png',
  'https://www.belayet.pro.bd/wp-content/uploads/2026/03/coach_bus_1-scaled.png',
];

export const HeroCarousel: React.FC = () => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.img
          key={images[index]}
          src={images[index]}
          initial={{ opacity: 0, filter: 'blur(20px)' }}
          animate={{ opacity: 0.2, filter: 'blur(0px)' }}
          exit={{ opacity: 0, filter: 'blur(20px)' }}
          transition={{ duration: 1.5, ease: 'easeInOut' }}
          className="w-full h-full object-cover"
          alt="Hero background"
          referrerPolicy="no-referrer"
        />
      </AnimatePresence>
    </div>
  );
};
