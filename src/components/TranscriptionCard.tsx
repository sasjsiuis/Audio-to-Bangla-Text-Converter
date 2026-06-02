import React, { useState } from "react";
import { TranscriptionRecord } from "../types";
import { 
  FileText, Clock, User, Copy, Check, Download, Edit, Save, Trash2, 
  Share2, Globe, Lock, Play, Pause, Users 
} from "lucide-react";

interface TranscriptionCardProps {
  key?: string;
  record: TranscriptionRecord;
  currentUserEmail: string;
  currentUserId: string;
  onUpdateText: (id: string, text: string) => Promise<void>;
  onUpdateTitle: (id: string, title: string) => Promise<void>;
  onTogglePublic: (id: string, isPublic: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onOpenCollab: (record: TranscriptionRecord) => void;
  isSelected?: boolean;
  onSelect?: () => void;
}

export default function TranscriptionCard({
  record,
  currentUserEmail,
  currentUserId,
  onUpdateText,
  onUpdateTitle,
  onTogglePublic,
  onDelete,
  onOpenCollab,
  isSelected = false,
  onSelect
}: TranscriptionCardProps) {
  const [isEditingText, setIsEditingText] = useState(false);
  const [editedText, setEditedText] = useState(record.text);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(record.title);
  
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);

  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const isOwner = record.ownerId === currentUserId;
  const isCollaborator = record.collaborators?.map(c => c.toLowerCase()).includes(currentUserEmail.toLowerCase());
  const canEdit = isOwner || isCollaborator;

