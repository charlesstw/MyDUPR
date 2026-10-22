export interface Player {
  id: string;
  duprId: string | null;
  fullName: string;
  doubles: string | null;
  singles: string | null;
  location: string | null;
  gender: string | null;
  age: number | null;
}

export interface SearchResult {
  hits: Player[];
  /** Total matches DUPR reports (may exceed hits.length), if it reports one. */
  total: number | null;
}

export type LookupStatus = "matched" | "multiple_candidates" | "not_found" | "error";

export interface LookupResult {
  input: string;
  status: LookupStatus;
  player: Player | null;
  /** Other people the input could mean; also kept on auto-matched name rows so the user can switch. */
  candidates: Player[] | null;
  message?: string;
}
