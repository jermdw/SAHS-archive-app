import { NavLink } from 'react-router-dom';
import { Home, FileText, Users, Search, Upload, UserPlus } from 'lucide-react';

export function Sidebar() {
    const navLinkClass = ({ isActive }: { isActive: boolean }) =>
        `flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${isActive
            ? 'bg-tan-light text-charcoal font-medium'
            : 'text-charcoal/80 hover:bg-black/5 hover:text-charcoal'
        }`;

    return (
        <aside className="w-64 border-r border-tan-light bg-white flex flex-col p-6 shrink-0 h-screen sticky top-0 overflow-y-auto shadow-[2px_0_8px_rgba(0,0,0,0.02)]">
            <div className="mb-10">
                <h1 className="font-serif text-[1.4rem] leading-tight font-bold text-charcoal">
                    Senoia Area<br />Historical Society
                </h1>
                <p className="text-sm text-charcoal/60 mt-1 font-medium tracking-wide">
                    Archive Database
                </p>
            </div>

            <div className="flex-1 flex flex-col gap-8">
                <div>
                    <h2 className="text-xs font-bold text-charcoal/50 tracking-wider uppercase mb-3 px-4">Browse</h2>
                    <nav className="flex flex-col gap-1">
                        <NavLink to="/" className={navLinkClass}>
                            <Home size={18} /> Home
                        </NavLink>
                        <NavLink to="/documents" className={navLinkClass}>
                            <FileText size={18} /> Documents
                        </NavLink>
                        <NavLink to="/figures" className={navLinkClass}>
                            <Users size={18} /> Historic Figures
                        </NavLink>
                        <NavLink to="/search" className={navLinkClass}>
                            <Search size={18} /> Search
                        </NavLink>
                    </nav>
                </div>

                <div>
                    <h2 className="text-xs font-bold text-charcoal/50 tracking-wider uppercase mb-3 px-4">Manage</h2>
                    <nav className="flex flex-col gap-1">
                        <NavLink to="/upload-document" className={navLinkClass}>
                            <Upload size={18} /> Upload Document
                        </NavLink>
                        <NavLink to="/add-figure" className={navLinkClass}>
                            <UserPlus size={18} /> Add Figure
                        </NavLink>
                    </nav>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-tan-light/50 text-center">
                <p className="text-xs text-charcoal/60 font-serif italic">
                    Preserving History, One Document at a Time
                </p>
            </div>
        </aside>
    );
}
