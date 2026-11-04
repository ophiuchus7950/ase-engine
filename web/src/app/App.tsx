/* eslint-disable no-nested-ternary, @typescript-eslint/no-explicit-any, react-hooks/rules-of-hooks, react-hooks/purity, react-hooks/set-state-in-effect --
 * This file is the Figma-generated design surface (Design Autonomous Signal
 * Engine.make). Its JSX idiom (nested ternaries for conditional styling),
 * recharts formatter typings, and render-time "time ago" labels are preserved
 * per design fidelity; lint stays strict on the hand-written data/api/store
 * code. */
import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Zap,
  Building2,
  Clock,
  Mail,
  Settings,
  Bell,
  Search,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  ExternalLink,
  X,
  Plus,
  Shield,
  DollarSign,
  Package,
  MessageSquare,
  Handshake,
  Trophy,
  Sparkles,
  Hash,
  Activity,
  Users,
  Bookmark,
  Share2,
  Target,
  Download,
  ChevronLeft,
  Tag,
  Edit,
  Trash2,
  Layers,
  Check,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from 'recharts';
import {
  useAseData,
  getSnapshot,
  refresh,
  refreshCompetitors,
  refreshRules,
  refreshNotifications,
  markAllRead,
  markRead,
  createRule,
  updateRule,
  deleteRule,
  addCompetitor,
  deleteCompetitor,
  toggleBookmark,
  updateBattlecardFor,
  loadActivitySignals,
  loadMoreSignals,
  fetchBattlecardHistoryFor,
} from '../data/ase-store';
import { fetchDataSources, fetchBattlecard } from '../api/client';
import type {
  AlertRuleWire,
  BattlecardWire,
  DataSourceWire,
  SignalListQuery,
  UserWire,
} from '../api/client';
import type {
  BattlecardTrigger,
  Category,
  Competitor,
  Priority,
  RuleDraft,
  Signal,
  View,
} from '../types/design';

// ─── Category Config ──────────────────────────────────────────────────────────
const CATEGORIES: Category[] = [
  'Pricing',
  'Product',
  'Messaging',
  'Personnel',
  'Partnerships',
  'Funding',
  'Customer Wins',
  'Other',
];

