import { BrowserRouter, Routes, Route, Outlet, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { BrowseArchive } from './pages/BrowseArchive';
import { ItemDetail } from './pages/ItemDetail';
import { AddItem } from './pages/AddItem';
import { EditItem } from './pages/EditItem';
import { Collections } from './pages/Collections';
import { CollectionDetail } from './pages/CollectionDetail';
import { AddCollection } from './pages/AddCollection';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Home } from './pages/Home';
import { SearchArchive } from './pages/SearchArchive';
import { AdminSettings } from './pages/AdminSettings';
import { ManageLocations } from './pages/ManageLocations';
import { TaggingHub } from './pages/TaggingHub';

function PageWrapper() {
  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 lg:p-12 max-w-screen-2xl mx-auto w-full">
      <Outlet />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isSAHSUser, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
        <p className="font-serif text-charcoal/60 text-lg">Verifying access...</p>
      </div>
    );
  }

  if (!user || !isSAHSUser) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />

            <Route element={<PageWrapper />}>
              <Route path="archive" element={<BrowseArchive />} />
              <Route path="collections" element={<Collections />} />
              <Route path="collections/:id" element={<CollectionDetail />} />

              {/* Authentication and Admin routes */}
              <Route path="items/:id" element={<ItemDetail />} />
              <Route path="figures/:id" element={<ItemDetail />} /> {/* Legacy detail redirect handled later */}
              <Route path="search" element={<SearchArchive />} />
              <Route path="login" element={<Login />} />

              {/* Protected Curator Routes */}
              <Route path="add-item" element={<ProtectedRoute><AddItem /></ProtectedRoute>} />
              <Route path="add-collection" element={<ProtectedRoute><AddCollection /></ProtectedRoute>} />
              <Route path="edit-item/:id" element={<ProtectedRoute><EditItem /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
              <Route path="tagging" element={<ProtectedRoute><TaggingHub /></ProtectedRoute>} />
              <Route path="manage-locations" element={<ProtectedRoute><ManageLocations /></ProtectedRoute>} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
