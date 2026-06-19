import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull(),
  region: text("region"),
  active: boolean("active").notNull().default(true),
  searchEnabled: boolean("search_enabled").notNull().default(true),
  serpApiKeyEnc: text("serpapi_key_enc"),
  waAccessTokenEnc: text("wa_access_token_enc"),
  waPhoneNumberId: text("wa_phone_number_id"),
  waBusinessAccountId: text("wa_business_account_id"),
  waAppId: text("wa_app_id"),
  whatsAppEnabled: boolean("whatsapp_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const searches = pgTable("searches", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id").references(() => users.id, { onDelete: "set null" }),
  industry: text("industry").notNull(),
  location: text("location").notNull(),
  query: text("query").notNull(),
  totalFetched: integer("total_fetched").notNull(),
  totalWithoutWebsite: integer("total_without_website").notNull(),
  pagesFetched: integer("pages_fetched").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const searchBusinesses = pgTable("search_businesses", {
  id: uuid("id").defaultRandom().primaryKey(),
  searchId: uuid("search_id")
    .notNull()
    .references(() => searches.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  placeId: text("place_id"),
  address: text("address"),
  phone: text("phone"),
  website: text("website"),
  hasWebsite: boolean("has_website").notNull(),
  latitude: real("latitude"),
  longitude: real("longitude"),
  rating: real("rating"),
  reviews: integer("reviews"),
  type: text("type"),
  mapsUrl: text("maps_url"),
  thumbnail: text("thumbnail"),
  serpPosition: integer("serp_position"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const leads = pgTable("leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  searchId: uuid("search_id")
    .notNull()
    .references(() => searches.id, { onDelete: "cascade" }),
  searchBusinessId: uuid("search_business_id").references(
    () => searchBusinesses.id,
    { onDelete: "set null" },
  ),
  title: text("title").notNull(),
  placeId: text("place_id"),
  address: text("address"),
  phone: text("phone"),
  rating: real("rating"),
  reviews: integer("reviews"),
  type: text("type"),
  mapsUrl: text("maps_url"),
  thumbnail: text("thumbnail"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  hasWhatsapp: boolean("has_whatsapp"),
  whatsappCheckedAt: timestamp("whatsapp_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const proposals = pgTable("proposals", {
  id: uuid("id").defaultRandom().primaryKey(),
  leadId: uuid("lead_id")
    .notNull()
    .unique()
    .references(() => leads.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  status: text("status").notNull().default("in_progress"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const websiteStatsCache = pgTable("website_stats_cache", {
  id: uuid("id").defaultRandom().primaryKey(),
  websiteUrl: text("website_url").notNull().unique(),
  trafficLabel: text("traffic_label"),
  trafficEstimate: text("traffic_estimate"),
  websiteAge: text("website_age"),
  lastUpdated: text("last_updated"),
  source: text("source").notNull().default("measured"),
  rawJson: jsonb("raw_json"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const leadCompetitorPicks = pgTable("lead_competitor_picks", {
  id: uuid("id").defaultRandom().primaryKey(),
  leadId: uuid("lead_id")
    .notNull()
    .unique()
    .references(() => leads.id, { onDelete: "cascade" }),
  competitorIds: jsonb("competitor_ids").$type<string[]>().notNull(),
  pickedAt: timestamp("picked_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const searchActivityLogs = pgTable("search_activity_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  region: text("region").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const whatsappConversations = pgTable("whatsapp_conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
  customerPhone: text("customer_phone").notNull(),
  displayName: text("display_name"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const whatsappMessages = pgTable("whatsapp_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => whatsappConversations.id, { onDelete: "cascade" }),
  direction: text("direction").notNull(), // inbound | outbound
  body: text("body").notNull(),
  waMessageId: text("wa_message_id"),
  status: text("status").notNull().default("sent"), // sent | delivered | read | failed
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const searchesRelations = relations(searches, ({ many }) => ({
  leads: many(leads),
  searchBusinesses: many(searchBusinesses),
}));

export const searchBusinessesRelations = relations(
  searchBusinesses,
  ({ one }) => ({
    search: one(searches, {
      fields: [searchBusinesses.searchId],
      references: [searches.id],
    }),
  }),
);

export const leadsRelations = relations(leads, ({ one }) => ({
  search: one(searches, {
    fields: [leads.searchId],
    references: [searches.id],
  }),
  searchBusiness: one(searchBusinesses, {
    fields: [leads.searchBusinessId],
    references: [searchBusinesses.id],
  }),
  proposal: one(proposals, {
    fields: [leads.id],
    references: [proposals.leadId],
  }),
  competitorPick: one(leadCompetitorPicks, {
    fields: [leads.id],
    references: [leadCompetitorPicks.leadId],
  }),
}));

export const proposalsRelations = relations(proposals, ({ one }) => ({
  lead: one(leads, {
    fields: [proposals.leadId],
    references: [leads.id],
  }),
}));

export const leadCompetitorPicksRelations = relations(
  leadCompetitorPicks,
  ({ one }) => ({
    lead: one(leads, {
      fields: [leadCompetitorPicks.leadId],
      references: [leads.id],
    }),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  searchActivityLogs: many(searchActivityLogs),
  whatsappConversations: many(whatsappConversations),
}));

export const searchActivityLogsRelations = relations(
  searchActivityLogs,
  ({ one }) => ({
    agent: one(users, {
      fields: [searchActivityLogs.agentId],
      references: [users.id],
    }),
  }),
);

export const whatsappConversationsRelations = relations(
  whatsappConversations,
  ({ one, many }) => ({
    agent: one(users, {
      fields: [whatsappConversations.agentId],
      references: [users.id],
    }),
    lead: one(leads, {
      fields: [whatsappConversations.leadId],
      references: [leads.id],
    }),
    messages: many(whatsappMessages),
  }),
);

export const whatsappMessagesRelations = relations(whatsappMessages, ({ one }) => ({
  conversation: one(whatsappConversations, {
    fields: [whatsappMessages.conversationId],
    references: [whatsappConversations.id],
  }),
}));
