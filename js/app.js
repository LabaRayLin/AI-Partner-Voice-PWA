/**
 * app.js - Main Application Controller for AI Partner & Agents PWA
 * Dedicated for Native Google Gemini API
 */

import { db } from './db.js';
import { PRESET_AGENTS, getAvatarUrl } from './agents.js';
import { LLMClient } from './llm.js';
import { speech } from './speech.js';

class App {
  constructor() {
    this.agents = [];
    this.chats = [];
    this.currentAgent = null;
    this.currentChat = null;
    this.messages = [];
    this.isGenerating = false;
    this.deferredInstallPrompt = null;

    this.llm = new LLMClient();

    // DOM Elements
    this.el = {
      sidebar: document.getElementById('sidebar'),
      sidebarToggleBtn: document.getElementById('sidebar-toggle-btn'),
      mobileMenuBtn: document.getElementById('mobile-menu-btn'),
      agentsList: document.getElementById('agents-list'),
      chatsList: document.getElementById('chats-list'),
      newChatBtn: document.getElementById('new-chat-btn'),
      addAgentBtn: document.getElementById('add-agent-btn'),
      
      // Active Agent Header
      activeAgentAvatar: document.getElementById('active-agent-avatar'),
      activeAgentName: document.getElementById('active-agent-name'),
      activeAgentCategory: document.getElementById('active-agent-category'),
      activeAgentDesc: document.getElementById('active-agent-desc'),
      
      // Messages Container
      messagesContainer: document.getElementById('messages-container'),
      messagesEmptyState: document.getElementById('messages-empty-state'),
      
      // Inputs
      chatInput: document.getElementById('chat-input'),
      sendBtn: document.getElementById('send-btn'),
      micBtn: document.getElementById('mic-btn'),
      micPulse: document.getElementById('mic-pulse'),
      micStatusText: document.getElementById('mic-status-text'),
      
      // Modals
      settingsModal: document.getElementById('settings-modal'),
      openSettingsBtn: document.getElementById('open-settings-btn'),
      closeSettingsBtn: document.getElementById('close-settings-btn'),
      saveSettingsBtn: document.getElementById('save-settings-btn'),
      
      agentModal: document.getElementById('agent-modal'),
      closeAgentBtn: document.getElementById('close-agent-btn'),
      saveAgentBtn: document.getElementById('save-agent-btn'),

      // Settings Inputs
      apiKeyInput: document.getElementById('setting-api-key'),
      modelSelect: document.getElementById('setting-model'),
      speechRateInput: document.getElementById('setting-speech-rate'),
      speechRateVal: document.getElementById('setting-speech-rate-val'),
      autoPlayCheck: document.getElementById('setting-autoplay'),
      voiceSelect: document.getElementById('setting-voice'),

      // PWA Install
      installPwaBtn: document.getElementById('install-pwa-btn')
    };
  }

  async init() {
    await db.init();
    await this.loadSettings();
    await this.initAgents();
    await this.loadChats();
    this.bindEvents();
    this.initPWA();
  }

