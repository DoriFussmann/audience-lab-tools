export type FieldStatus = "empty" | "confirmed" | "skipped";

export type FieldState = {
  value: string;
  status: FieldStatus;
  inferred: boolean;
};

export type FieldMap = Record<string, FieldState>;

export type Proposal = {
  key: string;
  value: string;
  inferred?: boolean;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type TaxRow = {
  id: string;
  premade: string;
  category: string;
  subcategory: string;
  description: string;
  keywords: string;
  type: string;
};

export type Match = {
  id: string;
  why: string;
  confidence: number;
};

export type SavedAudience = {
  row: TaxRow;
  why: string;
  confidence: number;
};

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  define: {
    fields: FieldMap;
    messages: ChatMessage[];
  };
  find: {
    messages: ChatMessage[];
    audience: SavedAudience | null;
    taxonomyName: string;
  };
};
