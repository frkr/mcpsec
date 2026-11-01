import {createBrowserRouter, Navigate} from 'react-router'
import { App } from './App.tsx'
import { Login } from './auth/Login.tsx'
import { Register } from './auth/Register.tsx'
import { RequireAuth } from './auth/RequireAuth.tsx'
import {Layout} from './layout/Layout.tsx'
import {Registry} from './pages/Registry.tsx'
import {Review} from './pages/Review.tsx'
import {Runner} from './pages/Runner.tsx'
import {ServerPage} from './pages/ServerPage.tsx'
import {SettingsPage} from './pages/SettingsPage.tsx'
import {ProxyDocs} from './pages/ProxyDocs.tsx'
import {ProxyPage} from './pages/ProxyPage.tsx'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
        {index: true, element: <Navigate to="/registry" replace/>},
      { path: 'login', element: <Login /> },
      { path: 'register', element: <Register /> },
      {
        element: <RequireAuth />,
        children: [
            {
                element: <Layout/>,
                children: [
                    {path: 'registry', element: <Registry/>},
                    {path: 'server/:id', element: <ServerPage/>},
                    {path: 'review/:id', element: <Review/>},
                    {path: 'runner', element: <Runner/>},
                    {path: 'proxy', element: <ProxyPage/>},
                    {path: 'proxy/docs', element: <ProxyDocs/>},
                    {path: 'settings', element: <SettingsPage/>},
                ],
            },
        ],
      },
    ],
  },
])
