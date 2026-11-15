import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './proto.css';
import { App } from './App';
import { FamilyProvider } from './store';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FamilyProvider>
      <App />
    </FamilyProvider>
  </StrictMode>,
);
