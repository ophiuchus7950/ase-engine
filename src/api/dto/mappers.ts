/**
 * Rivela ASE — wire <-> domain mappers (ase_coding_standards.md §2).
 *
 * One explicit mapper per entity, both directions:
 *   wire (snake_case) -> domain (camelCase)   for request bodies
 *   domain (camelCase) -> wire (snake_case)   for response DTOs
 * Enum string values are passed through verbatim ('competitor_website', ...).
 */
import type {
  AlertRule,
  AlertRuleChannel,
  Battlecard,
  BattlecardVersion,
  ClassifyRequest,
  Competitor,
  CompetitorProfile,
  CreateAlertRuleRequest,
  CreateDataSourceRequest,
  DataSource,
  IngestRawSignalRequest,
  Notification,
  Paginated,
  PublicUser,
  RawSignal,
  RouteRequest,
  ScoreRequest,
  Signal,
  SignalDetail,
  SlackSettings,
  UpdateAlertRuleRequest,
  UpdateDataSourceRequest,
  UpdateSlackSettingsRequest,
} from '../../types/domain';
import type {
  AlertRuleWire,
  BattlecardVersionWire,
  BattlecardWire,
  ClassifyBody,
  CompetitorProfileWire,
  CompetitorWire,
  CreateAlertRuleBody,
  CreateDataSourceBody,
  DataSourceWire,
  IngestRawSignalBody,
  NotificationWire,
  PaginatedWire,
  RawSignalWire,
  RouteBody,
  ScoreBody,
  SignalDetailWire,
  SignalWire,
  SlackSettingsWire,
  UpdateAlertRuleBody,
  UpdateDataSourceBody,
  UpdateSlackSettingsBody,
  UserWire,
} from './schemas';

// ---------------------------------------------------------------------------
// wire -> domain (request bodies)
// ---------------------------------------------------------------------------

export function createDataSourceToDomain(body: CreateDataSourceBody): CreateDataSourceRequest {
  return {
    competitorId: body.competitor_id,
    sourceType: body.source_type,
    targetUrl: body.target_url,
    collectionMethod: body.collection_method,
    refreshIntervalMinutes: body.refresh_interval_minutes,
  };
}

export function updateDataSourceToDomain(body: UpdateDataSourceBody): UpdateDataSourceRequest {
  const req: UpdateDataSourceRequest = {};
  if ('target_url' in body) req.targetUrl = body.target_url;
  if ('refresh_interval_minutes' in body)
    req.refreshIntervalMinutes = body.refresh_interval_minutes;
  if ('is_active' in body) req.isActive = body.is_active;
  return req;
}

export function ingestRawSignalToDomain(body: IngestRawSignalBody): IngestRawSignalRequest {
  return {
    organizationId: body.organization_id,
    competitorId: body.competitor_id,
    dataSourceId: body.data_source_id,
    sourceType: body.source_type,
    rawText: body.raw_text,
    sourceUrl: body.source_url,
    collectionMethod: body.collection_method,
    collectedAt: body.collected_at,
    contentHash: body.content_hash,
  };
}

export function classifyToDomain(body: ClassifyBody): ClassifyRequest {
  return {
    actionType: body.action_type,
    confidenceLevel: body.confidence_level,
    keyFacts: body.key_facts,
    llmModelUsed: body.llm_model_used,
  };
}

export function scoreToDomain(body: ScoreBody): ScoreRequest {
  return {
    scoreRecency: body.score_recency,
    scoreSourceAuthority: body.score_source_authority,
    scoreActionType: body.score_action_type,
    scoreIcpRelevance: body.score_icp_relevance,
    scoreDealStageContext: body.score_deal_stage_context,
    scoreNovelty: body.score_novelty,
  };
}

export function routeToDomain(body: RouteBody): RouteRequest {
  return {
    routingDecision: body.routing_decision,
    battlecardUpdateTriggered: body.battlecard_update_triggered,
    dealAlertCheckTriggered: body.deal_alert_check_triggered,
  };
}

// ---------------------------------------------------------------------------
// domain -> wire (response DTOs)
// ---------------------------------------------------------------------------

