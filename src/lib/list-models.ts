import type { ProviderConfig } from './providers';

export async function listModels(config: ProviderConfig): Promise<string[]> {
  switch (config.provider) {
    case 'claude':
      return listClaude(config.apiKey);
    case 'openai':
      return listOpenAI(config.apiKey);
    case 'gemini':
      return listGemini(config.apiKey);
    case 'local':
    case 'custom':
      return listOpenAICompat(config.baseUrl || 'http://localhost:11434', config.apiKey);
    default:
      return [];
  }
}

async function listClaude(apiKey: string): Promise<string[]> {
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.data as Array<{ id: string }>)
    .map(m => m.id)
    .sort((a, b) => b.localeCompare(a));
}

async function listOpenAI(apiKey: string): Promise<string[]> {
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.data as Array<{ id: string }>)
    .map(m => m.id)
    .filter(id => id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3'))
    .sort((a, b) => b.localeCompare(a));
}

async function listGemini(apiKey: string): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.models as Array<{ name: string; supportedGenerationMethods?: string[] }>)
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => m.name.replace('models/', ''))
    .sort((a, b) => b.localeCompare(a));
}

async function listOpenAICompat(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/v1/models`;
  const res = await fetch(url, {
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  });
  if (!res.ok) {
    // Ollama native fallback
    const ollamaUrl = `${baseUrl.replace(/\/$/, '')}/api/tags`;
    const r2 = await fetch(ollamaUrl);
    if (!r2.ok) throw new Error(`Could not list models from ${url}`);
    const d2 = await r2.json();
    return (d2.models as Array<{ name: string }>).map(m => m.name);
  }
  const data = await res.json();
  return (data.data as Array<{ id: string }>).map(m => m.id).sort((a, b) => b.localeCompare(a));
}
