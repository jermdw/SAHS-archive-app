import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { Documents } from './pages/Documents';
import { DocumentDetail } from './pages/DocumentDetail';
import { HistoricFigures } from './pages/HistoricFigures';
import { HistoricFigureDetail } from './pages/HistoricFigureDetail';
import { UploadDocument } from './pages/UploadDocument';
import { AddFigure } from './pages/AddFigure';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={
            <div className="space-y-6">
              <h1 className="text-5xl font-serif font-bold tracking-tight">Digital Archive</h1>
              <p className="text-xl text-charcoal/80 max-w-2xl leading-relaxed">
                Explore the rich history of the Senoia area through our collection of historical documents,
                photographs, and curated profiles of historic figures.
              </p>
              <div className="flex gap-4 pt-4">
                <a href="/documents" className="bg-tan text-white px-6 py-3 rounded-lg font-medium hover:bg-charcoal transition-colors">
                  Browse Documents
                </a>
                <a href="/search" className="bg-white border border-tan-light text-charcoal px-6 py-3 rounded-lg font-medium hover:bg-tan-light/30 transition-colors">
                  Search Archive
                </a>
              </div>
            </div>
          } />
          <Route path="documents" element={<Documents />} />
          <Route path="documents/:id" element={<DocumentDetail />} />
          <Route path="figures" element={<HistoricFigures />} />
          <Route path="figures/:id" element={<HistoricFigureDetail />} />
          <Route path="search" element={<div className="font-serif text-3xl font-bold">Search Archive</div>} />
          <Route path="upload-document" element={<UploadDocument />} />
          <Route path="add-figure" element={<AddFigure />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
