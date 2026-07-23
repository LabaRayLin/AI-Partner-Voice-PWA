/**
 * speech.js - Web Native Speech Recognition (STT) & Multi-Engine Speech Synthesis (TTS)
 * Supports Google Cloud HD Neural Human Voices (US/UK/AU) & System Web Speech
 */

export class SpeechManager {
  constructor() {
    this.synth = window.speechSynthesis;
    this.recognition = null;
    this.isListening = false;
    this.voices = [];
    this.selectedVoice = null;
    this.rate = 1.0; // Speech speed rate
    this.pitch = 1.0;
    this.autoPlay = true;
    this.recLang = 'zh-TW'; // Default to zh-TW for seamless mixed Chinese + English recognition
    this.ttsEngine = 'google-hd-us'; // Default to Google HD Audio for natural human voice
    this.currentAudio = null;
    this.wakeLock = null;

    this.initRecognition();
    this.initVoices();
    this.initMediaSession();
  }

  // --- Speech Recognition (STT) ---
  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('Web Speech Recognition API is not supported in this browser.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = false; // Stop when user stops speaking
    this.recognition.interimResults = true; // Show real-time interim transcript
    this.recognition.lang = this.recLang || 'zh-TW';
  }

  setRecLang(lang) {
    this.recLang = lang || 'zh-TW';
    if (this.recognition) {
      this.recognition.lang = this.recLang;
    }
  }

  setTTSEngine(engine) {
    this.ttsEngine = engine || 'google-hd-us';
  }

