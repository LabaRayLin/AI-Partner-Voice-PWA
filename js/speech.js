/**
 * speech.js - Web Native Speech Recognition (STT) and Speech Synthesis (TTS)
 * Mobile (iOS Safari & Android) Optimized with Mixed Chinese/English STT
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

    this.initRecognition();
    this.initVoices();
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

  /**
   * iOS Safari User-Gesture Unlock Helper
   * Call this synchronously inside user click/tap handlers so iOS permits background/async TTS play!
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
    if (!this.voices || this.voices.length === 0) {
      this.voices = this.synth.getVoices();
    }
    // Filter voices starting with 'en' (en-US, en-GB, en-AU, etc.)
    return (this.voices || []).filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
  }

  setVoice(voiceName) {
    if (!voiceName) return;
    const englishVoices = this.getEnglishVoices();
    const found = (this.voices || []).find(v => v.name === voiceName);

    if (found) {
      this.selectedVoice = found;
    } else if (englishVoices.length > 0) {
      // Fallback if saved voice name from another OS/device doesn't exist on this mobile OS
      this.selectedVoice = englishVoices.find(v => 
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
    if (!this.synth) return;

    // Fix iOS Safari stuck speech state
    try {
      this.synth.cancel();
      if (this.synth.paused) {
        this.synth.resume();
      }
    } catch (e) {}

    const englishVoices = this.getEnglishVoices();

    // Clean markdown syntax for speech
    const cleanText = text
      .replace(/```[\s\S]*?```/g, '') // remove code blocks
      .replace(/[\#\*\_\~\`]/g, '') // remove markdown symbols
      .replace(/\[(.*?)\]\(.*?\)/g, '$1') // link formatting
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
      if (onStart) onStart();
    };

    utterance.onend = () => {
      if (onEnd) onEnd();
    };

    utterance.onerror = (err) => {
      console.error('Speech synthesis error:', err);
      if (onEnd) onEnd();
    };

    try {
      this.synth.speak(utterance);
      // Extra iOS Safari workaround: resume synth if iOS accidentally pauses
      if (this.synth.paused) {
        this.synth.resume();
      }
    } catch (e) {
      console.error('Failed to trigger speech:', e);
    }
  }

  stopSpeaking() {
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch (e) {}
    }
  }
}

export const speech = new SpeechManager();
