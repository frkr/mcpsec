import { createBrowserRouter } from 'react-router'
import { App } from './App.tsx'
import { Login } from './auth/Login.tsx'
import { Register } from './auth/Register.tsx'
import { RequireAuth } from './auth/RequireAuth.tsx'
import { Home } from './pages/Home.tsx'
// scaffold:imports

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: 'login', element: <Login /> },
      { path: 'register', element: <Register /> },
      {
        element: <RequireAuth />,
        children: [
          // scaffold:routes
        ],
      },
    ],
  },
])
