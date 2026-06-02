import React, { useState } from "react";
import { Users, Plus, X, ShieldAlert, CheckCircle } from "lucide-react";

interface CollaborationModalProps {
  isOpen: boolean;
  onClose: () => void;
  collaborators: string[];
  onAddCollaborator: (email: string) => Promise<void>;
  onRemoveCollaborator: (email: string) => Promise<void>;
  ownerEmail: string;
}

export default function CollaborationModal({
  isOpen,
  onClose,
  collaborators,
  onAddCollaborator,
  onRemoveCollaborator,
  ownerEmail
}: CollaborationModalProps) {
  const [newEmail, setNewEmail] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error" | null; msg: string }>({ type: null, msg: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({ type: null, msg: "" });

    const emailToInvite = newEmail.trim().toLowerCase();
    if (!emailToInvite) return;

    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailToInvite)) {
      setStatus({ type: "error", msg: "দয়া করে একটি সঠিক ইমেইল আইডি প্রদান করুন।" });
      return;
    }

    if (emailToInvite === ownerEmail.toLowerCase()) {
      setStatus({ type: "error", msg: "আপনি নিজের ইমেইল আইডি যুক্ত করতে পারবেন না।" });
      return;
    }

    if (collaborators.map(c => c.toLowerCase()).includes(emailToInvite)) {
      setStatus({ type: "error", msg: "এই ব্যবহারকারী ইতিমধ্যেই সহযোগী হিসেবে যুক্ত আছেন।" });
      return;
    }

    setIsSubmitting(true);
    try {
      await onAddCollaborator(emailToInvite);
      setStatus({ type: "success", msg: "সহযোগী সফলভাবে যুক্ত হয়েছে!" });
      setNewEmail("");
    } catch (err: any) {
      console.error(err);
      setStatus({ type: "error", msg: err.message || "সহযোগী যুক্ত করতে ব্যর্থ হয়েছে। পুনরায় চেষ্টা করুন।" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div 
        id="collab-modal-card" 
        className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl p-6 relative overflow-hidden text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header container */}
        <div className="flex justify-between items-center pb-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-semibold">সহযোগিতা ও অ্যাক্সেস কন্ট্রোল</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-4 flex flex-col gap-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <label id="collab-input-label" className="text-xs text-slate-300 font-medium">নতুন সহযোগী আমন্ত্রণ পাঠান</label>
            <div className="flex gap-2">
              <input
                id="collab-email-input"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="সহযোগীর গুগল ইমেইল লিখুন..."
                className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500 transition-colors"
              />
              <button
                id="collab-submit-btn"
                type="submit"
                disabled={isSubmitting || !newEmail.trim()}
                className="bg-emerald-500 text-gray-950 px-3.5 py-2 rounded-lg font-medium hover:bg-emerald-400 disabled:bg-gray-850 disabled:text-gray-500 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>যুক্ত করুন</span>
              </button>
            </div>
          </form>

          {/* Success / Error notification */}
          {status.type && (
            <div className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
              status.type === "success" 
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                : "bg-red-500/10 text-red-400 border border-red-500/20"
            }`}>
              {status.type === "success" ? (
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{status.msg}</span>
            </div>
          )}

          {/* Collaborator Lists */}
          <div className="flex flex-col gap-2 pt-2">
            <h4 className="text-xs text-slate-400 font-semibold uppercase tracking-wider">বর্তমান সহযোগীবৃন্দ</h4>
            
            <div className="max-h-48 overflow-y-auto flex flex-col gap-1.5 pr-1">
              {/* Owner Display */}
              <div className="flex justify-between items-center px-3 py-2 bg-gray-950/45 rounded-lg border border-gray-850">
                <div className="flex flex-col text-xs">
                  <span className="text-slate-200 truncate max-w-[240px]">{ownerEmail}</span>
                  <span className="text-slate-500 text-[10px] uppercase font-bold mt-0.5 tracking-wider">মালিক (ডিফল্ট)</span>
                </div>
              </div>

              {/* Added collaborators display */}
              {collaborators.length === 0 ? (
                <p id="no-collaborators-text" className="text-slate-500 text-center text-xs py-4">কোনো সহযোগী এখনও যুক্ত করা হয়নি।</p>
              ) : (
                collaborators.map((email) => (
                  <div key={email} className="flex justify-between items-center px-3 py-2 bg-gray-950 rounded-lg border border-gray-850 hover:border-gray-800 transition-all">
                    <span className="text-slate-200 text-xs truncate max-w-[240px]">{email}</span>
                    <button
                      id={`remove-collab-${email}`}
                      onClick={() => onRemoveCollaborator(email)}
                      className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                      title="সহযোগী অপসারণ"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Info panel */}
        <div id="collab-warning-footer" className="bg-gray-950 p-3 rounded-xl border border-gray-850 mt-2 text-[11px] text-slate-400 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="leading-normal">
            সহযোগীরা আপনার এই ডকুমেন্টটি রিয়েল-টাইমে দেখতে পাবেন এবং অনুবাদিত টেক্সট সম্পাদন বা সংশোধন করতে পারবেন।
          </p>
        </div>
      </div>
    </div>
  );
}
