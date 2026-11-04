/**
 * Rivela ASE — wire DTO schemas (ase_coding_standards.md §2).
 *
 * HTTP bodies/params/queries are snake_case on the wire, camelCase in TS.
 * Every z.infer shape in this file IS the wire type. Mappers in mappers.ts
 * convert wire <-> domain (src/types/domain.ts).
 *
 * zod is applied at every HTTP boundary (standards §5): bodies, params,
 * queries, and the response DTO shapes are all zod-validated.
 */
import { z } from 'zod';
import {
  ACTION_TYPES,
  CONFIDENCE_LEVELS,
  ROUTING_DECISIONS,
  SOURCE_TYPES,
  type ActionType,
  type ConfidenceLevel,
  type RoutingDecision,
  type SourceType,
} from '../../types/domain';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const UuidSchema = z.string().uuid();

/** Accepts any ISO-8601-ish datetime (Date.parse-able), e.g. 2026-07-31T10:00:00.000Z. */
export const DateTimeSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: 'Invalid ISO 8601 datetime',
});

/** Build a z.enum from a readonly string-literal-union array (domain.ts exports). */
function enumFromArray<T extends string>(values: readonly T[]): z.ZodEnum<[T, ...T[]]> {
  return z.enum(values as unknown as [T, ...T[]]);
}

export const SourceTypeSchema = enumFromArray<SourceType>(SOURCE_TYPES);
export const ActionTypeSchema = enumFromArray<ActionType>(ACTION_TYPES);
export const ConfidenceLevelSchema = enumFromArray<ConfidenceLevel>(CONFIDENCE_LEVELS);
export const RoutingDecisionSchema = enumFromArray<RoutingDecision>(ROUTING_DECISIONS);

// ---------------------------------------------------------------------------
// Route params
// ---------------------------------------------------------------------------

export const IdParamsSchema = z.object({ id: UuidSchema });
export type IdParams = z.infer<typeof IdParamsSchema>;

export const OrganizationIdParamsSchema = z.object({ organizationId: UuidSchema });
export type OrganizationIdParams = z.infer<typeof OrganizationIdParamsSchema>;

export const RawSignalIdParamsSchema = z.object({ rawSignalId: UuidSchema });
export type RawSignalIdParams = z.infer<typeof RawSignalIdParamsSchema>;

// ---------------------------------------------------------------------------
// Query params
// ---------------------------------------------------------------------------

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** ?is_active=true|false — query strings arrive as text, coerced to boolean. */
const OptionalBooleanQuerySchema = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean().optional());

export const DataSourcesListQuerySchema = PaginationQuerySchema.extend({
  competitor_id: UuidSchema.optional(),
  source_type: SourceTypeSchema.optional(),
  is_active: OptionalBooleanQuerySchema,
});
export type DataSourcesListQuery = z.infer<typeof DataSourcesListQuerySchema>;

export const RawSignalsListQuerySchema = PaginationQuerySchema.extend({
  competitor_id: UuidSchema.optional(),
  source_type: SourceTypeSchema.optional(),
  collected_from: DateTimeSchema.optional(),
  collected_to: DateTimeSchema.optional(),
});
export type RawSignalsListQuery = z.infer<typeof RawSignalsListQuerySchema>;

export const SignalsListQuerySchema = PaginationQuerySchema.extend({
  organization_id: UuidSchema.optional(),
  competitor_id: UuidSchema.optional(),
  action_type: ActionTypeSchema.optional(),
  routing_decision: RoutingDecisionSchema.optional(),
  min_significance: z.coerce.number().int().min(1).max(10).optional(),
  max_significance: z.coerce.number().int().min(1).max(10).optional(),
  classified_from: DateTimeSchema.optional(),
  classified_to: DateTimeSchema.optional(),
  routed_from: DateTimeSchema.optional(),
  routed_to: DateTimeSchema.optional(),
  bookmarked: OptionalBooleanQuerySchema,
  search: z.string().max(200).optional(),
});
export type SignalsListQuery = z.infer<typeof SignalsListQuerySchema>;

/** Shared by the worker queue endpoints (pending-scoring, pending-routing, unclassified). */
export const QueueQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