  // Handle text copy operation
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(record.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  // Save changes to the transcription content
  const handleSaveText = async () => {
    if (editedText.trim() === record.text) {
      setIsEditingText(false);
      return;
    }
    setIsSaving(true);
    try {
      await onUpdateText(record.id, editedText);
      setIsEditingText(false);
    } catch (err) {
      console.error(err);
      alert("তথ্য সেভ করতে ব্যর্থ হয়েছে। পুনরায় চেষ্টা করুন।");
    } finally {
      setIsSaving(false);
    }
  };

  // Save changes to the title
  const handleSaveTitle = async () => {
    if (editedTitle.trim() === "" || editedTitle.trim() === record.title) {
      setIsEditingTitle(false);
      return;
    }
    setIsSaving(true);
    try {
      await onUpdateTitle(record.id, editedTitle);
      setIsEditingTitle(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Export as TXT / Markdown file
  const handleDownloadFile = (format: "txt" | "md") => {
    let content = "";
    let fileExtension = "";
    let mimeType = "";

    if (format === "txt") {
      content = `শিরোনাম: ${record.title}\nমালিক: ${record.ownerName}\nতারিখ: ${new Date(record.createdAt?.seconds * 1000 || record.createdAt).toLocaleString("bn-BD")}\n\n--- ট্রান্সক্রিপশন ---\n\n${record.text}`;
      fileExtension = "txt";
      mimeType = "text/plain";
    } else {
      content = `# ${record.title}\n\n* **মালিক:** ${record.ownerName}\n* **তারিখ:** ${new Date(record.createdAt?.seconds * 1000 || record.createdAt).toLocaleString("bn-BD")}\n\n## বাংলা ট্রান্সক্রিপশন\n\n${record.text}`;
      fileExtension = "md";
      mimeType = "text/markdown";
    }

    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${record.title.replace(/\s+/g, "_")}_transcription.${fileExtension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleToggleAudio = () => {
    if (!record.audioDataUrl) return;
    
    if (!audioRef.current) {
      audioRef.current = new Audio(record.audioDataUrl);
      audioRef.current.onended = () => {
        setIsPlaying(false);
      };
      audioRef.current.onerror = () => {
        setAudioError(true);
        setIsPlaying(false);
      };
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setAudioError(false);
      audioRef.current.play()
        .then(() => setIsPlaying(true))
        .catch((e) => {
          console.error("Audio playback error", e);
          setAudioError(true);
        });
    }
  };

  const formatFirebaseDate = (timestamp: any) => {
    if (!timestamp) return "তারিখ অজানা";
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    return date.toLocaleString("bn-BD", { 
      year: "numeric", 
      month: "short", 
      day: "numeric", 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  return (
    <div 
      id={`transcription-card-${record.id}`} 
      onClick={onSelect}
      className={`bg-gray-900 border text-slate-100 rounded-2xl p-5 shadow-lg transition-all duration-200 hover:shadow-xl hover:translate-y-[-2px] flex flex-col gap-4 ${
        isSelected 
          ? "border-emerald-500/80 ring-2 ring-emerald-500/10" 
          : "border-gray-800 hover:border-gray-700"
      }`}
    >
      {/* Card Header information */}
      <div className="flex justify-between items-start gap-4">
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <div className="flex gap-2 items-center">
              <input
                id={`edit-title-input-${record.id}`}
                type="text"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="bg-gray-950 border border-emerald-500/40 rounded-lg px-2.5 py-1 text-sm font-semibold focus:outline-none focus:border-emerald-500 flex-1"
                placeholder="শিরোনাম লিখুন..."
              />
              <button
                id={`save-title-btn-${record.id}`}
                onClick={handleSaveTitle}
                className="p-1 px-2.5 bg-emerald-500 text-gray-950 rounded-lg text-xs font-semibold cursor-pointer shrink-0"
              >
                রক্ষা
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 group">
              <h3 className="font-semibold text-slate-100 text-sm md:text-base truncate tracking-wide">{record.title}</h3>
              {isOwner && (
                <button
                  id={`edit-title-btn-${record.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditingTitle(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white transition-opacity transition-colors"
                  title="শিরোনাম পরিবর্তন করুন"
                >
                  <Edit className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Temporal and authorship metadata */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-emerald-400/80" />
              <span>{record.ownerName}</span>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-teal-400/80" />
              <span>{formatFirebaseDate(record.createdAt)}</span>
            </span>
          </div>
        </div>

        {/* Action Widgets right panel */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {record.audioDataUrl && (
            <button
              id={`audio-play-btn-${record.id}`}
              onClick={handleToggleAudio}
              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                isPlaying 
                  ? "bg-emerald-600/10 border-emerald-500/40 text-emerald-400 animate-pulse" 
                  : "bg-gray-950 border-gray-800 text-slate-300 hover:bg-gray-800"
              }`}
              title={isPlaying ? "প্লেব্যাক থামান" : "রেকর্ড শুনুন"}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? "প্লেয়িং" : "শুনুন"}</span>
            </button>
          )}

          {/* Share collaboration menu */}
          {isOwner && (
            <button
              id={`collab-settings-btn-${record.id}`}
              onClick={() => onOpenCollab(record)}
              className="p-1.5 bg-gray-950 border border-gray-800 text-slate-300 rounded-lg hover:bg-gray-800 transition-colors flex items-center gap-1 text-xs"
              title="সহযোগীদের আমন্ত্রণ"
            >
              <Users className="w-3.5 h-3.5 text-emerald-400/80" />
              <span>{record.collaborators?.length || 0}</span>
            </button>
          )}

          {/* Delete triggers */}
          {isOwner && (
            <button
              id={`delete-transcription-btn-${record.id}`}
              onClick={() => {
                if(confirm("আপনি কি নিশ্চিতভাবে এই ট্রান্সক্রিপশনটি ডিলিট করতে চান? এটি পুনরুদ্ধার করা যাবে না।")) {
                  onDelete(record.id);
                }
              }}
              className="p-1.5 bg-gray-950 border border-red-500/10 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
              title="ট্রান্সক্রিপশন ডিলিট"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {audioError && (
        <p className="text-[10px] text-red-400 font-mono italic">অডিও প্লেব্যাক লোড করা যায়নি (সম্ভবত এই ব্রাউজার সেশনে ফাইলটি সাময়িকভাবে অনুপলব্ধ)।</p>
      )}

      {/* Main text container and inline edit area */}
      <div className="flex-1 flex flex-col gap-2">
        {isEditingText ? (
          <div className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            <textarea
              id={`edit-textbox-${record.id}`}
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              className="w-full bg-gray-950 border border-emerald-500/40 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-emerald-500 transition-colors font-sans leading-relaxed h-32 resize-y"
              placeholder="ট্রান্সক্রিপশন সম্পাদন করুন..."
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                id={`cancel-edit-btn-${record.id}`}
                onClick={() => {
                  setEditedText(record.text);
                  setIsEditingText(false);
                }}
                className="px-3 py-1.5 bg-gray-800 text-slate-300 rounded-lg font-medium hover:bg-gray-700 transition"
              >
                বাতিল
              </button>
              <button
                id={`save-edit-btn-${record.id}`}
                disabled={isSaving}
                onClick={handleSaveText}
                className="px-4 py-1.5 bg-emerald-500 text-gray-950 rounded-lg font-bold hover:bg-emerald-400 transition flex items-center gap-1 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>সংরক্ষণ করুন</span>
              </button>
            </div>
          </div>
        ) : (
          <div 
            id={`display-text-${record.id}`}
            className="bg-gray-950/70 border border-gray-850 rounded-xl p-4 text-sm leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap select-text selection:bg-emerald-500/20 text-slate-200 cursor-pointer relative group/text"
            onClick={onSelect}
          >
            <p className="font-sans font-normal">{record.text || "[খালি ট্রান্সক্রিপশন]"}</p>
            
            {canEdit && (
              <button
                id={`inline-edit-trigger-${record.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingText(true);
                }}
                className="absolute right-3 bottom-3 opacity-0 group-hover/text:opacity-100 p-1.5 bg-emerald-500 text-gray-950 hover:bg-emerald-400 rounded-lg transition-all shadow-md flex items-center gap-1 text-[11px] font-semibold"
                title="এডিট করুন"
              >
                <Edit className="w-3 h-3" />
                <span>এডিট</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Footer toolbars (copy, export, public sharing) */}
      <div className="flex flex-wrap justify-between items-center bg-gray-950/40 border border-gray-850 rounded-xl p-2 px-3 text-xs" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5">
          <button
            id={`copy-clipboard-btn-${record.id}`}
            onClick={handleCopyText}
            className={`p-1.5 rounded-lg border text-slate-400 transition-colors flex items-center gap-1 ${
              copied 
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                : "bg-gray-950 border-gray-850 hover:border-gray-700 hover:text-white"
            }`}
            title="ক্লিপবোর্ডে কপি করুন"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "কপি হয়েছে!" : "কপি"}</span>
          </button>

          <button
            id={`download-txt-btn-${record.id}`}
            onClick={() => handleDownloadFile("txt")}
            className="p-1.5 bg-gray-950 border border-gray-850 text-slate-400 hover:border-gray-700 hover:text-white rounded-lg transition-colors flex items-center gap-1"
            title="TXT ফাইল ডাউনলোড করুন"
          >
            <Download className="w-3.5 h-3.5" />
            <span>TXT</span>
          </button>
          
          <button
            id={`download-md-btn-${record.id}`}
            onClick={() => handleDownloadFile("md")}
            className="p-1.5 bg-gray-950 border border-gray-850 text-slate-400 hover:border-gray-700 hover:text-white rounded-lg transition-colors flex items-center gap-1"
            title="Markdown ফাইল ডাউনলোড করুন"
          >
            <Download className="w-3.5 h-3.5" />
            <span>MD</span>
          </button>
        </div>

        {/* Public Sharing Control widget */}
        <div className="flex items-center gap-1">
          {isOwner ? (
            <button
              id={`visibility-toggle-btn-${record.id}`}
              onClick={() => onTogglePublic(record.id, !record.isPublic)}
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors flex items-center gap-1.5 ${
                record.isPublic 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                  : "bg-gray-950 border-gray-850 text-slate-400 hover:text-slate-200"
              }`}
              title={record.isPublic ? "পাবলিক লিংক সক্রিয়" : "শুধুমাত্র মালিক ও সহযোগীবৃন্দ"}
            >
              {record.isPublic ? (
                <>
                  <Globe className="w-3.5 h-3.5" />
                  <span>পাবলিক লিংক সক্রিয়</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>ব্যক্তিগত</span>
                </>
              )}
            </button>
          ) : (
            <div className="px-2.5 py-1 text-slate-400 text-[10px] flex items-center gap-1.5 font-medium select-none bg-gray-950 rounded-lg">
              {record.isPublic ? <Globe className="w-3 h-3 text-emerald-400" /> : <Lock className="w-3 h-3 text-red-400" />}
              <span>{record.isPublic ? "প্রকাশিত" : "সংযুক্ত সহযোগী"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