  startListening(onResult, onEnd, onError, onVolumeChange) {
    if (!this.recognition) {
      if (onError) onError('您的瀏覽器不支援 Web Speech 語音辨識功能。');
      return;
    }

    if (this.isListening) {
      this.stopListening();
    }

    // Set active language right before starting
    this.recognition.lang = this.recLang || 'zh-TW';

    let finalTranscript = '';

    this.recognition.onstart = () => {
      this.isListening = true;
      if (onVolumeChange) onVolumeChange(true);
    };

    this.recognition.onresult = (event) => {
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      if (onResult) {
        onResult(finalTranscript || interimTranscript, !!finalTranscript);
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      this.isListening = false;
      if (onVolumeChange) onVolumeChange(false);
      if (onError) onError(event.error);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (onVolumeChange) onVolumeChange(false);
      if (onEnd) onEnd(finalTranscript);
    };

    try {
      this.recognition.start();
    } catch (e) {
      console.error('Failed to start recognition:', e);
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  // --- Speech Synthesis (TTS) ---
  initVoices() {
    if (!this.synth) return;

    const loadVoices = () => {
      this.voices = this.synth.getVoices();
      const englishVoices = this.getEnglishVoices();
      if (englishVoices.length > 0 && !this.selectedVoice) {
        // Preferred iOS & Android English voice matching
        this.selectedVoice = englishVoices.find(v => 
          v.name.includes('Enhanced') ||
          v.name.includes('Premium') ||
          v.name.includes('Samantha') || 
          v.name.includes('Natural') || 
          v.name.includes('Google') || 
          v.name.includes('Karen') || 
          v.name.includes('Daniel') ||
          v.name.includes('Ava')
        ) || englishVoices[0];
      }
    };

    loadVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = loadVoices;
    }
  }

  // --- CarPlay & Lock Screen Media Session API ---
  initMediaSession() {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: '戶外品牌商務口說教練',
          artist: 'AI Partner Voice',
          album: '英語口語 PWA',
          artwork: [
            { src: 'assets/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
          ]
        });

        navigator.mediaSession.setActionHandler('play', () => {
          this.unlock();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          this.stopSpeaking();
        });
      } catch (e) {
        console.warn('MediaSession init warning:', e);
      }
    }
  }

  // --- Screen Wake Lock for Driving Mode ---
  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('Screen Wake Lock active');
      } catch (e) {
        console.warn('Wake Lock request failed:', e);
      }
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      try {
        this.wakeLock.release();
        this.wakeLock = null;
      } catch (e) {}
    }
  }

  /**
   * iOS Safari User-Gesture Unlock Helper
   */
  unlock() {
    if (!this.synth) return;
    try {
      this.synth.resume();
      const silentUtterance = new SpeechSynthesisUtterance(' ');
      silentUtterance.volume = 0.01;
      silentUtterance.rate = 10.0; // Play instantly
      this.synth.speak(silentUtterance);
    } catch (e) {
      console.warn('TTS Unlock warning:', e);
    }
  }

  getEnglishVoices() {
    if (!this.synth) return [];
    // Always fetch latest system voices
    this.voices = this.synth.getVoices();
    return (this.voices || []).filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
  }

  setVoice(voiceName) {
    if (!voiceName) return;
    const englishVoices = this.getEnglishVoices();
    const found = (this.voices || []).find(v => v.name === voiceName);

    if (found) {
      this.selectedVoice = found;
    } else if (englishVoices.length > 0) {
      this.selectedVoice = englishVoices.find(v => 
        v.name.includes('Enhanced') ||
        v.name.includes('Premium') ||
        v.name.includes('Samantha') || 
        v.name.includes('Natural') || 
        v.name.includes('Google') ||
        v.name.includes('Karen')
      ) || englishVoices[0];
    }
  }

  setRate(rate) {
    this.rate = parseFloat(rate) || 1.0;
  }

  speak(text, onStart, onEnd) {
    this.stopSpeaking();

    // Check if user selected Cloud HD Neural Audio Engine
    if (this.ttsEngine && this.ttsEngine.startsWith('google-hd')) {
      let lang = 'en';
      if (this.ttsEngine === 'google-hd-uk') lang = 'en-gb';
      if (this.ttsEngine === 'google-hd-au') lang = 'en-au';
      
      this.playCloudTTS(text, lang, onStart, onEnd);
      return;
    }

    // Fallback to System Web Speech
    this._speakSystemTTS(text, onStart, onEnd);
  }

  // --- Cloud HD Audio Stream Player ---
  playCloudTTS(text, lang = 'en', onStart, onEnd) {
    const cleanText = text
      .replace(/```[\s\S]*?```/g, '') // remove code blocks
      .replace(/[\#\*\_\~\`]/g, '') // remove markdown symbols
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // link formatting
      .replace(/\n+/g, ' ')
      .trim();

    if (!cleanText) {
      if (onEnd) onEnd();
      return;
    }

    const chunks = this._splitTextIntoChunks(cleanText, 170);
    this._playChunksSequentially(chunks, lang, onStart, onEnd);
  }

  _splitTextIntoChunks(text, maxLength = 170) {
    const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
    const chunks = [];
    let current = '';

    for (const sentence of sentences) {
      if ((current + sentence).length <= maxLength) {
        current += sentence;
      } else {
        if (current) chunks.push(current.trim());
        if (sentence.length <= maxLength) {
          current = sentence;
        } else {
          const words = sentence.split(' ');
          let wordChunk = '';
          for (const w of words) {
            if ((wordChunk + ' ' + w).length <= maxLength) {
              wordChunk += (wordChunk ? ' ' : '') + w;
            } else {
              if (wordChunk) chunks.push(wordChunk.trim());
              wordChunk = w;
            }
          }
          current = wordChunk;
        }
      }
    }
    if (current) chunks.push(current.trim());
    return chunks;
  }

  _playChunksSequentially(chunks, lang, onStart, onEnd) {
    if (chunks.length === 0) {
      if (onEnd) onEnd();
      return;
    }

    let index = 0;
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'playing';
    }
    if (onStart) onStart();

    const playNext = () => {
      if (index >= chunks.length) {
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
        if (onEnd) onEnd();
        return;
      }

      const chunkText = chunks[index];
      index++;

      const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunkText)}&tl=${lang}&client=tw-ob`;
      const audio = new Audio();
      audio.src = url;
      audio.playbackRate = this.rate || 1.0;
      this.currentAudio = audio;

      audio.onended = () => {
        playNext();
      };

      audio.onerror = (err) => {
        console.warn('Cloud Audio chunk play warning:', err);
        playNext();
      };

      audio.play().catch(err => {
        console.warn('Cloud Audio play catch:', err);
        // If HTML5 audio is blocked by iOS, fallback to System TTS
        this._speakSystemTTS(chunks.slice(index - 1).join(' '), null, onEnd);
      });
    };

    playNext();
  }

  _speakSystemTTS(text, onStart, onEnd) {
    if (!this.synth) return;

    try {
      this.synth.cancel();
      if (this.synth.paused) {
        this.synth.resume();
      }
    } catch (e) {}

    const englishVoices = this.getEnglishVoices();
    const cleanText = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[\#\*\_\~\`]/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/\n+/g, ' ')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;

    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    } else if (englishVoices.length > 0) {
      utterance.voice = englishVoices[0];
    } else {
      utterance.lang = 'en-US';
    }

    utterance.onstart = () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      if (onStart) onStart();
    };

    utterance.onend = () => {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      if (onEnd) onEnd();
    };

    utterance.onerror = (err) => {
      console.error('Speech synthesis error:', err);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      if (onEnd) onEnd();
    };

    try {
      this.synth.speak(utterance);
      if (this.synth.paused) {
        this.synth.resume();
      }
    } catch (e) {
      console.error('Failed to trigger speech:', e);
    }
  }

  stopSpeaking() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio = null;
      } catch (e) {}
    }
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch (e) {}
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused';
    }
  }
}

export const speech = new SpeechManager();