/** GET /signals/routed?routing_decision=... (required, enum). */
export const RoutedQuerySchema = z.object({
  routing_decision: RoutingDecisionSchema,
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type RoutedQuery = z.infer<typeof RoutedQuerySchema>;

// ---------------------------------------------------------------------------
// Request bodies (snake_case wire -> camelCase domain via mappers.ts)
// ---------------------------------------------------------------------------

export const CreateDataSourceBodySchema = z.object({
  competitor_id: UuidSchema.nullable(),
  source_type: SourceTypeSchema,
  target_url: z.string().nullable(),
  collection_method: z.string().min(1),
  refresh_interval_minutes: z.number().int().positive(),
});
export type CreateDataSourceBody = z.infer<typeof CreateDataSourceBodySchema>;

export const UpdateDataSourceBodySchema = z.object({
  target_url: z.string().nullable().optional(),
  refresh_interval_minutes: z.number().int().positive().optional(),
  is_active: z.boolean().optional(),
});
export type UpdateDataSourceBody = z.infer<typeof UpdateDataSourceBodySchema>;

export const IngestRawSignalBodySchema = z.object({
  organization_id: UuidSchema,
  competitor_id: UuidSchema,
  data_source_id: UuidSchema.nullable(),
  source_type: SourceTypeSchema,
  raw_text: z.string().min(1),
  source_url: z.string().nullable(),
  collection_method: z.string().min(1),
  collected_at: DateTimeSchema,
  content_hash: z.string().min(1),
});
export type IngestRawSignalBody = z.infer<typeof IngestRawSignalBodySchema>;

export const ClassifyBodySchema = z.object({
  action_type: ActionTypeSchema,
  confidence_level: ConfidenceLevelSchema,
  key_facts: z.array(z.string().min(1)).max(3),
  llm_model_used: z.string().min(1),
});
export type ClassifyBody = z.infer<typeof ClassifyBodySchema>;

export const ScoreBodySchema = z.object({
  score_recency: z.number().int(),
  score_source_authority: z.number().int(),
  score_action_type: z.number().int(),
  score_icp_relevance: z.number().int(),
  score_deal_stage_context: z.number().int(),
  score_novelty: z.number().int(),
});
export type ScoreBody = z.infer<typeof ScoreBodySchema>;

export const RouteBodySchema = z.object({
  routing_decision: RoutingDecisionSchema,
  battlecard_update_triggered: z.boolean(),
  deal_alert_check_triggered: z.boolean(),
});
export type RouteBody = z.infer<typeof RouteBodySchema>;

// ---------------------------------------------------------------------------
// Schema 002 request bodies (auth, competitors, rules, notifications)
// ---------------------------------------------------------------------------

export const RegisterBodySchema = z.object({
  name: z.string().min(1).max(100),
  password: z.string().min(4).max(200),
});
export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const LoginBodySchema = z.object({
  name: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});
export type LoginBody = z.infer<typeof LoginBodySchema>;

export const CreateCompetitorBodySchema = z.object({
  name: z.string().min(1).max(200),
  /** Optional website URL(s) to monitor for this competitor (creates data_sources). */
  website_urls: z.array(z.string().url()).max(10).optional(),
});
export type CreateCompetitorBody = z.infer<typeof CreateCompetitorBodySchema>;

export const UpdateCompetitorBodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
});
export type UpdateCompetitorBody = z.infer<typeof UpdateCompetitorBodySchema>;

export const AlertRuleTriggersSchema = z
  .object({
    min_score: z.number().int().min(1).max(10).optional(),
    categories: z.array(ActionTypeSchema).optional(),
    competitor_ids: z.array(UuidSchema).optional(),
    keywords: z.array(z.string().min(1)).optional(),
  })
  .optional();

export const AlertRuleChannelSchema = z.object({
  type: z.enum(['slack', 'email', 'webhook']),
  target: z.string().min(1),
});

