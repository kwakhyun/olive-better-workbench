export type Well =
  | "Eat Well"
  | "Nourish Well"
  | "Fit Well"
  | "Relax Well"
  | "Glow Well"
  | "Care Well";

export type Product = {
  id: string;
  sku: string;
  canonicalSku: string;
  name: string;
  brand: string;
  well: Well;
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
  well?: Well;
  at: string;
};

export type RawTrendSignal = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  source: string;
};

export type TrendSignal = RawTrendSignal & {
  relevance: number;
  ageDays: number | null;
};

export type ResearchSource = {
  name: string;
  url: string;
  itemCount: number;
};

export type ResearchPayload = {
  status: "live" | "cached";
  topic: string;
  fetchedAt: string;
  startedAt?: string;
  sources: ResearchSource[];
  failedSources?: string[];
  signals: RawTrendSignal[];
  fallbackReason?: string;
};

export type BannerCopy = {
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
};

export type BannerResponse = {
  status: "generated";
  generatedAt: string;
  engine: string;
  banner: BannerCopy;
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
  well: Well;
  theme: string;
  palette: { accent: string; soft: string; ink: string; canvas: string };
  research: {
    status: "live" | "cached" | "failed";
    topic: string;
    fetchedAt: string;
    sources: Array<{ name: string; url: string; itemCount: number }>;
    signals: TrendSignal[];
    excludedSignals: Array<TrendSignal & { reason: string }>;
    bannerStatus: "generated" | "failed";
    bannerEngine?: string;
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

export type DraftAssemblyRequest = {
  request: string;
  well: Well;
  research: ResearchPayload;
  banner?: BannerCopy;
  bannerStatus: "generated" | "failed";
  bannerEngine?: string;
  bannerGeneratedAt?: string;
  bannerError?: string;
};

export type PublishCheck = {
  allowed: boolean;
  reasons: string[];
  safety?: {
    safe: boolean;
    violations: Array<{ phrase?: string; reason: string; type?: string }>;
  };
  config?: { valid?: boolean; issues: string[] };
};
