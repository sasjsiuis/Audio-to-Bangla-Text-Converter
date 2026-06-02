import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, RefreshCw, AlertCircle, FileAudio, UploadCloud, Info, Settings, Sparkles } from "lucide-react";
import { RecordStatus } from "../types";

interface AudioRecorderProps {
  onTranscribeSuccess: (text: string, durationSeconds: number, audioDataUrl?: string) => void;
  isTranscribing: boolean;
}

export default function AudioRecorder({ onTranscribeSuccess, isTranscribing }: AudioRecorderProps) {
  const [status, setStatus] = useState<RecordStatus>(RecordStatus.IDLE);
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Audio recording references
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Suggested instructions/presets for Gemini Bangla output formatting
  const promptPresets = [
    { label: "ফরমাল (সংবাদ/অফিস)", value: "যেকোনো আঞ্চলিক ভাষার শব্দ পরিহার করে শুদ্ধ প্রমিত বাংলায় বিরামচিহ্ন সহ পুঙ্খানুপুঙ্খ ট্রান্সক্রিপশন করুন। কোনো ইংরেজি নোট সংযোজন করবেন না।" },
    { label: "ক্যাজুয়াল (কথোপকথন)", value: "স্বাভাবিক কথোপকথন শৈলী বজায় রাখুন। কথার ভাঁজে ব্যবহৃত ইংরেজি শব্দগুলো বাংলা লিপিতে লিখুন (যেমন: ফোন, থ্যাংক ইউ)।" },
    { label: "আইন/মেডিকেল", value: "পারিভাষিক ও প্রযুক্তিগত পরিভাষাগুলোর নির্ভুল বানান বজায় রেখে বিরামচিহ্ন সমৃদ্ধ শুদ্ধ বাংলা টেক্সট দিন।" }
  ];

  // Duration Timer
  useEffect(() => {
    if (status === RecordStatus.RECORDING) {
      timerIntervalRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [status]);

  // Clean active stream on unmount
  useEffect(() => {
    return () => {
      stopAudioVisualization();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Format second digits
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainSecs.toString().padStart(2, "0")}`;
  };

  // Setup canvas audio visualizer
  const startAudioVisualization = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const canvasCtx = canvas.getContext("2d");
      if (!canvasCtx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (!analyserRef.current || !canvasRef.current) return;
        
        animationFrameRef.current = requestAnimationFrame(draw);
        analyserRef.current.getByteFrequencyData(dataArray);

        const width = canvas.width;
        const height = canvas.height;

        canvasCtx.fillStyle = "#111827"; // Dark slate matches theme
        canvasCtx.fillRect(0, 0, width, height);

        // Draw voice visualizer bar loops
        const barWidth = (width / bufferLength) * 1.8;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = dataArray[i] / 1.5;

          // Beautiful green-blue gradient representing Bangla branding
          const red = 16 + i * 2;
          const green = 185;
          const blue = 129 + i;

          canvasCtx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
          // Mirror rendering
          canvasCtx.fillRect(width / 2 + x, height - barHeight / 2, barWidth, barHeight);
          canvasCtx.fillRect(width / 2 - x - barWidth, height - barHeight / 2, barWidth, barHeight);

          x += barWidth + 1;
        }
      };

      draw();
    } catch (e) {
      console.error("Visualizer initialization failed:", e);
    }
  };

  const stopAudioVisualization = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(console.error);
    }
    analyserRef.current = null;
    audioContextRef.current = null;
  };

  // Recorder Control: Start recording microphone input
  const startRecording = async () => {
    setErrorMsg(null);
    setSelectedFile(null);
    audioChunksRef.current = [];
    setSeconds(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Select supported audio type prioritising opus compressed webm
      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus";
      } else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus";
      } else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await processAndTranscribe(audioBlob, mimeType);
      };

      recorder.start(1000); // chunk every 1 second
      setStatus(RecordStatus.RECORDING);
      startAudioVisualization(stream);
    } catch (err: any) {
      console.error("Microphone Access Error:", err);
      setErrorMsg("মাইক্রোফোন অ্যাক্সেস করতে ব্যর্থ হয়েছে। অনুগ্রহ করে ব্রাউজার পারমিশন চেক করুন।");
      setStatus(RecordStatus.ERROR);
    }
  };

  // Recorder Control: Stop recording microphone input
  const stopRecording = () => {
    if (mediaRecorderRef.current && status === RecordStatus.RECORDING) {
      mediaRecorderRef.current.stop();
      setStatus(RecordStatus.PROCESSING);
      stopAudioVisualization();

      // Stop all mic streams safely
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  };

  // Convert File/Blob to Base64 easily
  const fileToBase64 = (fileOrBlob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          // Extract base64 without the data URI prefix
          const base64String = reader.result.split(",")[1];
          resolve(base64String);
        } else {
          reject(new Error("Failed to convert file format to Base64"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(fileOrBlob);
    });
  };

  // Hit the backend server transcribing endpoint
  const processAndTranscribe = async (audioBlob: Blob, mime: string) => {
    setStatus(RecordStatus.PROCESSING);
    setErrorMsg(null);

    try {
      const base64Data = await fileToBase64(audioBlob);
      
      // Calculate duration of the blob
      const duration = seconds > 0 ? seconds : 5; // Default reference if direct upload

      // Create a temporary local DataURL of the blob so users can play back their recorded/uploaded audio!
      const audioDataUrl = URL.createObjectURL(audioBlob);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: base64Data,
          mimeType: mime,
          customPrompt: customPrompt
        }),
      });

      let resData: any = null;
      const contentType = response.headers.get("content-type");

      if (contentType && contentType.includes("application/json")) {
        try {
          resData = await response.json();
        } catch (jsonErr) {
          console.error("JSON parsing failed:", jsonErr);
        }
      }

      if (!resData) {
        const textResponse = await response.text().catch(() => "");
        console.error("Non-JSON Server response:", textResponse);
        if (response.status === 404) {
          throw new Error("সার্ভার রুটটি পাওয়া যায়নি (404 Error)। অনুগ্রহ করে নিশ্চিত করুন যে ডেভ সার্ভারটি সঠিকভাবে সচল আছে।");
        } else if (response.status === 502 || response.status === 503 || response.status === 504) {
          throw new Error("সার্ভিসটি এই মুহূর্তে সাময়িকভাবে অনুপলব্ধ বা টাইমআউট হয়েছে (Gateway/Server Error)। অনুগ্রহ করে কিছু সময় পর আবার চেষ্টা করুন।");
        }
        throw new Error(`সার্ভার থেকে অপ্রত্যাশিত রেসপন্স এসেছে (স্ট্যাটাস: ${response.status})। অনুগ্রহ করে আপনার জেমিনি এপিআই কী (GEMINI_API_KEY) সেটিংস থেকে কনফিগার করা আছে কিনা পরীক্ষা করুন।`);
      }

      if (!response.ok) {
        throw new Error(resData.error || "সার্ভার ট্রান্সক্রাইব করতে ব্যর্থ হয়েছে।");
      }

      onTranscribeSuccess(resData.transcription, duration, audioDataUrl);
      setStatus(RecordStatus.CONVERTED);
    } catch (err: any) {
      console.error("Transcribing transaction failed:", err);
      setErrorMsg(err.message || "ট্রান্সক্রিপশন প্রক্রিয়া সম্পন্ন করা যায়নি। পুনরায় চেষ্টা করুন।");
      setStatus(RecordStatus.ERROR);
    }
  };

  // Handle Drag & Drop operations
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setErrorMsg(null);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      validateAndSetAudioFile(files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndSetAudioFile(files[0]);
    }
  };

  const validateAndSetAudioFile = (file: File) => {
    if (!file.type.startsWith("audio/")) {
      setErrorMsg("দয়া করে শুধুমাত্র অডিও ব্রডকাস্ট ফাইল নির্বাচন করুন (যেমন: MP3, WAV, WebM!)");
      return;
    }
    // Limit file size to 10MB to be extremely friendly
    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg("ফাইলের আকার সর্বোচ্চ ১৫ মেগাবাইট হতে পারবে।");
      return;
    }

    setSelectedFile(file);
    setErrorMsg(null);
  };

  // Submit file for transcribing
  const submitFileForTranscription = async () => {
    if (!selectedFile) return;
    setStatus(RecordStatus.PROCESSING);

    // Get approximate audio duration inside an mock metadata constructor if possible
    let approxDuration = 10;
    try {
      const audioUrl = URL.createObjectURL(selectedFile);
      const audio = new Audio(audioUrl);
      audio.addEventListener("loadedmetadata", () => {
        approxDuration = Math.round(audio.duration) || 10;
      });
    } catch (e) {
      console.warn("Could not determine duration, using default", e);
    }

    await processAndTranscribe(selectedFile, selectedFile.type);
    setSelectedFile(null);
  };

  return (
    <div id="audio-recorder-module" className="bg-gray-900 border border-emerald-500/20 rounded-2xl p-6 shadow-2xl relative overflow-hidden transition-all">
      {/* Background glow ambient blur */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-teal-500/5 rounded-full blur-3xl pointer-events-none"></div>

      <div className="flex flex-col gap-5">
        <div className="flex justify-between items-center pb-2 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-medium text-white tracking-wide">অডিও ইনপুট প্যানেল</h2>
          </div>
          <button
            id="toggle-settings-btn"
            onClick={() => setShowConfig(!showConfig)}
            className={`p-2 rounded-lg transition-colors duration-150 flex items-center gap-1.5 text-xs text-slate-300 hover:bg-gray-800 ${showConfig ? "bg-emerald-600/10 text-emerald-400 border border-emerald-500/30" : ""}`}
            title="AI নির্দেশাবলী কনফিগার করুন"
          >
            <Settings className="w-4 h-4" />
            <span>নির্দেশনা সেট করুন</span>
          </button>
        </div>

        {/* Gemini Prompts Instructions Tuning */}
        {showConfig && (
          <div id="ai-prompts-tuning" className="bg-gray-950/80 border border-gray-800/80 rounded-xl p-4 flex flex-col gap-3 text-sm animate-fade-in">
            <div className="flex items-start gap-2 text-xs text-slate-400">
              <Info className="w-4 h-4 text-emerald-400 mt-0.5" />
              <span>Bangla বাণীর ধরন নির্ধারণ করুন। Gemini ইন্টেলিজেন্স ট্রান্সক্রিপশনকে উক্ত শৈলী অনুযায়ী সাজাবে।</span>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {promptPresets.map((preset, i) => (
                <button
                  key={i}
                  id={`preset-prompt-${i}`}
                  onClick={() => setCustomPrompt(preset.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                    customPrompt === preset.value
                      ? "bg-emerald-500 text-gray-950 shadow-md font-semibold"
                      : "bg-gray-900 text-slate-300 hover:bg-gray-850 hover:text-white border border-gray-800"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <textarea
              id="custom-instructions-textarea"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="জিবি বাণীর জন্য কাস্টম কনফিগারেশন লিখুন... (যেমন: অপ্রাসঙ্গিক হাসাহাসি বাদ দিন, প্রমিত বাংলা করুন)"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg p-2.5 text-slate-200 text-xs focus:outline-none focus:border-emerald-500 transition-all resize-none h-16"
            />
            {customPrompt && (
              <button
                id="reset-instruction-btn"
                onClick={() => setCustomPrompt("")}
                className="text-right text-[10px] text-red-400 hover:underline cursor-pointer"
              >
                ডিফল্ট সেটআপে ফিরে যান
              </button>
            )}
          </div>
        )}

        {/* Dynamic State Layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Method 1: Real-time Audio Recorder */}
          <div className="flex flex-col items-center justify-center p-6 bg-gray-950 rounded-xl border border-gray-800/85 relative group min-h-[180px]">
            {status === RecordStatus.RECORDING ? (
              <div className="flex flex-col items-center gap-4 w-full">
                <div className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 border border-red-500/30 rounded-full text-xs text-red-400 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span>কথোপকথন রেকর্ড হচ্ছে</span>
                </div>
                
                {/* Voice amplitude mirror canvas */}
                <canvas 
                  ref={canvasRef} 
                  width={300} 
                  height={50} 
                  className="w-full h-12 bg-gray-900/40 rounded-lg border border-gray-850 overflow-hidden"
                />

                <div className="text-2xl font-mono font-medium text-emerald-400 tracking-wider">
                  {formatTime(seconds)}
                </div>

                <button
                  id="stop-recording-btn"
                  onClick={stopRecording}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-full font-medium transition-all shadow-lg hover:scale-105 active:scale-95"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>রেকর্ড থামান</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <button
                  id="start-recording-btn"
                  disabled={status === RecordStatus.PROCESSING || isTranscribing}
                  onClick={startRecording}
                  className={`p-6 rounded-full transition-all duration-350 shadow-xl flex items-center justify-center border-4 ${
                    status === RecordStatus.PROCESSING || isTranscribing
                      ? "bg-gray-800 border-gray-700 text-gray-600 cursor-not-allowed"
                      : "bg-emerald-500 hover:bg-emerald-400 text-gray-950 border-emerald-500/20 hover:scale-110 active:scale-95 cursor-pointer ring-8 ring-emerald-500/10"
                  }`}
                  title="কথা বলুন ও রেকর্ড শুরু করুন"
                >
                  <Mic className="w-8 h-8" />
                </button>
                <div className="text-center">
                  <p className="text-slate-200 text-sm font-medium">রিয়েল-টাইম ভয়েস রেকর্ডার</p>
                  <p className="text-slate-400 text-xs mt-1">মাইক্রোফোন ক্লিক করে বাংলা বলা শুরু করুন</p>
                </div>
              </div>
            )}
          </div>

          {/* Method 2: Audio File Upload Drag area */}
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl transition-all min-h-[180px] ${
              status === RecordStatus.RECORDING
                ? "bg-gray-900/20 border-gray-800 text-slate-600 pointer-events-none"
                : isDragging
                ? "bg-emerald-500/5 border-emerald-500 text-emerald-400 scale-[1.01]"
                : selectedFile
                ? "bg-gray-950 border-emerald-500/40 text-emerald-300"
                : "bg-gray-950 border-gray-800 text-slate-400 hover:border-gray-700 hover:bg-gray-900/10 cursor-pointer"
            }`}
          >
            {selectedFile ? (
              <div className="flex flex-col items-center gap-3 w-full text-center">
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl">
                  <FileAudio className="w-8 h-8" />
                </div>
                <div className="max-w-full">
                  <p className="text-slate-200 text-xs font-semibold truncate px-2">{selectedFile.name}</p>
                  <p className="text-slate-400 text-[10px] mt-1">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
                <div className="flex gap-2 mt-2 w-full justify-center">
                  <button
                    id="cancel-upload-btn"
                    onClick={() => setSelectedFile(null)}
                    className="px-3 py-1.5 text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg font-medium transition-colors cursor-pointer"
                  >
                    বাদ দিন
                  </button>
                  <button
                    id="submit-upload-btn"
                    disabled={status === RecordStatus.PROCESSING || isTranscribing}
                    onClick={submitFileForTranscription}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-emerald-500 text-gray-950 hover:bg-emerald-400 font-semibold rounded-lg shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <span>কনভার্ট করুন</span>
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2 cursor-pointer w-full height-full py-2">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={status === RecordStatus.RECORDING}
                />
                <div className="p-3 bg-gray-900 text-slate-300 rounded-full hover:scale-105 transition-all">
                  <UploadCloud className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <p className="text-slate-200 text-sm font-medium">অডিও ফাইল বাছাই করুন</p>
                  <p className="text-slate-400 text-xs mt-1">ক্লিক করুন অথবা ফাইল ড্রপ করুন এখানে</p>
                  <p className="text-slate-500 text-[10px] mt-2">MP3, WAV, M4A up to 15MB</p>
                </div>
              </label>
            )}
          </div>
        </div>

        {/* Processing Indicator loading block */}
        {(status === RecordStatus.PROCESSING || isTranscribing) && (
          <div id="processing-loader-overlay" className="bg-gray-950/90 border border-emerald-500/10 rounded-xl p-5 flex flex-col items-center justify-center gap-3 animate-pulse">
            <RefreshCw className="w-7 h-7 text-emerald-400 animate-spin" />
            <div className="text-center">
              <p className="text-sm text-slate-100 font-medium">Gemini AI দ্বারা বাংলা অডিও অনুবাদ করা হচ্ছে...</p>
              <p className="text-xs text-slate-400 mt-1">কিছুক্ষণ অপেক্ষা করুন, আপনার অডিওটি প্রসেস ও পরিশোধন করা হচ্ছে।</p>
            </div>
          </div>
        )}

        {/* Error notification */}
        {errorMsg && (
          <div id="recorder-error-alert" className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl p-3.5 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">ত্রুটি ঘটেছে</p>
              <p className="mt-0.5 leading-relaxed">{errorMsg}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
