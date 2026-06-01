import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { SYSTEM_PROMPT } from './prompt';

export type ProviderName = 'claude' | 'openai' | 'gemini' | 'local' | 'custom';

export interface ProviderConfig {
  provider: ProviderName;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODELS: Record<ProviderName, string> = {
  claude: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash',
  local: 'llama3',
  custom: 'gpt-4o',
};

export async function callProvider(
  userMessage: string,
  config: ProviderConfig & { _systemPromptOverride?: string }
): Promise<string> {
  const model = config.model || DEFAULT_MODELS[config.provider];
  const systemPrompt = config._systemPromptOverride ?? SYSTEM_PROMPT;

  switch (config.provider) {
    case 'claude': {
      const client = new Anthropic({
        apiKey: config.apiKey,
        dangerouslyAllowBrowser: true,
      });
      const response = await client.messages.create({
        model,
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      });
      const block = response.content[0];
      if (block.type !== 'text') throw new Error('Unexpected response type from Claude');
      return block.text;
    }

    case 'openai': {
      const client = new OpenAI({
        apiKey: config.apiKey,
        dangerouslyAllowBrowser: true,
      });
      const response = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 2048,
        temperature: 0.3,
      });
      return response.choices[0]?.message?.content ?? '';
    }

    case 'gemini': {
      const genAI = new GoogleGenerativeAI(config.apiKey);
      const geminiModel = genAI.getGenerativeModel({
        model,
        systemInstruction: systemPrompt,
      });
      const result = await geminiModel.generateContent(userMessage);
      return result.response.text();
    }

    case 'local':
    case 'custom': {
      const baseUrl = config.baseUrl?.replace(/\/$/, '') || 'http://localhost:11434';
      const endpoint = `${baseUrl}/v1/chat/completions`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          max_tokens: 2048,
          temperature: 0.3,
        }),
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Provider error ${response.status}: ${err}`);
      }
      const data = await response.json();
      return data.choices?.[0]?.message?.content ?? '';
    }

    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}