/** Battlecard history trigger -> badge styling (Activity feed). */
const TRIGGER_META: Record<BattlecardTrigger, { color: string; bg: string; label: string }> = {
  routing: { color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20', label: 'routing' },
  worker: {
    color: 'text-violet-400',
    bg: 'bg-violet-400/10 border-violet-400/20',
    label: 'worker',
  },
  manual: { color: 'text-teal-400', bg: 'bg-teal-400/10 border-teal-400/20', label: 'manual' },
  startup: { color: 'text-gray-400', bg: 'bg-gray-400/10 border-gray-400/20', label: 'startup' },
};

/** Design label -> backend wire enum (alert-rule triggers expect snake_case). */
const CATEGORY_TO_WIRE: Record<Category, string> = {
  Pricing: 'pricing',
  Product: 'product',
  Messaging: 'messaging',
  Personnel: 'personnel',
  Partnerships: 'partnership',
  Funding: 'funding',
  'Customer Wins': 'customer_win',
  Other: 'other',
};

/** Backend wire enum -> design label (edit mode pre-checks). */
const WIRE_TO_CATEGORY: Record<string, Category> = {
  pricing: 'Pricing',
  product: 'Product',
  messaging: 'Messaging',
  personnel: 'Personnel',
  partnership: 'Partnerships',
  funding: 'Funding',
  customer_win: 'Customer Wins',
  regulatory: 'Other',
  other: 'Other',
};
const CAT: Record<Category, { color: string; bg: string; Icon: any }> = {
  Pricing: { color: 'text-amber-400', bg: 'bg-amber-400/10 border-amber-400/20', Icon: DollarSign },
  Product: { color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/20', Icon: Package },
  Messaging: {
    color: 'text-purple-400',
    bg: 'bg-purple-400/10 border-purple-400/20',
    Icon: MessageSquare,
  },
  Personnel: { color: 'text-cyan-400', bg: 'bg-cyan-400/10 border-cyan-400/20', Icon: Users },
  Partnerships: {
    color: 'text-green-400',
    bg: 'bg-green-400/10 border-green-400/20',
    Icon: Handshake,
  },
  Funding: {
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/10 border-yellow-400/20',
    Icon: TrendingUp,
  },
  'Customer Wins': {
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10 border-emerald-400/20',
    Icon: Trophy,
  },
  Other: { color: 'text-gray-400', bg: 'bg-gray-400/10 border-gray-400/20', Icon: Hash },
};

function getPriority(n: number): Priority {
  return n >= 7 ? 'high' : n >= 4 ? 'medium' : 'low';
}

function getCompetitor(name: string) {
  return getSnapshot().competitors.find((c) => c.name === name);
}

// ─── Utility Components ───────────────────────────────────────────────────────
function CategoryTag({ category }: { category: Category }) {
  const { color, bg, Icon } = CAT[category];
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${bg} ${color}`}
    >
      <Icon size={9} />
      {category}
    </span>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const p = getPriority(score);
  const cls =
    p === 'high'
      ? 'text-red-400 border-red-400/40 bg-red-400/8'
      : p === 'medium'
        ? 'text-amber-400 border-amber-400/40 bg-amber-400/8'
        : 'text-gray-500 border-gray-500/30 bg-gray-500/8';
  return (
    <div
      className={`inline-flex flex-col items-center justify-center w-9 h-9 rounded-lg border ${cls} flex-shrink-0`}
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
    >
      <span className="text-sm font-bold leading-none">{score}</span>
      <span className="text-[8px] opacity-50 leading-none mt-0.5">/10</span>
    </div>
  );
}

function ConfidenceBar({ pct }: { pct: number }) {
  const color = pct >= 85 ? 'bg-teal-400' : pct >= 65 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span
        className="text-[10px] text-muted-foreground"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        {pct}%
      </span>
    </div>
  );
}

function LivePulse() {
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-400" />
      </div>
      <span
        className="text-[10px]"
        style={{ fontFamily: "'JetBrains Mono', monospace", color: '#0FCCB8' }}
      >
        LIVE
      </span>
    </div>
  );
}

function CompLogo({ comp, size = 'sm' }: { comp: Competitor; size?: 'sm' | 'md' | 'lg' }) {
  const s =
    size === 'sm' ? 'w-7 h-7 text-[10px]' : size === 'md' ? 'w-9 h-9 text-xs' : 'w-12 h-12 text-sm';
  return (
    <div
      className={`${s} rounded-lg flex items-center justify-center font-bold border border-white/10 flex-shrink-0`}
      style={{
        backgroundColor: `${comp.logoColor}22`,
        color: comp.logoColor,
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {comp.logo}
    </div>
  );
}

function TimeAgo({ iso }: { iso: string }) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  const label = d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : `${Math.floor(diff / 60000)}m ago`;
  return (
    <span
      className="text-[10px] text-muted-foreground"
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
    >
      {label}
    </span>
  );
}

function SourcePill({ type }: { type: string }) {
  const map: Record<string, string> = {
    web: 'text-blue-400',
    news: 'text-purple-400',
    social: 'text-pink-400',
    review: 'text-yellow-400',
    job: 'text-cyan-400',
    rss: 'text-orange-400',
  };
  const labels: Record<string, string> = {
    web: 'Website',
    news: 'News',
    social: 'Social',
    review: 'Review',
    job: 'Job Board',
    rss: 'RSS',
  };
  return (
    <span
      className={`text-[10px] ${map[type] || 'text-gray-400'}`}
      style={{ fontFamily: "'JetBrains Mono', monospace" }}
    >
      {labels[type] || type}
    </span>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 cursor-pointer rounded-full transition-colors duration-200 flex-shrink-0 ${on ? 'bg-teal-400' : 'bg-white/20'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${on ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0C1018] border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// ─── Modal Shell ─────────────────────────────────────────────────────────────
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[520px] max-w-full max-h-[85vh] bg-[#0C1018] border border-white/[0.1] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.07] flex-shrink-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
      {children}
    </div>
  );
}

const inputCls =
  'w-full bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-foreground placeholder:text-muted-foreground px-3 py-2 focus:outline-none focus:border-teal-400/40 transition-colors';

// ─── Add Competitor Modal ─────────────────────────────────────────────────────
function AddCompetitorModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [urls, setUrls] = useState<string[]>(['']);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setUrl = (i: number, v: string) => setUrls(urls.map((u, idx) => (idx === i ? v : u)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Competitor name is required');
      return;
    }
    const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
    if (cleanUrls.length === 0) {
      setError('Add at least one website URL to monitor');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addCompetitor(name.trim(), cleanUrls);
      await refreshCompetitors();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add competitor');
      setBusy(false);
    }
  };

  return (
    <Modal title="Add Competitor" onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <div>
          <FieldLabel>Competitor name</FieldLabel>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Acme Corp"
            autoFocus
            className={inputCls}
          />
        </div>
        <div>
          <FieldLabel>Website URLs to monitor</FieldLabel>
          <div className="space-y-2">
            {urls.map((u, i) => (
              <input
                key={i}
                type="text"
                value={u}
                onChange={(e) => setUrl(i, e.target.value)}
                placeholder="e.g. https://www.gong.io"
                className={inputCls}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setUrls([...urls, ''])}
            className="mt-2 flex items-center gap-1 text-[11px] text-teal-400 hover:text-teal-300 transition-colors"
          >
            <Plus size={11} /> Add another URL
          </button>
        </div>

        {error && (
          <div className="px-3 py-2 bg-red-400/10 border border-red-400/25 rounded-lg text-[11px] text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 bg-white/[0.06] hover:bg-white/[0.09] text-foreground text-xs font-medium rounded-lg transition-colors border border-white/[0.08]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-400 hover:bg-teal-300 disabled:opacity-50 text-black text-xs font-bold rounded-lg transition-colors"
          >
            <Plus size={12} />
            {busy ? 'Adding…' : 'Add Competitor'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── New / Edit Alert Rule Modal ──────────────────────────────────────────────
const CHANNEL_TYPES = ['email', 'webhook'] as const;

function RuleModal({ initial, onClose }: { initial: AlertRuleWire | null; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [minScore, setMinScore] = useState(
    initial?.triggers.min_score !== undefined ? String(initial.triggers.min_score) : '',
  );
  const [cats, setCats] = useState<Category[]>(
    (initial?.triggers.categories ?? []).map((c) => WIRE_TO_CATEGORY[c] ?? 'Other'),
  );
  const [keywords, setKeywords] = useState((initial?.triggers.keywords ?? []).join(', '));
  const [channelType, setChannelType] = useState<'email' | 'webhook'>(
    initial?.channels[0]?.type ?? 'email',
  );
  const [channelTarget, setChannelTarget] = useState(initial?.channels[0]?.target ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleCat = (c: Category) =>
    setCats(cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Rule name is required');
      return;
    }
    setBusy(true);
    setError(null);
    const draft: RuleDraft = {
      name: name.trim(),
      description: description.trim() || undefined,
      enabled,
      ...(minScore !== '' ? { minScore: Number(minScore) } : {}),
      ...(cats.length > 0 ? { categories: cats.map((c) => CATEGORY_TO_WIRE[c]) } : {}),
      ...(keywords.trim()
        ? {
            keywords: keywords
              .split(',')
              .map((k) => k.trim())
              .filter(Boolean),
          }
        : {}),
      channels: [
        {
          type: channelType,
          target: channelTarget.trim(),
        },
      ],
    };
    try {
      if (initial) {
        await updateRule(initial.id, draft);
      } else {
        await createRule(draft);
      }
      await refreshRules();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save alert rule');
      setBusy(false);
    }
  };

  return (
    <Modal title={initial ? 'Edit Alert Rule' : 'New Alert Rule'} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-4">
        <div>
          <FieldLabel>Rule name</FieldLabel>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. High Significance Alert"
            autoFocus
            className={inputCls}
          />
        </div>
        <div>
          <FieldLabel>Description</FieldLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="When and why should this alert fire?"
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Min score (1–10)</FieldLabel>
            <input
              type="number"
              min={1}
              max={10}
              value={minScore}
              onChange={(e) => setMinScore(e.target.value)}
              placeholder="Any"
              className={inputCls}
            />
          </div>
          <div>
            <FieldLabel>Enabled</FieldLabel>
            <div className="flex items-center h-[34px]">
              <Toggle on={enabled} onChange={() => setEnabled(!enabled)} />
            </div>
          </div>
        </div>

        <div>
          <FieldLabel>Categories</FieldLabel>
          <div className="grid grid-cols-2 gap-1.5">
            {CATEGORIES.map((c) => (
              <label
                key={c}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] cursor-pointer transition-colors ${
                  cats.includes(c)
                    ? 'bg-teal-400/[0.08] border-teal-400/25 text-teal-400'
                    : 'bg-white/[0.02] border-white/[0.07] text-muted-foreground hover:text-foreground'
                }`}
              >
                <input
                  type="checkbox"
                  checked={cats.includes(c)}
                  onChange={() => toggleCat(c)}
                  className="accent-teal-400 w-3 h-3"
                />
                {c}
              </label>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>Keywords (comma separated)</FieldLabel>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="e.g. CRO, funding, pricing"
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FieldLabel>Channel</FieldLabel>
            <select
              value={channelType}
              onChange={(e) => setChannelType(e.target.value as 'email' | 'webhook')}
              className={`${inputCls} appearance-none`}
            >
              {CHANNEL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Channel target</FieldLabel>
            <input
              type="text"
              value={channelTarget}
              onChange={(e) => setChannelTarget(e.target.value)}
              placeholder={channelType === 'email' ? 'team@co.com' : 'https://hook'}
              className={inputCls}
            />
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 bg-red-400/10 border border-red-400/25 rounded-lg text-[11px] text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 bg-white/[0.06] hover:bg-white/[0.09] text-foreground text-xs font-medium rounded-lg transition-colors border border-white/[0.08]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-400 hover:bg-teal-300 disabled:opacity-50 text-black text-xs font-bold rounded-lg transition-colors"
          >
            <Check size={12} />
            {busy ? 'Saving…' : initial ? 'Save Changes' : 'Create Rule'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Notification Bell Panel ──────────────────────────────────────────────────
function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { notifications, unreadCount } = useAseData();
  const [busy, setBusy] = useState(false);

  const markAll = async () => {
    setBusy(true);
    try {
      await markAllRead();
      await refreshNotifications();
    } catch {
      /* non-fatal */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute right-0 top-9 w-[360px] max-w-[92vw] bg-[#0C1018] border border-white/[0.1] rounded-xl shadow-2xl overflow-hidden z-50">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">Notifications</span>
          {unreadCount > 0 && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] bg-teal-400/15 text-teal-400"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {unreadCount} unread
            </span>
          )}
        </div>
        <button
          onClick={markAll}
          disabled={busy || unreadCount === 0}
          className="text-[11px] text-teal-400 hover:text-teal-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? 'Marking…' : 'Mark all read'}
        </button>
      </div>

      <div className="max-h-[420px] overflow-y-auto divide-y divide-white/[0.04]">
        {notifications.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Bell size={18} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-[11px] text-muted-foreground">No notifications yet</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={`px-4 py-3 hover:bg-white/[0.02] transition-colors ${
                n.read_at ? 'opacity-50' : ''
              }`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                {!n.read_at && (
                  <div className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />
                )}
                <span
                  className={`text-[11px] leading-snug ${
                    n.read_at ? 'text-muted-foreground' : 'text-foreground font-semibold'
                  }`}
                >
                  {n.title}
                </span>
              </div>
              {n.body && (
                <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2 mb-1.5">
                  {n.body}
                </p>
              )}
              <div className="flex items-center gap-2">
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-muted-foreground"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {n.channel}
                </span>
                <span
                  className={`text-[9px] ${
                    n.status === 'failed'
                      ? 'text-red-400'
                      : n.status === 'pending'
                        ? 'text-amber-400'
                        : 'text-teal-400'
                  }`}
                >
                  {n.status}
                </span>
                <TimeAgo iso={n.created_at} />
              </div>
            </div>
          ))
        )}
      </div>

      <button
        onClick={onClose}
        className="w-full px-4 py-2.5 border-t border-white/[0.06] text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        Close
      </button>
    </div>
  );
}

// ─── Signal Detail Panel ───────────────────────────────────────────────────────
function SignalDetailPanel({ signal, onClose }: { signal: Signal; onClose: () => void }) {
  const { signals } = useAseData();
  const live = signals.find((s) => s.id === signal.id) ?? signal;
  const bookmarked = live.isBookmarked;
  const comp = getCompetitor(signal.competitor);
  const p = getPriority(signal.significance);
  const [bcState, setBcState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [bcError, setBcError] = useState<string | null>(null);

  const toggleBookmarkNow = async () => {
    try {
      await toggleBookmark(signal.id);
    } catch {
      /* optimistic toggle reverts in the store */
    }
  };

  const updateBattlecardNow = async () => {
    if (!comp) {
      setBcError('No competitor profile for this signal');
      return;
    }
    setBcState('busy');
    setBcError(null);
    try {
      await updateBattlecardFor(comp.id);
      setBcState('done');
    } catch (err) {
      setBcError(err instanceof Error ? err.message : 'Battlecard update failed');
      setBcState('idle');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[660px] max-w-[95vw] bg-[#07090E] border-l border-white/[0.08] flex flex-col overflow-hidden shadow-2xl">
        {/* Panel header */}
        <div className="flex items-start justify-between p-5 border-b border-white/[0.07] gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <ScoreBadge score={live.significance} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <CategoryTag category={live.category} />
                <SourcePill type={live.sourceType} />
                {comp && (
                  <span className="text-[10px] font-semibold" style={{ color: comp.logoColor }}>
                    {comp.name}
                  </span>
                )}
                <TimeAgo iso={live.detectedAt} />
              </div>
              <h2 className="text-sm font-semibold text-foreground leading-snug">{live.title}</h2>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] text-muted-foreground">Source:</span>
                <span
                  className="text-[10px] text-muted-foreground"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {live.source}
                </span>
                <ExternalLink size={9} className="text-muted-foreground" />
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* Confidence + priority row */}
        <div className="px-5 py-3 bg-white/[0.02] border-b border-white/[0.05] grid grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
              Confidence Score
            </div>
            <ConfidenceBar pct={live.confidence} />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
              Routing
            </div>
            <div
              className={`text-[11px] font-medium ${p === 'high' ? 'text-red-400' : p === 'medium' ? 'text-amber-400' : 'text-gray-500'}`}
            >
              {p === 'high'
                ? '⚡ HIGH — Battlecard + Alert'
                : p === 'medium'
                  ? '📋 MEDIUM — Weekly Digest'
                  : '📁 LOW — Archived'}
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* AI Interpretation */}
          <div className="p-5 border-b border-white/[0.05]">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={13} style={{ color: '#0FCCB8' }} />
              <span className="text-[10px] uppercase tracking-widest" style={{ color: '#0FCCB8' }}>
                AI Interpretation
              </span>
            </div>
            <p className="text-xs text-foreground/90 leading-relaxed">{live.aiInterpretation}</p>
          </div>

          {/* Source Evidence */}
          <div className="p-5 border-b border-white/[0.05]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shield size={13} className="text-blue-400" />
                <span className="text-[10px] uppercase tracking-widest text-blue-400">
                  Source Evidence
                </span>
              </div>
              <span
                className="text-[10px] text-muted-foreground"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {live.source}
              </span>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-lg p-4">
              <p
                className="text-xs text-muted-foreground leading-relaxed italic"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {live.rawExcerpt}
              </p>
            </div>
          </div>

          {/* Recommended Actions */}
          <div className="p-5 border-b border-white/[0.05]">
            <div className="flex items-center gap-2 mb-3">
              <Target size={13} className="text-amber-400" />
              <span className="text-[10px] uppercase tracking-widest text-amber-400">
                Recommended Actions
              </span>
            </div>
            <div className="space-y-2">
              {live.recommendedActions.map((action, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 bg-white/[0.02] border border-white/[0.05] rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer group"
                >
                  <div className="w-5 h-5 rounded border border-white/20 group-hover:border-teal-400/50 flex-shrink-0 mt-0.5 flex items-center justify-center">
                    <span
                      className="text-[9px] text-muted-foreground group-hover:text-teal-400"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <p className="text-xs text-foreground/80 leading-relaxed">{action}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Tag size={13} className="text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Tags
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {live.tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-1 bg-white/[0.04] border border-white/[0.08] rounded text-[10px] text-muted-foreground hover:text-foreground hover:border-white/20 transition-colors cursor-pointer"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  #{t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="p-4 border-t border-white/[0.07] bg-white/[0.02]">
          {bcError && (
            <div className="mb-2 px-3 py-2 bg-red-400/10 border border-red-400/25 rounded-lg text-[11px] text-red-400">
              {bcError}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={updateBattlecardNow}
              disabled={bcState === 'busy'}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-colors ${
                bcState === 'done'
                  ? 'bg-teal-400/15 text-teal-400 border border-teal-400/30'
                  : 'bg-teal-400 hover:bg-teal-300 text-black text-xs font-bold'
              }`}
            >
              <Zap size={12} />
              {bcState === 'done' ? (
                <>
                  <Check size={12} /> Updated just now
                </>
              ) : bcState === 'busy' ? (
                'Updating…'
              ) : (
                'Update Battlecard'
              )}
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2.5 bg-white/[0.06] hover:bg-white/[0.09] text-foreground text-xs font-medium rounded-lg transition-colors border border-white/[0.08]">
              <Bell size={12} />
              Alert
            </button>
            <button
              onClick={toggleBookmarkNow}
              className="flex items-center justify-center px-3 py-2.5 bg-white/[0.06] hover:bg-white/[0.09] rounded-lg transition-colors border border-white/[0.08]"
            >
              <Bookmark
                size={12}
                className={bookmarked ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground'}
              />
            </button>
            <button className="flex items-center justify-center px-3 py-2.5 bg-white/[0.06] hover:bg-white/[0.09] rounded-lg transition-colors border border-white/[0.08]">
              <Share2 size={12} className="text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard View ───────────────────────────────────────────────────────────
function DashboardView({
  onSignal,
  onNav,
  userName,
  sourceCount,
  search,
}: {
  onSignal: (s: Signal) => void;
  onNav: (v: View) => void;
  userName: string;
  sourceCount: number;
  search: string;
}) {
  const {
    signals: SIGNALS,
    competitors: COMPETITORS,
    activity: ACTIVITY_DATA,
    competitorBars: COMPETITOR_BARS,
  } = useAseData();
  const q = search.trim().toLowerCase();
  const visibleSignals = q
    ? SIGNALS.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          s.competitor.toLowerCase().includes(q),
      )
    : SIGNALS;
  const highPrio = visibleSignals.filter((s) => getPriority(s.significance) === 'high');
  const activeComps = COMPETITORS.filter((c) => c.monitoringActive).length;
  const firstName = userName.trim().split(/\s+/)[0] || 'there';
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const kpis = [
    {
      label: 'Signals Today',
      val: String(SIGNALS.length),
      delta: '+23%',
      pos: true,
      sub: 'vs. 7-day avg',
    },
    {
      label: 'High Priority',
      val: String(highPrio.length),
      delta: '+5',
      pos: true,
      sub: 'require action',
    },
    {
      label: 'Competitors Active',
      val: `${activeComps}/${COMPETITORS.length}`,
      delta: '',
      pos: true,
      sub: `${COMPETITORS.length - activeComps} monitoring paused`,
    },
    {
      label: 'Sources Monitored',
      val: String(sourceCount),
      delta: '',
      pos: true,
      sub: 'websites, news, feeds & boards',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Good morning, {firstName}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {today} · {COMPETITORS.length} competitors monitored · {sourceCount} sources active
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LivePulse />
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors">
            <Download size={11} />
            Export
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {kpis.map((k, i) => (
          <div key={i} className="bg-card border border-white/[0.07] rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              {k.label}
            </div>
            <div className="flex items-end justify-between">
              <span
                className="text-2xl font-bold text-foreground"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {k.val}
              </span>
              {k.delta && (
                <span
                  className={`text-[11px] ${k.pos ? 'text-teal-400' : 'text-red-400'}`}
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {k.delta}
                </span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="col-span-2 bg-card border border-white/[0.07] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium text-foreground">Signal Velocity</h3>
              <p className="text-[11px] text-muted-foreground">Last 7 days</p>
            </div>
            <div className="flex items-center gap-4 text-[10px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-teal-400" />
                Total
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                High Priority
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={ACTIVITY_DATA}>
              <defs>
                <linearGradient id="gTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0FCCB8" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#0FCCB8" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gHigh" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E5404A" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#E5404A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#5E6E84', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fill: '#5E6E84', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="signals"
                name="Total"
                stroke="#0FCCB8"
                strokeWidth={2}
                fill="url(#gTotal)"
              />
              <Area
                type="monotone"
                dataKey="high"
                name="High Priority"
                stroke="#E5404A"
                strokeWidth={2}
                fill="url(#gHigh)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-card border border-white/[0.07] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-foreground">By Competitor</h3>
            <span className="text-[10px] text-muted-foreground">Last 7d</span>
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={COMPETITOR_BARS} layout="vertical" margin={{ left: -10 }}>
              <XAxis
                type="number"
                tick={{ fill: '#5E6E84', fontSize: 9 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: '#5E6E84', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={52}
              />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="signals" name="Signals" radius={[0, 3, 3, 0]}>
                {COMPETITOR_BARS.map((e, i) => (
                  <Cell key={i} fill={`${e.color}BB`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Active Alerts + Recent */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-white/[0.07] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <AlertTriangle size={13} className="text-red-400" />
              <span className="text-xs font-medium text-foreground">Active Alerts</span>
              <span
                className="px-1.5 py-0.5 rounded text-[9px] bg-red-400/15 text-red-400"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {highPrio.length}
              </span>
            </div>
            <button
              onClick={() => onNav('feed')}
              className="text-[11px] text-muted-foreground hover:text-teal-400 transition-colors"
            >
              View all →
            </button>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {highPrio.slice(0, 4).map((s) => {
              const c = getCompetitor(s.competitor);
              return (
                <div
                  key={s.id}
                  className="px-4 py-3 hover:bg-white/[0.02] cursor-pointer group transition-colors"
                  onClick={() => onSignal(s)}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        {c && (
                          <span className="text-[10px] font-bold" style={{ color: c.logoColor }}>
                            {s.competitor}
                          </span>
                        )}
                        <CategoryTag category={s.category} />
                      </div>
                      <p className="text-[11px] text-foreground/80 leading-snug line-clamp-1 group-hover:text-white transition-colors">
                        {s.title}
                      </p>
                    </div>
                    <ScoreBadge score={s.significance} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-card border border-white/[0.07] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Activity size={13} style={{ color: '#0FCCB8' }} />
              <span className="text-xs font-medium text-foreground">Recent Signals</span>
            </div>
            <button
              onClick={() => onNav('feed')}
              className="text-[11px] text-muted-foreground hover:text-teal-400 transition-colors"
            >
              Feed →
            </button>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {visibleSignals.slice(0, 5).map((s) => {
              const c = getCompetitor(s.competitor);
              return (
                <div
                  key={s.id}
                  className="px-4 py-3 hover:bg-white/[0.02] cursor-pointer group transition-colors"
                  onClick={() => onSignal(s)}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        {c && (
                          <span className="text-[10px] font-bold" style={{ color: c.logoColor }}>
                            {s.competitor}
                          </span>
                        )}
                        <CategoryTag category={s.category} />
                        {!s.isRead && <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1 group-hover:text-foreground transition-colors">
                        {s.title}
                      </p>
                    </div>
                    <TimeAgo iso={s.detectedAt} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Signal Feed View ─────────────────────────────────────────────────────────

function SignalFeedView({ onSignal, search }: { onSignal: (s: Signal) => void; search: string }) {
  const { signals: SIGNALS, competitors: COMPETITORS } = useAseData();
  const [localSearch, setLocalSearch] = useState('');
  const [catFilter, setCatFilter] = useState<Category | 'All'>('All');
  const [compFilter, setCompFilter] = useState('All');
  const [priFilter, setPriFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);

  const toggleBookmarkNow = async (id: string) => {
    try {
      await toggleBookmark(id);
    } catch {
      /* optimistic toggle reverts in the store */
    }
  };

  const effectiveSearch = search.trim() || localSearch;
  const filtered = SIGNALS.filter((s) => {
    if (catFilter !== 'All' && s.category !== catFilter) return false;
    if (compFilter !== 'All' && s.competitor !== compFilter) return false;
    if (priFilter !== 'all' && getPriority(s.significance) !== priFilter) return false;
    if (bookmarkedOnly && !s.isBookmarked) return false;
    if (effectiveSearch) {
      const q = effectiveSearch.toLowerCase();
      if (
        !s.title.toLowerCase().includes(q) &&
        !s.summary.toLowerCase().includes(q) &&
        !s.competitor.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Feed header */}
      <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-foreground">Signal Feed</h1>
          <LivePulse />
          <span
            className="text-[10px] text-muted-foreground bg-white/[0.04] px-2 py-0.5 rounded"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {filtered.length} signals
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="Search signals..."
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              className="bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-foreground placeholder:text-muted-foreground pl-7 pr-3 py-1.5 w-48 focus:outline-none focus:border-teal-400/40 transition-colors"
            />
          </div>
          <button className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            <Bookmark size={11} />
            Saved Views
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="px-5 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground mr-1 flex-shrink-0">
          Priority:
        </span>
        {(['all', 'high', 'medium', 'low'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPriFilter(p)}
            className={`px-2 py-1 rounded text-[10px] font-medium flex-shrink-0 transition-colors border ${
              priFilter === p
                ? p === 'high'
                  ? 'bg-red-400/15 text-red-400 border-red-400/30'
                  : p === 'medium'
                    ? 'bg-amber-400/15 text-amber-400 border-amber-400/30'
                    : p === 'low'
                      ? 'bg-gray-400/15 text-gray-400 border-gray-400/30'
                      : 'bg-teal-400/15 text-teal-400 border-teal-400/30'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-white/[0.04]'
            }`}
          >
            {p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
        <div className="w-px h-3 bg-white/10 mx-1 flex-shrink-0" />
        <button
          onClick={() => setBookmarkedOnly(!bookmarkedOnly)}
          className={`px-2 py-1 rounded text-[10px] font-medium flex-shrink-0 transition-colors border ${
            bookmarkedOnly
              ? 'bg-amber-400/15 text-amber-400 border-amber-400/30'
              : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-white/[0.04]'
          }`}
        >
          <Bookmark size={10} className="inline mr-1 -mt-0.5" />
          Bookmarked
        </button>
        <div className="w-px h-3 bg-white/10 mx-1 flex-shrink-0" />
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground flex-shrink-0">
          Cat:
        </span>
        <button
          onClick={() => setCatFilter('All')}
          className={`px-2 py-1 rounded text-[10px] flex-shrink-0 transition-colors border ${catFilter === 'All' ? 'bg-teal-400/15 text-teal-400 border-teal-400/30' : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-white/[0.04]'}`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setCatFilter(cat)}
            className={`px-2 py-1 rounded text-[10px] flex-shrink-0 transition-colors border ${catFilter === cat ? `${CAT[cat].bg} ${CAT[cat].color}` : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-white/[0.04]'}`}
          >
            {cat}
          </button>
        ))}
        <div className="w-px h-3 bg-white/10 mx-1 flex-shrink-0" />
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground flex-shrink-0">
          Competitor:
        </span>
        <select
          value={compFilter}
          onChange={(e) => setCompFilter(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.08] rounded text-[10px] text-foreground px-2 py-1 focus:outline-none focus:border-teal-400/40 flex-shrink-0"
        >
          <option value="All">All</option>
          {COMPETITORS.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Signal list */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-center mb-4">
              <Search size={22} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              No signals match your filters
            </p>
            <p className="text-xs text-muted-foreground">
              Try adjusting your search or filter criteria
            </p>
          </div>
        ) : (
          filtered.map((s) => {
            const c = getCompetitor(s.competitor);
            const p = getPriority(s.significance);
            return (
              <div
                key={s.id}
                onClick={() => onSignal(s)}
                className={`p-4 border rounded-xl cursor-pointer transition-all group hover:border-white/15 ${
                  p === 'high'
                    ? 'bg-red-500/[0.04] border-red-500/[0.12] hover:bg-red-500/[0.07]'
                    : p === 'medium'
                      ? 'bg-amber-500/[0.03] border-amber-500/[0.10] hover:bg-amber-500/[0.06]'
                      : 'bg-white/[0.02] border-white/[0.07] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <ScoreBadge score={s.significance} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {c && (
                        <span className="text-[10px] font-bold" style={{ color: c.logoColor }}>
                          {s.competitor}
                        </span>
                      )}
                      <CategoryTag category={s.category} />
                      {!s.isRead && (
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />
                      )}
                    </div>
                    <h3 className="text-xs font-semibold text-foreground mb-1 leading-snug group-hover:text-white transition-colors">
                      {s.title}
                    </h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                      {s.summary}
                    </p>
                    <div className="flex items-center justify-between mt-2 gap-3">
                      <div className="flex items-center gap-2">
                        <SourcePill type={s.sourceType} />
                        <span className="text-[10px] text-muted-foreground">{s.source}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <ConfidenceBar pct={s.confidence} />
                        <TimeAgo iso={s.detectedAt} />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBookmarkNow(s.id);
                          }}
                          className="p-1 rounded hover:bg-white/[0.06] transition-colors"
                          title={s.isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                        >
                          <Bookmark
                            size={11}
                            className={
                              s.isBookmarked
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-muted-foreground'
                            }
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Competitors View ─────────────────────────────────────────────────────────
function CompetitorsView({
  initialCompetitorId,
  onOpenActivityBattlecards,
}: {
  initialCompetitorId?: string | null;
  onOpenActivityBattlecards?: (competitorId: string) => void;
}) {
  const { signals: SIGNALS, competitors: COMPETITORS, battlecardHistory } = useAseData();
  const [selected, setSelected] = useState<string | null>(initialCompetitorId ?? null);
  const [showAdd, setShowAdd] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (selected) fetchBattlecardHistoryFor(selected);
  }, [selected]);

  const removeCompetitor = async (id: string) => {
    try {
      await deleteCompetitor(id);
      setActionError(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete competitor');
    }
  };

  if (selected) {
    const comp = COMPETITORS.find((c) => c.id === selected)!;
    const compSignals = SIGNALS.filter((s) => s.competitor === comp.name);
    const versions = battlecardHistory[selected] ?? [];
    const latest = versions[0];
    return (
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft size={13} /> Competitors
          </button>
          <span className="text-muted-foreground text-xs">/</span>
          <span className="text-xs text-foreground">{comp.name}</span>
        </div>

        <div className="bg-card border border-white/[0.07] rounded-xl p-5 mb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <CompLogo comp={comp} size="lg" />
              <div>
                <h2 className="text-base font-semibold text-foreground">{comp.name}</h2>
                <p
                  className="text-xs text-muted-foreground"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {comp.website}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {comp.tags.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 bg-white/[0.04] border border-white/[0.08] rounded text-[10px] text-muted-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-5 text-center flex-shrink-0">
              <div>
                <div
                  className="text-xl font-bold text-foreground"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {comp.signalCount}
                </div>
                <div className="text-[10px] text-muted-foreground">Total Signals</div>
              </div>
              <div>
                <div
                  className="text-xl font-bold text-foreground"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {compSignals.length}
                </div>
                <div className="text-[10px] text-muted-foreground">This Month</div>
              </div>
              <div>
                <div
                  className={`text-xl font-bold ${comp.signalTrend === 'up' ? 'text-teal-400' : 'text-red-400'}`}
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {comp.signalTrend === 'up' ? '↑' : '↓'}
                  {comp.trendPercent}%
                </div>
                <div className="text-[10px] text-muted-foreground">vs. Last Mo.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Battlecard provenance */}
        <div className="bg-card border border-white/[0.07] rounded-xl p-4 mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers size={11} className="text-muted-foreground" />
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground">
                Battlecard
              </span>
            </div>
            {latest ? (
              <p className="text-[11px] text-muted-foreground">
                Regenerated <TimeAgo iso={latest.generatedAt} /> via{' '}
                <span
                  className={`${TRIGGER_META[latest.trigger].color} font-medium`}
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {latest.trigger}
                </span>
                <span className="ml-1">
                  — {latest.sections.length} section{latest.sections.length === 1 ? '' : 's'},{' '}
                  {latest.sourceSignalCount} source signal
                  {latest.sourceSignalCount === 1 ? '' : 's'}
                </span>
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">No battlecard history yet.</p>
            )}
          </div>
          {onOpenActivityBattlecards && (
            <button
              onClick={() => onOpenActivityBattlecards(comp.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-[11px] text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
            >
              View history <ExternalLink size={11} />
            </button>
          )}
        </div>

        <h3 className="text-xs font-semibold text-foreground mb-3">
          Recent Signals ({compSignals.length})
        </h3>
        <div className="space-y-2">
          {compSignals.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs">
              No signals detected for {comp.name} yet.
            </div>
          ) : (
            compSignals.map((s) => (
              <div
                key={s.id}
                className="bg-card border border-white/[0.07] rounded-xl p-4 flex items-start gap-3"
              >
                <ScoreBadge score={s.significance} />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <CategoryTag category={s.category} />
                    <TimeAgo iso={s.detectedAt} />
                  </div>
                  <p className="text-xs font-medium text-foreground">{s.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{s.summary}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-sm font-semibold text-foreground">Competitor Profiles</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-400 hover:bg-teal-300 text-black text-[11px] font-bold rounded-lg transition-colors"
        >
          <Plus size={12} />
          Add Competitor
        </button>
      </div>
      {actionError && (
        <div className="mb-4 px-3 py-2 bg-red-400/10 border border-red-400/25 rounded-lg text-[11px] text-red-400">
          {actionError}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        {COMPETITORS.map((comp) => (
          <div
            key={comp.id}
            onClick={() => setSelected(comp.id)}
            className="bg-card border border-white/[0.07] rounded-xl p-5 cursor-pointer hover:border-white/20 transition-all group"
          >
            <div className="flex items-start justify-between mb-4">
              <CompLogo comp={comp} size="md" />
              <div className="flex items-center gap-1.5">
                <div
                  className={`text-[9px] flex items-center gap-1 ${comp.monitoringActive ? 'text-teal-400' : 'text-muted-foreground'}`}
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${comp.monitoringActive ? 'bg-teal-400' : 'bg-muted-foreground'}`}
                  />
                  {comp.monitoringActive ? 'Active' : 'Paused'}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCompetitor(comp.id);
                  }}
                  className="p-1 rounded hover:bg-white/[0.06] text-muted-foreground hover:text-red-400 transition-colors"
                  title="Delete competitor"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-0.5 group-hover:text-white transition-colors">
              {comp.name}
            </h3>
            <p
              className="text-[10px] text-muted-foreground mb-3"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {comp.website}
            </p>
            <div className="flex items-center justify-between">
              <div>
                <div
                  className="text-lg font-bold text-foreground"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {comp.signalCount}
                </div>
                <div className="text-[9px] text-muted-foreground">signals / 7d</div>
              </div>
              <div
                className={`flex items-center gap-1 text-[11px] ${comp.signalTrend === 'up' ? 'text-teal-400' : 'text-red-400'}`}
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {comp.signalTrend === 'up' ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {comp.trendPercent}%
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-white/[0.06]">
              <p className="text-[9px] text-muted-foreground">Last signal: {comp.lastSignal}</p>
            </div>
          </div>
        ))}
      </div>
      {showAdd && <AddCompetitorModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

// ─── Timeline View ─────────────────────────────────────────────────────────────
function TimelineView({ onSignal, search }: { onSignal: (s: Signal) => void; search: string }) {
  const { signals: SIGNALS, competitors: COMPETITORS } = useAseData();
  const [compFilter, setCompFilter] = useState('All');

  const q = search.trim().toLowerCase();
  const searched = q
    ? SIGNALS.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          s.competitor.toLowerCase().includes(q),
      )
    : SIGNALS;
  const filtered =
    compFilter === 'All' ? searched : searched.filter((s) => s.competitor === compFilter);
  // Sort newest-first before grouping so day headers and the signals inside
  // each day are deterministic; unparseable timestamps are dropped.
  const sorted = [...filtered].sort((a, b) => +new Date(b.detectedAt) - +new Date(a.detectedAt));
  const groups: Record<string, Signal[]> = {};
  sorted.forEach((s) => {
    const t = new Date(s.detectedAt).getTime();
    if (Number.isNaN(t)) return;
    const d = new Date(t).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    if (!groups[d]) groups[d] = [];
    groups[d].push(s);
  });

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-sm font-semibold text-foreground">Signal Timeline</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Competitor:</span>
          <select
            value={compFilter}
            onChange={(e) => setCompFilter(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-foreground px-2.5 py-1.5 focus:outline-none focus:border-teal-400/40"
          >
            <option value="All">All Competitors</option>
            {COMPETITORS.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-white/[0.06]" />
        {Object.entries(groups).map(([date, sigs]) => (
          <div key={date} className="mb-7">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-card border border-white/[0.1] flex items-center justify-center z-10 relative flex-shrink-0">
                <Clock size={12} className="text-muted-foreground" />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground">{date}</span>
              <span
                className="text-[9px] text-muted-foreground bg-white/[0.04] px-2 py-0.5 rounded"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {sigs.length} signals
              </span>
            </div>
            <div className="ml-11 space-y-2">
              {sigs.map((s) => {
                const c = getCompetitor(s.competitor);
                return (
                  <div
                    key={s.id}
                    onClick={() => onSignal(s)}
                    className="bg-card border border-white/[0.07] rounded-xl p-4 cursor-pointer hover:border-white/15 transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <ScoreBadge score={s.significance} />
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          {c && (
                            <span className="text-[10px] font-bold" style={{ color: c.logoColor }}>
                              {s.competitor}
                            </span>
                          )}
                          <CategoryTag category={s.category} />
                          <TimeAgo iso={s.detectedAt} />
                        </div>
                        <p className="text-xs font-medium text-foreground group-hover:text-white transition-colors">
                          {s.title}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Weekly Digest View ───────────────────────────────────────────────────────
function DigestView({ search }: { search: string }) {
  const { signals: SIGNALS } = useAseData();
  const q = search.trim().toLowerCase();
  const searched = q
    ? SIGNALS.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.summary.toLowerCase().includes(q) ||
          s.competitor.toLowerCase().includes(q),
      )
    : SIGNALS;
  // Weekly window: the last 7 days (rolling, day-aligned). The digest is a
  // weekly email-style view, so it must never span the whole signal history.
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setHours(23, 59, 59, 999);
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const inWeek = (iso: string): boolean => {
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && t >= weekStart.getTime() && t <= weekEnd.getTime();
  };
  const weekSignals = searched.filter((s) => inWeek(s.detectedAt));

  const high = weekSignals.filter((s) => getPriority(s.significance) === 'high');
  const med = weekSignals.filter((s) => getPriority(s.significance) === 'medium');
  const topStory = weekSignals.find((s) => s.significance === 10) ?? weekSignals[0];

  const dayFmt = (d: Date): string =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fullFmt = (d: Date): string =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const digestLabel = `${dayFmt(weekStart)} — ${dayFmt(weekEnd)}`;
  const digestDate = fullFmt(now);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-sm font-semibold text-foreground">Weekly Digest</h1>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{digestLabel}</span>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            <Download size={11} />
            Export
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-400 hover:bg-teal-300 text-black text-[11px] font-bold rounded-lg transition-colors">
            <Mail size={11} />
            Send Digest
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="bg-card border border-white/[0.09] rounded-2xl overflow-hidden">
          {/* Email header */}
          <div className="px-7 py-5 border-b border-white/[0.06] bg-white/[0.02]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-teal-400/20 border border-teal-400/30 flex items-center justify-center">
                  <Zap size={12} style={{ color: '#0FCCB8' }} />
                </div>
                <span
                  className="text-xs font-bold text-foreground"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  ASE
                </span>
              </div>
              <span
                className="text-[10px] text-muted-foreground"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {digestDate}
              </span>
            </div>
            <h2 className="text-lg font-bold text-foreground mt-4">
              Your Competitive Intelligence Digest
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Week of {digestLabel} · {weekSignals.length} signals detected · {high.length} require
              action
            </p>
          </div>

          {/* Top story */}
          {topStory && (
            <div className="px-7 py-5 border-b border-white/[0.06]">
              <div className="text-[9px] uppercase tracking-widest text-red-400 mb-3">
                ⚡ Top Story This Week
              </div>
              <div className="bg-red-500/[0.06] border border-red-500/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <ScoreBadge score={topStory.significance} />
                  <div>
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <CategoryTag category={topStory.category} />
                      {(() => {
                        const c = getCompetitor(topStory.competitor);
                        return c ? (
                          <span className="text-[10px] font-bold" style={{ color: c.logoColor }}>
                            {topStory.competitor}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    <h3 className="text-xs font-semibold text-foreground mb-2">{topStory.title}</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {topStory.summary}
                    </p>
                    <div className="mt-3 p-3 bg-white/[0.04] rounded-lg border border-white/[0.06]">
                      <p className="text-[9px] uppercase tracking-widest text-amber-400 mb-1">
                        Action Required
                      </p>
                      <p className="text-[11px] text-foreground">
                        {topStory.recommendedActions[0]}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* High priority list */}
          <div className="px-7 py-5 border-b border-white/[0.06]">
            <div className="text-[9px] uppercase tracking-widest text-red-400 mb-4">
              High Priority Signals ({high.length})
            </div>
            <div className="space-y-4">
              {high.slice(0, 4).map((s) => {
                const c = getCompetitor(s.competitor);
                return (
                  <div key={s.id} className="flex items-start gap-3">
                    <ScoreBadge score={s.significance} />
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        {c && (
                          <span className="text-[10px] font-bold" style={{ color: c.logoColor }}>
                            {s.competitor}
                          </span>
                        )}
                        <CategoryTag category={s.category} />
                      </div>
                      <p className="text-xs font-medium text-foreground">{s.title}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                        {s.summary}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Medium priority table */}
          <div className="px-7 py-5 border-b border-white/[0.06]">
            <div className="text-[9px] uppercase tracking-widest text-amber-400 mb-4">
              Medium Priority ({med.length} signals)
            </div>
            <div className="space-y-2.5">
              {med.map((s) => {
                const c = getCompetitor(s.competitor);
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 py-1.5 border-b border-white/[0.04] last:border-0"
                  >
                    <span
                      className="text-xs font-bold text-amber-400 w-4"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {s.significance}
                    </span>
                    <span
                      className="text-[10px] font-bold w-16 flex-shrink-0"
                      style={{ color: c?.logoColor }}
                    >
                      {s.competitor}
                    </span>
                    <CategoryTag category={s.category} />
                    <span className="text-[11px] text-muted-foreground flex-1 truncate">
                      {s.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div className="px-7 py-4 bg-white/[0.01] text-center">
            <p className="text-[10px] text-muted-foreground">
              Autonomous Signal Engine ·{' '}
              <span className="text-teal-400 cursor-pointer hover:underline">
                View in Dashboard
              </span>{' '}
              ·{' '}
              <span className="cursor-pointer hover:text-foreground transition-colors">
                Manage Preferences
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Alert Rules View ─────────────────────────────────────────────────────────
function ruleToDraft(r: AlertRuleWire): RuleDraft {
  return {
    name: r.name,
    description: r.description,
    enabled: r.enabled,
    ...(r.triggers.min_score !== undefined ? { minScore: r.triggers.min_score } : {}),
    ...((r.triggers.categories ?? []).length > 0 ? { categories: r.triggers.categories } : {}),
    ...((r.triggers.competitor_ids ?? []).length > 0
      ? { competitorIds: r.triggers.competitor_ids }
      : {}),
    ...((r.triggers.keywords ?? []).length > 0 ? { keywords: r.triggers.keywords } : {}),
    channels: r.channels.map((ch) => ({ type: ch.type, target: ch.target })),
    ...(r.routing_override ? { routingOverride: r.routing_override } : {}),
  };
}

function AlertsView() {
  const { rules, notifications } = useAseData();
  const [showRule, setShowRule] = useState(false);
  const [editing, setEditing] = useState<AlertRuleWire | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    refreshRules();
    refreshNotifications();
  }, []);

  const triggerChips = (r: AlertRuleWire): string[] => {
    const chips: string[] = [];
    if (r.triggers.min_score !== undefined) chips.push(`Score ≥ ${r.triggers.min_score}/10`);
    (r.triggers.categories ?? []).forEach((c) => chips.push(`Category: ${c}`));
    (r.triggers.keywords ?? []).forEach((k) => chips.push(`Keyword: ${k}`));
    (r.triggers.competitor_ids ?? []).forEach((id) => {
      const comp = getSnapshot().competitors.find((c) => c.id === id);
      chips.push(`Competitor: ${comp?.name ?? id}`);
    });
    return chips;
  };

  const toggleRule = async (r: AlertRuleWire) => {
    setActionError(null);
    try {
      await updateRule(r.id, { ...ruleToDraft(r), enabled: !r.enabled });
      await refreshRules();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update rule');
    }
  };

  const deleteRuleNow = async (r: AlertRuleWire) => {
    setActionError(null);
    try {
      await deleteRule(r.id);
      await refreshRules();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete rule');
    }
  };

  const editRule = (r: AlertRuleWire) => {
    setEditing(r);
    setShowRule(true);
  };

  const newRule = () => {
    setEditing(null);
    setShowRule(true);
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Alert Rules</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Configure when and how you receive intelligence alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={newRule}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-400 hover:bg-teal-300 text-black text-[11px] font-bold rounded-lg transition-colors"
          >
            <Plus size={12} />
            New Rule
          </button>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 px-3 py-2 bg-red-400/10 border border-red-400/25 rounded-lg text-[11px] text-red-400">
          {actionError}
        </div>
      )}

      {/* Rules */}
      <div className="space-y-2.5">
        {rules.length === 0 && (
          <div className="bg-card border border-white/[0.07] rounded-xl p-8 text-center">
            <p className="text-xs text-muted-foreground">
              No alert rules yet — click <span className="text-teal-400">New Rule</span> to create
              your first one.
            </p>
          </div>
        )}
        {rules.map((r) => (
          <div
            key={r.id}
            className={`bg-card border rounded-xl p-4 transition-all ${r.enabled ? 'border-white/[0.07]' : 'border-white/[0.04] opacity-55'}`}
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <h3 className="text-xs font-semibold text-foreground">{r.name}</h3>
                  {r.fired_count > 0 && (
                    <span
                      className="text-[9px] bg-white/[0.05] text-muted-foreground px-1.5 py-0.5 rounded"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {r.fired_count} fired
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mb-3">{r.description}</p>
                <div className="flex items-start gap-5 flex-wrap">
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
                      Triggers
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {triggerChips(r).map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 bg-white/[0.04] border border-white/[0.07] rounded text-[9px] text-muted-foreground"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
                      Notify via
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {r.channels.map((ch) => (
                        <span
                          key={`${ch.type}-${ch.target}`}
                          className="px-1.5 py-0.5 bg-teal-400/[0.08] border border-teal-400/20 rounded text-[9px] text-teal-400"
                        >
                          {ch.type} · {ch.target}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2.5 flex-shrink-0 mt-0.5">
                <Toggle on={r.enabled} onChange={() => toggleRule(r)} />
                <button
                  onClick={() => editRule(r)}
                  className="p-1 rounded hover:bg-white/[0.05] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Edit size={12} />
                </button>
                <button
                  onClick={() => deleteRuleNow(r)}
                  className="p-1 rounded hover:bg-white/[0.05] text-muted-foreground hover:text-red-400 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent notifications */}
      <div className="mt-7">
        <h2 className="text-xs font-semibold text-foreground mb-3">Recent Notifications</h2>
        {notifications.length === 0 ? (
          <div className="bg-card border border-white/[0.07] rounded-xl p-8 text-center">
            <p className="text-xs text-muted-foreground">No notifications delivered yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.slice(0, 8).map((n) => (
              <div
                key={n.id}
                className={`bg-card border rounded-xl p-3.5 flex items-start gap-3 ${n.read_at ? 'border-white/[0.05] opacity-70' : 'border-teal-400/20'}`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    n.status === 'failed'
                      ? 'bg-red-400/10'
                      : n.status === 'pending'
                        ? 'bg-amber-400/10'
                        : 'bg-teal-400/10'
                  }`}
                >
                  <Bell
                    size={12}
                    className={
                      n.status === 'failed'
                        ? 'text-red-400'
                        : n.status === 'pending'
                          ? 'text-amber-400'
                          : 'text-teal-400'
                    }
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={`text-xs font-medium truncate ${n.read_at ? 'text-muted-foreground' : 'text-foreground font-semibold'}`}
                    >
                      {n.title}
                    </span>
                    {!n.read_at && (
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mb-1">{n.body}</p>
                  <div className="flex items-center gap-2 text-[9px]">
                    <span
                      className="text-muted-foreground"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {n.channel}
                    </span>
                    <span
                      className={`${
                        n.status === 'failed'
                          ? 'text-red-400'
                          : n.status === 'pending'
                            ? 'text-amber-400'
                            : 'text-teal-400'
                      }`}
                    >
                      {n.status}
                    </span>
                    <span className="text-muted-foreground">
                      <TimeAgo iso={n.created_at} />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showRule && (
        <RuleModal
          initial={editing}
          onClose={() => {
            setShowRule(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Monitoring Settings View ──────────────────────────────────────────────────
function MonitoringView() {
  const { competitors: COMPETITORS, user } = useAseData();
  const [sources, setSources] = useState<DataSourceWire[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchDataSources(user.organization_id)
      .then((items) => setSources(items))
      .catch((err) => {
        setSources([]);
        setSourceError(err instanceof Error ? err.message : 'Failed to load data sources');
      });
  }, [user]);

  const activeSources = (sources ?? []).filter((s) => s.is_active);
  const totalSources = (sources?.length ?? 0) + COMPETITORS.length;

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      <div className="mb-5">
        <h1 className="text-sm font-semibold text-foreground">Monitoring Settings</h1>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Configure which sources and competitors the engine monitors
        </p>
      </div>

      {sourceError && (
        <div className="mb-4 px-3 py-2 bg-red-400/10 border border-red-400/25 rounded-lg text-[11px] text-red-400">
          {sourceError}
        </div>
      )}

      {/* Summary */}
      <div className="mb-7">
        <div className="bg-card border border-white/[0.07] rounded-xl p-5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-teal-400/15 border border-teal-400/25 flex items-center justify-center flex-shrink-0">
            <Activity size={18} style={{ color: '#0FCCB8' }} />
          </div>
          <div className="flex-1">
            <div
              className="text-2xl font-bold text-foreground"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {totalSources}
            </div>
            <div className="text-[10px] text-muted-foreground">Sources monitored</div>
          </div>
          <div className="text-right flex-shrink-0">
            <div
              className="text-xs font-medium text-foreground"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {COMPETITORS.length} competitors
            </div>
            <div
              className="text-[10px] text-muted-foreground"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {activeSources.length} / {sources?.length ?? 0} sources active
            </div>
          </div>
        </div>
      </div>

      {/* Sources */}
      <div className="mb-7">
        <h2 className="text-xs font-semibold text-foreground mb-3">Data Sources</h2>
        {sources === null ? (
          <div className="bg-card border border-white/[0.07] rounded-xl p-8 text-center">
            <p className="text-xs text-muted-foreground">Loading sources…</p>
          </div>
        ) : sources.length === 0 ? (
          <div className="bg-card border border-white/[0.07] rounded-xl p-8 text-center">
            <p className="text-xs text-muted-foreground">
              No sources configured yet — add a competitor or connect a data source to start
              monitoring.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sources.map((src) => (
              <div
                key={src.id}
                className={`bg-card border rounded-xl p-4 flex items-center gap-3 transition-all ${src.is_active ? 'border-white/[0.07]' : 'border-white/[0.04] opacity-60'}`}
              >
                <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center flex-shrink-0">
                  <ExternalLink size={14} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className="text-xs font-medium text-foreground truncate"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {src.target_url}
                    </span>
                    <span
                      className="text-[9px] text-teal-400 bg-teal-400/[0.08] px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {src.source_type}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {src.collection_method} · every {src.refresh_interval_minutes} min
                  </p>
                </div>
                <div className="text-right flex-shrink-0 mr-3">
                  <div className="text-[9px] text-muted-foreground">Last collected</div>
                  <div
                    className="text-[10px] text-foreground"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {src.last_collected_at ? <TimeAgo iso={src.last_collected_at} /> : 'Never'}
                  </div>
                </div>
                <span
                  className={`text-[9px] ${src.is_active ? 'text-teal-400' : 'text-muted-foreground'}`}
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {src.is_active ? '● Active' : '○ Paused'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Competitors */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-foreground">Monitored Competitors</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-[11px] text-teal-400 hover:text-teal-300 transition-colors"
          >
            <Plus size={11} />
            Add competitor
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {COMPETITORS.map((comp) => (
            <div
              key={comp.id}
              className={`bg-card border rounded-xl p-3.5 flex items-center gap-3 transition-all ${comp.monitoringActive ? 'border-white/[0.07]' : 'border-white/[0.04] opacity-60'}`}
            >
              <CompLogo comp={comp} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground">{comp.name}</p>
                <p
                  className="text-[10px] text-muted-foreground"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {comp.website}
                </p>
              </div>
              <span
                className={`text-[9px] ${comp.monitoringActive ? 'text-teal-400' : 'text-muted-foreground'}`}
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {comp.monitoringActive ? '● Active' : '○ Paused'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {showAdd && <AddCompetitorModal onClose={() => setShowAdd(false)} />}
    </div>
  );
}

// ─── Activity (Everything) Feed View ──────────────────────────────────────────

type ActivityTab = 'signals' | 'notifications' | 'battlecards';

const SIGNIFICANCE_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function ActivityTabs({ tab, onChange }: { tab: ActivityTab; onChange: (t: ActivityTab) => void }) {
  return (
    <div className="px-5 pt-3 flex items-center gap-1 border-b border-white/[0.06] flex-shrink-0">
      {(
        [
          { id: 'signals', label: 'Signals' },
          { id: 'notifications', label: 'Notifications' },
          { id: 'battlecards', label: 'Battlecards' },
        ] as { id: ActivityTab; label: string }[]
      ).map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-2 rounded-t text-[11px] font-medium transition-colors border-b-2 -mb-px ${
            tab === t.id
              ? 'text-teal-400 border-teal-400'
              : 'text-muted-foreground border-transparent hover:text-foreground'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ActivitySignalsTab({
  search,
  onSignal,
  initialSignalId,
}: {
  search: string;
  onSignal: (s: Signal) => void;
  initialSignalId?: string | null;
}) {
  const { activitySignals, hasMore, competitors, loading } = useAseData();
  const [text, setText] = useState('');
  const [compFilter, setCompFilter] = useState('All');
  const [catFilter, setCatFilter] = useState<Category | 'All'>('All');
  const [confidence, setConfidence] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [minSig, setMinSig] = useState(0);
  const [routing, setRouting] = useState<'all' | 'signal_card' | 'weekly_digest' | 'archive'>(
    'all',
  );
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);

  useEffect(() => {
    const q: SignalListQuery = { limit: 50 };
    if (compFilter !== 'All') q.competitor_id = compFilter;
    if (catFilter !== 'All') q.action_type = CATEGORY_TO_WIRE[catFilter];
    if (confidence !== 'all') q.confidence_level = confidence;
    if (minSig > 0) q.min_significance = minSig;
    if (routing !== 'all') q.routing_decision = routing;
    if (bookmarkedOnly) q.bookmarked = true;
    const t = (search || text).trim();
    if (t) q.search = t;
    const handle = setTimeout(() => loadActivitySignals(q), 250);
    return () => clearTimeout(handle);
  }, [compFilter, catFilter, confidence, minSig, routing, bookmarkedOnly, search, text]);

  const toggleBookmarkNow = async (id: string) => {
    try {
      await toggleBookmark(id);
    } catch {
      /* optimistic toggle reverts in the store */
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Filters bar */}
      <div className="px-5 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
        <div className="relative flex-shrink-0">
          <Search
            size={11}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            placeholder="Search signals..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-foreground placeholder:text-muted-foreground pl-7 pr-3 py-1.5 w-40 focus:outline-none focus:border-teal-400/40 transition-colors flex-shrink-0"
          />
        </div>
        <div className="w-px h-3 bg-white/10 mx-1 flex-shrink-0" />
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground flex-shrink-0">
          Competitor:
        </span>
        <select
          value={compFilter}
          onChange={(e) => setCompFilter(e.target.value)}
          className="bg-white/[0.04] border border-white/[0.08] rounded text-[10px] text-foreground px-2 py-1 focus:outline-none focus:border-teal-400/40 flex-shrink-0"
        >
          <option value="All">All</option>
          {competitors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="w-px h-3 bg-white/10 mx-1 flex-shrink-0" />
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground flex-shrink-0">
          Category:
        </span>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value as Category | 'All')}
          className="bg-white/[0.04] border border-white/[0.08] rounded text-[10px] text-foreground px-2 py-1 focus:outline-none focus:border-teal-400/40 flex-shrink-0"
        >
          <option value="All">All</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="w-px h-3 bg-white/10 mx-1 flex-shrink-0" />
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground flex-shrink-0">
          Confidence:
        </span>
        {(
          [
            ['all', 'All'],
            ['high', 'High'],
            ['medium', 'Medium'],
            ['low', 'Low'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setConfidence(val)}
            className={`px-2 py-1 rounded text-[10px] font-medium flex-shrink-0 transition-colors border ${
              confidence === val
                ? 'bg-teal-400/15 text-teal-400 border-teal-400/30'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-white/[0.04]'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="w-px h-3 bg-white/10 mx-1 flex-shrink-0" />
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground flex-shrink-0">
          Min Sig:
        </span>
        <select
          value={minSig}
          onChange={(e) => setMinSig(Number(e.target.value))}
          className="bg-white/[0.04] border border-white/[0.08] rounded text-[10px] text-foreground px-2 py-1 focus:outline-none focus:border-teal-400/40 flex-shrink-0"
        >
          {SIGNIFICANCE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s === 0 ? 'Any' : `≥ ${s}`}
            </option>
          ))}
        </select>
        <div className="w-px h-3 bg-white/10 mx-1 flex-shrink-0" />
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground flex-shrink-0">
          Route:
        </span>
        {(
          [
            ['all', 'All'],
            ['signal_card', 'Card'],
            ['weekly_digest', 'Digest'],
            ['archive', 'Archive'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setRouting(val)}
            className={`px-2 py-1 rounded text-[10px] font-medium flex-shrink-0 transition-colors border ${
              routing === val
                ? 'bg-teal-400/15 text-teal-400 border-teal-400/30'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-white/[0.04]'
            }`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => setBookmarkedOnly(!bookmarkedOnly)}
          className={`px-2 py-1 rounded text-[10px] font-medium flex-shrink-0 transition-colors border ${
            bookmarkedOnly
              ? 'bg-amber-400/15 text-amber-400 border-amber-400/30'
              : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-white/[0.04]'
          }`}
        >
          <Bookmark size={10} className="inline mr-1 -mt-0.5" />
          Bookmarked
        </button>
      </div>

      {/* Signal list */}
      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
        {activitySignals.length === 0 && loading ? (
          <div className="flex items-center justify-center py-20 text-xs text-muted-foreground">
            Loading signals…
          </div>
        ) : activitySignals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex items-center justify-center mb-4">
              <Search size={22} className="text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-1">
              No signals match your filters
            </p>
            <p className="text-xs text-muted-foreground">
              Try adjusting your search or filter criteria
            </p>
          </div>
        ) : (
          activitySignals.map((s) => {
            const c = getCompetitor(s.competitor);
            const p = getPriority(s.significance);
            const highlighted = s.id === initialSignalId;
            return (
              <div
                key={s.id}
                onClick={() => onSignal(s)}
                className={`p-4 border rounded-xl cursor-pointer transition-all group hover:border-white/15 ${
                  highlighted ? 'ring-2 ring-teal-400/60 border-teal-400/40' : ''
                } ${
                  p === 'high'
                    ? 'bg-red-500/[0.04] border-red-500/[0.12] hover:bg-red-500/[0.07]'
                    : p === 'medium'
                      ? 'bg-amber-500/[0.03] border-amber-500/[0.10] hover:bg-amber-500/[0.06]'
                      : 'bg-white/[0.02] border-white/[0.07] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <ScoreBadge score={s.significance} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {c && (
                        <span className="text-[10px] font-bold" style={{ color: c.logoColor }}>
                          {s.competitor}
                        </span>
                      )}
                      <CategoryTag category={s.category} />
                      {!s.isRead && (
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />
                      )}
                    </div>
                    <h3 className="text-xs font-semibold text-foreground mb-1 leading-snug group-hover:text-white transition-colors">
                      {s.title}
                    </h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                      {s.summary}
                    </p>
                    <div className="flex items-center justify-between mt-2 gap-3">
                      <div className="flex items-center gap-2">
                        <SourcePill type={s.sourceType} />
                        <span className="text-[10px] text-muted-foreground">{s.source}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <ConfidenceBar pct={s.confidence} />
                        <TimeAgo iso={s.detectedAt} />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleBookmarkNow(s.id);
                          }}
                          className="p-1 rounded hover:bg-white/[0.06] transition-colors"
                          title={s.isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                        >
                          <Bookmark
                            size={11}
                            className={
                              s.isBookmarked
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-muted-foreground'
                            }
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Load more */}
      <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-center gap-3 flex-shrink-0">
        <span
          className="text-[10px] text-muted-foreground"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {activitySignals.length} signals loaded
        </span>
        {hasMore && (
          <button
            onClick={() => loadMoreSignals()}
            className="px-3 py-1.5 bg-teal-400 hover:bg-teal-300 text-black text-[11px] font-bold rounded-lg transition-colors"
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}

function ActivityNotificationsTab() {
  const { notifications } = useAseData();
  const [channelFilter, setChannelFilter] = useState<'all' | 'in_app'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'delivered' | 'failed' | 'pending'>(
    'all',
  );

  const filtered = notifications.filter((n) => {
    if (channelFilter !== 'all' && n.channel !== channelFilter) return false;
    if (statusFilter !== 'all' && n.status !== statusFilter) return false;
    return true;
  });

  const markReadNow = async (id: string) => {
    try {
      await markRead(id);
    } catch {
      /* non-fatal */
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Filters */}
      <div className="px-5 py-2.5 border-b border-white/[0.06] flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground flex-shrink-0">
          Channel:
        </span>
        {(
          [
            ['all', 'All'],
            ['in_app', 'In-app'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setChannelFilter(val)}
            className={`px-2 py-1 rounded text-[10px] font-medium flex-shrink-0 transition-colors border ${
              channelFilter === val
                ? 'bg-teal-400/15 text-teal-400 border-teal-400/30'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-white/[0.04]'
            }`}
          >
            {label}
          </button>
        ))}
        <div className="w-px h-3 bg-white/10 mx-1 flex-shrink-0" />
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground flex-shrink-0">
          Status:
        </span>
        {(
          [
            ['all', 'All'],
            ['delivered', 'Delivered'],
            ['failed', 'Failed'],
            ['pending', 'Pending'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setStatusFilter(val)}
            className={`px-2 py-1 rounded text-[10px] font-medium flex-shrink-0 transition-colors border ${
              statusFilter === val
                ? 'bg-teal-400/15 text-teal-400 border-teal-400/30'
                : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-white/[0.04]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Bell size={22} className="text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No notifications</p>
            <p className="text-xs text-muted-foreground">Adjust your channel or status filters</p>
          </div>
        ) : (
          filtered.map((n) => (
            <div
              key={n.id}
              className={`bg-card border border-white/[0.07] rounded-xl p-4 ${
                n.read_at ? 'opacity-55' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {!n.read_at && (
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />
                  )}
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded bg-white/[0.05] text-muted-foreground"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {n.channel}
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                      n.status === 'failed'
                        ? 'bg-red-400/15 text-red-400'
                        : n.status === 'pending'
                          ? 'bg-amber-400/15 text-amber-400'
                          : 'bg-teal-400/15 text-teal-400'
                    }`}
                  >
                    {n.status}
                  </span>
                </div>
                {!n.read_at && (
                  <button
                    onClick={() => markReadNow(n.id)}
                    className="flex items-center gap-1 text-[10px] text-teal-400 hover:text-teal-300 transition-colors flex-shrink-0"
                  >
                    <Check size={11} />
                    Mark read
                  </button>
                )}
              </div>
              <h3 className="text-xs font-semibold text-foreground mb-1">{n.title}</h3>
              {n.body && (
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 mb-2">
                  {n.body}
                </p>
              )}
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                <span>
                  Created <TimeAgo iso={n.created_at} />
                </span>
                {n.status === 'failed' && <span className="text-red-400">✕ delivery failed</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ActivityBattlecardsTab({ initialCompetitor }: { initialCompetitor?: string | null }) {
  const { competitors, battlecardHistory } = useAseData();
  const [selectedComp, setSelectedComp] = useState<string | null>(
    initialCompetitor ?? competitors[0]?.id ?? null,
  );
  const [content, setContent] = useState<BattlecardWire | null>(null);
  const [busy, setBusy] = useState(false);

  const history = selectedComp ? (battlecardHistory[selectedComp] ?? []) : [];

  const loadContent = async (id?: string) => {
    const cid = id ?? selectedComp;
    if (!cid) return;
    setBusy(true);
    try {
      const bc = await fetchBattlecard(cid);
      setContent(bc);
    } catch {
      setContent(null);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!selectedComp) return;
    fetchBattlecardHistoryFor(selectedComp);
    loadContent(selectedComp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComp]);

  const updateNow = async () => {
    if (!selectedComp) return;
    setBusy(true);
    try {
      await updateBattlecardFor(selectedComp);
    } catch {
      /* non-fatal */
    }
    await fetchBattlecardHistoryFor(selectedComp);
    await loadContent(selectedComp);
    setBusy(false);
  };

  const [activeVersion, setActiveVersion] = useState<string | null>(null);

  const selectVersion = (id: string) => {
    setActiveVersion(id);
    const version = history.find((h) => h.id === id);
    if (!version) return;
    const comp = competitors.find((c) => c.id === selectedComp);
    // Render the selected version's own snapshot (already in the history slice),
    // not the current battlecard — so the drill-down shows what that version held.
    setContent({
      competitor_id: (selectedComp as string) ?? '',
      competitor_name: comp?.name ?? 'Unknown competitor',
      summary: version.summary,
      sections: version.sections,
      source_signals: version.sourceSignals.map((s) => ({
        id: s.id,
        title: s.title,
        score: s.score,
        source_url: s.sourceUrl,
      })),
      generated_at: version.generatedAt,
    });
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-2.5 border-b border-white/[0.06] flex items-center gap-3 flex-wrap flex-shrink-0">
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground flex-shrink-0">
          Competitor:
        </span>
        <select
          value={selectedComp ?? ''}
          onChange={(e) => {
            setSelectedComp(e.target.value || null);
            setActiveVersion(null);
          }}
          className="bg-white/[0.04] border border-white/[0.08] rounded text-[10px] text-foreground px-2 py-1 focus:outline-none focus:border-teal-400/40 flex-shrink-0"
        >
          {competitors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => loadContent()}
          disabled={busy}
          className="px-2.5 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
        >
          View current battlecard
        </button>
        <button
          onClick={updateNow}
          disabled={busy || !selectedComp}
          className="px-2.5 py-1.5 bg-teal-400 hover:bg-teal-300 text-black text-[11px] font-bold rounded-lg transition-colors disabled:opacity-40"
        >
          {busy ? 'Updating…' : 'Update now'}
        </button>
      </div>

      {selectedComp && (
        <div className="flex-1 flex flex-col min-h-0 lg:flex-row">
          {/* Version history */}
          <div className="lg:w-72 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-white/[0.06] overflow-y-auto p-3 space-y-2">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground px-1">
              Version history ({history.length})
            </p>
            {history.length === 0 ? (
              <p className="px-1 text-[11px] text-muted-foreground">No versions recorded yet.</p>
            ) : (
              history.map((v) => {
                const meta = TRIGGER_META[v.trigger];
                return (
                  <div
                    key={v.id}
                    onClick={() => selectVersion(v.id)}
                    className={`p-3 border rounded-xl cursor-pointer transition-all ${
                      activeVersion === v.id
                        ? 'bg-teal-400/[0.06] border-teal-400/30'
                        : 'bg-card border-white/[0.07] hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded border ${meta.bg} ${meta.color}`}
                      >
                        {meta.label}
                      </span>
                      <TimeAgo iso={v.generatedAt} />
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {v.sections.length} section{v.sections.length === 1 ? '' : 's'} ·{' '}
                      {v.sourceSignalCount} source{v.sourceSignalCount === 1 ? '' : 's'}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Current battlecard snapshot */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {content ? (
              <>
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <h3 className="text-sm font-semibold text-foreground">
                    {content.competitor_name}
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    Generated <TimeAgo iso={content.generated_at} />
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground leading-relaxed mb-5">
                  {content.summary}
                </p>
                <div className="space-y-4">
                  {content.sections.map((sec) => (
                    <div
                      key={sec.heading}
                      className="bg-card border border-white/[0.07] rounded-xl p-4"
                    >
                      <h4 className="text-xs font-semibold text-foreground mb-2">{sec.heading}</h4>
                      <ul className="space-y-1.5">
                        {sec.bullets.map((b, i) => (
                          <li key={i} className="text-[11px] text-muted-foreground flex gap-2">
                            <span className="text-teal-400 flex-shrink-0">•</span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-20 text-xs text-muted-foreground">
                {busy ? 'Loading battlecard…' : 'No battlecard snapshot available.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActivityView({
  tab,
  onTabChange,
  search,
  onSignal,
  initialCompetitor,
  initialSignalId,
}: {
  tab: ActivityTab;
  onTabChange: (t: ActivityTab) => void;
  search: string;
  onSignal: (s: Signal) => void;
  initialCompetitor?: string | null;
  initialSignalId?: string | null;
}) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-foreground">Activity</h1>
          <LivePulse />
          <span
            className="text-[10px] text-muted-foreground bg-white/[0.04] px-2 py-0.5 rounded"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            everything feed
          </span>
        </div>
      </div>
      <ActivityTabs tab={tab} onChange={onTabChange} />
      {tab === 'signals' && (
        <ActivitySignalsTab search={search} onSignal={onSignal} initialSignalId={initialSignalId} />
      )}
      {tab === 'notifications' && <ActivityNotificationsTab />}
      {tab === 'battlecards' && <ActivityBattlecardsTab initialCompetitor={initialCompetitor} />}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard' as View, Icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'feed' as View, Icon: Zap, label: 'Signal Feed', badge: '11' },
  { id: 'competitors' as View, Icon: Building2, label: 'Competitors' },
  { id: 'timeline' as View, Icon: Clock, label: 'Timeline' },
  { id: 'activity' as View, Icon: Activity, label: 'Activity' },
  { id: 'digest' as View, Icon: Mail, label: 'Weekly Digest' },
];
const NAV2 = [
  { id: 'alerts' as View, Icon: Bell, label: 'Alert Rules' },
  { id: 'monitoring' as View, Icon: Settings, label: 'Monitoring' },
];

function Sidebar({
  current,
  onNav,
  user,
}: {
  current: View;
  onNav: (v: View) => void;
  user: UserWire;
}) {
  const initials = user.name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="w-52 flex-shrink-0 bg-[#06080D] border-r border-white/[0.06] flex flex-col">
      {/* Brand */}
      <div className="px-4 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-teal-400/15 border border-teal-400/25 flex items-center justify-center">
            <Zap size={13} style={{ color: '#0FCCB8' }} />
          </div>
          <div>
            <div
              className="text-xs font-bold text-foreground tracking-tight"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              ASE
            </div>
            <div className="text-[8px] uppercase tracking-[0.15em] text-muted-foreground">
              Signal Engine
            </div>
          </div>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="px-2.5 py-3 flex-1">
        <div className="space-y-0.5">
          {NAV.map(({ id, Icon, label, badge }: any) => {
            const active = current === id;
            return (
              <button
                key={id}
                onClick={() => onNav(id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[11px] font-medium transition-all border ${
                  active
                    ? 'bg-teal-400/[0.08] text-teal-400 border-teal-400/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border-transparent'
                }`}
              >
                <Icon size={13} />
                <span className="flex-1 text-left">{label}</span>
                {badge && (
                  <span
                    className="text-[9px] px-1 py-0.5 rounded bg-red-400/20 text-red-400"
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-0.5">
          {NAV2.map(({ id, Icon, label }: any) => {
            const active = current === id;
            return (
              <button
                key={id}
                onClick={() => onNav(id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[11px] font-medium transition-all border ${
                  active
                    ? 'bg-teal-400/[0.08] text-teal-400 border-teal-400/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04] border-transparent'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* User */}
      <div className="px-2.5 py-3 border-t border-white/[0.06]">
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/[0.04] cursor-pointer transition-colors">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-400 to-teal-400 flex items-center justify-center flex-shrink-0">
            <span className="text-[9px] font-bold text-black">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium text-foreground truncate">{user.name}</div>
            <div className="text-[9px] text-muted-foreground">Signal Analyst</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState<View>('dashboard');
  const [signal, setSignal] = useState<Signal | null>(null);
  const [search, setSearch] = useState('');
  const [bellOpen, setBellOpen] = useState(false);
  const [dataSources, setDataSources] = useState<DataSourceWire[] | null>(null);
  const [activityTab, setActivityTab] = useState<ActivityTab>('signals');
  const [activityCompetitor, setActivityCompetitor] = useState<string | null>(null);
  const [activitySignal, setActivitySignal] = useState<string | null>(null);
  const [competitorDeep, setCompetitorDeep] = useState<string | null>(null);
  const { live, lastSync, user, unreadCount, competitors } = useAseData();

  // Load live engine data on mount, then poll so the UI tracks the workers.
  useEffect(() => {
    refresh();
    const t = setInterval(() => refresh(), 30000);
    return () => clearInterval(t);
  }, []);

  // URL-param deep-link router (SPA, no react-router). External integrations'
  // "Open signal" / "View battlecard" buttons point at these URLs.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get('view');
    const tab = params.get('tab');
    const competitor = params.get('competitor');
    const signalId = params.get('signal');
    if (target === 'activity') {
      if (tab === 'signals' || tab === 'notifications' || tab === 'battlecards')
        setActivityTab(tab);
      if (competitor) setActivityCompetitor(competitor);
      if (signalId) setActivitySignal(signalId);
      setView('activity');
    } else if (target === 'competitors') {
      if (competitor) setCompetitorDeep(competitor);
      setView('competitors');
    }
  }, []);

  // Refresh user-scoped slices once the local identity (/me) resolves.
  useEffect(() => {
    if (!user) return;
    refreshCompetitors();
    refreshRules();
    refreshNotifications();
    fetchDataSources(user.organization_id)
      .then((items) => setDataSources(items))
      .catch(() => setDataSources([]));
  }, [user]);

  const syncLabel = live
    ? lastSync
      ? `synced ${new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      : 'syncing…'
    : 'demo data';

  const openBell = () => {
    setBellOpen(!bellOpen);
    if (!bellOpen) refreshNotifications();
  };

  const openActivityBattlecards = (competitorId: string) => {
    setActivityTab('battlecards');
    setActivityCompetitor(competitorId);
    setView('activity');
  };

  if (!user) {
    return null; // local identity (/me) still resolving
  }

  const sourceCount = competitors.length + (dataSources?.length ?? 0);

  return (
    <div
      className="h-screen flex flex-col bg-background text-foreground overflow-hidden"
      style={{ colorScheme: 'dark' }}
    >
      {/* Top bar */}
      <div className="h-9 border-b border-white/[0.06] bg-[#06080D] flex items-center px-4 gap-3 flex-shrink-0 z-20">
        <div className="flex-1" />
        <LivePulse />
        <span
          className="text-[9px] text-muted-foreground"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {syncLabel}
        </span>
        <div className="w-px h-3 bg-white/10" />
        <div className="relative">
          <Search
            size={11}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            placeholder="Search everything..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white/[0.04] border border-white/[0.07] rounded text-[11px] text-foreground placeholder:text-muted-foreground pl-6 pr-3 py-1 w-40 focus:outline-none focus:border-teal-400/40 transition-colors"
          />
        </div>
        <div className="relative">
          <button
            onClick={openBell}
            className="relative p-1.5 rounded hover:bg-white/[0.05] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Bell size={13} />
            {unreadCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-400 text-black text-[8px] font-bold flex items-center justify-center"
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {bellOpen && <NotificationPanel onClose={() => setBellOpen(false)} />}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar current={view} onNav={setView} user={user} />
        <main className="flex-1 flex flex-col overflow-hidden">
          {view === 'dashboard' && (
            <DashboardView
              onSignal={setSignal}
              onNav={setView}
              userName={user.name}
              sourceCount={sourceCount}
              search={search}
            />
          )}
          {view === 'feed' && <SignalFeedView onSignal={setSignal} search={search} />}
          {view === 'competitors' && (
            <CompetitorsView
              initialCompetitorId={competitorDeep}
              onOpenActivityBattlecards={openActivityBattlecards}
            />
          )}
          {view === 'timeline' && <TimelineView onSignal={setSignal} search={search} />}
          {view === 'digest' && <DigestView search={search} />}
          {view === 'activity' && (
            <ActivityView
              tab={activityTab}
              onTabChange={setActivityTab}
              search={search}
              onSignal={setSignal}
              initialCompetitor={activityCompetitor}
              initialSignalId={activitySignal}
            />
          )}
          {view === 'alerts' && <AlertsView />}
          {view === 'monitoring' && <MonitoringView />}
        </main>
      </div>

      {/* Signal detail slide-over */}
      {signal && <SignalDetailPanel signal={signal} onClose={() => setSignal(null)} />}
    </div>
  );
}
