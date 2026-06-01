import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, ChevronDown, RefreshCw, Check } from 'lucide-react';
import type { ProviderConfig, ProviderName } from '../lib/providers';
import { listModels } from '../lib/list-models';

const PROVIDERS: { value: ProviderName; label: string; keyPlaceholder: string; defaultModel: string }[] = [
  { value: 'claude',  label: 'Claude (Anthropic)',          keyPlaceholder: 'sk-ant-…',          defaultModel: 'claude-sonnet-4-6' },
  { value: 'openai',  label: 'OpenAI (ChatGPT)',            keyPlaceholder: 'sk-…',              defaultModel: 'gpt-4o' },
  { value: 'gemini',  label: 'Google Gemini',               keyPlaceholder: 'AIza…',             defaultModel: 'gemini-2.0-flash' },
  { value: 'local',   label: 'Local (Ollama)',              keyPlaceholder: '(no key needed)',   defaultModel: 'llama3' },
  { value: 'custom',  label: 'Custom (Groq / Mistral / …)', keyPlaceholder: 'your-api-key',      defaultModel: '' },
];

interface Props {
  config: ProviderConfig;
  onChange: (c: ProviderConfig) => void;
}

export default function ApiConfig({ config, onChange }: Props) {
  const [showKey, setShowKey] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const modelDropRef = useRef<HTMLDivElement>(null);

  const provider = PROVIDERS.find(p => p.value === config.provider) ?? PROVIDERS[0];

  // Load saved config once on mount
  useEffect(() => {
    const saved = localStorage.getItem('fyr-api-config');
    if (saved) {
      try { onChange(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  // Close model dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelDropRef.current && !modelDropRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const update = (patch: Partial<ProviderConfig>) => {
    const next = { ...config, ...patch };
    onChange(next);
    localStorage.setItem('fyr-api-config', JSON.stringify(next));
  };

  const fetchModels = async () => {
    if (!config.apiKey && config.provider !== 'local') return;
    setFetchingModels(true);
    setModelError(null);
    setModels([]);
    try {
      const list = await listModels(config);
      setModels(list);
      setModelOpen(true);
    } catch (e) {
      setModelError(e instanceof Error ? e.message : 'Failed to fetch models');
    } finally {
      setFetchingModels(false);
    }
  };

  const selectModel = (m: string) => {
    update({ model: m });
    setModelOpen(false);
  };

  const canFetchModels = config.provider === 'local' || !!config.apiKey.trim();

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-200">AI Provider</h3>

      {/* Provider selector */}
      <div className="relative">
        <button
          onClick={() => setProviderOpen(o => !o)}
          className="w-full flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 hover:border-gray-600 transition-colors"
        >
          {provider.label}
          <ChevronDown size={14} className={providerOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>
        {providerOpen && (
          <div className="absolute z-20 top-full mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 overflow-hidden shadow-xl">
            {PROVIDERS.map(p => (
              <button
                key={p.value}
                onClick={() => { update({ provider: p.value, model: '', apiKey: config.provider === p.value ? config.apiKey : '' }); setProviderOpen(false); setModels([]); setModelError(null); }}
                className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between
                  ${config.provider === p.value ? 'bg-green-400/10 text-green-400' : 'text-gray-300 hover:bg-gray-700'}`}
              >
                {p.label}
                {config.provider === p.value && <Check size={13} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* API Key */}
      {config.provider !== 'local' && (
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={config.apiKey}
            onChange={e => update({ apiKey: e.target.value })}
            placeholder={provider.keyPlaceholder}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-green-500 pr-9"
          />
          <button
            onClick={() => setShowKey(s => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      )}

      {/* Base URL for local/custom */}
      {(config.provider === 'local' || config.provider === 'custom') && (
        <input
          type="text"
          value={config.baseUrl ?? ''}
          onChange={e => update({ baseUrl: e.target.value })}
          placeholder="Base URL: http://localhost:11434"
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-green-500"
        />
      )}

      {/* Model picker */}
      <div className="relative" ref={modelDropRef}>
        <div className="flex gap-2">
          <input
            type="text"
            value={config.model ?? ''}
            onChange={e => update({ model: e.target.value })}
            placeholder={`Model (default: ${provider.defaultModel})`}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-green-500"
          />
          <button
            onClick={fetchModels}
            disabled={!canFetchModels || fetchingModels}
            title="Fetch available models"
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-400 hover:text-gray-200 hover:border-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            <RefreshCw size={13} className={fetchingModels ? 'animate-spin' : ''} />
            {fetchingModels ? 'Loading…' : 'List Models'}
          </button>
        </div>

        {/* Model dropdown */}
        {modelOpen && models.length > 0 && (
          <div className="absolute z-20 top-full mt-1 w-full rounded-lg border border-gray-700 bg-gray-800 overflow-y-auto max-h-56 shadow-xl">
            {models.map(m => (
              <button
                key={m}
                onClick={() => selectModel(m)}
                className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors flex items-center justify-between
                  ${config.model === m ? 'bg-green-400/10 text-green-400' : 'text-gray-300 hover:bg-gray-700'}`}
              >
                {m}
                {config.model === m && <Check size={12} />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Errors / hints */}
      {modelError && (
        <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 break-all">
          {modelError}
        </p>
      )}

      {config.provider === 'local' && (
        <p className="text-xs text-amber-400/80 bg-amber-400/5 border border-amber-400/20 rounded-lg px-3 py-2">
          Start Ollama with: <code className="font-mono">OLLAMA_ORIGINS=* ollama serve</code>
        </p>
      )}
    </div>
  );
}
