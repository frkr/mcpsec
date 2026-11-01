import {Outlet} from 'react-router'

// Plain passthrough: the topbar chrome lives in `Layout` (inside the
// authed branch); login/register render bare.
export function App() {
    return <Outlet/>
}
