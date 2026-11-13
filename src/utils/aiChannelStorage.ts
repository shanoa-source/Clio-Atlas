import { AiChannelConfig, AppLanguage } from '../types/history';

export const DEFAULT_FRONTEND_GEMINI_MODEL = 'gemini-4-hydrogen';

const STORAGE_KEY = 'civ_atlas_ai_channel_v1';

export interface GeminiModelPresetOption {
  id: string;
  label: string;
  desc: Record<AppLanguage, string>;
}

export const GEMINI_MODEL_PRESETS: readonly GeminiModelPresetOption[] = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    desc: {
      zh: '平台默认 · 极速高精度时空分析',
      en: 'Default · Fast, high-accuracy historical analysis',
      de: 'Standard · Schnelle, präzise historische Analyse',
    },
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon',
    desc: {
      zh: '进阶推理 · 复杂多图层耦合与史料考据',
      en: 'Advanced reasoning · Complex multi-layer synthesis',
      de: 'Erweitertes Denken · Komplexe Ebenen-Synthese',
    },
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    desc: {
      zh: '深度推演 · 长时段结构性因果分析',
      en: 'Deep reasoning · Structural causal synthesis',
      de: 'Tiefenanalyse · Strukturelle Kausalforschung',
    },
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    desc: {
      zh: '超低延迟 · 轻量级快速问答',
      en: 'Ultra-low latency · Lightweight rapid Q&A',
      de: 'Niedrige Latenz · Schnelle Kurzantworten',
    },
  },
] as const;

const DEPRECATED_MODEL_RE = /^(gemini-1\.5(?:-|$)|gemini-2\.0(?:-|$)|gemini-pro$)/i;

export function isSupportedCustomModelId(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (DEPRECATED_MODEL_RE.test(trimmed)) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,95}$/.test(trimmed);
}

export function formatDisplayModelName(modelId: string | undefined): string {
  const clean = (modelId || DEFAULT_FRONTEND_GEMINI_MODEL).trim();
  const preset = GEMINI_MODEL_PRESETS.find((p) => p.id === clean);
  return preset ? preset.label : clean;
}

export function getDefaultAiChannelConfig(): AiChannelConfig {
  return {
    mode: 'default',
    model: DEFAULT_FRONTEND_GEMINI_MODEL,
  };
}

export function loadAiChannelConfig(): AiChannelConfig {
  if (typeof window === 'undefined') return getDefaultAiChannelConfig();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultAiChannelConfig();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return getDefaultAiChannelConfig();
    const mode = parsed.mode === 'custom' ? 'custom' : 'default';
    const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
    const baseUrl = typeof parsed.baseUrl === 'string' ? parsed.baseUrl.trim() : '';
    const model =
      typeof parsed.model === 'string' && isSupportedCustomModelId(parsed.model)
        ? parsed.model.trim()
        : DEFAULT_FRONTEND_GEMINI_MODEL;

    if (mode === 'custom' && !apiKey) {
      return getDefaultAiChannelConfig();
    }

    return {
      mode,
      ...(apiKey ? { apiKey } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      model,
    };
  } catch {
    return getDefaultAiChannelConfig();
  }
}

export function saveAiChannelConfig(config: AiChannelConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota / privacy mode write errors
  }
}

export function resetAiChannelConfig(): AiChannelConfig {
  const fallback = getDefaultAiChannelConfig();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
  return fallback;
}
