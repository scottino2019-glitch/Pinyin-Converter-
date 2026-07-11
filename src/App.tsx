import React, { useState, useEffect, useMemo } from 'react';
import { 
  Languages, 
  Volume2, 
  VolumeX, 
  Copy, 
  Check, 
  Trash2, 
  Sparkles, 
  RefreshCw, 
  Info, 
  BookOpen, 
  History, 
  Bookmark, 
  BookmarkCheck, 
  ArrowRightLeft, 
  Code, 
  Eye, 
  HelpCircle, 
  GraduationCap, 
  Play, 
  ChevronRight, 
  Search, 
  ChevronLeft,
  Settings,
  Mic,
  MicOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { pinyin } from 'pinyin-pro';
import { sify, tify } from 'chinese-conv';
import { ConversionOptions, Token, VocabularyItem, HistoryItem } from './types';
import { tokenizeText, applyCaseStyle, convertPinyinNumbersToSymbols, generateRubyHtml } from './utils/pinyinUtils';

// Preset sample phrases for quick conversion
const PRESETS = [
  { text: "你好，世界！", label: "Greeting" },
  { text: "音乐能带给我们快乐和享受。", label: "Polyphones (乐/乐)" },
  { text: "他背着一个沉重的背包，正在背诵古诗。", label: "Polyphones (背/背)" },
  { text: "北京的长城是非常雄伟的风景线。", label: "Travel" },
  { text: "好好学习，天天向上。", label: "Idiom" },
];

export default function App() {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'main' | 'tones' | 'study'>('main');
  
  // Tab 1: Chinese to Pinyin Converter
  const [inputText, setInputText] = useState("你好，世界！音乐带给我们快乐。");
  const [options, setOptions] = useState<ConversionOptions>({
    toneType: 'symbol',
    pattern: 'pinyin',
    nonZh: 'keep',
    caseStyle: 'lower',
    v: false,
  });
  
  // Custom manual overrides for characters (polyphone support)
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  
  // Selected character index for the interactive popover
  const [activeTokenIndex, setActiveTokenIndex] = useState<number | null>(null);

  // Tab 2: Pinyin Numbers to Symbols Converter
  const [numberPinyinInput, setNumberPinyinInput] = useState("ni3 hao3 ma1? Wo3 hen3 hao3, xie4xie5!");
  
  // Tab 3: Vocabulary & Study
  const [vocab, setVocab] = useState<VocabularyItem[]>(() => {
    try {
      const saved = localStorage.getItem('pinyin_vocab_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('pinyin_history_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Copy success indicator state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Study Flashcard Mode State
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Web Speech synthesis settings
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(1.0);

  // Search filter for Vocabulary list
  const [vocabSearch, setVocabSearch] = useState('');

  // HTML Ruby toggle preview/code
  const [rubyViewMode, setRubyViewMode] = useState<'preview' | 'code'>('preview');

  // --- AUDIO SYNTHESIS ---
  const playFallbackAudio = (text: string) => {
    try {
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=zh-CN&client=tw-ob&q=${encodeURIComponent(text)}`;
      const audio = new Audio(url);
      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => setIsSpeaking(false);
      audio.onerror = () => setIsSpeaking(false);
      audio.play().catch(e => {
        console.warn("Audio fallback playback failed:", e);
        setIsSpeaking(false);
      });
    } catch (e) {
      console.error("Fallback audio creation failed:", e);
      setIsSpeaking(false);
    }
  };

  const speakText = (text: string, slow = false) => {
    if (!('speechSynthesis' in window)) {
      playFallbackAudio(text);
      return;
    }
    
    try {
      window.speechSynthesis.cancel();
      
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      
      // Attempt to locate a high-quality Chinese narrator voice
      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find(v => 
        v.lang === 'zh-CN' || 
        v.lang === 'zh-HK' || 
        v.lang === 'zh-TW' || 
        v.lang.toLowerCase().startsWith('zh') || 
        v.name.includes('Chinese') || 
        v.name.includes('Mandarin') ||
        v.name.includes('Google 普通话')
      );
      if (zhVoice) {
        utterance.voice = zhVoice;
      }
      
      utterance.rate = slow ? 0.55 : speechRate;
      utterance.volume = 1.0;
      utterance.pitch = 1.0;
      
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = (e) => {
        console.warn("SpeechSynthesis error, playing fallback:", e);
        setIsSpeaking(false);
        playFallbackAudio(text);
      };
      
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("SpeechSynthesis failed, playing fallback:", err);
      setIsSpeaking(false);
      playFallbackAudio(text);
    }
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  };

  // --- UTILS & HANDLERS ---
  const handleInputChange = (text: string) => {
    setInputText(text);
    setOverrides({}); // Reset overrides when base characters change
    setActiveTokenIndex(null);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  // Process tokens based on input text, options, and user manual overrides
  const tokens = useMemo(() => {
    const rawTokens = tokenizeText(inputText, options);
    // Apply user overrides on polyphones
    return rawTokens.map((token, index) => {
      if (token.isChinese && overrides[index] !== undefined) {
        return {
          ...token,
          pinyin: overrides[index],
        };
      }
      return token;
    });
  }, [inputText, options, overrides]);

  // Combined final string representation of Pinyin
  const finalPinyinString = useMemo(() => {
    return tokens
      .map(t => {
        if (!t.isChinese) return t.char;
        return t.pinyin;
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }, [tokens]);

  // HTML Ruby representation for export
  const rubyHtmlCode = useMemo(() => {
    return generateRubyHtml(tokens);
  }, [tokens]);

  // --- PERSISTENCE LOGIC ---
  // Save Vocabulary
  const handleSaveToVocab = (chinese: string, py: string) => {
    if (!chinese.trim()) return;
    
    // Check if already exists to prevent duplicates
    if (vocab.some(item => item.chinese === chinese && item.pinyin === py)) {
      return;
    }

    const newItem: VocabularyItem = {
      id: Date.now().toString(),
      chinese: chinese.trim(),
      pinyin: py,
      addedAt: new Date().toLocaleDateString(),
      notes: ''
    };
    const updated = [newItem, ...vocab];
    setVocab(updated);
    localStorage.setItem('pinyin_vocab_v1', JSON.stringify(updated));
  };

  const handleDeleteFromVocab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = vocab.filter(item => item.id !== id);
    setVocab(updated);
    localStorage.setItem('pinyin_vocab_v1', JSON.stringify(updated));
    // Reset flashcard index if out of bounds
    if (flashcardIndex >= updated.length) {
      setFlashcardIndex(Math.max(0, updated.length - 1));
    }
  };

  const handleUpdateVocabNotes = (id: string, notes: string) => {
    const updated = vocab.map(item => item.id === id ? { ...item, notes } : item);
    setVocab(updated);
    localStorage.setItem('pinyin_vocab_v1', JSON.stringify(updated));
  };

  // Convert tone numbers to symbols instantly
  const convertedNumberPinyin = useMemo(() => {
    return convertPinyinNumbersToSymbols(numberPinyinInput);
  }, [numberPinyinInput]);

  // --- DEBOUNCED AUTOMATIC HISTORY LOGGING ---
  // Run on primitive dependency variables
  const optionToneType = options.toneType;
  const optionPattern = options.pattern;
  const optionNonZh = options.nonZh;
  const optionCaseStyle = options.caseStyle;
  const optionV = options.v;

  useEffect(() => {
    if (!inputText.trim()) return;
    const handler = setTimeout(() => {
      const currentTokens = tokenizeText(inputText, options);
      const currentPinyin = currentTokens
        .map((t, idx) => {
          if (!t.isChinese) return t.char;
          return overrides[idx] || t.pinyin;
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
        
      if (!currentPinyin) return;

      setHistory(prev => {
        // Prevent storing consecutive duplicates
        if (prev[0]?.chinese === inputText) return prev;
        
        const newItem: HistoryItem = {
          id: Date.now().toString(),
          chinese: inputText.trim().slice(0, 150),
          pinyin: currentPinyin.slice(0, 400),
          convertedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        const updated = [newItem, ...prev.slice(0, 14)]; // Keep 15 items max
        localStorage.setItem('pinyin_history_v1', JSON.stringify(updated));
        return updated;
      });
    }, 2000); // 2-second typing buffer before adding to history log

    return () => clearTimeout(handler);
  }, [inputText, optionToneType, optionPattern, optionNonZh, optionCaseStyle, optionV, overrides]);

  // Handle polyphone custom selection override
  const selectOverrideValue = (tokenIndex: number, val: string) => {
    setOverrides(prev => ({
      ...prev,
      [tokenIndex]: val,
    }));
    setActiveTokenIndex(null);
  };

  // Filter vocabulary by search query
  const filteredVocab = useMemo(() => {
    if (!vocabSearch.trim()) return vocab;
    const q = vocabSearch.toLowerCase();
    return vocab.filter(v => 
      v.chinese.toLowerCase().includes(q) || 
      v.pinyin.toLowerCase().includes(q) || 
      (v.notes && v.notes.toLowerCase().includes(q))
    );
  }, [vocab, vocabSearch]);

  return (
    <div className="min-h-screen bento-bg text-slate-900 antialiased font-sans flex flex-col selection:bg-indigo-100 selection:text-indigo-950">
      
      {/* HEADER SECTION */}
      <header className="border-b border-slate-200/60 bg-white/75 backdrop-blur-md sticky top-0 z-40 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-2xl shadow-xs transition duration-300 hover:rotate-3">
              <Languages className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display tracking-tight text-slate-900 flex items-center gap-2">
                Pinyin Converter
                <span className="text-[10px] font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">Mandarin Utility</span>
              </h1>
              <p className="text-xs text-slate-500 font-medium">Phonetic character translation, tone parsing, and accent mapping</p>
            </div>
          </div>

          {/* MAIN TABS */}
          <nav className="flex gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200/40">
            <button
              id="tab-main"
              onClick={() => setActiveTab('main')}
              className={`px-4.5 py-2 rounded-xl text-xs font-semibold font-display tracking-tight transition-all duration-200 ${
                activeTab === 'main'
                  ? 'bg-white text-indigo-700 shadow-sm font-bold scale-[1.02]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/50'
              }`}
            >
              <span className="flex items-center gap-2">
                <Languages className="w-4 h-4" />
                Character to Pinyin
              </span>
            </button>
            <button
              id="tab-tones"
              onClick={() => setActiveTab('tones')}
              className={`px-4.5 py-2 rounded-xl text-xs font-semibold font-display tracking-tight transition-all duration-200 ${
                activeTab === 'tones'
                  ? 'bg-white text-indigo-700 shadow-sm font-bold scale-[1.02]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/50'
              }`}
            >
              <span className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4" />
                Tone Number Fixer
              </span>
            </button>
            <button
              id="tab-study"
              onClick={() => setActiveTab('study')}
              className={`px-4.5 py-2 rounded-xl text-xs font-semibold font-display tracking-tight transition-all duration-200 relative ${
                activeTab === 'study'
                  ? 'bg-white text-indigo-700 shadow-sm font-bold scale-[1.02]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/50'
              }`}
            >
              <span className="flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Vocabulary Notebook
                {vocab.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                    {vocab.length}
                  </span>
                )}
              </span>
            </button>
          </nav>
        </div>
      </header>

      {/* CORE WORKSPACE CONTENT */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
        
        {/* TAB 1: CHINESE TO PINYIN */}
        {activeTab === 'main' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            
            {/* LEFT COLUMN: INPUT PANEL & PRESETS */}
            <div className="lg:col-span-7 space-y-6">
              
              {/* INPUT AREA */}
              <div className="bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.02)] hover:shadow-lg hover:border-slate-300/80 transition-all duration-300 relative">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4.5">
                  <label className="text-sm font-semibold tracking-tight text-slate-800 font-display flex items-center gap-1.5">
                    Chinese Characters
                    <span className="text-[11px] font-normal text-slate-400 font-mono">(Simplified / Traditional)</span>
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                       id="convert-simplified-btn"
                      onClick={() => {
                        if (inputText) {
                          const converted = sify(inputText);
                          handleInputChange(converted);
                        }
                      }}
                      disabled={!inputText.trim()}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-850 disabled:opacity-40 disabled:cursor-not-allowed transition bg-indigo-50/55 hover:bg-indigo-50 border border-indigo-100/50 px-2.5 py-1 rounded-lg"
                      title="Convert to Simplified Chinese"
                    >
                      To Simplified 简体 🇨🇳
                    </button>
                    <button
                      id="convert-traditional-btn"
                      onClick={() => {
                        if (inputText) {
                          const converted = tify(inputText);
                          handleInputChange(converted);
                        }
                      }}
                      disabled={!inputText.trim()}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-850 disabled:opacity-40 disabled:cursor-not-allowed transition bg-indigo-50/55 hover:bg-indigo-50 border border-indigo-100/50 px-2.5 py-1 rounded-lg"
                      title="Convert to Traditional Chinese"
                    >
                      To Traditional 繁体 🇭🇰
                    </button>
                    <span className="text-slate-200 hidden sm:inline">|</span>
                    <button
                      id="clear-input-btn"
                      onClick={() => handleInputChange("")}
                      className="text-xs font-semibold text-slate-400 hover:text-rose-600 transition duration-200"
                    >
                      Clear Text
                    </button>
                  </div>
                </div>
                
                <textarea
                  id="main-chinese-input"
                  value={inputText}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder="Paste or type Chinese characters here..."
                  className="w-full h-44 bg-slate-50/50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-2xl p-4 text-lg text-slate-900 resize-none outline-none transition focus:ring-1 focus:ring-indigo-500 font-sans"
                />

                {/* Speech Recognition Info & Audio Playback Rate */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-3">
                    <button
                      id="speak-text-btn"
                      onClick={() => {
                        if (isSpeaking) stopSpeaking();
                        else speakText(inputText);
                      }}
                      disabled={!inputText.trim()}
                      className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition duration-200 ${
                        isSpeaking 
                          ? 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-100/50 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed'
                      }`}
                    >
                      {isSpeaking ? (
                        <>
                          <VolumeX className="w-3.5 h-3.5" />
                          Stop Speech
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          Listen (Speech Synth)
                        </>
                      )}
                    </button>

                    <button
                      id="speak-slow-btn"
                      onClick={() => speakText(inputText, true)}
                      disabled={!inputText.trim() || isSpeaking}
                      className="text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50 px-3 py-2 rounded-xl text-xs font-semibold transition bg-white disabled:opacity-50"
                    >
                      Slow Read 🐌
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-mono font-medium">Speed:</span>
                    <select
                      id="speech-speed-select"
                      value={speechRate}
                      onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                      className="text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 outline-none text-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="0.5">0.5x</option>
                      <option value="0.75">0.75x</option>
                      <option value="1.0">1.0x (Normal)</option>
                      <option value="1.25">1.25x</option>
                      <option value="1.5">1.5x</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* QUICK PHRASE PRESETS */}
              <div className="bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.02)] hover:shadow-lg hover:border-slate-300/80 transition-all duration-300">
                <h3 className="text-sm font-bold text-slate-800 font-display mb-3.5 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  Practice Sentences & Presets
                </h3>
                <div className="flex flex-col gap-2.5">
                  {PRESETS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleInputChange(preset.text)}
                      className="text-left w-full p-3 rounded-2xl border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/40 transition duration-200 group flex justify-between items-center text-xs"
                    >
                      <span className="font-semibold text-slate-700 group-hover:text-indigo-950 truncate max-w-[70%] sm:max-w-[80%]">
                        {preset.text}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono font-bold border border-slate-100 bg-slate-50/80 px-2.5 py-1 rounded-lg group-hover:bg-white group-hover:border-indigo-100/50 group-hover:text-indigo-700 transition">
                        {preset.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: OPTIONS & LIVE CONVERSION DISPLAY */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* CONVERSION OPTIONS */}
              <div className="bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.02)] hover:shadow-lg hover:border-slate-300/80 transition-all duration-300">
                <div className="flex items-center gap-2 mb-4.5">
                  <Settings className="w-4.5 h-4.5 text-indigo-600" />
                  <h3 className="text-sm font-bold text-slate-800 font-display">Conversion Settings</h3>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  
                  {/* TONE NOTATION TYPE */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 block font-mono">Tone Style</label>
                    <select
                      id="option-tone-type"
                      value={options.toneType}
                      onChange={(e) => setOptions(prev => ({ ...prev, toneType: e.target.value as any }))}
                      className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none text-slate-700 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition cursor-pointer"
                    >
                      <option value="symbol">Symbol Tones (nǐ)</option>
                      <option value="num">Numbered Tones (ni3)</option>
                      <option value="none">No Tones (ni)</option>
                    </select>
                    <p className="text-[10px] text-slate-400 leading-normal">Stile dei toni: con accenti grafici, numeri o senza toni.</p>
                  </div>

                  {/* DISPLAY MODE PATTERN */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 block font-mono">Pinyin Type</label>
                    <select
                      id="option-pattern"
                      value={options.pattern}
                      onChange={(e) => setOptions(prev => ({ ...prev, pattern: e.target.value as any }))}
                      className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none text-slate-700 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition cursor-pointer"
                    >
                      <option value="pinyin">Full Pinyin</option>
                      <option value="initial">Initials Only</option>
                      <option value="final">Finals Only</option>
                      <option value="first">First Letters Only</option>
                    </select>
                    <p className="text-[10px] text-slate-400 leading-normal">Mostra pinyin intero, o solo consonanti/vocali iniziali.</p>
                  </div>

                  {/* LETTER CASING STYLE */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 block font-mono">Letter Casing</label>
                    <select
                      id="option-case-style"
                      value={options.caseStyle}
                      onChange={(e) => setOptions(prev => ({ ...prev, caseStyle: e.target.value as any }))}
                      className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none text-slate-700 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition cursor-pointer"
                    >
                      <option value="lower">lowercase</option>
                      <option value="upper">UPPERCASE</option>
                      <option value="capitalize">Capitalize First</option>
                    </select>
                    <p className="text-[10px] text-slate-400 leading-normal">Applica maiuscole/minuscole <strong>solo alle lettere Pinyin</strong> (es: nǐ, Nǐ, NǏ), non ai caratteri cinesi.</p>
                  </div>

                  {/* NON CHINESE FILTER */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 block font-mono">Non-Chinese Text</label>
                    <select
                      id="option-non-zh"
                      value={options.nonZh}
                      onChange={(e) => setOptions(prev => ({ ...prev, nonZh: e.target.value as any }))}
                      className="w-full text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl p-2.5 outline-none text-slate-700 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition cursor-pointer"
                    >
                      <option value="keep">Keep characters</option>
                      <option value="remove">Filter out</option>
                    </select>
                    <p className="text-[10px] text-slate-400 leading-normal">Scegli se mostrare o rimuovere <strong>testo occidentale</strong> (es: lettere, punteggiatura, numeri, spazi).</p>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">Represent <strong>ü</strong> with <strong>v</strong> (e.g. lv3)</span>
                  <input
                    id="option-v-checkbox"
                    type="checkbox"
                    checked={options.v}
                    onChange={(e) => setOptions(prev => ({ ...prev, v: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 focus:ring-1"
                  />
                </div>
              </div>

              {/* SAVE TO STUDY NOTEBOOK ACTION */}
              <div className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-[0_10px_30px_-10px_rgba(15,23,42,0.3)] hover:shadow-[0_12px_35px_-8px_rgba(15,23,42,0.4)] hover:scale-[1.01] transition-all duration-300">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-bold font-display">Save to Vocabulary notebook?</h4>
                  <p className="text-xs text-slate-400 font-medium">Save current text and active overrides to local flashcards.</p>
                </div>
                <button
                  id="save-to-notebook-btn"
                  onClick={() => handleSaveToVocab(inputText, finalPinyinString)}
                  disabled={!inputText.trim()}
                  className="flex items-center gap-1.5 bg-white hover:bg-indigo-50 text-slate-950 px-4.5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Bookmark className="w-3.5 h-3.5 text-indigo-600 fill-indigo-600" />
                  Save Phrase
                </button>
              </div>

            </div>

            {/* FULL WIDTH SECTION BELOW: INTERACTIVE RESULTS ROW */}
            <div className="col-span-1 lg:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8 mt-4">
              
              {/* PRIMARY INTERACTIVE RESULTS VIEW (CHARACTER CHIPS) */}
              <div className="md:col-span-8 bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.02)] hover:shadow-lg hover:border-slate-300/80 transition-all duration-300">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <h3 className="text-sm font-bold text-slate-800 font-display">Phonetic Character Alignments</h3>
                  </div>
                  <span className="text-xs text-slate-400 font-semibold">Click characters with multiple readings (Polyphones) to toggle tones</span>
                </div>

                {!inputText ? (
                  <div className="py-12 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200/80 flex flex-col items-center justify-center gap-2">
                    <Languages className="w-8 h-8 text-slate-300" />
                    <span className="text-xs font-medium">Enter some Chinese text to render live character mapping cards</span>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-6 items-end bg-slate-50/50 p-6 rounded-2xl border border-slate-100 min-h-24">
                    {tokens.map((token, index) => {
                      if (!token.isChinese) {
                        return (
                          <span 
                            key={index} 
                            className="text-2xl font-bold text-slate-400 font-mono select-all self-end mb-2.5 inline-block whitespace-pre-wrap"
                          >
                            {token.char}
                          </span>
                        );
                      }

                      const hasOverride = overrides[index] !== undefined;

                      return (
                        <div key={index} className="relative group/tile flex flex-col items-center">
                          
                          {/* PINYIN ACCENT SYMBOL MARK */}
                          <div className="font-mono text-xs font-bold text-indigo-600 mb-1.5 select-all select-none">
                            {token.pinyin || " "}
                          </div>

                          {/* CHINESE CHARACTER BOX */}
                          <button
                            id={`char-tile-${index}`}
                            onClick={() => {
                              // If there are multiple pronunciations, open custom popover
                              if (token.isPolyphone) {
                                setActiveTokenIndex(activeTokenIndex === index ? null : index);
                              } else {
                                // Just play pronunciation if no alternate readings
                                speakText(token.char);
                              }
                            }}
                            className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-semibold border-2 transition shadow-xs cursor-pointer relative ${
                              token.isPolyphone 
                                ? hasOverride
                                  ? 'border-indigo-600 bg-indigo-50/45 text-indigo-950 font-bold shadow-sm'
                                  : 'border-emerald-400/80 bg-white hover:bg-emerald-50/50 text-slate-900 shadow-xs'
                                : 'border-slate-200/80 bg-white hover:border-indigo-300 hover:bg-indigo-50/20 text-slate-900'
                            }`}
                          >
                            {token.char}

                            {/* POLYPHONIC DOT INDICATOR */}
                            {token.isPolyphone && (
                              <span className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${
                                hasOverride ? 'bg-indigo-600' : 'bg-emerald-500'
                              }`} />
                            )}
                          </button>

                          {/* TEXT SPEECH UTTERANCE INDIVIDUAL ICON */}
                          <button
                            id={`pronounce-char-${index}`}
                            title={`Pronounce ${token.char}`}
                            onClick={() => speakText(token.char)}
                            className="mt-1 opacity-0 group-hover/tile:opacity-100 transition duration-150 text-slate-400 hover:text-indigo-600 p-0.5"
                          >
                            <Volume2 className="w-3 h-3" />
                          </button>

                          {/* INTERACTIVE POLYPHONIC DROPDOWN POPOVER */}
                          <AnimatePresence>
                            {activeTokenIndex === index && (
                              <>
                                <div 
                                  className="fixed inset-0 z-40" 
                                  onClick={() => setActiveTokenIndex(null)} 
                                />
                                <motion.div
                                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                                  className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 bg-white rounded-2xl border border-slate-200 shadow-xl p-3.5 z-50 w-44"
                                >
                                  <div className="text-[10px] font-bold text-slate-400 mb-2.5 font-mono uppercase tracking-wider text-center">
                                    Alternate Readings
                                  </div>
                                  <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                                    {token.allPinyins.map((altPy, altIdx) => {
                                      const isSelected = altPy === token.pinyin;
                                      return (
                                        <button
                                          key={altIdx}
                                          onClick={() => selectOverrideValue(index, altPy)}
                                          className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center justify-between transition ${
                                            isSelected 
                                              ? 'bg-indigo-50 text-indigo-700' 
                                              : 'hover:bg-slate-50 text-slate-600'
                                          }`}
                                        >
                                          <span>{altPy}</span>
                                          {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                        </button>
                                      );
                                    })}
                                    {hasOverride && (
                                      <button
                                        id={`reset-override-char-${index}`}
                                        onClick={() => {
                                          setOverrides(prev => {
                                            const next = { ...prev };
                                            delete next[index];
                                            return next;
                                          });
                                          setActiveTokenIndex(null);
                                        }}
                                        className="w-full text-center text-slate-400 hover:text-slate-800 text-[10px] py-1 border-t border-slate-100 mt-1"
                                      >
                                        Reset to Default
                                      </button>
                                    )}
                                  </div>
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* RAW TEXT & EXPORT ACTIONS COLUMN */}
              <div className="md:col-span-4 space-y-6">
                
                {/* SPACES CONVERSION OUTPUT CONTAINER */}
                <div className="bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.02)] hover:shadow-lg hover:border-slate-300/80 transition-all duration-300 relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-slate-800 font-display flex items-center gap-1.5">
                      Pinyin Transcript
                    </span>
                    <button
                      id="copy-transcript-btn"
                      onClick={() => copyToClipboard(finalPinyinString, 'transcript')}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-850 flex items-center gap-1 transition"
                    >
                      {copiedId === 'transcript' ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy Pinyin
                        </>
                      )}
                    </button>
                  </div>

                  <div className="w-full min-h-24 p-4.5 bg-slate-50 rounded-2xl font-mono text-sm text-slate-800 select-all border border-slate-200/50 whitespace-pre-wrap leading-relaxed">
                    {finalPinyinString || <span className="text-slate-400 font-sans italic text-xs">Pinyin output will render here...</span>}
                  </div>
                </div>

                {/* HTML RUBY EXPORT COMPONENT */}
                <div className="bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.02)] hover:shadow-lg hover:border-slate-300/80 transition-all duration-300">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-slate-800 font-display flex items-center gap-1.5">
                      Phonetic Ruby HTML
                    </span>
                    <div className="flex items-center gap-1.5">
                      {/* VIEW PREVIEW VS CODE BUTTON */}
                      <button
                        id="toggle-ruby-preview"
                        onClick={() => setRubyViewMode(rubyViewMode === 'preview' ? 'code' : 'preview')}
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-xl transition"
                        title={rubyViewMode === 'preview' ? "View Raw Code" : "View Preview"}
                      >
                        {rubyViewMode === 'preview' ? (
                          <Code className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>

                      <button
                        id="copy-ruby-html-btn"
                        onClick={() => copyToClipboard(rubyHtmlCode, 'ruby')}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-850 flex items-center gap-1 transition"
                      >
                        {copiedId === 'ruby' ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Copy HTML
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {rubyViewMode === 'preview' ? (
                    <div 
                      className="w-full min-h-24 p-4.5 bg-slate-50 rounded-2xl border border-slate-200/50 overflow-x-auto flex items-center justify-center"
                      dangerouslySetInnerHTML={{ __html: rubyHtmlCode || "<span class='text-slate-400 font-sans italic text-xs'>Preview of annotated ruby HTML...</span>" }}
                    />
                  ) : (
                    <textarea
                      readOnly
                      value={rubyHtmlCode}
                      className="w-full h-24 p-3 bg-slate-900 text-slate-300 rounded-2xl font-mono text-[10px] resize-none outline-none border border-slate-800 leading-tight"
                    />
                  )}
                  <p className="text-[10px] text-slate-400 mt-2 font-semibold leading-relaxed">
                    Ruby tags are native HTML elements supported across major browsers. Ideal for pasting into e-learning websites.
                  </p>
                </div>

              </div>

            </div>

          </div>
        )}

        {/* TAB 2: TONE NUMBER TO SYMBOL FIXER */}
        {activeTab === 'tones' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8 items-start">
            
            {/* CONVERSION INTERFACE */}
            <div className="md:col-span-7 bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.02)] hover:shadow-lg hover:border-slate-300/80 transition-all duration-300 space-y-6">
              <div className="flex items-center gap-2 mb-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
                <h2 className="text-md font-bold font-display tracking-tight text-slate-900">Tone Number to Accent Mark Fixer</h2>
              </div>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                Type or paste pinyin written with numeric tones (e.g. <code>zhong1wen2</code>, <code>lv3xing2</code>) to instantly place accurate accent glyph marks above the proper vowels.
              </p>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-2 font-mono">Numbered Pinyin Input</label>
                <textarea
                  id="tone-number-input"
                  value={numberPinyinInput}
                  onChange={(e) => setNumberPinyinInput(e.target.value)}
                  placeholder="Paste numbered pinyin like 'ni3 hao3 ma1?' or 'nv3-hai2'..."
                  className="w-full h-32 bg-slate-50/50 border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-2xl p-4 text-sm font-mono text-slate-800 resize-none outline-none transition focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-500 block font-mono">Accent Symbols Output</label>
                  <button
                    id="copy-converted-tones-btn"
                    onClick={() => copyToClipboard(convertedNumberPinyin, 'num-pinyin')}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-850 flex items-center gap-1 transition"
                  >
                    {copiedId === 'num-pinyin' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Results
                      </>
                    )}
                  </button>
                </div>
                <div className="w-full min-h-24 p-4.5 bg-indigo-50/20 border border-indigo-100/50 rounded-2xl font-mono text-sm text-slate-900 font-bold select-all leading-relaxed">
                  {convertedNumberPinyin || <span className="text-slate-400 italic font-sans text-xs">Awaiting input...</span>}
                </div>
              </div>
            </div>

            {/* MANDARIN TONES EDUCATIONAL CHART */}
            <div className="md:col-span-5 bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.02)] hover:shadow-lg hover:border-slate-300/80 transition-all duration-300 space-y-6">
              <div className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-800 font-display">Mandarin Tones Reference</h3>
              </div>

              {/* FIVE TONE TILES */}
              <div className="grid grid-cols-5 gap-2 text-center">
                <div className="p-2 bg-red-50/60 rounded-2xl border border-red-100/70">
                  <div className="text-md font-bold text-red-700">ā</div>
                  <div className="text-[9px] text-red-500 font-bold font-mono">1st Tone</div>
                </div>
                <div className="p-2 bg-amber-50/60 rounded-2xl border border-amber-100/70">
                  <div className="text-md font-bold text-amber-700">á</div>
                  <div className="text-[9px] text-amber-500 font-bold font-mono">2nd Tone</div>
                </div>
                <div className="p-2 bg-emerald-50/60 rounded-2xl border border-emerald-100/70">
                  <div className="text-md font-bold text-emerald-700">ǎ</div>
                  <div className="text-[9px] text-emerald-500 font-bold font-mono">3rd Tone</div>
                </div>
                <div className="p-2 bg-blue-50/60 rounded-2xl border border-blue-100/70">
                  <div className="text-md font-bold text-blue-700">à</div>
                  <div className="text-[9px] text-blue-500 font-bold font-mono">4th Tone</div>
                </div>
                <div className="p-2 bg-slate-50/60 rounded-2xl border border-slate-150">
                  <div className="text-md font-bold text-slate-600">a</div>
                  <div className="text-[9px] text-slate-500 font-bold font-mono">Neutral</div>
                </div>
              </div>

              {/* TONE CHART VOWEL GLYPH REFERENCE */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">Tone Placing Vowels Index</h4>
                <div className="divide-y divide-slate-100 text-xs font-mono">
                  <div className="py-2.5 flex justify-between items-center">
                    <span className="font-bold text-slate-500">vowel (a)</span>
                    <span className="text-slate-800 font-bold">ā · á · ǎ · à</span>
                  </div>
                  <div className="py-2.5 flex justify-between items-center">
                    <span className="font-bold text-slate-500">vowel (o)</span>
                    <span className="text-slate-800 font-bold">ō · ó · ǒ · ò</span>
                  </div>
                  <div className="py-2.5 flex justify-between items-center">
                    <span className="font-bold text-slate-500">vowel (e)</span>
                    <span className="text-slate-800 font-bold">ē · é · ě · è</span>
                  </div>
                  <div className="py-2.5 flex justify-between items-center">
                    <span className="font-bold text-slate-500">vowel (i)</span>
                    <span className="text-slate-800 font-bold">ī · í · ǐ · ì</span>
                  </div>
                  <div className="py-2.5 flex justify-between items-center">
                    <span className="font-bold text-slate-500">vowel (u)</span>
                    <span className="text-slate-800 font-bold">ū · ú · ǔ · ù</span>
                  </div>
                  <div className="py-2.5 flex justify-between items-center">
                    <span className="font-bold text-slate-500">vowel (ü) / (v)</span>
                    <span className="text-slate-800 font-bold">ǖ · ǘ · ǚ · ǜ</span>
                  </div>
                </div>
              </div>

              {/* HOW TONES ARE PLACED EXPLANATION */}
              <div className="p-4.5 bg-indigo-50/50 rounded-2xl border border-indigo-100/40 text-[11px] leading-relaxed text-slate-600 space-y-1.5">
                <span className="font-bold text-indigo-900 block flex items-center gap-1 font-display text-xs">
                  <Info className="w-3.5 h-3.5" />
                  Tone Marking Hierarchy Rule
                </span>
                <p className="font-medium">
                  Accent glyph marks are placed on the dominant vowel according to standard Mandarin guidelines:
                </p>
                <ol className="list-decimal pl-4 space-y-1 font-medium">
                  <li>If there is an <strong>a</strong> or <strong>e</strong>, place tone mark on it.</li>
                  <li>If there is an <strong>o</strong>, place tone mark on it.</li>
                  <li>If there is a compound vowel ending in <strong>iu</strong> or <strong>ui</strong>, place the tone mark on the <strong>second</strong> vowel.</li>
                  <li>Otherwise, place it on the remaining vowel (i.e. <strong>i</strong>, <strong>u</strong>, or <strong>ü</strong>).</li>
                </ol>
              </div>

            </div>

          </div>
        )}

        {/* TAB 3: STUDY NOTEBOOK & HISTORIES */}
        {activeTab === 'study' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            
            {/* STUDY CENTER / INTERACTIVE FLASHCARD WIDGET */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.02)] hover:shadow-lg hover:border-slate-300/80 transition-all duration-300 space-y-4">
                <h3 className="text-sm font-bold text-slate-800 font-display flex items-center gap-2">
                  <GraduationCap className="w-4.5 h-4.5 text-indigo-600" />
                  Mini Study Flashcards
                </h3>
                
                {vocab.length === 0 ? (
                  <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200/80 rounded-2xl text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                    <Bookmark className="w-8 h-8 text-slate-300" />
                    <span className="font-semibold">No vocabulary items saved yet. Save a word in the main converter to start reviewing!</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* THE CARD FRAME */}
                    <div 
                      id="study-flashcard"
                      onClick={() => setIsFlipped(!isFlipped)}
                      className="w-full h-48 bg-slate-50/50 hover:bg-slate-50 hover:border-indigo-200/80 rounded-3xl border-2 border-slate-200/60 shadow-xs flex flex-col items-center justify-center p-6 text-center relative cursor-pointer group transition duration-300 overflow-hidden"
                    >
                      <AnimatePresence mode="wait">
                        {!isFlipped ? (
                          <motion.div
                            key="front"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="space-y-2"
                          >
                            <span className="text-[10px] font-mono tracking-widest text-indigo-600 uppercase font-bold bg-indigo-50 px-2.5 py-1 rounded-full">
                              Front
                            </span>
                            <div className="text-4xl font-extrabold text-slate-900 group-hover:scale-105 transition duration-300">
                              {vocab[flashcardIndex]?.chinese}
                            </div>
                            <span className="text-xs text-slate-400 font-semibold block mt-2">Click to flip card</span>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="back"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="space-y-2.5"
                          >
                            <span className="text-[10px] font-mono tracking-widest text-emerald-600 uppercase font-bold bg-emerald-50 px-2.5 py-1 rounded-full">
                              Back / Pronunciation
                            </span>
                            <div className="text-xl font-mono font-bold text-slate-800">
                              {vocab[flashcardIndex]?.pinyin}
                            </div>
                            
                            {vocab[flashcardIndex]?.notes && (
                              <p className="text-xs text-slate-500 font-semibold max-w-44 truncate italic mx-auto">
                                "{vocab[flashcardIndex]?.notes}"
                              </p>
                            )}
 
                            {/* Audio trigger inside card */}
                            <button
                              id="flashcard-speak"
                              onClick={(e) => {
                                e.stopPropagation();
                                speakText(vocab[flashcardIndex]?.chinese);
                              }}
                              className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-xl text-[10px] font-bold transition duration-200"
                            >
                              <Volume2 className="w-3.5 h-3.5 text-indigo-600" />
                              Hear Voice
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
 
                    {/* FLASHCARD PREV/NEXT CONTROLS */}
                    <div className="flex items-center justify-between">
                      <button
                        id="prev-flashcard-btn"
                        onClick={() => {
                          setIsFlipped(false);
                          setFlashcardIndex(prev => prev === 0 ? vocab.length - 1 : prev - 1);
                        }}
                        className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition text-slate-600"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
 
                      <span className="text-xs font-mono text-slate-500 font-bold">
                        {flashcardIndex + 1} / {vocab.length}
                      </span>
 
                      <button
                        id="next-flashcard-btn"
                        onClick={() => {
                          setIsFlipped(false);
                          setFlashcardIndex(prev => prev === vocab.length - 1 ? 0 : prev + 1);
                        }}
                        className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition text-slate-600"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
 
            {/* SAVED WORDS & HISTORICAL LOGS ROW */}
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-12 gap-6 lg:gap-8">
              
              {/* VOCABULARY LIST NOTEBOOK */}
              <div className="md:col-span-7 bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.02)] hover:shadow-lg hover:border-slate-300/80 transition-all duration-300 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-slate-800 font-display flex items-center gap-2">
                    <BookmarkCheck className="w-4.5 h-4.5 text-indigo-600" />
                    My Vocabulary Notebook
                  </h3>
                  
                  {/* Search box for vocab */}
                  {vocab.length > 0 && (
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        id="search-vocab-input"
                        type="text"
                        placeholder="Search vocab..."
                        value={vocabSearch}
                        onChange={(e) => setVocabSearch(e.target.value)}
                        className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs outline-none bg-slate-50/50 focus:bg-white focus:ring-1 focus:ring-indigo-500 w-full sm:w-40 transition"
                      />
                    </div>
                  )}
                </div>
 
                {filteredVocab.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 bg-slate-50/50 border border-dashed border-slate-200/80 rounded-2xl text-xs flex flex-col items-center justify-center gap-2">
                    <Bookmark className="w-8 h-8 text-slate-300" />
                    <span className="font-semibold">
                      {vocabSearch ? "No vocabulary matched your query." : "No saved words yet."}
                    </span>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
                    {filteredVocab.map((item) => (
                      <div 
                        key={item.id} 
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group/vocab-row"
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-lg font-extrabold text-slate-900 select-all font-display">{item.chinese}</span>
                            <span className="text-xs font-mono font-bold text-indigo-600 select-all">{item.pinyin}</span>
                          </div>
                          
                          {/* Inline notes modifier */}
                          <input
                            type="text"
                            placeholder="Add English definition/notes..."
                            value={item.notes || ''}
                            onChange={(e) => handleUpdateVocabNotes(item.id, e.target.value)}
                            className="text-xs text-slate-500 font-semibold bg-transparent hover:bg-slate-50/50 focus:bg-white border-b border-transparent focus:border-slate-300 py-1 px-1.5 rounded-md outline-none w-full transition"
                          />
                        </div>
 
                        <div className="flex items-center gap-2">
                          <button
                            id={`vocab-speak-${item.id}`}
                            onClick={() => speakText(item.chinese)}
                            className="p-1.5 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-xl transition"
                            title="Hear Audio"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            id={`vocab-delete-${item.id}`}
                            onClick={(e) => handleDeleteFromVocab(item.id, e)}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition"
                            title="Delete Item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
 
              {/* LOG HISTORY LOGGING CONTAINER */}
              <div className="md:col-span-5 bg-white rounded-3xl border border-slate-200/60 p-6 md:p-8 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.02)] hover:shadow-lg hover:border-slate-300/80 transition-all duration-300 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800 font-display flex items-center gap-2">
                    <History className="w-4.5 h-4.5 text-slate-500" />
                    Translation History
                  </h3>
                  {history.length > 0 && (
                    <button
                      id="clear-history-btn"
                      onClick={() => {
                        setHistory([]);
                        localStorage.removeItem('pinyin_history_v1');
                      }}
                      className="text-[10px] text-slate-400 hover:text-rose-600 font-bold font-mono transition duration-200"
                    >
                      Clear Log
                    </button>
                  )}
                </div>
 
                {history.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 bg-slate-50/50 border border-dashed border-slate-200/80 rounded-2xl text-xs flex flex-col items-center justify-center gap-2">
                    <History className="w-8 h-8 text-slate-300" />
                    <span className="font-semibold">Your translation history will automatically log here as you type.</span>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {history.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setInputText(item.chinese);
                          setOverrides({});
                          setActiveTab('main');
                        }}
                        className="w-full text-left p-3 rounded-2xl border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/20 transition duration-200 group flex flex-col gap-1 relative overflow-hidden"
                      >
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 w-full mb-1 font-semibold">
                          <span>Converted Phrase</span>
                          <span className="group-hover:text-indigo-600">{item.convertedAt}</span>
                        </div>
                        <div className="text-xs font-bold text-slate-800 group-hover:text-indigo-950 truncate">
                          {item.chinese}
                        </div>
                        <div className="text-[10px] font-mono font-semibold text-slate-500 truncate mt-0.5 leading-none">
                          {item.pinyin}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
 
            </div>
 
          </div>
        )}
 
      </main>
 
      {/* FOOTER BRUTALIST SUB-CREDIT */}
      <footer className="border-t border-slate-100 bg-white/40 backdrop-blur-md py-8 mt-16">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 font-semibold font-mono">
          <div className="flex items-center gap-1.5">
            <span>© 2026</span>
            <span className="font-bold text-slate-500">Pinyin Converter Utility</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px]">
            <span>Powered by pinyin-pro</span>
            <span className="text-slate-300">|</span>
            <span>Accurate tone placement heuristic</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
