import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@heytaksi/ui';
import { App } from './routes/App';
import './styles/global.css';
import './styles/phase3.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthProvider apiUrl={import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'}><BrowserRouter><App /></BrowserRouter></AuthProvider></React.StrictMode>);
