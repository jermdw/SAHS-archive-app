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
          <Route path="documents" element={
            <div>
              <h1 className="text-4xl font-serif font-bold mb-2">Document Archive</h1>
              <p className="text-charcoal/70 mb-8">Browse and search through our collection of historical documents</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {/* Grid items go here */}
                <div className="bg-white border border-tan-light/50 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="aspect-[4/3] bg-tan-light/20 flex flex-col p-4 relative">
                    <span className="absolute top-3 right-3 bg-charcoal/80 text-white text-xs px-2 py-1 rounded-full font-medium">+10 more</span>
                  </div>
                  <div className="p-5">
                    <h3 className="font-bold text-lg leading-tight mb-2">Hightower Petroleum Report</h3>
                    <p className="text-sm text-charcoal/70 line-clamp-2 mb-4">A corporate report to the shareholders of the Hightower Petroleum company...</p>
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-xs text-charcoal/60 flex items-center gap-1">c. 1950</span>
                      <span className="text-xs bg-tan-light text-charcoal px-2.5 py-1 rounded-full font-medium">Letter</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          } />
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
