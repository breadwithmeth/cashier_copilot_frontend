export type Role =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "OPERATIONS_DIRECTOR"
  | "REGIONAL_MANAGER"
  | "STORE_MANAGER"
  | "QUALITY_CONTROL"
  | "HR"
  | "ANALYST"
  | "OPERATOR"
  | "EMPLOYEE"
  | "VIEWER"
  | "ANALYTICS_SERVICE"
  | "INTEGRATION_SERVICE";

export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AuthResponse = {
  user: User;
  accessToken: string;
  refreshToken: string;
};

export type ApiErrorBody = {
  error: string;
  message: string;
  details?: unknown;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
};

export type ListResponse<T> = {
  data: T[];
  pagination: Pagination;
};

export type DashboardSummary = {
  totalReceipts?: number;
  totalViolations?: number;
  totalPossibleFinancialRiskAmount?: string | number;
  cameraAvailability?: Array<{
    videoStatus?: string;
    audioStatus?: string;
    _count?: number;
  }>;
  receiptsTotal?: number;
  receiptsChecked?: number;
  highRiskViolations?: number;
  potentialRiskAmount?: number;
  integrationErrors?: number;
  serviceScore?: number;
  falsePositiveRate?: number;
  averageReviewMinutes?: number;
};

export type ViolationStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "CONFIRMED"
  | "REJECTED"
  | "FALSE_POSITIVE"
  | "CORRECTED"
  | "RESOLVED"
  | "ESCALATED_TO_MANAGER"
  | "ESCALATED_TO_HR"
  | "ESCALATED_TO_QUALITY_CONTROL"
  | "IGNORED";

export type Violation = {
  id: string;
  eventType?: string;
  violationType?: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title?: string;
  occurredAt?: string;
  confidence?: number | string;
  status: ViolationStatus;
  storeId?: string;
  registerId?: string;
  employeeId?: string;
  receiptId?: string;
  createdAt: string;
};

export type Store = {
  id: string;
  name: string;
  code?: string;
  city?: string;
  address?: string;
  timezone?: string;
  isActive?: boolean;
};

export type Register = {
  id: string;
  name?: string;
  code?: string;
  storeId?: string;
  registerNumber?: number;
  workstationId?: string;
  isActive?: boolean;
};

export type Camera = {
  id: string;
  name?: string;
  code?: string;
  storeId?: string;
  registerId?: string;
  locationType?: string;
  videoRtspUrl?: string;
  audioRtspUrl?: string;
  isActive?: boolean;
};

export type Workstation = {
  id: string;
  name?: string;
  code?: string;
  storeId?: string;
  registerId?: string;
  isActive?: boolean;
};

export type Receipt = {
  id: string;
  receiptNumber?: string;
  operationType?: "SALE" | "RETURN" | "CANCELLATION" | "VOID" | "RECEIPT_CORRECTION";
  status?: string;
  totalAmount?: number | string;
  paidAmount?: number | string;
  total?: number | string;
  paid?: number | string;
  storeId?: string;
  registerId?: string;
  employeeId?: string;
  createdAt: string;
};

export type WorkstationNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  displayMode: "TOAST" | "BANNER" | "MODAL_NON_BLOCKING";
  status: "PENDING" | "ACKNOWLEDGED" | "DISMISSED" | "CORRECTED";
};

export type RoiPoint = {
  x: number;
  y: number;
};

export type RoiPolygon = {
  label: string;
  points: RoiPoint[];
  metadata: Record<string, unknown>;
};

export type RoiImage = {
  id: string;
  width: number;
  height: number;
  capturedAt?: string;
};

export type CameraRois = {
  image?: RoiImage;
  referenceImage?: RoiImage;
  cashierRoi: RoiPolygon[];
  scanRoi: RoiPolygon[];
  customerRoi: RoiPolygon[];
};

export type SpeakerType = "CASHIER" | "CUSTOMER" | "SYSTEM" | "UNKNOWN";

export type SpeechEvent = {
  id: string;
  text: string;
  speakerType?: SpeakerType;
  language?: string;
  confidence?: number;
  storeId?: string;
  cameraId?: string;
  registerId?: string;
  sessionId?: string;
  startedAt: string;
  endedAt?: string;
};

export type TimelineItem<T = unknown> = {
  type: string;
  at: string;
  data: T;
};

export type TimelineResponse<T = unknown> = {
  data: Array<TimelineItem<T>>;
};
