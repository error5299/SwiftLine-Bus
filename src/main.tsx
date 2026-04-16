import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

import { FirebaseProvider } from './context/FirebaseProvider';
import { NotificationProvider } from './context/NotificationContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <NotificationProvider>
        <FirebaseProvider>
          <App />
        </FirebaseProvider>
      </NotificationProvider>
    </BrowserRouter>
  </StrictMode>,
);
