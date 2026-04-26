import { BrowserRouter, Routes, Route, Outlet, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import { BrowseArchive } from './pages/BrowseArchive';
import { ItemDetail } from './pages/ItemDetail';
import { AddItem } from './pages/AddItem';
import EditItem from './pages/EditItem';
import { Collections } from './pages/Collections';
import { CollectionDetail } from './pages/CollectionDetail';
import { AddCollection } from './pages/AddCollection';
import { EditCollection } from './pages/EditCollection';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Home } from './pages/Home';
import { SearchArchive } from './pages/SearchArchive';
import { AdminSettings } from './pages/AdminSettings';
import { ManageLocations } from './pages/ManageLocations';
import { ManageRoomLocations } from './pages/ManageRoomLocations';
import { TaggingHub } from './pages/TaggingHub';
import { LocationDetail } from './pages/LocationDetail';
import { RoomDetail } from './pages/RoomDetail';
import { InteractiveMap } from './pages/InteractiveMap';
import { AuditDashboard } from './pages/AuditDashboard';
import { BrowseMap } from './pages/BrowseMap';

function PageWrapper() {
  return (
    <div className="flex-1 p-4 sm:p-6 md:p-8 lg:p-12 max-w-screen-2xl mx-auto w-full">
      <Outlet />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isSAHSUser, realIsAdmin, loading } = useAuth();
  const location = useLocation();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 border-4 border-tan/30 border-t-tan rounded-full animate-spin"></div>
        <p className="font-serif text-charcoal/60 text-lg">Verifying access...</p>
      </div>
    );
  }

  // Admins always have access to /settings to toggle simulation
  if (realIsAdmin && location.pathname === '/settings') {
    return <>{children}</>;
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
              <Route path="map" element={<BrowseMap />} />
              <Route path="login" element={<Login />} />

              {/* Protected Curator Routes */}
              <Route path="add-item" element={<ProtectedRoute><AddItem /></ProtectedRoute>} />
              <Route path="add-collection" element={<ProtectedRoute><AddCollection /></ProtectedRoute>} />
              <Route path="edit-item/:id" element={<ProtectedRoute><EditItem /></ProtectedRoute>} />
              <Route path="edit-collection/:id" element={<ProtectedRoute><EditCollection /></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
              <Route path="tagging" element={<ProtectedRoute><TaggingHub /></ProtectedRoute>} />
              <Route path="manage-locations" element={<ProtectedRoute><ManageLocations /></ProtectedRoute>} />
              <Route path="manage-locations/rooms/:roomId" element={<ProtectedRoute><ManageRoomLocations /></ProtectedRoute>} />
              <Route path="rooms/:id" element={<ProtectedRoute><RoomDetail /></ProtectedRoute>} />
              <Route path="locations/:id" element={<ProtectedRoute><LocationDetail /></ProtectedRoute>} />
              <Route path="interactive-map" element={<ProtectedRoute><InteractiveMap /></ProtectedRoute>} />
              <Route path="audit" element={<ProtectedRoute><AuditDashboard /></ProtectedRoute>} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
