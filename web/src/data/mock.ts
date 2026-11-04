/**
 * Rivela ASE web — mock data (verbatim from the Figma design export).
 *
 * The UI renders instantly with this design-faithful mock data and swaps in
 * live engine data as soon as the API responds (see data/ase-store.ts).
 */

import type { ActivityPoint, Competitor, CompetitorBar, Signal } from '../types/design';
import type { AlertRuleWire, CompetitorProfileWire, NotificationWire } from '../api/client';

/** Mock timestamps are rendered relative to "now" so demo mode looks live. */
const hoursAgo = (h: number): string => new Date(Date.now() - h * 3600_000).toISOString();

export const COMPETITORS: Competitor[] = [
  {
    id: 'c1',
    name: 'Gong',
    logo: 'G',
    logoColor: '#FF5C00',
    website: 'gong.io',
    lastSignal: '2h ago',
    signalCount: 47,
    signalTrend: 'up',
    trendPercent: 23,
    monitoringActive: true,
    tags: ['Conversation AI', 'Revenue Intel'],
  },
  {
    id: 'c2',
    name: 'Clari',
    logo: 'C',
    logoColor: '#4F46E5',
    website: 'clari.com',
    lastSignal: '3h ago',
    signalCount: 38,
    signalTrend: 'up',
    trendPercent: 41,
    monitoringActive: true,
    tags: ['Revenue Forecasting', 'Pipeline Mgmt'],
  },
  {
    id: 'c3',
    name: 'Salesloft',
    logo: 'SL',
    logoColor: '#00B4D8',
    website: 'salesloft.com',
    lastSignal: '5h ago',
    signalCount: 29,
    signalTrend: 'down',
    trendPercent: 8,
    monitoringActive: true,
    tags: ['Sales Engagement', 'Cadence'],
  },
  {
    id: 'c4',
    name: 'Chorus',
    logo: 'CH',
    logoColor: '#7C3AED',
    website: 'chorus.ai',
    lastSignal: '1d ago',
    signalCount: 22,
    signalTrend: 'up',
    trendPercent: 12,
    monitoringActive: true,
    tags: ['Conversation Analytics', 'Deal Intel'],
  },
  {
    id: 'c5',
    name: 'Outreach',
    logo: 'OR',
    logoColor: '#059669',
    website: 'outreach.io',
    lastSignal: '6h ago',
    signalCount: 31,
    signalTrend: 'up',
    trendPercent: 17,
    monitoringActive: true,
    tags: ['Sales Automation', 'Revenue AI'],
  },
  {
    id: 'c6',
    name: 'Apollo.io',
    logo: 'AP',
    logoColor: '#DC2626',
    website: 'apollo.io',
    lastSignal: '2d ago',
    signalCount: 14,
    signalTrend: 'down',
    trendPercent: 5,
    monitoringActive: false,
    tags: ['Sales Intel', 'Lead Gen'],
  },
];