export function dataSourceToWire(ds: DataSource): DataSourceWire {
  return {
    id: ds.id,
    organization_id: ds.organizationId,
    competitor_id: ds.competitorId,
    source_type: ds.sourceType,
    target_url: ds.targetUrl,
    collection_method: ds.collectionMethod,
    refresh_interval_minutes: ds.refreshIntervalMinutes,
    is_active: ds.isActive,
    last_collected_at: ds.lastCollectedAt,
    created_at: ds.createdAt,
    updated_at: ds.updatedAt,
  };
}

export function rawSignalToWire(signal: RawSignal): RawSignalWire {
  return {
    id: signal.id,
    organization_id: signal.organizationId,
    competitor_id: signal.competitorId,
    data_source_id: signal.dataSourceId,
    source_type: signal.sourceType,
    raw_text: signal.rawText,
    source_url: signal.sourceUrl,
    collection_method: signal.collectionMethod,
    collected_at: signal.collectedAt,
    content_hash: signal.contentHash,
    ingested_at: signal.ingestedAt,
  };
}

export function signalToWire(signal: Signal): SignalWire {
  return {
    id: signal.id,
    raw_signal_id: signal.rawSignalId,
    organization_id: signal.organizationId,
    competitor_id: signal.competitorId,
    action_type: signal.actionType,
    confidence_level: signal.confidenceLevel,
    key_facts: signal.keyFacts,
    llm_model_used: signal.llmModelUsed,
    classified_at: signal.classifiedAt,
    score_recency: signal.scoreRecency,
    score_source_authority: signal.scoreSourceAuthority,
    score_action_type: signal.scoreActionType,
    score_icp_relevance: signal.scoreIcpRelevance,
    score_deal_stage_context: signal.scoreDealStageContext,
    score_novelty: signal.scoreNovelty,
    significance_score: signal.significanceScore,
    scored_at: signal.scoredAt,
    routing_decision: signal.routingDecision,
    battlecard_update_triggered: signal.battlecardUpdateTriggered,
    deal_alert_check_triggered: signal.dealAlertCheckTriggered,
    routed_at: signal.routedAt,
    bookmarked: signal.bookmarked,
    created_at: signal.createdAt,
  };
}

export function signalDetailToWire(signal: SignalDetail): SignalDetailWire {
  return {
    ...signalToWire(signal),
    raw_text: signal.rawText,
    source_type: signal.sourceType,
    source_url: signal.sourceUrl,
    collected_at: signal.collectedAt,
    competitor_name: signal.competitorName,
  };
}

export function paginatedToWire<T, W>(
  page: Paginated<T>,
  mapper: (item: T) => W,
): PaginatedWire<W> {
  return {
    items: page.items.map(mapper),
    next_cursor: page.nextCursor,
    limit: page.limit,
  };
}

// ---------------------------------------------------------------------------
// Schema 002 mappers (users, competitors, rules, notifications, battlecards)
// ---------------------------------------------------------------------------

export function userToWire(user: PublicUser): UserWire {
  return { id: user.id, organization_id: user.organizationId, name: user.name };
}

export function competitorToWire(c: Competitor): CompetitorWire {
  return { id: c.id, organization_id: c.organizationId, name: c.name, created_at: c.createdAt };
}

export function competitorProfileToWire(c: CompetitorProfile): CompetitorProfileWire {
  return {
    id: c.id,
    organization_id: c.organizationId,
    name: c.name,
    created_at: c.createdAt,
    signal_count: c.signalCount,
    monitoring_active: c.monitoringActive,
    sources: c.sources.map((s) => ({
      id: s.id,
      source_type: s.sourceType,
      target_url: s.targetUrl,
    })),
  };
}

export function createAlertRuleToDomain(body: CreateAlertRuleBody): CreateAlertRuleRequest {
  return {
    name: body.name,
    description: body.description,
    enabled: body.enabled,
    triggers: body.triggers
      ? {
          minScore: body.triggers.min_score,
          categories: body.triggers.categories,
          competitorIds: body.triggers.competitor_ids,
          keywords: body.triggers.keywords,
        }
      : undefined,
    channels: (body.channels ?? []) as AlertRuleChannel[],
    routingOverride: body.routing_override ?? null,
  };
}

