export type Category = 'Letter' | 'Photograph' | 'Legal Document' | 'Newspaper' | 'Object' | 'Other';
export type Condition = 'Excellent' | 'Good' | 'Fair' | 'Poor';

export interface DocumentRecord {
    id: string;
    title: string;
    description: string;
    date_approx: string;
    category: Category;
    location?: string;
    archive_reference?: string;
    condition?: Condition;
    tags?: string[];
    image_urls: string[];
    created_at: string;
}

export interface HistoricFigure {
    id: string;
    full_name: string;
    also_known_as?: string;
    type: 'Person' | 'Organization' | 'Building';
    life_dates?: string;
    biography: string;
    portrait_url?: string;
    created_at: string;
}
