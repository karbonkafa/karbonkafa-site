// Terminal-themed identity titles. Opt-in display only (CD4 Ownership).
// Earned purely from the user's own activity — no scarcity, no punishment.
// Criteria are cumulative, so an earned title never gets revoked.

export interface TitleStats {
  logged: number;   // entries logged (library size)
  types: number;    // distinct media types in the library
  lists: number;    // public lists created
  replays: number;  // replay logs (logs table; 0 until Faz 3 ships)
}

export interface Title {
  id: string;
  label: string;            // terminal display form
  desc: string;             // how it's earned (shown in the picker)
  earned: (s: TitleStats) => boolean;
}

export const TITLES: Title[] = [
  { id: 'rookie',      label: 'ROOKIE_USER',           desc: 'İlk kaydını logla',          earned: s => s.logged >= 1 },
  { id: 'operator',    label: 'OPERATOR',              desc: '10+ öğe logla',              earned: s => s.logged >= 10 },
  { id: 'sysadmin',    label: 'SYSADMIN',              desc: '50+ öğe logla',              earned: s => s.logged >= 50 },
  { id: 'kernel',      label: 'KERNEL_ARCHITECT',      desc: '150+ öğe logla',             earned: s => s.logged >= 150 },
  { id: 'multiformat', label: 'MULTI_FORMAT_ARCHIVIST', desc: '3+ farklı medya türü logla', earned: s => s.types >= 3 },
  { id: 'curator',     label: 'LIST_CURATOR',          desc: '3+ liste oluştur',           earned: s => s.lists >= 3 },
  { id: 'rewind',      label: 'REWIND_SPECIALIST',     desc: '5+ yeniden deneyim (replay)', earned: s => s.replays >= 5 },
];

export const titleById = (id?: string | null): Title | null =>
  TITLES.find(t => t.id === id) ?? null;

export const earnedTitles = (s: TitleStats): Title[] =>
  TITLES.filter(t => t.earned(s));