export const CreateAlertRuleBodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  enabled: z.boolean().optional(),
  triggers: AlertRuleTriggersSchema,
  channels: z.array(AlertRuleChannelSchema).optional(),
  routing_override: RoutingDecisionSchema.nullable().optional(),
});
export type CreateAlertRuleBody = z.infer<typeof CreateAlertRuleBodySchema>;

export const UpdateAlertRuleBodySchema = CreateAlertRuleBodySchema.partial();
export type UpdateAlertRuleBody = z.infer<typeof UpdateAlertRuleBodySchema>;

export const BookmarkBodySchema = z.object({
  bookmarked: z.boolean(),
});
export type BookmarkBody = z.infer<typeof BookmarkBodySchema>;

// ---------------------------------------------------------------------------
// Response DTOs (domain -> wire via mappers.ts)
// ---------------------------------------------------------------------------

export const DataSourceWireSchema = z.object({
  id: UuidSchema,
  organization_id: UuidSchema,
  competitor_id: UuidSchema.nullable(),
  source_type: SourceTypeSchema,
  target_url: z.string().nullable(),
  collection_method: z.string(),
  refresh_interval_minutes: z.number().int().positive(),
  is_active: z.boolean(),
  last_collected_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type DataSourceWire = z.infer<typeof DataSourceWireSchema>;

export const RawSignalWireSchema = z.object({
  id: UuidSchema,
  organization_id: UuidSchema,
  competitor_id: UuidSchema,
  data_source_id: UuidSchema.nullable(),
  source_type: SourceTypeSchema,
  raw_text: z.string(),
  source_url: z.string().nullable(),
  collection_method: z.string(),
  collected_at: z.string(),
  content_hash: z.string(),
  ingested_at: z.string(),
});
export type RawSignalWire = z.infer<typeof RawSignalWireSchema>;

export const SignalWireSchema = z.object({
  id: UuidSchema,
  raw_signal_id: UuidSchema,
  organization_id: UuidSchema,
  competitor_id: UuidSchema,
  action_type: ActionTypeSchema,
  confidence_level: ConfidenceLevelSchema,
  key_facts: z.array(z.string()),
  llm_model_used: z.string().nullable(),
  classified_at: z.string().nullable(),
  score_recency: z.number().int(),
  score_source_authority: z.number().int(),
  score_action_type: z.number().int(),
  score_icp_relevance: z.number().int(),
  score_deal_stage_context: z.number().int(),
  score_novelty: z.number().int(),
  significance_score: z.number().int().min(1).max(10),
  scored_at: z.string().nullable(),
  routing_decision: RoutingDecisionSchema,
  battlecard_update_triggered: z.boolean(),
  deal_alert_check_triggered: z.boolean(),
  routed_at: z.string().nullable(),
  bookmarked: z.boolean(),
  created_at: z.string(),
});
export type SignalWire = z.infer<typeof SignalWireSchema>;

/** Joined view: signal + raw text/source metadata + competitor name. */
export const SignalDetailWireSchema = SignalWireSchema.extend({
  raw_text: z.string(),
  source_type: SourceTypeSchema,
  source_url: z.string().nullable(),
  collected_at: z.string(),
  competitor_name: z.string(),
});
export type SignalDetailWire = z.infer<typeof SignalDetailWireSchema>;

/** Paginated envelope: { items, next_cursor, limit } (spec: cursor-based). */
export interface PaginatedWire<T> {
  items: T[];
  next_cursor: string | null;
  limit: number;
}

/** Standard error envelope (spec open item — defaulted): { error, message }. */
export const ErrorEnvelopeSchema = z.object({
  error: z.string(),
  message: z.string(),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;

// ---------------------------------------------------------------------------
// Schema 002 response DTOs
// ---------------------------------------------------------------------------

export const UserWireSchema = z.object({
  id: UuidSchema,
  organization_id: UuidSchema,
  name: z.string(),
});
export type UserWire = z.infer<typeof UserWireSchema>;

export const AuthResponseWireSchema = z.object({
  token: z.string().min(1),
  user: UserWireSchema,
});
export type AuthResponseWire = z.infer<typeof AuthResponseWireSchema>;

export const CompetitorWireSchema = z.object({
  id: UuidSchema,
  organization_id: UuidSchema,
  name: z.string(),
  created_at: z.string(),
});
export type CompetitorWire = z.infer<typeof CompetitorWireSchema>;

export const CompetitorProfileWireSchema = CompetitorWireSchema.extend({
  signal_count: z.number().int(),
  monitoring_active: z.boolean(),
  sources: z.array(
    z.object({
      id: UuidSchema,
      source_type: SourceTypeSchema,
      target_url: z.string().nullable(),
    }),
  ),
});
export type CompetitorProfileWire = z.infer<typeof CompetitorProfileWireSchema>;

export const AlertRuleWireSchema = z.object({
  id: UuidSchema,
  organization_id: UuidSchema,
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  triggers: z.object({
    min_score: z.number().int().min(1).max(10).optional(),
    categories: z.array(ActionTypeSchema).optional(),
    competitor_ids: z.array(UuidSchema).optional(),
    keywords: z.array(z.string()).optional(),
  }),
  channels: z.array(AlertRuleChannelSchema),
  routing_override: RoutingDecisionSchema.nullable(),
  fired_count: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type AlertRuleWire = z.infer<typeof AlertRuleWireSchema>;

export const NotificationWireSchema = z.object({
  id: UuidSchema,
  organization_id: UuidSchema,
  signal_id: UuidSchema.nullable(),
  rule_id: UuidSchema.nullable(),
  title: z.string(),
  body: z.string(),
  channel: z.string(),
  status: z.enum(['delivered', 'failed', 'pending']),
  read_at: z.string().nullable(),
  created_at: z.string(),
  channel_target: z.string().nullable(),
  slack_ts: z.string().nullable(),
  permalink: z.string().nullable(),
  delivered_at: z.string().nullable(),
  error: z.string().nullable(),
});
export type NotificationWire = z.infer<typeof NotificationWireSchema>;

export const BattlecardWireSchema = z.object({
  competitor_id: UuidSchema,
  competitor_name: z.string(),
  summary: z.string(),
  sections: z.array(
    z.object({
      heading: z.string(),
      bullets: z.array(z.string()),
    }),
  ),
  source_signals: z.array(
    z.object({
      id: UuidSchema,
      title: z.string(),
      score: z.number().int(),
      source_url: z.string().nullable(),
    }),
  ),
  generated_at: z.string(),
  updated_at: z.string(),
});
export type BattlecardWire = z.infer<typeof BattlecardWireSchema>;

export const BattlecardVersionWireSchema = z.object({
  id: UuidSchema,
  competitor_id: UuidSchema,
  trigger: z.enum(['routing', 'worker', 'manual', 'startup']),
  summary: z.string(),
  sections: z.array(
    z.object({
      heading: z.string(),
      bullets: z.array(z.string()),
    }),
  ),
  source_signals: z.array(
    z.object({
      id: UuidSchema,
      title: z.string(),
      score: z.number().int(),
      source_url: z.string().nullable(),
    }),
  ),
  source_signal_count: z.number().int(),
  triggered_by_signal_id: UuidSchema.nullable(),
  generated_at: z.string(),
});
export type BattlecardVersionWire = z.infer<typeof BattlecardVersionWireSchema>;

/** PUT /v1/settings/slack body — partial; empty string clears a field. */
export const UpdateSlackSettingsBodySchema = z
  .object({
    bot_token: z.string().max(200).optional(),
    app_token: z.string().max(200).optional(),
    signing_secret: z.string().max(200).optional(),
    default_channel: z.string().max(200).optional(),
    web_app_url: z.string().max(500).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateSlackSettingsBody = z.infer<typeof UpdateSlackSettingsBodySchema>;

/** GET /v1/settings/slack — tokens always masked; only configured + a preview. */
export const SlackSettingsWireSchema = z.object({
  organization_id: UuidSchema,
  configured: z.boolean(),
  bot_token_masked: z.string().nullable(),
  app_token_configured: z.boolean(),
  signing_secret_configured: z.boolean(),
  default_channel: z.string(),
  web_app_url: z.string(),
  updated_at: z.string(),
});
export type SlackSettingsWire = z.infer<typeof SlackSettingsWireSchema>;
