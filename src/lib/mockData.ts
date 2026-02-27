import type { DocumentRecord, HistoricFigure } from '../types/database';

export const mockDocuments: DocumentRecord[] = [
    {
        id: '1',
        title: 'Hightower Petroleum Report',
        description: 'A corporate report to the shareholders of the Hightower Petroleum company outlining annual revenue and operations.',
        date_approx: 'c. 1950',
        category: 'Letter',
        image_urls: ['https://images.unsplash.com/photo-1544830215-200742d4a6de?auto=format&fit=crop&w=800&q=80'],
        created_at: new Date().toISOString()
    },
    {
        id: '2',
        title: 'Provident Home Loan Company',
        description: 'A series of letters from G. G. Glower to Mr. Allen H. Jones regarding loan agreements.',
        date_approx: 'c. 1908',
        category: 'Letter',
        image_urls: ['https://images.unsplash.com/photo-1579548122080-c35fd6820ecb?auto=format&fit=crop&w=800&q=80'],
        created_at: new Date().toISOString()
    },
    {
        id: '3',
        title: 'AH Jones Estate Account',
        description: 'An account of the AH Jones estate\'s assets and ledger entries.',
        date_approx: 'c. 1898',
        category: 'Legal Document',
        image_urls: ['https://images.unsplash.com/photo-1502414736173-ee1005ca7c90?auto=format&fit=crop&w=800&q=80'],
        created_at: new Date().toISOString()
    },
    {
        id: '4',
        title: 'Mrs. AH Jones Donation Receipt',
        description: 'A donation receipt in the amount of $21.50 by Mrs. A. H. Jones to the Baptist Convention.',
        date_approx: 'c. 1930',
        category: 'Letter',
        image_urls: ['https://images.unsplash.com/photo-1563811771141-cb4be43bb593?auto=format&fit=crop&w=800&q=80'],
        created_at: new Date().toISOString()
    }
];

export const mockFigures: HistoricFigure[] = [
    {
        id: '1',
        full_name: 'Dr. John Baggarly',
        also_known_as: 'J. Baggarly',
        type: 'Person',
        life_dates: '1850 - 1920',
        biography: 'A prominent physician in the Senoia area during the late 19th century.',
        portrait_url: 'https://images.unsplash.com/photo-1555529733-0e67056058ab?auto=format&fit=crop&w=800&q=80',
        created_at: new Date().toISOString()
    }
];
