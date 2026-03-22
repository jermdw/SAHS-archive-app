import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider, db } from '../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    isSAHSUser: boolean; // Alias for isAdmin || isCurator
    isAdmin: boolean;
    isCurator: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// We define our allowed domain here
const ALLOWED_DOMAIN = 'senoiahistory.com';

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isCurator, setIsCurator] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser && currentUser.email) {
                const email = currentUser.email.toLowerCase();
                if (email === 'catnolan@senoiahistory.com' || email === 'jeremywarren@senoiahistory.com') {
                    setIsAdmin(true);
                    setIsCurator(false);
                } else {
                    try {
                        const roleDoc = await getDoc(doc(db, 'user_roles', email));
                        if (roleDoc.exists()) {
                            const role = roleDoc.data().role;
                            if (role === 'admin') {
                                setIsAdmin(true);
                                setIsCurator(false);
                            } else if (role === 'curator') {
                                setIsAdmin(false);
                                setIsCurator(true);
                            } else {
                                setIsAdmin(false);
                                setIsCurator(false);
                            }
                        } else {
                            setIsAdmin(false);
                            setIsCurator(false);
                        }
                    } catch (error) {
                        console.error('Error fetching user role:', error);
                        setIsAdmin(false);
                        setIsCurator(false);
                    }
                }
            } else {
                setIsAdmin(false);
                setIsCurator(false);
            }
            setUser(currentUser);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const loginWithGoogle = async () => {
        try {
            // Optional: You can force prompt select_account to make it easier for users with multiple googles
            googleProvider.setCustomParameters({ prompt: 'select_account' });

            const result = await signInWithPopup(auth, googleProvider);
            const userEmail = result.user.email;

            // Check domain immediately upon sign in
            if (userEmail && !userEmail.endsWith(`@${ALLOWED_DOMAIN}`)) {
                // If not valid, immediately sign them out
                await signOut(auth);
                throw new Error(`Unauthorized. Please sign in with an @${ALLOWED_DOMAIN} email address.`);
            }
        } catch (error) {
            console.error("Auth error", error);
            throw error;
        }
    };

    const logout = async () => {
        await signOut(auth);
    };

    const isSAHSUser = isAdmin || isCurator;

    return (
        <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout, isSAHSUser, isAdmin, isCurator }}>
            {loading ? (
                <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-4">
                    <div className="w-12 h-12 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
                    <p className="font-serif text-charcoal/60 text-lg">Initializing SAHS Archive...</p>
                </div>
            ) : children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
