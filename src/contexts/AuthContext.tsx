import { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    isSAHSUser: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

// We define our allowed domain here
const ALLOWED_DOMAIN = 'senoiahistory.com';

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
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

    const isSAHSUser = !!user?.email?.endsWith(`@${ALLOWED_DOMAIN}`);

    return (
        <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout, isSAHSUser }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
