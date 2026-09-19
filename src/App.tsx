import React, { useState } from "react";
import {
  Sliders,
  Play,
  RotateCcw,
  Clock,
  FolderPlus,
  Trash2,
  Volume2,
  VolumeX,
  BookOpen,
  X,
  ShieldCheck,
  Check
} from "lucide-react";

interface VoiceModel {
  key: string;
  name: string;
  accent: string;
  gender: string;
  description: string;
}

interface HistoryItem {
  id: number;
  title: string;
  text: string;
  voiceKey: string;
  voiceName: string;
  speed: number;
  pauseSilence: number;
  wordCount: number;
  createdAt: string;
}

interface ProjectItem {
  id: number;
  name: string;
  chapters: { id: number; title: string; wordCount: number }[];
}

const VOICES: VoiceModel[] = [
  { key: "en_US-lessac-high", name: "Lessac", accent: "American", gender: "Female", description: "Clear, warm narrative tone" },
  { key: "en_US-amy-medium", name: "Amy", accent: "American", gender: "Female", description: "Natural, expressive conversational" },
  { key: "en_US-ryan-high", name: "Ryan", accent: "American", gender: "Male", description: "Deep, articulated documentary tone" },
  { key: "en_US-danny-low", name: "Danny", accent: "American", gender: "Male", description: "Direct, rhythmic male voice" },
  { key: "en_GB-alan-medium", name: "Alan", accent: "British", gender: "Male", description: "Refined British literary narrator" },
  { key: "en_GB-southern_english_female-low", name: "Southern", accent: "British", gender: "Female", description: "Gentle British female accent" },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<"studio" | "history" | "projects">("studio");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("en_US-lessac-high");
  const [speed, setSpeed] = useState(1.0);
  const [pauseSilence, setPauseSilence] = useState(0.2);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTrack, setActiveTrack] = useState<{ title: string; voice: string } | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [previewingVoiceKey, setPreviewingVoiceKey] = useState<string | null>(null);

  // Clean slate: no random mock history items or auto-tags
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Clean slate: no random pre-populated mock projects
  const [projects, setProjects] = useState<ProjectItem[]>([]);

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;

  const currentVoice = VOICES.find(v => v.key === selectedVoice) || VOICES[0];

  const playVoicePreview = (voiceKey: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    // If already playing this voice, stop it
    if (previewingVoiceKey === voiceKey) {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setPreviewingVoiceKey(null);
      return;
    }

    const voice = VOICES.find(v => v.key === voiceKey) || VOICES[0];
    setSelectedVoice(voiceKey);
    setPreviewingVoiceKey(voiceKey);

    const samplePhrase = `Hello, this is a preview of the ${voice.name} voice. Clear, natural speech for your reading.`;

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(samplePhrase);
      utterance.rate = speed;

      const availableVoices = window.speechSynthesis.getVoices();
      const isBritish = voice.accent === "British";
      const isFemale = voice.gender === "Female";
      const targetLang = isBritish ? "en-GB" : "en-US";

      const matched = availableVoices.find(v => {
        const langMatch = v.lang.replace("_", "-").startsWith(targetLang);
        if (!langMatch) return false;
        const lower = v.name.toLowerCase();
        if (isFemale) {
          return lower.includes("female") || lower.includes("samantha") || lower.includes("zira") || lower.includes("victoria");
        } else {
          return lower.includes("male") || lower.includes("david") || lower.includes("george") || lower.includes("daniel");
        }
      }) || availableVoices.find(v => v.lang.replace("_", "-").startsWith(targetLang)) || availableVoices[0];

      if (matched) {
        utterance.voice = matched;
      }

      utterance.onend = () => setPreviewingVoiceKey(null);
      utterance.onerror = () => setPreviewingVoiceKey(null);

      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(() => setPreviewingVoiceKey(null), 1800);
    }
  };

  const handleGenerate = () => {
    if (!text.trim()) return;
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      const trackTitle = title.trim() || "Untitled";
      setActiveTrack({ title: trackTitle, voice: currentVoice.name });

      const newItem: HistoryItem = {
        id: Date.now(),
        title: trackTitle,
        text,
        voiceKey: selectedVoice,
        voiceName: currentVoice.name,
        speed,
        pauseSilence,
        wordCount,
        createdAt: "Just now"
      };
      setHistory(prev => [newItem, ...prev]);
    }, 1000);
  };

  const handleUseItem = (item: HistoryItem) => {
    setTitle(item.title);
    setText(item.text);
    setSelectedVoice(item.voiceKey);
    setSpeed(item.speed);
    setPauseSilence(item.pauseSilence);
    setActiveTab("studio");
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-[#f8fafc] flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Sleek Minimal Header */}
      <header className="bg-[#131c2e] border-b border-[#1e293b] px-6 py-3.5 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm">
              <Volume2 className="w-4 h-4" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-white">Piper Studio</span>
          </div>

          {/* Clean Segmented Control */}
          <nav className="flex bg-[#0a0f1d] p-0.5 rounded-lg border border-[#1e293b]">
            <button
              onClick={() => setActiveTab("studio")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === "studio" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Studio
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === "history" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              History {history.length > 0 && `(${history.length})`}
            </button>
            <button
              onClick={() => setActiveTab("projects")}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === "projects" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Projects {projects.length > 0 && `(${projects.length})`}
            </button>
          </nav>

          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>Ready</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-5xl w-full mx-auto px-6 py-8 flex-1 pb-32">
        {activeTab === "studio" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Main Text Input Column */}
            <div className="lg:col-span-7 bg-[#131c2e] border border-[#1e293b] rounded-xl p-5 flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-xs font-medium text-slate-300">Document Text</label>
                  {text && (
                    <button
                      onClick={() => setText("")}
                      className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Title (optional)"
                  className="w-full bg-[#0a0f1d] border border-[#1e293b] rounded-lg px-3.5 py-2 text-sm text-white mb-3 focus:outline-none focus:border-indigo-500"
                />

                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={14}
                  placeholder="Paste or write text to convert to speech..."
                  className="w-full bg-[#0a0f1d] border border-[#1e293b] rounded-lg p-3.5 text-sm text-slate-200 leading-relaxed resize-y focus:outline-none focus:border-indigo-500"
                />

                <div className="flex items-center justify-end text-xs text-slate-500 mt-2 font-mono">
                  <span>{wordCount.toLocaleString()} words • {charCount.toLocaleString()} chars</span>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-[#1e293b]">
                <button
                  onClick={handleGenerate}
                  disabled={isProcessing || !text.trim()}
                  className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {isProcessing ? (
                    <>
                      <RotateCcw className="w-4 h-4 animate-spin" />
                      <span>Generating Audio...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>Generate Audio</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Settings Column */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-slate-300">Select &amp; Preview Voice</span>
                  <button
                    onClick={() => playVoicePreview(selectedVoice)}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {previewingVoiceKey === selectedVoice ? (
                      <>
                        <VolumeX className="w-3.5 h-3.5" />
                        <span>Stop Sample</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Preview Current</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Quick Audition Voice List */}
                <div className="space-y-1.5 mb-5">
                  {VOICES.map(v => {
                    const isSelected = selectedVoice === v.key;
                    const isPlayingThis = previewingVoiceKey === v.key;

                    return (
                      <div
                        key={v.key}
                        onClick={() => setSelectedVoice(v.key)}
                        className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#0a0f1d] border-indigo-500/80 text-white"
                            : "bg-[#0a0f1d]/50 border-[#1e293b] text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                              isSelected ? "bg-indigo-600 text-white" : "border border-[#1e293b] text-transparent"
                            }`}
                          >
                            <Check className="w-2.5 h-2.5" />
                          </div>
                          <div className="truncate">
                            <div className="text-xs font-medium flex items-center gap-1.5">
                              <span>{v.name}</span>
                              <span className="text-[10px] text-slate-400">({v.accent} {v.gender})</span>
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">{v.description}</div>
                          </div>
                        </div>

                        {/* Dedicated 1-Click Preview Button */}
                        <button
                          onClick={(e) => playVoicePreview(v.key, e)}
                          title={`Preview ${v.name}`}
                          className={`px-2 py-1 rounded text-xs flex items-center gap-1 transition-all shrink-0 cursor-pointer ${
                            isPlayingThis
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "bg-[#131c2e] hover:bg-indigo-600 hover:text-white border border-[#1e293b] text-slate-300"
                          }`}
                        >
                          {isPlayingThis ? (
                            <>
                              <VolumeX className="w-3 h-3 animate-pulse" />
                              <span className="text-[10px]">Playing</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 fill-current" />
                              <span className="text-[10px]">Sample</span>
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Speed Slider */}
                <div className="mb-4 pt-3 border-t border-[#1e293b]">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                    <span>Speed</span>
                    <span className="text-slate-200 font-mono">{speed.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.05"
                    value={speed}
                    onChange={e => setSpeed(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 bg-[#0a0f1d] rounded h-1.5 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>0.5x</span>
                    <span>1.0x</span>
                    <span>2.0x</span>
                  </div>
                </div>

                {/* Pause Slider */}
                <div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                    <span>Sentence Pause</span>
                    <span className="text-slate-200 font-mono">{pauseSilence.toFixed(2)}s</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="1.5"
                    step="0.05"
                    value={pauseSilence}
                    onChange={e => setPauseSilence(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 bg-[#0a0f1d] rounded h-1.5 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>Short (0s)</span>
                    <span>Natural (0.2s)</span>
                    <span>Long (1.5s)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: History */}
        {activeTab === "history" && (
          <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#1e293b]">
              <span className="text-xs font-medium text-slate-300">History</span>
              <span className="text-xs text-slate-500">{history.length} records</span>
            </div>

            {history.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No generation history yet.
              </div>
            ) : (
              <div className="divide-y divide-[#1e293b]">
                {history.map(item => (
                  <div key={item.id} className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-white truncate">{item.title}</h3>
                        <span className="text-[11px] text-slate-400">• {item.voiceName}</span>
                        <span className="text-[11px] text-slate-500">• {item.wordCount} words</span>
                      </div>
                      <p className="text-xs text-slate-400 truncate mt-0.5">{item.text}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setActiveTrack({ title: item.title, voice: item.voiceName })}
                        className="px-2.5 py-1 rounded bg-[#0a0f1d] hover:bg-indigo-600 hover:text-white border border-[#1e293b] text-xs text-slate-300 flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        Play
                      </button>
                      <button
                        onClick={() => handleUseItem(item)}
                        className="px-2.5 py-1 rounded bg-[#0a0f1d] hover:bg-slate-800 border border-[#1e293b] text-xs text-slate-300 flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reload
                      </button>
                      <button
                        onClick={() => setHistory(prev => prev.filter(h => h.id !== item.id))}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Projects */}
        {activeTab === "projects" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-slate-300">Projects</span>
              <button
                onClick={() => {
                  const name = prompt("Project Name:");
                  if (name && name.trim()) {
                    setProjects(prev => [...prev, { id: Date.now(), name: name.trim(), chapters: [] }]);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                New Project
              </button>
            </div>

            {projects.length === 0 ? (
              <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-12 text-center text-slate-500 text-xs">
                No projects created yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map(p => (
                  <div key={p.id} className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-4 shadow-sm flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-white">{p.name}</h3>
                        <span className="text-[11px] text-slate-400">{p.chapters.length} chapters</span>
                      </div>
                      {p.chapters.length > 0 ? (
                        <div className="bg-[#0a0f1d] rounded-lg p-2.5 border border-[#1e293b] space-y-1.5 my-3">
                          {p.chapters.map((ch, idx) => (
                            <div key={ch.id} className="flex items-center justify-between text-xs text-slate-300">
                              <span>#{idx + 1} {ch.title}</span>
                              <span className="text-[10px] text-slate-500">{ch.wordCount}w</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-4 text-center text-xs text-slate-500">
                          Empty project. Add tracks from history.
                        </div>
                      )}
                    </div>

                    {p.chapters.length > 0 && (
                      <button
                        onClick={() => setActiveTrack({ title: p.name, voice: "Playlist" })}
                        className="w-full py-1.5 rounded bg-[#0a0f1d] hover:bg-slate-800 border border-[#1e293b] text-xs text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        Play Sequential
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Discrete Bottom Footer */}
      <footer className="max-w-5xl mx-auto w-full px-6 py-4 flex items-center justify-between text-xs text-slate-500 border-t border-[#1e293b]/40">
        <span>Local Device Storage</span>
        <button
          onClick={() => setShowPrivacy(true)}
          className="hover:text-slate-300 transition-colors cursor-pointer"
        >
          Privacy Policy
        </button>
      </footer>

      {/* Active Audio Bar */}
      {activeTrack && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#131c2e] border-t border-[#1e293b] px-6 py-3 z-50 shadow-2xl">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                <Volume2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-medium text-white">{activeTrack.title}</div>
                <div className="text-[10px] text-slate-400">{activeTrack.voice}</div>
              </div>
            </div>

            <audio controls autoPlay className="h-8 w-64 sm:w-80" src="https://actions.google.com/sounds/v1/water/rain_heavy.ogg" />

            <button
              onClick={() => setActiveTrack(null)}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {showPrivacy && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[#131c2e] border border-[#1e293b] rounded-xl p-5 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Privacy &amp; Data Storage
              </div>
              <button onClick={() => setShowPrivacy(false)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-300 space-y-2.5 leading-relaxed">
              <p>
                <strong>Offline Processing:</strong> Text synthesis and voice models run directly on your device.
              </p>
              <p>
                <strong>No Cloud Telemetry:</strong> No input text, synthesized audio, or usage metadata is sent to remote servers.
              </p>
              <p>
                <strong>Data Retention:</strong> Audio files and history logs remain solely within your local user directory.
              </p>
            </div>
            <div className="mt-5 pt-3 border-t border-[#1e293b] flex justify-end">
              <button
                onClick={() => setShowPrivacy(false)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
