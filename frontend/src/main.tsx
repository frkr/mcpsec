import React from 'react'
import ReactDOM from 'react-dom/client'
import {QueryClientProvider} from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import {queryClient} from './layout/Layout.tsx'
import { router } from './routes.tsx'
import './styles.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('No root element found')
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
)
