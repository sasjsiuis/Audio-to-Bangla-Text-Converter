export interface TranscriptionRecord {
  id: string;
  title: string;
  text: string;
  audioDataUrl?: string; // Storable audio URL or base64 data for playback
  createdAt: any; // Firebase Timestamp or ISO date string
  updatedAt: any; // Firebase Timestamp or ISO date string
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  collaborators?: string[]; // Array of emails authorized to edit or view
  isPublic?: boolean; // If true, anyone with link can view
  audioDuration?: number; // duration of translation segments in seconds
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export enum RecordStatus {
  IDLE = "idle",
  RECORDING = "recording",
  PAUSED = "paused",
  PROCESSING = "processing",
  CONVERTED = "converted",
  ERROR = "error"
}
