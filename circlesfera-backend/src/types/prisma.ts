export interface Report {
  id: string;
  reporterId: string;
  reason: string;
  details: string | null;
  status: string;
  targetType: string;
  targetId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchHistory {
  id: string;
  userId: string;
  query: string;
  createdAt: Date;
}