export function updateAlertRuleToDomain(body: UpdateAlertRuleBody): UpdateAlertRuleRequest {
  const req: UpdateAlertRuleRequest = {};
  if ('name' in body) req.name = body.name;
  if ('description' in body) req.description = body.description;
  if ('enabled' in body) req.enabled = body.enabled;
  if (body.triggers !== undefined) {
    req.triggers = {
      minScore: body.triggers.min_score,
      categories: body.triggers.categories,
      competitorIds: body.triggers.competitor_ids,
      keywords: body.triggers.keywords,
    };
  }
  if (body.channels !== undefined) req.channels = body.channels as AlertRuleChannel[];
  if ('routing_override' in body) req.routingOverride = body.routing_override ?? null;
  return req;
}

export function alertRuleToWire(rule: AlertRule): AlertRuleWire {
  return {
    id: rule.id,
    organization_id: rule.organizationId,
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled,
    triggers: {
      min_score: rule.triggers.minScore,
      categories: rule.triggers.categories,
      competitor_ids: rule.triggers.competitorIds,
      keywords: rule.triggers.keywords,
    },
    channels: rule.channels,
    routing_override: rule.routingOverride,
    fired_count: rule.firedCount,
    created_at: rule.createdAt,
    updated_at: rule.updatedAt,
  };
}

export function notificationToWire(n: Notification): NotificationWire {
  return {
    id: n.id,
    organization_id: n.organizationId,
    signal_id: n.signalId,
    rule_id: n.ruleId,
    title: n.title,
    body: n.body,
    channel: n.channel,
    status: n.status,
    read_at: n.readAt,
    created_at: n.createdAt,
    channel_target: n.channelTarget,
    slack_ts: n.slackTs,
    permalink: n.permalink,
    delivered_at: n.deliveredAt,
    error: n.error,
  };
}

export function battlecardToWire(bc: Battlecard, competitorName: string): BattlecardWire {
  return {
    competitor_id: bc.competitorId,
    competitor_name: competitorName,
    summary: bc.content.summary,
    sections: bc.content.sections,
    source_signals: bc.content.sourceSignals.map((s) => ({
      id: s.id,
      title: s.title,
      score: s.score,
      source_url: s.sourceUrl,
    })),
    generated_at: bc.generatedAt,
    updated_at: bc.updatedAt,
  };
}

export function battlecardVersionToWire(v: BattlecardVersion): BattlecardVersionWire {
  return {
    id: v.id,
    competitor_id: v.competitorId,
    trigger: v.trigger,
    summary: v.content.summary,
    sections: v.content.sections,
    source_signals: v.content.sourceSignals.map((s) => ({
      id: s.id,
      title: s.title,
      score: s.score,
      source_url: s.sourceUrl,
    })),
    source_signal_count: v.sourceSignalCount,
    triggered_by_signal_id: v.triggeredBySignalId,
    generated_at: v.generatedAt,
  };
}

export function updateSlackSettingsToDomain(
  body: UpdateSlackSettingsBody,
): UpdateSlackSettingsRequest {
  return {
    botToken: body.bot_token,
    appToken: body.app_token,
    signingSecret: body.signing_secret,
    defaultChannel: body.default_channel,
    webAppUrl: body.web_app_url,
  };
}

/** Mask a secret for display — show only the last 4 chars when non-empty. */
function maskSecret(value: string): string | null {
  if (value.length === 0) return null;
  const visible = value.slice(-4);
  return `••••${visible}`;
}

/** GET wire — tokens always masked; never exposes the full token. */
export function slackSettingsToWire(s: SlackSettings): SlackSettingsWire {
  return {
    organization_id: s.organizationId,
    configured: s.botToken.length > 0 && s.appToken.length > 0,
    bot_token_masked: maskSecret(s.botToken),
    app_token_configured: s.appToken.length > 0,
    signing_secret_configured: s.signingSecret.length > 0,
    default_channel: s.defaultChannel,
    web_app_url: s.webAppUrl,
    updated_at: s.updatedAt,
  };
}
