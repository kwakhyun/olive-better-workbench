export type Product = {
  id: string;
  sku: string;
  canonicalSku: string;
  name: string;
  brand: string;
  well: string;
  category: string;
  functional: string[];
  price: number;
  stock: number;
  rating: number;
  reviewCount: number;
  tags: string[];
  flags: { coupon: boolean; hasOptions: boolean };
  color: string;
  form: string;
  recommendationScore?: number;
  recommendationReason?: string;
};

export type CustomerEvent = {
  id: string;
  type: "click" | "like" | "purchase";
  productId?: string;
  blockId?: string;
  well?: string;
  at: string;
};

export type TrendSignal = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  source: string;
  relevance: number;
  ageDays: number | null;
};

export type PageBlock = {
  id: string;
  type: string;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  body?: string;
  cta?: string;
  variant?: string;
  well?: string;
  productIds?: string[];
  items?: string[];
  steps?: Array<{ time: string; label: string; productId?: string }>;
  presentation?: Record<string, string | number>;
};

export type Draft = {
  schemaVersion: string;
  id: string;
  status: "draft" | "published";
  createdAt: string;
  publishedAt?: string;
  request: string;
  well: string;
  theme: string;
  palette: { accent: string; soft: string; ink: string; canvas: string };
  research: {
    status: "live" | "cached" | "failed";
    topic: string;
    fetchedAt: string;
    sources: Array<{ name: string; url: string; itemCount: number }>;
    signals: TrendSignal[];
    excludedSignals: Array<TrendSignal & { reason: string }>;
    bannerStatus: "live" | "failed" | "unavailable";
    bannerModel?: string;
    bannerGeneratedAt?: string;
    fallbackReason?: string;
  };
  blocks: PageBlock[];
  products: Record<string, Product>;
  audit: {
    includedCount: number;
    excluded: Array<{ id: string; name: string; reason: string }>;
    heroSafety: {
      safe: boolean;
      violations: Array<{ phrase: string; reason: string; type: string }>;
      inspectedAt: string;
    };
    feedback: string;
    eventCount: number;
    assumptions: string[];
  };
};

