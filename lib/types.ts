export interface GpsCoordinates {
  latitude: number;
  longitude: number;
}

export interface SerpApiLocalResult {
  position?: number;
  title: string;
  place_id?: string;
  data_id?: string;
  rating?: number;
  reviews?: number;
  type?: string;
  types?: string[];
  address?: string;
  phone?: string;
  website?: string;
  gps_coordinates?: GpsCoordinates;
  thumbnail?: string;
  serpapi_thumbnail?: string;
}

export interface SerpApiMapsResponse {
  local_results?: SerpApiLocalResult[];
  error?: string;
}

export interface BusinessLead {
  title: string;
  placeId: string | null;
  address: string | null;
  phone: string | null;
  rating: number | null;
  reviews: number | null;
  type: string | null;
  mapsUrl: string | null;
  thumbnail: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface SearchBusiness {
  title: string;
  placeId: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  hasWebsite: boolean;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviews: number | null;
  type: string | null;
  mapsUrl: string | null;
  thumbnail: string | null;
  serpPosition: number | null;
}

export interface SearchResult {
  query: string;
  totalFetched: number;
  totalWithoutWebsite: number;
  pagesFetched: number;
  businesses: BusinessLead[];
  allBusinesses: SearchBusiness[];
  searchId?: string;
}

export interface SearchSummary {
  id: string;
  query: string;
  industry: string;
  location: string;
  totalWithoutWebsite: number;
  createdAt: string;
}

export type ProposalStatus = "in_progress" | "sent" | "replied" | "draft";

export interface ProposalFollowUpSummary {
  step: number;
  status: "pending" | "sent" | "cancelled" | "failed";
  scheduledAt: string;
  sentAt: string | null;
}

export interface ProposalSummary {
  id: string;
  status: ProposalStatus;
  body: string;
  sentAt: string | null;
  repliedAt: string | null;
  demoUrl: string | null;
  demoStatus?: "none" | "building" | "ready" | "failed";
  demoRequestedAt?: string | null;
  followUps?: ProposalFollowUpSummary[];
  followUpLabel?: string | null;
}

export interface LeadWithProposal {
  id: string;
  title: string;
  placeId: string | null;
  address: string | null;
  phone: string | null;
  rating: number | null;
  reviews: number | null;
  type: string | null;
  mapsUrl: string | null;
  thumbnail: string | null;
  hasWhatsapp: boolean | null;
  proposal: ProposalSummary | null;
}

export interface SearchDetail {
  id: string;
  query: string;
  industry: string;
  location: string;
  totalFetched: number;
  totalWithoutWebsite: number;
  demoTemplate?: string | null;
  createdAt: string;
}

export interface SearchRequest {
  industryId: string;
  city: string;
}

export type WebsiteStatsSource = "measured" | "ai" | "mixed" | "apify";

export interface WebsiteStats {
  trafficLabel: string | null;
  trafficEstimate: string | null;
  websiteAge: string | null;
  lastUpdated: string | null;
  source: WebsiteStatsSource;
  trafficError?: string | null;
}

export interface CompetitorWithStats {
  id: string;
  title: string;
  website: string;
  address: string | null;
  stats: WebsiteStats;
}

export interface LeadDetail {
  id: string;
  title: string;
  thumbnail: string | null;
  address: string | null;
  phone: string | null;
  rating: number | null;
  reviews: number | null;
  type: string | null;
  mapsUrl: string | null;
  hasWhatsapp: boolean | null;
}

export interface CompetitorsResponse {
  lead: LeadDetail;
  competitors: CompetitorWithStats[];
  pickSource: "cache" | "ai" | "none";
  competitorsMessage?: string;
  trafficNote?: string;
}