  // --- Settings ---
  async loadSettings() {
    const apiKey = await db.getSetting('apiKey', '');
    let model = await db.getSetting('model', 'gemini-2.5-flash');
    if (model) model = model.replace(/^models\//, '');

    const speechRate = await db.getSetting('speechRate', 1.0);
    const autoPlay = await db.getSetting('autoPlay', true);
    const voiceName = await db.getSetting('voiceName', '');

    this.llm.updateConfig({ apiKey, model });
    speech.setRate(speechRate);
    speech.autoPlay = autoPlay;
    if (voiceName) speech.setVoice(voiceName);

    // Populate Settings UI
    this.el.apiKeyInput.value = apiKey;
    this.el.modelSelect.value = model || 'gemini-2.5-flash';
    this.el.speechRateInput.value = speechRate;
    this.el.speechRateVal.textContent = `${speechRate}x`;
    this.el.autoPlayCheck.checked = autoPlay;
  }

  async saveSettings() {
    const apiKey = this.el.apiKeyInput.value.trim();
    let model = this.el.modelSelect.value || 'gemini-2.5-flash';
    model = model.replace(/^models\//, '');

    if (apiKey && !apiKey.startsWith('AIzaSy')) {
      this.showToast('提示：Google Gemini API Key 通常以 "AIzaSy" 開頭，請確認是否為 AI Studio Key！', 'info');
    }

    const speechRate = parseFloat(this.el.speechRateInput.value);
    const autoPlay = this.el.autoPlayCheck.checked;
    const voiceName = this.el.voiceSelect.value;

    await db.saveSetting('apiKey', apiKey);
    await db.saveSetting('model', model);
    await db.saveSetting('speechRate', speechRate);
    await db.saveSetting('autoPlay', autoPlay);
    await db.saveSetting('voiceName', voiceName);

    this.llm.updateConfig({ apiKey, model });
    speech.setRate(speechRate);
    speech.autoPlay = autoPlay;
    speech.setVoice(voiceName);

    this.closeModal(this.el.settingsModal);
    this.showToast('Google Gemini 設定已成功儲存！', 'success');
  }

  // --- Agents ---
  async initAgents() {
    let savedAgents = await db.getAgents();

    if (savedAgents.length === 0) {
      for (const preset of PRESET_AGENTS) {
        await db.saveAgent(preset);
      }
      savedAgents = await db.getAgents();
    }

    this.agents = savedAgents;
    this.renderAgents();

    if (this.agents.length > 0) {
      this.selectAgent(this.agents[0]);
    }
  }

  renderAgents() {
    this.el.agentsList.innerHTML = '';

    this.agents.forEach(agent => {
      const card = document.createElement('div');
      card.className = `group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
        this.currentAgent?.id === agent.id
          ? 'bg-indigo-600/20 border border-indigo-500/40 text-white shadow-lg shadow-indigo-500/10'
          : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
      }`;

      card.innerHTML = `
        <img src="${agent.avatarUrl}" alt="${agent.name}" class="w-10 h-10 rounded-xl bg-slate-900/80 p-1 flex-shrink-0 border border-slate-700/50" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <h4 class="font-semibold text-sm truncate">${agent.name}</h4>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-indigo-400 font-mono">${agent.category || 'AI'}</span>
          </div>
          <p class="text-xs text-slate-400 truncate mt-0.5">${agent.description}</p>
        </div>
      `;

      card.onclick = () => this.selectAgent(agent);
      this.el.agentsList.appendChild(card);
    });
  }

  async selectAgent(agent) {
    this.currentAgent = agent;
    this.renderAgents();

    // Update Header
    this.el.activeAgentAvatar.src = agent.avatarUrl;
    this.el.activeAgentName.textContent = agent.name;
    this.el.activeAgentCategory.textContent = agent.category || 'AI Partner';
    this.el.activeAgentDesc.textContent = agent.description;

    // Load or create chat for this agent
    const chatsForAgent = this.chats.filter(c => c.agentId === agent.id);
    if (chatsForAgent.length > 0) {
      this.selectChat(chatsForAgent[0]);
    } else {
      await this.createNewChat();
    }
  }

  // --- Chats ---
  async loadChats() {
    this.chats = await db.getChats();
    this.renderChats();
  }

  renderChats() {
    this.el.chatsList.innerHTML = '';

    this.chats.forEach(chat => {
      const agent = this.agents.find(a => a.id === chat.agentId);
      const isSelected = this.currentChat?.id === chat.id;

      const item = document.createElement('div');
      item.className = `flex items-center justify-between p-2.5 px-3 rounded-lg text-xs cursor-pointer transition-all ${
        isSelected
          ? 'bg-slate-800 text-indigo-300 font-medium border-l-2 border-indigo-500'
          : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
      }`;

      item.innerHTML = `
        <div class="flex items-center gap-2 truncate">
          <span>${agent?.icon || '💬'}</span>
          <span class="truncate">${chat.title || '新對話'}</span>
        </div>
        <button class="delete-chat-btn opacity-0 group-hover:opacity-100 hover:text-red-400 p-1 transition-opacity" title="刪除對話">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
      `;

      item.onclick = (e) => {
        if (e.target.closest('.delete-chat-btn')) {
          e.stopPropagation();
          this.deleteChat(chat.id);
        } else {
          this.selectChat(chat);
        }
      };

      this.el.chatsList.appendChild(item);
    });
  }

  async createNewChat() {
    if (!this.currentAgent) return;

    const newChat = {
      id: 'chat-' + Date.now(),
      agentId: this.currentAgent.id,
      title: `${this.currentAgent.name} - ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await db.saveChat(newChat);
    this.chats.unshift(newChat);
    this.renderChats();
    this.selectChat(newChat);
  }

  async selectChat(chat) {
    this.currentChat = chat;
    this.renderChats();
    this.messages = await db.getMessages(chat.id);
    this.renderMessages();
  }

  async deleteChat(chatId) {
    if (confirm('確定要刪除這記錄對話嗎？')) {
      await db.deleteChat(chatId);
      this.chats = this.chats.filter(c => c.id !== chatId);
      if (this.currentChat?.id === chatId) {
        this.currentChat = null;
        if (this.chats.length > 0) {
          this.selectChat(this.chats[0]);
        } else {
          await this.createNewChat();
        }
      }
      this.renderChats();
    }
  }

  // --- Messages & Rendering ---
  renderMessages() {
    this.el.messagesContainer.innerHTML = '';

    if (this.messages.length === 0) {
      this.el.messagesContainer.appendChild(this.el.messagesEmptyState);
      this.el.messagesEmptyState.classList.remove('hidden');
      return;
    } else {
      this.el.messagesEmptyState.classList.add('hidden');
    }

    this.messages.forEach(msg => {
      const bubble = this.createMessageBubble(msg);
      this.el.messagesContainer.appendChild(bubble);
    });

    this.scrollToBottom();
  }

  createMessageBubble(msg) {
    const isUser = msg.role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `flex gap-3 text-sm ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-4 animate-fade-in`;

    const avatar = document.createElement('img');
    avatar.className = 'w-8 h-8 rounded-full bg-slate-800 p-0.5 border border-slate-700/60 flex-shrink-0';
    avatar.src = isUser
      ? 'https://api.dicebear.com/9.x/avataaars/svg?seed=User123'
      : this.currentAgent?.avatarUrl || PRESET_AGENTS[0].avatarUrl;

    const contentBox = document.createElement('div');
    contentBox.className = `max-w-[82%] sm:max-w-[75%] rounded-2xl p-4 shadow-md leading-relaxed ${
      isUser
        ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-tr-none'
        : 'bg-slate-800/90 text-slate-100 border border-slate-700/60 rounded-tl-none backdrop-blur-md'
    }`;

    const textDiv = document.createElement('div');
    textDiv.className = 'prose prose-invert prose-sm max-w-none break-words space-y-2';
    textDiv.innerHTML = this.formatMarkdown(msg.content);

    contentBox.appendChild(textDiv);

    if (!isUser) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'flex items-center gap-2 mt-2 pt-2 border-t border-slate-700/40 text-xs text-slate-400';
      
      const speakBtn = document.createElement('button');
      speakBtn.className = 'flex items-center gap-1 hover:text-indigo-400 transition-colors py-0.5 px-1.5 rounded hover:bg-slate-700/40';
      speakBtn.innerHTML = `
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/></svg>
        朗讀
      `;
      speakBtn.onclick = () => speech.speak(msg.content);

      const copyBtn = document.createElement('button');
      copyBtn.className = 'flex items-center gap-1 hover:text-indigo-400 transition-colors py-0.5 px-1.5 rounded hover:bg-slate-700/40';
      copyBtn.innerHTML = `
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
        複製
      `;
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(msg.content);
        this.showToast('已複製到剪貼簿！', 'info');
      };

      actionsDiv.appendChild(speakBtn);
      actionsDiv.appendChild(copyBtn);
      contentBox.appendChild(actionsDiv);
    }

    wrapper.appendChild(avatar);
    wrapper.appendChild(contentBox);
    return wrapper;
  }

  formatMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-indigo-300">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic text-slate-300">$1</em>')
      .replace(/`([^`]+)`/g, '<code class="bg-slate-900 px-1.5 py-0.5 rounded text-xs font-mono text-indigo-300">$1</code>')
      .replace(/\n/g, '<br/>');
  }

  scrollToBottom() {
    this.el.messagesContainer.scrollTop = this.el.messagesContainer.scrollHeight;
  }

  // --- Send Message & Stream Response ---
  async sendMessage(userInputText = null) {
    const text = userInputText || this.el.chatInput.value.trim();
    if (!text || this.isGenerating || !this.currentChat) return;

    if (!this.llm.apiKey) {
      this.showToast('請先點擊右上角設定 Google Gemini API Key！', 'error');
      this.openModal(this.el.settingsModal);
      return;
    }

    this.el.chatInput.value = '';
    this.isGenerating = true;
    this.el.sendBtn.disabled = true;

    // 1. Add User Message
    const userMsg = {
      id: 'msg-' + Date.now(),
      chatId: this.currentChat.id,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString()
    };

    await db.saveMessage(userMsg);
    this.messages.push(userMsg);
    this.renderMessages();

    // 2. Prepare LLM System Prompt & History
    const historyPayload = [
      { role: 'system', content: this.currentAgent.prompt || 'You are a helpful English Tutor.' }
    ];

    const recent = this.messages.slice(-10);
    recent.forEach(m => historyPayload.push({ role: m.role, content: m.content }));

    // 3. Create Placeholder Assistant Bubble
    const aiMsgId = 'msg-' + (Date.now() + 1);
    const aiMsg = {
      id: aiMsgId,
      chatId: this.currentChat.id,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString()
    };

    const aiBubble = this.createMessageBubble(aiMsg);
    this.el.messagesContainer.appendChild(aiBubble);
    this.scrollToBottom();

    const aiTextDiv = aiBubble.querySelector('.prose');

    try {
      const fullResponse = await this.llm.sendMessageStream(
        historyPayload,
        (chunk, fullContent) => {
          aiMsg.content = fullContent;
          aiTextDiv.innerHTML = this.formatMarkdown(fullContent);
          this.scrollToBottom();
        }
      );

      await db.saveMessage(aiMsg);
      this.messages.push(aiMsg);

      if (speech.autoPlay) {
        speech.speak(fullResponse);
      }

      this.currentChat.updatedAt = new Date().toISOString();
      await db.saveChat(this.currentChat);

    } catch (err) {
      console.error(err);
      aiTextDiv.innerHTML = `<span class="text-red-400 font-semibold">⚠️ 錯誤: ${err.message || '無法連線至 Gemini API，請檢查 API Key 設定。'}</span>`;
      this.showToast('Gemini API 產生失敗，請檢查 API Key 設定！', 'error');
    } finally {
      this.isGenerating = false;
      this.el.sendBtn.disabled = false;
    }
  }

  // --- Voice Input (STT) ---
  toggleVoiceInput() {
    if (speech.isListening) {
      speech.stopListening();
      return;
    }

    this.el.micPulse.classList.remove('hidden');
    this.el.micStatusText.textContent = '聆聽中... 請開口說話';

    speech.startListening(
      (transcript, isFinal) => {
        this.el.chatInput.value = transcript;
        this.el.micStatusText.textContent = `辨識中: "${transcript}"`;
      },
      (finalTranscript) => {
        this.el.micPulse.classList.add('hidden');
        this.el.micStatusText.textContent = '';
        if (finalTranscript.trim()) {
          this.sendMessage(finalTranscript);
        }
      },
      (error) => {
        this.el.micPulse.classList.add('hidden');
        this.el.micStatusText.textContent = '';
        this.showToast(`語音辨識提示: ${error}`, 'info');
      }
    );
  }

  // --- Modal Helpers ---
  openModal(modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  closeModal(modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const bg = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-emerald-600' : 'bg-indigo-600';
    toast.className = `fixed bottom-6 right-6 ${bg} text-white text-sm px-4 py-2.5 rounded-xl shadow-2xl z-50 animate-bounce flex items-center gap-2`;
    toast.innerHTML = `<span>${message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  // --- Event Bindings ---
  bindEvents() {
    this.el.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    this.el.sendBtn.addEventListener('click', () => this.sendMessage());
    this.el.micBtn.addEventListener('click', () => this.toggleVoiceInput());

    this.el.newChatBtn.addEventListener('click', () => this.createNewChat());

    this.el.sidebarToggleBtn.addEventListener('click', () => {
      this.el.sidebar.classList.toggle('hidden');
    });

    this.el.mobileMenuBtn.addEventListener('click', () => {
      this.el.sidebar.classList.toggle('hidden');
    });

    this.el.openSettingsBtn.addEventListener('click', async () => {
      // Sync form values with current LLM state
      this.el.apiKeyInput.value = this.llm.apiKey;
      this.el.modelSelect.value = this.llm.model || 'gemini-2.5-flash';

      const voices = speech.getEnglishVoices();
      this.el.voiceSelect.innerHTML = '<option value="">預設系統聲音</option>';
      voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})`;
        if (speech.selectedVoice?.name === v.name) opt.selected = true;
        this.el.voiceSelect.appendChild(opt);
      });

      this.openModal(this.el.settingsModal);
    });

    this.el.closeSettingsBtn.addEventListener('click', () => this.closeModal(this.el.settingsModal));
    this.el.saveSettingsBtn.addEventListener('click', () => this.saveSettings());

    this.el.speechRateInput.addEventListener('input', (e) => {
      this.el.speechRateVal.textContent = `${e.target.value}x`;
    });

    this.el.addAgentBtn.addEventListener('click', () => this.openModal(this.el.agentModal));
    this.el.closeAgentBtn.addEventListener('click', () => this.closeModal(this.el.agentModal));
    
    this.el.saveAgentBtn.addEventListener('click', async () => {
      const name = document.getElementById('new-agent-name').value.trim();
      const category = document.getElementById('new-agent-category').value.trim() || '自訂助教';
      const description = document.getElementById('new-agent-desc').value.trim();
      const prompt = document.getElementById('new-agent-prompt').value.trim();

      if (!name || !prompt) {
        this.showToast('請輸入助教名稱與 System Prompt！', 'error');
        return;
      }

      const newAgent = {
        id: 'agent-custom-' + Date.now(),
        key: 'custom-' + Date.now(),
        name: name,
        icon: '🤖',
        avatarUrl: getAvatarUrl(name),
        category: category,
        description: description || '使用者自訂 AI 助教',
        prompt: prompt
      };

      await db.saveAgent(newAgent);
      this.agents.push(newAgent);
      this.renderAgents();
      this.selectAgent(newAgent);
      this.closeModal(this.el.agentModal);
      this.showToast(`成功新增助教「${name}」！`, 'success');
    });
  }

  // --- PWA Installation ---
  initPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      this.el.installPwaBtn.classList.remove('hidden');
    });

    this.el.installPwaBtn.addEventListener('click', async () => {
      if (this.deferredInstallPrompt) {
        this.deferredInstallPrompt.prompt();
        const { outcome } = await this.deferredInstallPrompt.userChoice;
        if (outcome === 'accepted') {
          this.el.installPwaBtn.classList.add('hidden');
        }
        this.deferredInstallPrompt = null;
      }
    });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
          console.log('PWA Service Worker registered:', reg.scope);
        }).catch((err) => {
          console.error('Service Worker registration failed:', err);
        });
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
