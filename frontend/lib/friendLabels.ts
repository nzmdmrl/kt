"use client";

/**
 * Arkadaş etiketleri (aile / iş / diğer) — arayüz tarafı sözlüğü.
 * Sunucudaki geçerli değerler: backend/app/models/friend_label.py → FRIEND_LABELS.
 */

export type FriendLabelKey = "aile" | "is" | "diger";

export const FRIEND_LABELS: { key: FriendLabelKey; icon: string; name: string; color: string }[] = [
  { key: "aile", icon: "👨‍👩‍👧", name: "Aile", color: "#c44a7e" },
  { key: "is", icon: "💼", name: "İş", color: "#4a90d9" },
  { key: "diger", icon: "🙂", name: "Diğer", color: "#3aa76d" },
];

export function labelInfo(key: string) {
  return FRIEND_LABELS.find((l) => l.key === key);
}

export type Friend = {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  label?: string;
  status?: string;   // online | in_match | offline
};
