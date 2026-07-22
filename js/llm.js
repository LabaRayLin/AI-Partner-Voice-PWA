/**
 * llm.js - Native Google Gemini REST API Client
 * Clean, fast, and 100% reliable direct connection to Google Gemini API
 */

export class LLMClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'gemini-1.5-flash';
    this.temperature = config.temperature ?? 0.7;
  }

  updateConfig(config) {
    if (config.apiKey !== undefined) this.apiKey = config.apiKey.trim();
    if (config.model) this.model = config.model.trim().replace(/^models\//, '');
    if (config.temperature !== undefined) this.temperature = config.temperature;
  }

  /**
   * Stream LLM response from native Google Gemini API
   * @param {Array} messages - [{ role: 'system'|'user'|'assistant'|'model', content: string }]
   * @param {Function} onChunk - Callback (chunkText, fullText)
   * @returns {Promise<string>} Full text response
   */
  async sendMessageStream(messages, onChunk) {
    if (!this.apiKey) {
      throw new Error('請先在設定中輸入有效的 Google Gemini API Key！');
    }

    const primaryModel = (this.model || 'gemini-1.5-flash').replace(/^models\//, '');
    
    // Candidate model list for maximum compatibility
    const modelCandidates = Array.from(new Set([
      primaryModel,
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.5-pro',
      'gemini-2.0-flash'
    ]));

    let lastError = null;

    for (const modelName of modelCandidates) {
      // Try v1 stable endpoint first, then v1beta
      for (const apiVer of ['v1', 'v1beta']) {
        try {
          console.log(`[Gemini API] Trying ${apiVer} with model: ${modelName}`);
          return await this._callGeminiStream(apiVer, modelName, messages, onChunk);
        } catch (err) {
          console.warn(`[Gemini API Warning] ${apiVer}/${modelName} failed:`, err.message);
          lastError = err;
          // If it's an API Key error (400 / 403), don't keep looping model names
          if (err.message.includes('API key not valid') || err.message.includes('400') || err.message.includes('403')) {
            throw err;
          }
        }
      }
    }

    throw lastError || new Error('連線 Google Gemini API 失敗，請確認 API Key 是否正確且已開通權限。');
  }

  async _callGeminiStream(apiVersion, modelName, messages, onChunk) {
    const cleanModel = modelName.replace(/^models\//, '');
    const endpoint = `https://generativelanguage.googleapis.com/${apiVersion}/models/${cleanModel}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;

    let systemInstructionText = '';
    const contentsPayload = [];

    messages.forEach(msg => {
      if (msg.role === 'system') {
        systemInstructionText += (systemInstructionText ? '\n' : '') + msg.content;
      } else {
        const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
        contentsPayload.push({
          role: role,
          parts: [{ text: msg.content || '' }]
        });
      }
    });

    const bodyPayload = {
      contents: contentsPayload,
      generationConfig: {
        temperature: this.temperature,
        maxOutputTokens: 2048,
      }
    };

    if (systemInstructionText) {
      bodyPayload.system_instruction = {
        parts: [{ text: systemInstructionText }]
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedMessage = errText;
      try {
        const json = JSON.parse(errText);
        parsedMessage = json.error?.message || errText;
      } catch (e) {}
      throw new Error(`(${response.status}): ${parsedMessage}`);
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
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed.startsWith('data: ')) {
          try {
            const jsonStr = trimmed.substring(6);
            const parsed = JSON.parse(jsonStr);
            const candidates = parsed.candidates || [];
            if (candidates.length > 0) {
              const parts = candidates[0].content?.parts || [];
              for (const part of parts) {
                if (part.text) {
                  fullContent += part.text;
                  if (onChunk) onChunk(part.text, fullContent);
                }
              }
            }
          } catch (e) {
            console.warn('SSE Parse error:', e);
          }
        }
      }
    }

    if (!fullContent.trim()) {
      throw new Error('Gemini API 未傳回文字回應，請再試一次。');
    }

    return fullContent;
  }
}