export const SIGNALS: Signal[] = [
  {
    id: 's1',
    competitor: 'Gong',
    category: 'Product',
    title: 'Gong Introduces AI-Powered Deal Risk Scoring',
    summary:
      "Gong quietly rolled out 'Deal Risk Score' in their Revenue Intelligence module — AI-generated risk ratings (1–10) per open deal, based on conversation patterns, engagement velocity, and activity gaps.",
    significance: 9,
    confidence: 94,
    source: 'gong.io/changelog',
    sourceType: 'web',
    detectedAt: hoursAgo(2),
    aiInterpretation:
      "Gong's Deal Risk Score directly encroaches on Clari's core 'Revenue Forecasting' positioning and your pipeline health features. This is a significant product expansion that repositions Gong as a full-stack revenue intelligence platform. PMMs should expect Gong reps to lead with this capability in competitive deals. The changelog-only launch suggests stress-testing before a major push — likely announcing at their upcoming user conference.",
    rawExcerpt:
      '"Deal Risk Score — Available Jan 14, 2025. Your deals now get a real-time risk rating powered by our AI engine, factoring in engagement velocity, multi-threading health, and sentiment trends from recorded calls."',
    recommendedActions: [
      "Update the Gong battlecard's Product Capabilities section — add Deal Risk Scoring with comparison to your pipeline health features",
      "Alert Sales leadership: Gong reps will likely demo this in competitive situations — prepare a counter-narrative around your model's accuracy and explainability",
      "Create a 1-pager for AEs: 'How our deal intelligence compares to Gong Deal Risk Score'",
      'Flag to Product: schedule a competitive gap analysis session within 2 weeks',
    ],
    tags: ['battlecard-update', 'deal-intelligence', 'ai-features', 'urgent'],
    isBookmarked: true,
    isRead: false,
  },
  {
    id: 's2',
    competitor: 'Clari',
    category: 'Funding',
    title: 'Clari Raises $150M Series E at $1.6B Valuation',
    summary:
      'Clari announced a $150M Series E led by Sapphire Ventures with Sequoia and Madrona participating. Valuation: $1.6B. Stated use: international expansion and AI R&D acceleration.',
    significance: 10,
    confidence: 98,
    source: 'techcrunch.com',
    sourceType: 'news',
    detectedAt: hoursAgo(3),
    aiInterpretation:
      'A $150M raise at $1.6B gives Clari significant runway to compete aggressively in enterprise accounts. Expect a hiring surge (especially engineering and enterprise sales), increased marketing spend, and potential M&A in adjacent categories like conversation intelligence. Short-term: increased competitive pressure in large enterprise deals as their enterprise AEs get renewed energy and budget.',
    rawExcerpt:
      '"Clari, the leader in Revenue Orchestration, today announced $150M in Series E funding to accelerate its platform expansion and international growth, led by Sapphire Ventures with participation from Sequoia Capital."',
    recommendedActions: [
      'Immediate: brief executive team and sales leadership on funding implications',
      "Update win/loss tracking to flag Clari as 'heightened competitive threat' for next 12 months",
      "Prepare investor-confidence counter-narrative: why your customers choose you despite Clari's funding",
      'Track Clari job postings over next 90 days to map their expansion strategy',
    ],
    tags: ['funding', 'executive-brief', 'competitive-threat', 'market-shift'],
    isBookmarked: true,
    isRead: false,
  },
  {
    id: 's3',
    competitor: 'Salesloft',
    category: 'Pricing',
    title: 'Salesloft Restructures to Usage-Based Pricing Model',
    summary:
      "Salesloft's pricing page updated overnight to reflect usage-based tiers. Starter: $75/user/mo (500 activities), Growth: $125/user/mo (2k activities), Enterprise: custom. Previous per-seat model retired.",
    significance: 8,
    confidence: 87,
    source: 'salesloft.com/pricing',
    sourceType: 'web',
    detectedAt: hoursAgo(5),
    aiInterpretation:
      "Switching to usage-based pricing signals Salesloft is trying to lower entry barriers for SMB while monetizing power users more aggressively. The Starter tier at $75/user is ~20% cheaper than their previous entry point — a clear downmarket move. This gives PMMs an opportunity to reframe your pricing story as more predictable vs. Salesloft's potentially unpredictable activity-based costs.",
    rawExcerpt:
      '"Salesloft now offers flexible pricing that scales with your team\'s activity. Pay for what you use, not for seats that sit idle. Starter: $75/user/month includes 500 sales activities per user."',
    recommendedActions: [
      "Capture Salesloft's new pricing page — screenshot + archive in competitive library immediately",
      "Run TCO scenarios: calculate when Salesloft's activity limits trigger costly overages for typical enterprise teams",
      'Update the pricing battlecard section with exact tier names, limits, and overage costs',
      'Brief finance/deal desk on new Salesloft structure for competitive deal scenarios',
    ],
    tags: ['pricing-change', 'battlecard-update', 'deal-desk', 'smb-expansion'],
    isBookmarked: false,
    isRead: false,
  },
  {
    id: 's4',
    competitor: 'Chorus',
    category: 'Personnel',
    title: 'Chorus Hires New CRO from HubSpot — Joins Feb 1',
    summary:
      "LinkedIn confirms Marcus Webb has joined Chorus as Chief Revenue Officer. Webb previously led HubSpot's enterprise segment, scaling it from $200M to $800M ARR over 4 years.",
    significance: 7,
    confidence: 91,
    source: 'linkedin.com',
    sourceType: 'social',
    detectedAt: hoursAgo(19),
    aiInterpretation:
      "Hiring a CRO with HubSpot's enterprise scaling playbook signals Chorus is making a serious upmarket push. Webb's background in land-and-expand motions suggests Chorus will sharpen their ICP focus on mid-market and lower enterprise (500–5k employees) — the exact sweet spot where you compete most frequently with them. Expect a revamped sales motion and more aggressive competitive displacement campaigns in Q2.",
    rawExcerpt:
      "LinkedIn post by Marcus Webb: \"Thrilled to announce that I'm joining Chorus as their new Chief Revenue Officer! After 4 incredible years scaling HubSpot's enterprise segment, I'm excited to bring that energy to the revenue intelligence space.\"",
    recommendedActions: [
      'Monitor Chorus job postings for enterprise AE/SDR roles over next 60 days',
      'Update Chorus battlecard personnel section with CRO profile and implications',
      'Alert enterprise AEs: Chorus will likely increase outbound activity in shared accounts starting Q2',
      "Consider proactively engaging Webb's former HubSpot enterprise accounts as targets",
    ],
    tags: ['personnel', 'cro-hire', 'enterprise-expansion', 'deal-watch'],
    isBookmarked: false,
    isRead: true,
  },
  {
    id: 's5',
    competitor: 'Outreach',
    category: 'Messaging',
    title: "Outreach Rebrands AI Suite as 'Kaia' — Human-AI Partnership Narrative",
    summary:
      "Outreach launched a full messaging overhaul. All AI features now branded under 'Kaia'. New homepage and positioning: 'Kaia doesn't replace your reps — it amplifies them.' Departure from previous automation-first angle.",
    significance: 7,
    confidence: 83,
    source: 'outreach.io',
    sourceType: 'web',
    detectedAt: hoursAgo(25),
    aiInterpretation:
      "Outreach's pivot to a 'human-AI partnership' narrative is a defensive response to customer backlash against full automation. The Kaia rebrand is sophisticated — it creates a memorable identity around their AI while softening 'automation feels impersonal' objections. This likely reflects their win/loss research. PMMs should audit whether your messaging has a clear, differentiated stance on the human-AI question.",
    rawExcerpt:
      '"Meet Kaia — your AI sales companion. While you focus on the human side of sales, Kaia handles the rest. Real-time coaching, automatic follow-ups, and deal insights that feel like your most experienced mentor is always by your side."',
    recommendedActions: [
      "Analyze your messaging: is 'human-AI partnership' framing a gap, strength, or opportunity to differentiate further?",
      'Brief content team: Outreach Kaia language will appear in their sales emails targeting your customers',
      "Update messaging battlecard with Kaia's exact positioning language and your counter-narrative",
      'Review customer case studies that reinforce YOUR human+AI story',
    ],
    tags: ['messaging-shift', 'ai-branding', 'battlecard-update', 'content-strategy'],
    isBookmarked: false,
    isRead: false,
  },
  {
    id: 's6',
    competitor: 'Gong',
    category: 'Partnerships',
    title: 'Gong Deepens Salesforce Partnership with Bi-Directional Data Sync',
    summary:
      'Announced at Dreamforce: deep bi-directional Salesforce integration. Gong activity data flows natively into Salesforce; Salesforce opportunity data surfaces in Gong deal view. Available Q1 2025.',
    significance: 8,
    confidence: 89,
    source: 'salesforce.com/news',
    sourceType: 'news',
    detectedAt: hoursAgo(27),
    aiInterpretation:
      "Gong's Salesforce partnership deepening is a strategic moat-building move. This integration will make Gong significantly stickier for Salesforce shops and harder to displace. For prospects with Salesforce as their CRM, Gong's value proposition just got materially stronger. Particularly relevant for enterprise deals where Salesforce penetration is high (>70% of enterprise accounts).",
    rawExcerpt:
      '"Gong and Salesforce announce expanded partnership bringing Gong\'s conversation intelligence natively into Salesforce workflows. No context switching, no data silos — one unified revenue experience."',
    recommendedActions: [
      "Audit your Salesforce integration and identify any feature gaps vs. Gong's new capabilities",
      'Brief sales on your Salesforce integration story — make it front-and-center in competitive deals',
      'Request technical deep-dive with Product: understand integration parity timeline',
      'Update integration comparison content in battlecards and on website',
    ],
    tags: ['partnerships', 'salesforce', 'integration', 'ecosystem'],
    isBookmarked: true,
    isRead: false,
  },
  {
    id: 's7',
    competitor: 'Clari',
    category: 'Product',
    title: "Clari Launches 'Copilot' for RevOps — Natural Language Pipeline Queries",
    summary:
      'Clari published a roadmap update announcing Copilot for RevOps teams: natural language queries against all pipeline and forecast data. Limited GA March 2025 with waitlist open.',
    significance: 9,
    confidence: 96,
    source: 'clari.com/blog',
    sourceType: 'web',
    detectedAt: hoursAgo(44),
    aiInterpretation:
      "Clari Copilot is a direct shot at your AI analytics positioning. Natural language pipeline querying will be table-stakes in 18 months — they're racing to be first with enterprise adoption at scale. The March 2025 GA timeline gives you a narrow window to either match this capability or reframe why your approach is different (accuracy, customization, data lineage, explainability).",
    rawExcerpt:
      "\"Ask Clari anything. With Copilot, your entire revenue dataset becomes conversational. 'What deals closed this week by East region?' or 'Which Stage 3 opportunities have stalled?' — instant, accurate answers.\"",
    recommendedActions: [
      'Expedite any in-development NLP/conversational analytics features — flag urgency to Product',
      "Develop competitive brief: 'Clari Copilot vs. [Your Product] AI Analytics' for Sales",
      'Identify customers likely to be on Clari Copilot waitlist and proactively engage them',
      "Prepare 'Why our AI analytics approach is superior' one-pager — focus on accuracy, explainability, customization",
    ],
    tags: ['ai-features', 'product-launch', 'battlecard-update', 'revenue-ops'],
    isBookmarked: false,
    isRead: false,
  },
  {
    id: 's8',
    competitor: 'Salesloft',
    category: 'Customer Wins',
    title: 'Salesloft Wins JP Morgan — 3,200-Seat Enterprise Contract',
    summary:
      'Press release confirms JP Morgan signed a 3,200-seat enterprise deal with Salesloft, described as one of their largest financial services wins. Includes professional services and custom implementation.',
    significance: 7,
    confidence: 78,
    source: 'businesswire.com',
    sourceType: 'news',
    detectedAt: hoursAgo(50),
    aiInterpretation:
      "JP Morgan is a marquee enterprise win that gives Salesloft significant financial services credibility. If you're selling into FSI, this changes the dynamic — prospects will ask 'if JP Morgan chose Salesloft, why shouldn't we?' Their FSI reference customer story just got materially stronger. This deal was likely won on compliance/security, existing Salesforce relationship, and competitive pricing.",
    rawExcerpt:
      '"JP Morgan has selected Salesloft as their enterprise sales engagement platform, deploying across 3,200 seats globally. The implementation integrates with their existing Salesforce CRM infrastructure."',
    recommendedActions: [
      'Alert FSI-focused AEs immediately — update competitive context for ongoing FSI deals',
      "Research JP Morgan's tech stack to understand Salesloft's winning factors",
      'Develop FSI-specific competitive talking points and compliance differentiation',
      'Identify other large FSI accounts in pipeline and verify competitive positioning',
    ],
    tags: ['customer-win', 'enterprise', 'financial-services', 'deal-watch'],
    isBookmarked: false,
    isRead: true,
  },
  {
    id: 's9',
    competitor: 'Outreach',
    category: 'Pricing',
    title: "Outreach Adds 'Enterprise Plus' Tier with Kaia AI Bundle",
    summary:
      'Outreach quietly added an Enterprise Plus tier above standard Enterprise. Includes Kaia AI Suite, advanced analytics, and dedicated Customer Success. Pricing: contact sales only.',
    significance: 6,
    confidence: 72,
    source: 'outreach.io/pricing',
    sourceType: 'web',
    detectedAt: hoursAgo(70),
    aiInterpretation:
      "Enterprise Plus indicates Outreach is testing premium pricing for their AI bundle. The 'contact sales' model suggests they're calibrating willingness to pay. This is consistent with segregating AI features as premium add-ons — a defensive play that protects existing ARR while creating upsell opportunity.",
    rawExcerpt:
      '"Enterprise Plus: Everything in Enterprise, plus Kaia AI Suite, Revenue Intelligence, and white-glove customer success. Contact our team for pricing."',
    recommendedActions: [
      'Add Enterprise Plus to the Outreach pricing battlecard section',
      'Note to deal desk: Outreach Enterprise Plus likely priced 30–40% above standard Enterprise',
      'Update competitive pricing comparison in sales materials to reflect new tier',
    ],
    tags: ['pricing', 'ai-features', 'enterprise-tier'],
    isBookmarked: false,
    isRead: true,
  },
  {
    id: 's10',
    competitor: 'Chorus',
    category: 'Product',
    title: "Chorus Ships 'Deal Moments' — AI Auto-Tagging of Key Call Events",
    summary:
      "Chorus shipped 'Deal Moments', auto-identifying and tagging high-impact call moments: objections, competitor mentions, pricing discussions, and buying signals.",
    significance: 5,
    confidence: 74,
    source: 'chorus.ai/changelog',
    sourceType: 'web',
    detectedAt: hoursAgo(75),
    aiInterpretation:
      "Deal Moments is incremental but reinforces Chorus's conversation intelligence positioning. The competitor mention tracking is particularly notable from a CI perspective — Chorus customers will now be automatically notified when your brand is mentioned in their sales calls.",
    rawExcerpt:
      '"Deal Moments automatically surfaces conversations that matter most. Configure moment types — competitor mentions, pricing discussions, objections — and Chorus flags them for your coaching library."',
    recommendedActions: [
      'Add Deal Moments to Chorus battlecard product section',
      'Note to field: Chorus users will now auto-track mentions of your brand in their calls',
    ],
    tags: ['product', 'conversation-intelligence', 'competitor-tracking'],
    isBookmarked: false,
    isRead: true,
  },
];

