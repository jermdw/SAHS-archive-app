import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Settings, Shield, UserPlus, Trash2, Mail, Loader2, UserMinus } from 'lucide-react';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';

interface UserRole {
    id: string; // the email
    role: 'admin' | 'curator';
    addedAt: string;
}

export function AdminSettings() {
    const { realIsAdmin, simulatedRole, setSimulatedRole } = useAuth();
    const [roles, setRoles] = useState<UserRole[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState<'admin' | 'curator'>('curator');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!realIsAdmin) return;
        fetchRoles();
    }, [realIsAdmin]);

    const fetchRoles = async () => {
        try {
            const querySnapshot = await getDocs(collection(db, 'user_roles'));
            const rolesData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as UserRole[];
            setRoles(rolesData);
        } catch (error) {
            console.error("Error fetching user roles:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        const email = newEmail.toLowerCase().trim();
        
        setIsSubmitting(true);
        try {
            await setDoc(doc(db, 'user_roles', email), {
                role: newRole,
                addedAt: new Date().toISOString()
            });
            setNewEmail('');
            setNewRole('curator');
            fetchRoles();
        } catch (error) {
            console.error('Error adding user role', error);
            alert('Failed to add user role.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteUser = async (email: string) => {
        if (!window.confirm(`Are you sure you want to revoke privileges for ${email}?`)) return;
        
        try {
            await deleteDoc(doc(db, 'user_roles', email));
            fetchRoles();
        } catch (error) {
            console.error('Error deleting user role', error);
            alert('Failed to delete user role.');
        }
    };

    if (!realIsAdmin) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-cream/30 rounded-2xl border border-tan-light/50 h-full min-h-[50vh]">
                <Shield size={48} className="text-red-500/50 mb-4" />
                <h3 className="text-2xl font-serif font-bold text-charcoal mb-2">Access Denied</h3>
                <p className="text-charcoal/60 max-w-md">You must be a system administrator to view this page.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full animate-in fade-in duration-500">
            <div className="flex justify-between items-end mb-8 border-b border-tan-light/50 pb-6 pr-4">
                <div>
                    <h1 className="text-4xl font-serif font-bold mb-3 text-charcoal tracking-tight flex items-center gap-3">
                        <Settings className="text-tan" size={32} />
                        Admin Settings
                    </h1>
                    <p className="text-charcoal/70 text-lg max-w-2xl">
                        Manage privileged users and access control rules.
                    </p>
                </div>
            </div>

            {/* Role Simulation Section */}
            <div className="mb-10 bg-tan/5 border border-tan-light/50 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-xl font-serif font-bold text-charcoal mb-2 flex items-center gap-2">
                            <Shield className="text-tan" size={24} />
                            Role Simulation
                        </h2>
                        <p className="text-charcoal/70 text-sm max-w-xl">
                            Preview the website as a different user level. This only affects your current browser session and does not change your actual database permissions.
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-2 p-1 bg-cream rounded-xl border border-tan-light/30 self-start md:self-auto">
                        <button
                            onClick={() => setSimulatedRole(null)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${!simulatedRole ? 'bg-white text-tan shadow-sm' : 'text-charcoal/60 hover:text-charcoal'}`}
                        >
                            Real Admin
                        </button>
                        <button
                            onClick={() => setSimulatedRole('curator')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${simulatedRole === 'curator' ? 'bg-white text-tan shadow-sm' : 'text-charcoal/60 hover:text-charcoal'}`}
                        >
                            Curator
                        </button>
                        <button
                            onClick={() => setSimulatedRole('visitor')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${simulatedRole === 'visitor' ? 'bg-white text-tan shadow-sm' : 'text-charcoal/60 hover:text-charcoal'}`}
                        >
                            Visitor
                        </button>
                    </div>
                </div>
                {simulatedRole && (
                    <div className="mt-4 px-4 py-2 bg-tan/10 rounded-lg inline-flex items-center gap-2 text-tan text-xs font-bold uppercase tracking-wider">
                        <Shield size={14} />
                        Active: Simulating {simulatedRole} View
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form to Add User */}
                <div className="lg:col-span-1">
                    <div className="bg-white p-6 rounded-xl border border-tan-light/50 shadow-sm sticky top-24">
                        <h2 className="text-xl font-serif font-bold text-charcoal mb-6 flex items-center gap-2">
                            <UserPlus size={20} className="text-tan" />
                            Assign Privilege
                        </h2>
                        
                        <form onSubmit={handleAddUser} className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">User Email</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" size={18} />
                                    <input 
                                        type="email" 
                                        required 
                                        placeholder="email@example.com"
                                        value={newEmail}
                                        onChange={(e) => setNewEmail(e.target.value)}
                                        className="w-full bg-cream pl-10 pr-4 py-3 rounded-lg border border-transparent focus:bg-white focus:border-tan outline-none transition-all font-sans text-charcoal"
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-bold text-charcoal/60 uppercase tracking-widest mb-2 font-sans">Role Level</label>
                                <select
                                    value={newRole}
                                    onChange={(e) => setNewRole(e.target.value as 'admin' | 'curator')}
                                    className="w-full bg-cream px-4 py-3 rounded-lg border border-transparent outline-none cursor-pointer focus:bg-white focus:border-tan transition-all font-sans text-charcoal"
                                >
                                    <option value="curator">Curator (Add, Edit, Delete)</option>
                                    <option value="admin">Admin (All + Settings + AI)</option>
                                </select>
                            </div>
                            
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full bg-tan text-white px-5 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors hover:scale-[1.02] active:scale-[0.98] mt-2 flex items-center justify-center"
                            >
                                {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : 'Assign Role'}
                            </button>
                        </form>
                    </div>
                </div>

                {/* List of current Users */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-xl border border-tan-light/50 overflow-hidden shadow-sm">
                        <div className="px-6 py-4 bg-cream/30 border-b border-tan-light/50 flex items-center justify-between">
                            <h3 className="font-serif font-bold text-charcoal flex items-center gap-2">
                                <Shield size={18} className="text-tan" />
                                Database Assigned Roles
                            </h3>
                        </div>
                        
                        {loading ? (
                            <div className="p-8 text-center text-charcoal/60 font-serif">Loading...</div>
                        ) : roles.length === 0 ? (
                            <div className="p-12 text-center text-charcoal/50 font-sans">
                                <UserMinus size={32} className="mx-auto mb-3 opacity-50" />
                                <p>No database overrides have been assigned yet.</p>
                                <p className="text-sm mt-1">Hardcoded admins have automatic permanent access.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-tan-light/30">
                                {roles.map(role => (
                                    <div key={role.id} className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-cream/20 transition-colors">
                                        <div>
                                            <p className="font-semibold text-charcoal font-sans">{role.id}</p>
                                            <p className="text-xs font-bold uppercase tracking-wider mt-1 flex items-center gap-2">
                                                {role.role === 'admin' ? (
                                                    <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">Admin</span>
                                                ) : (
                                                    <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">Curator</span>
                                                )}
                                                <span className="text-charcoal/40 font-mono text-[10px] lowercase">Since {new Date(role.addedAt || Date.now()).toLocaleDateString()}</span>
                                            </p>
                                        </div>
                                        <button 
                                            onClick={() => handleDeleteUser(role.id)}
                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded transition-colors self-start sm:self-auto"
                                            title="Revoke Overrides"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="bg-blue-50/50 rounded-xl border border-blue-100 p-6 text-sm text-blue-900/70 font-sans leading-relaxed">
                        <strong>Permanent Admins:</strong> <code>catnolan@senoiahistory.com</code> and <code>jeremywarren@senoiahistory.com</code> are hardcoded as permanent system administrators. You cannot revoke their access here.
                    </div>
                </div>
            </div>
        </div>
    );
}
