export interface SearchResult {
  id: string;
  title: string;
  content: string;
  url: string;
  source: 'google' | 'twitter' | 'github';
  timestamp: Date;
  relevanceScore: number;
  credibilityScore: number;
  metadata: {
    author?: string;
    platform?: string;
    tags?: string[];
    engagement?: {
      likes?: number;
      shares?: number;
      comments?: number;
      stars?: number;
    };
  };
}

export interface SearchConfig {
  focus: string[];
  timeWindow: string;
  sources: {
    google: SourceConfig;
    twitter: SourceConfig;
    github: SourceConfig;
  };
  quality: QualityConfig;
  performance: PerformanceConfig;
}

export interface SourceConfig {
  enabled: boolean;
  priority: number;
  searchQueries?: string[];
  hashtags?: string[];
  siteFilters?: string[];
  filters?: any;
}

export interface QualityConfig {
  minCredibilityScore: number;
  minRelevanceScore: number;
  maxAge: string;
  requiredKeywords: string[];
  excludeKeywords: string[];
}

export interface PerformanceConfig {
  maxConcurrentSearches: number;
  requestDelay: number;
  retryAttempts: number;
  timeout: number;
}

export interface AgenticSearchInput {
  keywords: string[];
  config: SearchConfig;
}

export interface AgenticSearchOutput {
  results: SearchResult[];
  totalFound: number;
  searchSummary: {
    googleResults: number;
    twitterResults: number;
    githubResults: number;
    processingTime: number;
  };
  newsletter: {
    title: string;
    content: string;
    sections: NewsletterSection[];
  };
}

export interface NewsletterSection {
  title: string;
  content: string;
  items: SearchResult[];
  priority: number;
}

export interface WorkerTask {
  type: 'search' | 'content' | 'validation' | 'aggregation';
  data: any;
  id: string;
}

export interface WorkerResult {
  taskId: string;
  success: boolean;
  data?: any;
  error?: string;
  processingTime: number;
}