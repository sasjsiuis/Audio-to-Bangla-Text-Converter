# Security Spec: Bangla Audio Transcript Storage

This document outlines the security architecture and validation tests for the Bangla Audio Transcript storing service, built on Firestore.

## 1. Data Invariants

1. **Owner Integrity**: Every transcription document must belong to a valid authenticated user (`ownerId == request.auth.uid`).
2. **Immutability of Provenance**: Once created, the `ownerId`, `ownerEmail`, and `createdAt` fields can never be mutated.
3. **Restricted Deletion**: Only the owner (creator) can delete a transcription.
4. **Access Control (Read)**: Unauthenticated lookup is blocked. Logged-in users can only read a transcription if:
   - They are the owner.
   - They are an authorized collaborator listed in the `collaborators` array.
   - The document is explicitly flagged as `isPublic == true`.
5. **Collab Collaboration (Write)**: Collaborators can update the transcription text but cannot alter other fields (like tags, title, public visibility, or ownership details).
6. **Denial of Wallet Protection**: Maximum text size is capped at 1MB, preventing extreme storage bloat, and the ID must match strict regex formats (`isValidId`).

---

## 2. The "Dirty Dozen" Adversarial Payloads

Here are 12 malicious payloads that should be explicitly blocked by Firestore rules.

| # | Attack Target | Payload / Operation Attempted | Target Path / Method | Expected Result |
|---|---|---|---|---|
| 1 | Identity Spoofing | Create document with `ownerId="malicious_user"` | `/transcriptions/doc1` [CREATE] | `PERMISSION_DENIED` |
| 2 | Privilege Escalation | Update document to change `ownerId` to yourself | `/transcriptions/doc1` [UPDATE] | `PERMISSION_DENIED` |
| 3 | Read Scraping / Blanket Reads| Fetch all transcriptions without specifying owner filter | `/transcriptions` [LIST] | `PERMISSION_DENIED` |
| 4 | State Poisoning - Length | Write transcription text with > 1MB of garbage characters | `/transcriptions/doc1` [CREATE] | `PERMISSION_DENIED` |
| 5 | State Poisoning - Type | Write `audioDuration` as a String instead of a Number | `/transcriptions/doc1` [CREATE] | `PERMISSION_DENIED` |
| 6 | Ghost Field Injection| Create document with extra unvetted fields (e.g. `isAdmin: true`) | `/transcriptions/doc1` [CREATE] | `PERMISSION_DENIED` |
| 7 | Path ID Traversal | Injection of traversal characters in ID: `../../hack` | `/transcriptions/../../hack` [CREATE] | `PERMISSION_DENIED` |
| 8 | Impersonating Collaborator Write | A collaborator attempting to change the document's `title` | `/transcriptions/doc1` [UPDATE] | `PERMISSION_DENIED` |
| 9 | Hijacking Ownership Private Data | Non-collaborator attempting to read a private transcription | `/transcriptions/doc1` [GET] | `PERMISSION_DENIED` |
| 10| Client Time Spoofing | Creating document with `createdAt` set to a future or custom date | `/transcriptions/doc1` [CREATE] | `PERMISSION_DENIED` |
| 11| Non-Owner Deletion | Signed-in user trying to delete a file owned by someone else | `/transcriptions/doc1` [DELETE] | `PERMISSION_DENIED` |
| 12| Temporal Tampering | Updating document without changing `updatedAt` to server-time | `/transcriptions/doc1` [UPDATE] | `PERMISSION_DENIED` |

---

## 3. Test Runner Reference

These conditions are tested and verified mathematically by the comprehensive `firestore.rules` setup, ensuring bulletproof lockouts for all 12 items.
