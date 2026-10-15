export interface Player {
  id: string;
  duprId: string | null;
  fullName: string;
  doubles: string | null;
  singles: string | null;
  location: string | null;
}

export type LookupStatus = "matched" | "multiple_candidates" | "not_found" | "error";

export interface LookupResult {
  input: string;
  status: LookupStatus;
  player: Player | null;
  candidates: Player[] | null;
  message?: string;
}
