/**
 * llm.js - Multi-Provider LLM Integration
 * Supports: Google Gemini, OpenAI, DeepSeek, Ollama (Local), Custom OpenAI-Compatible APIs
 */

export class LLMClient {
  constructor(config = {}) {
    this.provider = config.provider || 'gemini'; // 'gemini' | 'openai' | 'deepseek' | 'ollama' | 'custom'
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai';
    this.model = config.model || 'gemini-1.5-flash';
    this.temperature = config.temperature ?? 0.7;
  }

  updateConfig(config) {
    if (config.provider) this.provider = config.provider;
    if (config.apiKey !== undefined) this.apiKey = config.apiKey;
    if (config.baseUrl) this.baseUrl = config.baseUrl;
    if (config.model) this.model = config.model;
    if (config.temperature !== undefined) this.temperature = config.temperature;
  }

  getEndpoint() {
    let url = this.baseUrl.replace(/\/+$/, '');
    if (this.provider === 'ollama') {
      if (!url.endsWith('/v1')) {
        url = url + '/v1';
      }
    }
    return `${url}/chat/completions`;
  }

  /**
   * Stream LLM response chunk by chunk
   * @param {Array} messages - [{ role: 'system'|'user'|'assistant', content: string }]
   * @param {Function} onChunk - Callback for incremental text (chunkText, fullText)
   * @returns {Promise<string>} Full response text
   */
  async sendMessageStream(messages, onChunk) {
    const endpoint = this.getEndpoint();
    let modelName = (this.model || '').trim();

    if (this.provider === 'gemini' || this.baseUrl.includes('googleapis.com')) {
      modelName = modelName.replace(/^models\//, '');
      if (!modelName || modelName.startsWith('gpt-') || modelName.startsWith('deepseek') || modelName.startsWith('llama')) {
        modelName = 'gemini-1.5-flash';
      }
    }

    try {
      return await this._doFetchStream(endpoint, modelName, messages, onChunk);
    } catch (err) {
      // Seamless Fallback: If requested model returns 404 from Gemini API, auto-retry with gemini-1.5-flash
      if ((this.provider === 'gemini' || this.baseUrl.includes('googleapis.com')) && err.message.includes('404') && modelName !== 'gemini-1.5-flash') {
        console.warn(`[Gemini Fallback] Model ${modelName} returned 404. Retrying automatically with gemini-1.5-flash...`);
        return await this._doFetchStream(endpoint, 'gemini-1.5-flash', messages, onChunk);
      }
      throw err;
    }
  }

  async _doFetchStream(endpoint, modelName, messages, onChunk) {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
      if (this.provider === 'gemini' || this.baseUrl.includes('googleapis.com')) {
        headers['x-goog-api-key'] = this.apiKey;
      }
    }

    const payload = {
      model: modelName,
      messages: messages,
      temperature: this.temperature,
      stream: true,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API Request Failed (${response.status}): ${errText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue; // Skip comments/pings
        if (trimmed === 'data: [DONE]') continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const jsonStr = trimmed.substring(6);
            const parsed = JSON.parse(jsonStr);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullContent += delta;
              if (onChunk) onChunk(delta, fullContent);
            }
          } catch (e) {
            console.warn('Error parsing SSE line:', line, e);
          }
        }
      }
    }

    return fullContent;
  }
}