export const ACTIVITY_DATA: ActivityPoint[] = [
  { date: 'Jan 9', signals: 12, high: 2 },
  { date: 'Jan 10', signals: 18, high: 4 },
  { date: 'Jan 11', signals: 9, high: 1 },
  { date: 'Jan 12', signals: 24, high: 6 },
  { date: 'Jan 13', signals: 31, high: 8 },
  { date: 'Jan 14', signals: 22, high: 5 },
  { date: 'Jan 15', signals: 47, high: 11 },
];

export const COMPETITOR_BARS: CompetitorBar[] = [
  { name: 'Gong', signals: 47, color: '#FF5C00' },
  { name: 'Clari', signals: 38, color: '#4F46E5' },
  { name: 'Outreach', signals: 31, color: '#059669' },
  { name: 'Salesloft', signals: 29, color: '#00B4D8' },
  { name: 'Chorus', signals: 22, color: '#7C3AED' },
  { name: 'Apollo', signals: 14, color: '#DC2626' },
];

export const ALERT_RULES: AlertRuleWire[] = [
  {
    id: 'ar-1',
    organization_id: 'org-demo',
    name: 'High-Significance Pricing Shifts',
    description: 'Ping the deal desk whenever a competitor changes pricing or packaging.',
    enabled: true,
    triggers: { min_score: 8, categories: ['pricing'] },
    channels: [{ type: 'slack', target: '#competitive-intel' }],
    routing_override: 'signal_card',
    fired_count: 12,
    created_at: hoursAgo(24 * 12),
    updated_at: hoursAgo(3),
  },
  {
    id: 'ar-2',
    organization_id: 'org-demo',
    name: 'Executive Moves at Top Rivals',
    description: 'Track C-level hires and departures at the monitored competitors.',
    enabled: true,
    triggers: { categories: ['personnel'], competitor_ids: ['c1', 'c2'] },
    channels: [
      { type: 'email', target: 'revops@acme.com' },
      { type: 'slack', target: '#exec-briefing' },
    ],
    routing_override: 'weekly_digest',
    fired_count: 4,
    created_at: hoursAgo(24 * 30),
    updated_at: hoursAgo(24 * 2),
  },
];

