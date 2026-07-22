/**
 * llm.js - Native Google Gemini REST API Client
 * Clean, fast, and 100% reliable direct connection to Google Gemini API
 */

export class LLMClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || '';
    this.model = config.model || 'gemini-2.0-flash';
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
      throw new Error('請先輸入 Google Gemini API Key！');
    }

    let selectedModel = (this.model || 'gemini-2.0-flash').replace(/^models\//, '');

    try {
      return await this._callGeminiAPI(selectedModel, messages, onChunk);
    } catch (err) {
      console.warn(`[Gemini API] Primary model ${selectedModel} failed:`, err.message);
      // Auto Fallback if the selected model is not available
      if (selectedModel !== 'gemini-1.5-flash') {
        console.info('[Gemini API] Automatically falling back to gemini-1.5-flash...');
        return await this._callGeminiAPI('gemini-1.5-flash', messages, onChunk);
      }
      throw err;
    }
  }

  async _callGeminiAPI(modelName, messages, onChunk) {
    const cleanModel = modelName.replace(/^models\//, '');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:streamGenerateContent?alt=sse&key=${encodeURIComponent(this.apiKey)}`;

    // Separate system instruction from conversation contents
    let systemInstructionText = '';
    const contentsPayload = [];

    messages.forEach(msg => {
      if (msg.role === 'system') {
        systemInstructionText += (systemInstructionText ? '\n' : '') + msg.content;
      } else {
        // Gemini expects 'user' or 'model' (not 'assistant')
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
      throw new Error(`Google Gemini API 錯誤 (${response.status}): ${parsedMessage}`);
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
            console.warn('Error parsing SSE JSON:', line, e);
          }
        }
      }
    }

    return fullContent;
  }
}
