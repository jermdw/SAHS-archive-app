import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export default function Layout() {
    return (
        <div className="flex min-h-screen w-full bg-cream text-charcoal font-sans selection:bg-tan/20">
            <Sidebar />
            <main className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 p-8 md:p-12 max-w-7xl mx-auto w-full">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