export const NOTIFICATIONS: NotificationWire[] = [
  {
    id: 'n1',
    organization_id: 'org-demo',
    signal_id: 's1',
    rule_id: 'ar-1',
    channel: 'slack',
    title: 'Gong ships AI-powered Deal Risk Scoring',
    body: 'High-significance product change — update the Gong battlecard and brief sales leadership.',
    status: 'delivered',
    read_at: null,
    created_at: hoursAgo(2),
  },
  {
    id: 'n2',
    organization_id: 'org-demo',
    signal_id: 's4',
    rule_id: 'ar-2',
    channel: 'email',
    title: 'Chorus hires CRO from HubSpot',
    body: 'Executive move at a monitored competitor — review enterprise account exposure.',
    status: 'delivered',
    read_at: hoursAgo(5),
    created_at: hoursAgo(19),
  },
];

/** Bell badge seed — derived from the mock inbox so the two always agree. */
export const UNREAD_COUNT: number = NOTIFICATIONS.filter((n) => n.read_at === null).length;

/** Demo schema-002 competitor profile (with sources) for profile-driven views. */
export const COMPETITOR_PROFILES: CompetitorProfileWire[] = [
  {
    id: 'c1',
    organization_id: 'org-demo',
    name: 'Gong',
    created_at: hoursAgo(24 * 90),
    signal_count: 47,
    monitoring_active: true,
    sources: [
      {
        id: 'ds-1',
        organization_id: 'org-demo',
        competitor_id: 'c1',
        source_type: 'competitor_website',
        target_url: 'gong.io/changelog',
        collection_method: 'rss',
        refresh_interval_minutes: 60,
        is_active: true,
        last_collected_at: hoursAgo(1),
        created_at: hoursAgo(24 * 90),
      },
      {
        id: 'ds-2',
        organization_id: 'org-demo',
        competitor_id: 'c1',
        source_type: 'social_twitter',
        target_url: 'twitter.com/gong_io',
        collection_method: 'api',
        refresh_interval_minutes: 30,
        is_active: true,
        last_collected_at: hoursAgo(1),
        created_at: hoursAgo(24 * 90),
      },
    ],
  },
];
