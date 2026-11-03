import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Admin from './Admin.jsx';
import './styles.css';
import './admin.css';

createRoot(document.getElementById('root')).render(<React.StrictMode>{window.location.pathname === '/admin' ? <Admin /> : <App />}</React.StrictMode>);
