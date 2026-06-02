import React, { useState, useEffect } from "react";
import { 
  auth, googleProvider, db, handleFirestoreError, testConnection, OperationType 
} from "./firebase";
import { 
  signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser 
} from "firebase/auth";
import { 
  collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, serverTimestamp 
} from "firebase/firestore";
import { 
  Mic, LogIn, LogOut, CheckCircle, Search, Sparkles, SlidersHorizontal, 
  HelpCircle, Globe, Cloud, LayoutGrid, Heart, Flame, Database, ChevronRight 
} from "lucide-react";
import { TranscriptionRecord, UserProfile } from "./types";
import AudioRecorder from "./components/AudioRecorder";
import TranscriptionCard from "./components/TranscriptionCard";
import CollaborationModal from "./components/CollaborationModal";

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [transcriptions, setTranscriptions] = useState<TranscriptionRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "owned" | "shared">("all");
  const [selectedRecord, setSelectedRecord] = useState<TranscriptionRecord | null>(null);
  const [collabModalRecord, setCollabModalRecord] = useState<TranscriptionRecord | null>(null);
  const [connectionVerified, setConnectionVerified] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Time utilities for header
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    // Warm up the firebase link
    testConnection().then(() => setConnectionVerified(true));

    // Dynamic UTC clock ticks
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleString("bn-BD", { 
        hour: "2-digit", 
        minute: "2-digit", 
        second: "2-digit", 
        hour12: false 
      }) + " UTC");
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Sync Auth States
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      if (authUser) {
        setFirebaseUser(authUser);
        setUser({
          uid: authUser.uid,
          displayName: authUser.displayName,
          email: authUser.email,
          photoURL: authUser.photoURL,
        });
      } else {
        setFirebaseUser(null);
        setUser(null);
        setTranscriptions([]);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Securely fetch transcriptions using dual query streams (satisfies list query security)
  useEffect(() => {
    if (!user || !user.email) return;

    setTranscriptions([]);

    // 1. Snapshot owned documents
    const ownedQuery = query(
      collection(db, "transcriptions"), 
      where("ownerId", "==", user.uid)
    );

    // 2. Snapshot where user is listed as collaborator
    const collabQuery = query(
      collection(db, "transcriptions"), 
      where("collaborators", "array-contains", user.email.toLowerCase())
    );

    const mergedDataMap = new Map<string, TranscriptionRecord>();

    const updateState = () => {
      const list = Array.from(mergedDataMap.values()).sort((a, b) => {
        const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : new Date(a.createdAt).getTime();
        const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : new Date(b.createdAt).getTime();
        return (timeB || 0) - (timeA || 0);
      });
      setTranscriptions(list);
    };

    // Listen to owned recordings
    const unsubOwned = onSnapshot(ownedQuery, (snapshot) => {
      snapshot.forEach((doc) => {
        mergedDataMap.set(doc.id, { id: doc.id, ...doc.data() } as TranscriptionRecord);
      });
      updateState();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "transcriptions (owned)");
    });

    // Listen to collaborations
    const unsubCollab = onSnapshot(collabQuery, (snapshot) => {
      snapshot.forEach((doc) => {
        mergedDataMap.set(doc.id, { id: doc.id, ...doc.data() } as TranscriptionRecord);
      });
      updateState();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "transcriptions (collab)");
    });

    return () => {
      unsubOwned();
      unsubCollab();
    };
  }, [user]);

  // Auth Action handlers
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Login crashed:", err);
      alert("গুগল সাইন-ইন সম্পন্ন করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setSelectedRecord(null);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  // Callback: Succesfully calculated Bangla text from AudioRecorder
  const handleTranscribeSuccess = async (transcriptionText: string, duration: number, audioUrl?: string) => {
    if (!user) return;
    setIsTranscribing(true);

    try {
      const defaultTitle = `বাণী রেকর্ড - ${new Date().toLocaleDateString("bn-BD")}`;
      
      const newRecord = {
        title: defaultTitle,
        text: transcriptionText,
        audioDataUrl: audioUrl || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ownerId: user.uid,
        ownerName: user.displayName || "অজ্ঞাত ব্যবহারকারী",
        ownerEmail: user.email || "",
        collaborators: [],
        isPublic: false,
        audioDuration: duration
      };

      await addDoc(collection(db, "transcriptions"), newRecord);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "transcriptions");
    } finally {
      setIsTranscribing(false);
    }
  };

  // Callback: Update text value
  const handleUpdateText = async (id: string, nextText: string) => {
    try {
      const docRef = doc(db, "transcriptions", id);
      await updateDoc(docRef, {
        text: nextText,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `transcriptions/${id}`);
    }
  };

  // Callback: Update title
  const handleUpdateTitle = async (id: string, nextTitle: string) => {
    try {
      const docRef = doc(db, "transcriptions", id);
      await updateDoc(docRef, {
        title: nextTitle,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `transcriptions/${id}`);
    }
  };

  // Callback: Toggle public sharing
  const handleTogglePublic = async (id: string, isPublic: boolean) => {
    try {
      const docRef = doc(db, "transcriptions", id);
      await updateDoc(docRef, {
        isPublic: isPublic,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `transcriptions/${id}`);
    }
  };

  // Callback: Delete selection
  const handleDeleteRecord = async (id: string) => {
    try {
      if (selectedRecord?.id === id) {
        setSelectedRecord(null);
      }
      await deleteDoc(doc(db, "transcriptions", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `transcriptions/${id}`);
    }
  };

  // Collaboration Invitation handlers
  const handleAddCollaborator = async (email: string) => {
    if (!collabModalRecord) return;
    try {
      const currentCollaborators = collabModalRecord.collaborators || [];
      const updatedCollabs = [...currentCollaborators, email.toLowerCase()];
      
      const docRef = doc(db, "transcriptions", collabModalRecord.id);
      await updateDoc(docRef, {
        collaborators: updatedCollabs,
        updatedAt: serverTimestamp()
      });

      // Update local record to refresh rendering
      setCollabModalRecord({
        ...collabModalRecord,
        collaborators: updatedCollabs
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `transcriptions/${collabModalRecord.id}`);
    }
  };

  const handleRemoveCollaborator = async (email: string) => {
    if (!collabModalRecord) return;
    try {
      const currentCollaborators = collabModalRecord.collaborators || [];
      const updatedCollabs = currentCollaborators.filter(c => c.toLowerCase() !== email.toLowerCase());

      const docRef = doc(db, "transcriptions", collabModalRecord.id);
      await updateDoc(docRef, {
        collaborators: updatedCollabs,
        updatedAt: serverTimestamp()
      });

      setCollabModalRecord({
        ...collabModalRecord,
        collaborators: updatedCollabs
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `transcriptions/${collabModalRecord.id}`);
    }
  };

  // Filter computations
  const filteredTranscriptions = transcriptions.filter((item) => {
    const matchesSearch = 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.text.toLowerCase().includes(searchQuery.toLowerCase());

    const isOwned = item.ownerId === user?.uid;
    const isShared = !isOwned;

    if (activeTab === "owned") return matchesSearch && isOwned;
    if (activeTab === "shared") return matchesSearch && isShared;
    return matchesSearch;
  });

  return (
    <div id="application-root" className="min-h-screen bg-gray-950 text-slate-100 flex flex-col font-sans transition-all selection:bg-emerald-500/15">
      {/* Dynamic Navigation Header */}
      <header className="sticky top-0 z-40 bg-gray-900/90 backdrop-blur-md border-b border-gray-800 px-4 py-3 shadow-lg">
        <div className="max-w-7xl mx-auto flex justify-between items-center gap-4">
          
          {/* Logo container */}
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-gradient-to-tr from-emerald-500 to-teal-400 text-gray-950 rounded-xl font-bold shadow-md shadow-emerald-500/10 flex items-center justify-center">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm md:text-base font-bold tracking-wide text-white">কণ্ঠলিপি</h1>
              <span className="text-[10px] text-emerald-400 font-semibold font-mono tracking-wider flex items-center gap-1 uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span>অডিও টু বাংলা কনভার্টার</span>
              </span>
            </div>
          </div>

          {/* Temporal, status and profile widgets */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end text-right">
              <div className="text-xs font-mono font-medium text-slate-300">{currentTime}</div>
              <span className="text-[9px] text-slate-500 font-mono">2026-06-02</span>
            </div>

            {user ? (
              <div id="profile-container" className="flex items-center gap-3 bg-gray-950/60 border border-gray-850 p-1.5 pl-3 pr-2.5 rounded-full shadow-inner select-none transition">
                <div className="flex flex-col text-right">
                  <span className="text-xs font-semibold text-slate-200">{user.displayName}</span>
                  <span className="text-[9px] text-slate-400 font-mono leading-none truncate max-w-[120px]">{user.email}</span>
                </div>
                {user.photoURL ? (
                  <img 
                    src={user.photoURL} 
                    alt="profile" 
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 rounded-full border border-gray-800 object-cover hover:scale-105 transition"
                  />
                ) : (
                  <div className="w-7 h-7 bg-emerald-600 rounded-full flex items-center justify-center text-xs text-white font-bold">
                    {user.displayName?.charAt(0) || "U"}
                  </div>
                )}
                <button
                  id="logout-btn"
                  onClick={handleLogout}
                  className="p-1.5 text-slate-400 hover:text-red-400 transition-colors"
                  title="লগআউট"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                id="login-btn"
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-gray-950 text-xs font-bold rounded-xl transition duration-150 hover:scale-[1.02] shadow-lg shadow-emerald-500/10 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>গুগল আইডি দিয়ে প্রবেশ করুন</span>
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Main Body container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Loading overlay */}
        {loading && (
          <div className="col-span-12 py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-slate-800 border-t-emerald-500 rounded-full animate-spin"></div>
            <p className="text-xs">ডাটাবেজ ও ব্যবহারকারী সংযোগ যাচাই করা হচ্ছে...</p>
          </div>
        )}

        {/* Dashboard contents */}
        {!loading && (
          <>
            {user ? (
              <>
                {/* Left panel: Voice Recording and Workspace Instructions */}
                <div className="lg:col-span-5 flex flex-col gap-6">
                  
                  {/* Dynamic Voice recorder unit */}
                  <AudioRecorder 
                    onTranscribeSuccess={handleTranscribeSuccess} 
                    isTranscribing={isTranscribing}
                  />

                  {/* Collaboration and features walkthrough */}
                  <div id="capabilities-guide-card" className="bg-gray-900 border border-gray-850 rounded-2xl p-5 shadow-lg flex flex-col gap-4 text-xs text-slate-300">
                    <h3 className="font-semibold text-slate-100 flex items-center gap-1.5 text-xs text-slate-100 uppercase tracking-wide">
                      <Cloud className="w-4 h-4 text-emerald-400" />
                      <span>রিয়েল-টাইম ক্লাউড স্টোরেজ গাইড</span>
                    </h3>
                    <ul className="flex flex-col gap-2 font-sans pl-1">
                      <li className="flex gap-2">
                        <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span><strong>স্বয়ংক্রিয় ক্লাউড সিঙ্ক:</strong> প্রতিটি রেকর্ড শেষ হওয়া মাত্রই সরাসরি গুগল ফায়ারস্টোরে সংরক্ষিত হয়।</span>
                      </li>
                      <li className="flex gap-2">
                        <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span><strong>অন্যান্য ডিভাইসে অ্যাক্সেস:</strong> একই অ্যাকাউন্ট দিয়ে যেকোনো ফোন, ট্যাবলেট বা ল্যাপটপ থেকে লিপিগুলো অ্যাক্সেস করতে পারবেন।</span>
                      </li>
                      <li className="flex gap-2">
                        <ChevronRight className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span><strong>সহযোগীদের সাথে ট্রান্সক্রিপশন:</strong> 'সহযোগী' অপশন ব্যবহার করে অন্যদের ইমেইল যুক্ত করুন। তারা আপনার অডিও টেক্সট এডিট বা পরিবর্তন করতে পারবে!</span>
                      </li>
                    </ul>
                  </div>

                </div>

                {/* Right panel: Search list, folders, filters & details view */}
                <div className="lg:col-span-7 flex flex-col gap-5">
                  
                  <div className="bg-gray-900 border border-gray-850 rounded-2xl p-5 shadow-lg flex flex-col gap-4">
                    
                    {/* Folder tabs and filtering */}
                    <div className="flex flex-wrap justify-between items-center gap-3">
                      <div className="flex gap-1 bg-gray-950 p-1 rounded-xl border border-gray-850">
                        <button
                          id="tab-all"
                          onClick={() => setActiveTab("all")}
                          className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                            activeTab === "all" ? "bg-emerald-500 text-gray-950 font-semibold" : "text-slate-400 hover:text-white"
                          }`}
                        >
                          সব কপারশিপ ({transcriptions.length})
                        </button>
                        <button
                          id="tab-owned"
                          onClick={() => setActiveTab("owned")}
                          className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                            activeTab === "owned" ? "bg-emerald-500 text-gray-950 font-semibold" : "text-slate-400 hover:text-white"
                          }`}
                        >
                          আমার নিজস্ব
                        </button>
                        <button
                          id="tab-shared"
                          onClick={() => setActiveTab("shared")}
                          className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                            activeTab === "shared" ? "bg-emerald-500 text-gray-950 font-semibold" : "text-slate-400 hover:text-white"
                          }`}
                        >
                          অন্যদের শেয়ার করা
                        </button>
                      </div>

                      {/* Display grid/list toggle or filter tools */}
                      <span className="text-[10px] text-slate-500 font-mono tracking-wider flex items-center gap-1 uppercase select-none">
                        <Database className="w-3.5 h-3.5 text-teal-400/80" />
                        <span>Firestore সিঙ্কড</span>
                      </span>
                    </div>

                    {/* Elastic Search Bar */}
                    <div id="search-bar-wrapper" className="relative">
                      <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                      <input
                        id="search-transcriptions-input"
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="শিরোনাম বা কী-ওয়ার্ড দিয়ে খুঁজুন..."
                        className="w-full bg-gray-950 border border-gray-850 hover:border-gray-800 px-10 py-2 rounded-xl text-sm outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>

                    {/* Transcriptions Cards listing loop */}
                    <div className="flex flex-col gap-4 max-h-[700px] overflow-y-auto pr-1">
                      {filteredTranscriptions.length === 0 ? (
                        <div className="text-center py-12 border border-dashed border-gray-850 rounded-xl bg-gray-950/40">
                          <LayoutGrid className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                          <p className="text-xs text-slate-400 font-sans">খুঁজে পাওয়া যায়নি!</p>
                          <p className="text-[11px] text-slate-500 mt-1">রেকর্ডিং শুরু করুন বা অনুসন্ধানের শব্দ পরিবর্তন করুন।</p>
                        </div>
                      ) : (
                        filteredTranscriptions.map((record) => (
                          <TranscriptionCard
                            key={record.id}
                            record={record}
                            currentUserEmail={user.email || ""}
                            currentUserId={user.uid}
                            onUpdateText={handleUpdateText}
                            onUpdateTitle={handleUpdateTitle}
                            onTogglePublic={handleTogglePublic}
                            onDelete={handleDeleteRecord}
                            onOpenCollab={(rec) => setCollabModalRecord(rec)}
                            isSelected={selectedRecord?.id === record.id}
                            onSelect={() => setSelectedRecord(record)}
                          />
                        ))
                      )}
                    </div>

                  </div>

                </div>
              </>
            ) : (
              /* Public / Hero Pitch when user is logged out */
              <div id="public-hero-container" className="col-span-12 py-10 max-w-2xl mx-auto flex flex-col gap-6 text-center items-center">
                
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-full font-medium">
                  <Flame className="w-4 h-4" />
                  <span>রিয়েল-টাইম অডিও ট্রান্সক্রিপশন সলিউশন</span>
                </div>

                <div className="flex flex-col gap-2.5">
                  <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white leading-tight">
                    স্পষ্ট কণ্ঠের বাংলা রূপান্তর শুনুন <br/>
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-teal-300">যেকোনো ডিভাইস থেকে ক্লাউডে</span>
                  </h2>
                  <p className="text-slate-400 text-xs md:text-sm leading-relaxed max-w-lg mx-auto">
                    কণ্ঠলিপি হল Gemini 3.5 AI চালিত অত্যাধুনিক অডিও টু বাংলা টেক্সট কনভার্টার। এটি আপনার রেকর্ডিং বা অডিও ফাইল সরাসরি প্রমিত বাংলা টেক্সটে রূপান্তর করে এবং তাৎক্ষণিকভাবে ক্লাউড ড্রাইভে সিঙ্ক করে।
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full mt-2 text-left">
                  <div className="bg-gray-900 border border-gray-850 p-4 rounded-xl flex flex-col gap-1">
                    <span className="text-sm">🗣️</span>
                    <h4 className="text-sm font-semibold text-slate-100">ইনটেলিজেন্ট বাংলা রূপান্তর</h4>
                    <span className="text-[10.5px] text-slate-400 leading-normal">Gemini Multimodal ইন্টেলিজেন্স দ্বারা অডিও থেকে সঠিক ও ব্যাকরণসম্মত বাংলা টেক্সট রূপান্তর।</span>
                  </div>
                  <div className="bg-gray-900 border border-gray-850 p-4 rounded-xl flex flex-col gap-1">
                    <span className="text-sm">☁️</span>
                    <h4 className="text-sm font-semibold text-slate-100">রিয়েল-টাইম ক্লাউড স্টোরেজ</h4>
                    <span className="text-[10.5px] text-slate-400 leading-normal">আপনার রূপান্তরসমূহ গুগল ক্লাউডে স্টোর থাকে, ফলে কোনো তথ্য হারানোর ভয় নেই।</span>
                  </div>
                  <div className="bg-gray-900 border border-gray-850 p-4 rounded-xl flex flex-col gap-1">
                    <span className="text-sm">👥</span>
                    <h4 className="text-sm font-semibold text-slate-100">সহযোগী সম্পাদনা</h4>
                    <span className="text-[10.5px] text-slate-400 leading-normal">বন্ধুদের আমন্ত্রন জানান। তারা একসাথে অডিও রূপান্তরগুলো পর্যালোচনা ও এডিট করতে পারবে।</span>
                  </div>
                </div>

                <button
                  id="hero-get-started-btn"
                  onClick={handleLogin}
                  className="mt-4 flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-gray-950 text-sm font-bold rounded-xl shadow-xl shadow-emerald-500/5 transition duration-150 hover:scale-[1.03] cursor-pointer"
                >
                  <LogIn className="w-5 h-5" />
                  <span>এখনই শুরু করুন</span>
                </button>

              </div>
            )}
          </>
        )}

      </main>

      {/* Collaboration and Permission settings Modal */}
      {collabModalRecord && user && (
        <CollaborationModal
          isOpen={!!collabModalRecord}
          onClose={() => setCollabModalRecord(null)}
          collaborators={collabModalRecord.collaborators || []}
          onAddCollaborator={handleAddCollaborator}
          onRemoveCollaborator={handleRemoveCollaborator}
          ownerEmail={user.email || ""}
        />
      )}

      {/* Footer copyright */}
      <footer className="mt-auto py-5 border-t border-gray-900 bg-gray-955 text-center text-slate-500 text-[10px] select-none font-sans">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center px-4 gap-2">
          <p className="flex items-center gap-1">
            <span>নির্মিত হয়েছে</span>
            <Heart className="w-3 h-3 text-red-500 fill-red-500" />
            <span>বাংলাদেশি ডেভেলপারদের জন্য</span>
          </p>
          <p className="font-mono">কণ্ঠলিপি © 2026 • AI Studio Verified Applet</p>
        </div>
      </footer>
    </div>
  );
}
