import React, { useEffect, useState } from 'react';
import { Check, Eye, EyeOff, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { UI_TEXT } from '../i18n/translations';
import { AiChannelConfig, AiChannelMode, AppLanguage } from '../types/history';
import {
  DEFAULT_FRONTEND_GEMINI_MODEL,
  GEMINI_MODEL_PRESETS,
  isSupportedCustomModelId,
} from '../utils/aiChannelStorage';

interface AiModelConfigModalProps {
  language: AppLanguage;
  isOpen: boolean;
  config: AiChannelConfig;
  onSave: (next: AiChannelConfig) => void;
  onReset: () => void;
  onClose: () => void;
}

const CUSTOM_MODEL_SENTINEL = '__custom__';

export const AiModelConfigModal: React.FC<AiModelConfigModalProps> = ({
  language,
  isOpen,
  config,
  onSave,
  onReset,
  onClose,
}) => {
  const ui = UI_TEXT[language];

  const [mode, setMode] = useState<AiChannelMode>(config.mode);
  const [apiKey, setApiKey] = useState<string>(config.apiKey ?? '');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [baseUrl, setBaseUrl] = useState<string>(config.baseUrl ?? '');
  const [selectedPreset, setSelectedPreset] = useState<string>(DEFAULT_FRONTEND_GEMINI_MODEL);
  const [customModelText, setCustomModelText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode(config.mode);
    setApiKey(config.apiKey ?? '');
    setShowKey(false);
    setBaseUrl(config.baseUrl ?? '');
    const initialModel = config.model || DEFAULT_FRONTEND_GEMINI_MODEL;
    const matchesPreset = GEMINI_MODEL_PRESETS.some((p) => p.id === initialModel);
    if (matchesPreset) {
      setSelectedPreset(initialModel);
      setCustomModelText('');
    } else {
      setSelectedPreset(CUSTOM_MODEL_SENTINEL);
      setCustomModelText(initialModel);
    }
    setErrorMessage(null);
  }, [isOpen, config]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (mode === 'default') {
      onSave({
        mode: 'default',
        model: DEFAULT_FRONTEND_GEMINI_MODEL,
      });
      onClose();
      return;
    }

    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      setErrorMessage(ui.aiErrEmptyKey);
      return;
    }

    const rawModel =
      selectedPreset === CUSTOM_MODEL_SENTINEL ? customModelText.trim() : selectedPreset;
    if (!isSupportedCustomModelId(rawModel)) {
      setErrorMessage(ui.aiErrInvalidModel);
      return;
    }

    const trimmedUrl = baseUrl.trim();
    let normalizedBaseUrl: string | undefined;
    if (trimmedUrl) {
      try {
        const parsed = new URL(trimmedUrl);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          throw new Error('protocol');
        }
        normalizedBaseUrl = trimmedUrl.replace(/\/+$/, '');
      } catch {
        setErrorMessage(ui.aiErrInvalidUrl);
        return;
      }
    }

    onSave({
      mode: 'custom',
      apiKey: trimmedKey,
      ...(normalizedBaseUrl ? { baseUrl: normalizedBaseUrl } : {}),
      model: rawModel,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="ai-model-config-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-channel-dialog-title"
            data-testid="ai-config-modal"
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[480px] rounded-xl atlas-popover atlas-reticle p-5 text-slate-100"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 pb-3.5 border-b border-white/[0.08]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-sky-400 shrink-0" />
                  <h2
                    id="ai-channel-dialog-title"
                    className="text-sm font-semibold text-white tracking-tight"
                  >
                    {ui.aiModalTitle}
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{ui.aiModalSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={ui.cancelBtn}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {/* Channel Mode Selector */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode('default');
                    setErrorMessage(null);
                  }}
                  aria-pressed={mode === 'default'}
                  data-testid="ai-mode-default"
                  className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                    mode === 'default'
                      ? 'bg-sky-400/[0.14] border-sky-400/55 text-white'
                      : 'atlas-well text-slate-300 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold whitespace-nowrap">
                      {ui.aiModeDefault}
                    </span>
                    {mode === 'default' && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    {ui.aiModeDefaultDesc}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('custom');
                    setErrorMessage(null);
                  }}
                  aria-pressed={mode === 'custom'}
                  data-testid="ai-mode-custom"
                  className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                    mode === 'custom'
                      ? 'bg-sky-400/[0.14] border-sky-400/55 text-white'
                      : 'atlas-well text-slate-300 hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold whitespace-nowrap">
                      {ui.aiModeCustom}
                    </span>
                    {mode === 'custom' && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    {ui.aiModeCustomDesc}
                  </p>
                </button>
              </div>

              {mode === 'default' ? (
                <div className="p-3.5 rounded-lg atlas-well space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">{ui.aiModelPresetLabel}</span>
                    <span className="font-mono font-semibold text-sky-300">
                      Gemini 4 Hydrogen (gemini-4-hydrogen)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{ui.aiLocalNotice}</p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {/* Custom API Key */}
                  <div>
                    <label
                      htmlFor="ai-custom-api-key"
                      className="block text-xs font-medium text-slate-200 mb-1.5"
                    >
                      {ui.aiApiKeyLabel}
                    </label>
                    <div className="relative flex items-center">
                      <input
                        id="ai-custom-api-key"
                        type={showKey ? 'text' : 'password'}
                        autoComplete="off"
                        spellCheck={false}
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          if (errorMessage) setErrorMessage(null);
                        }}
                        placeholder={ui.aiApiKeyPlaceholder}
                        data-testid="ai-custom-key-input"
                        className="w-full h-9 pl-3 pr-9 rounded-md atlas-well text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/70"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((s) => !s)}
                        aria-label={showKey ? 'Hide API key' : 'Show API key'}
                        className="absolute right-2 p-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                      >
                        {showKey ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Gemini Model Selector */}
                  <div>
                    <label
                      htmlFor="ai-model-preset-select"
                      className="block text-xs font-medium text-slate-200 mb-1.5"
                    >
                      {ui.aiModelPresetLabel}
                    </label>
                    <select
                      id="ai-model-preset-select"
                      value={selectedPreset}
                      onChange={(e) => {
                        setSelectedPreset(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      data-testid="ai-model-select"
                      className="w-full h-9 px-2.5 rounded-md atlas-well text-xs text-slate-100 bg-[#05080F] focus:outline-none focus:border-sky-400/70 cursor-pointer"
                    >
                      {GEMINI_MODEL_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label} ({preset.id}) — {preset.desc[language]}
                        </option>
                      ))}
                      <option value={CUSTOM_MODEL_SENTINEL}>{ui.aiModelCustomOption}</option>
                    </select>
                  </div>

                  {selectedPreset === CUSTOM_MODEL_SENTINEL && (
                    <div>
                      <label
                        htmlFor="ai-custom-model-id"
                        className="block text-xs font-medium text-slate-200 mb-1.5"
                      >
                        {ui.aiModelCustomLabel}
                      </label>
                      <input
                        id="ai-custom-model-id"
                        type="text"
                        spellCheck={false}
                        value={customModelText}
                        onChange={(e) => {
                          setCustomModelText(e.target.value);
                          if (errorMessage) setErrorMessage(null);
                        }}
                        placeholder={ui.aiModelCustomPlaceholder}
                        data-testid="ai-custom-model-input"
                        className="w-full h-9 px-3 rounded-md atlas-well text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/70"
                      />
                    </div>
                  )}

                  {/* Optional Custom Base URL */}
                  <div>
                    <label
                      htmlFor="ai-custom-base-url"
                      className="block text-xs font-medium text-slate-200 mb-1.5"
                    >
                      {ui.aiBaseUrlLabel}
                    </label>
                    <input
                      id="ai-custom-base-url"
                      type="text"
                      spellCheck={false}
                      value={baseUrl}
                      onChange={(e) => {
                        setBaseUrl(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      placeholder={ui.aiBaseUrlPlaceholder}
                      data-testid="ai-custom-baseurl-input"
                      className="w-full h-9 px-3 rounded-md atlas-well text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/70"
                    />
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">{ui.aiLocalNotice}</p>
                </div>
              )}

              {errorMessage && (
                <div
                  role="alert"
                  data-testid="ai-config-error"
                  className="px-3 py-2 rounded-md bg-rose-950/55 border border-rose-500/40 text-xs text-rose-200"
                >
                  {errorMessage}
                </div>
              )}

              {/* Footer Actions */}
              <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => {
                    onReset();
                    onClose();
                  }}
                  data-testid="ai-config-reset-btn"
                  className="flex items-center gap-1.5 h-8 px-3 rounded-md atlas-well text-xs text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{ui.aiResetBtn}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="h-8 px-3.5 rounded-md text-xs text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {ui.cancelBtn}
                  </button>
                  <button
                    type="submit"
                    data-testid="ai-config-save-btn"
                    className="h-8 px-4 rounded-md bg-sky-400 hover:bg-sky-300 text-xs font-semibold text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {ui.aiSaveBtn}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
