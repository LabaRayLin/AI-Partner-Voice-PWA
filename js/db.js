/**
 * db.js - IndexedDB storage for AI Partner PWA
 * Handles persistent storage for:
 * - Agents (Presets + Custom)
 * - Chat Sessions
 * - Messages
 * - App Settings (API Keys, LLM Model, TTS settings)
 */

const DB_NAME = 'AIPartnerVoicePWA';
const DB_VERSION = 1;

class Database {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (e) => {
        console.error('IndexedDB error:', e);
        reject(e);
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Store for Custom/Preset Agents
        if (!db.objectStoreNames.contains('agents')) {
          const agentStore = db.createObjectStore('agents', { keyPath: 'id' });
          agentStore.createIndex('key', 'key', { unique: false });
        }

        // Store for Chat Sessions
        if (!db.objectStoreNames.contains('chats')) {
          const chatStore = db.createObjectStore('chats', { keyPath: 'id' });
          chatStore.createIndex('agentId', 'agentId', { unique: false });
          chatStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Store for Chat Messages
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('chatId', 'chatId', { unique: false });
          msgStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Store for App Settings
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
    });
  }

  // --- Agents CRUD ---
  async getAgents() {
    return this._getAll('agents');
  }

  async saveAgent(agent) {
    return this._put('agents', agent);
  }

  async deleteAgent(id) {
    return this._delete('agents', id);
  }

  // --- Chats CRUD ---
  async getChats() {
    const chats = await this._getAll('chats');
    return chats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  async getChat(id) {
    return this._get('chats', id);
  }

  async saveChat(chat) {
    return this._put('chats', chat);
  }

  async deleteChat(id) {
    await this._delete('chats', id);
    const messages = await this.getMessages(id);
    for (const msg of messages) {
      await this._delete('messages', msg.id);
    }
  }

  // --- Messages CRUD ---
  async getMessages(chatId) {
    const all = await this._getAll('messages');
    return all.filter(m => m.chatId === chatId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  async saveMessage(message) {
    return this._put('messages', message);
  }

  // --- Settings CRUD ---
  async getSetting(key, defaultValue = null) {
    const item = await this._get('settings', key);
    return item ? item.value : defaultValue;
  }

  async saveSetting(key, value) {
    return this._put('settings', { key, value });
  }

  // --- Generic Helpers ---
  _getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  _get(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  _put(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(data);
      req.onsuccess = () => resolve(data);
      req.onerror = () => reject(req.error);
    });
  }

  _delete(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }
}

export const db = new Database();
