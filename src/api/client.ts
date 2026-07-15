import type { ApiErrorBody, AuthResponse, ListResponse } from "../types";

// const DEFAULT_API_BASE_URL = "http://localhost:3020";
const DEFAULT_API_BASE_URL = "https://bmon.gradusy24.kz";

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
const API_PREFIX = "/api/v1";
const REFRESH_TOKEN_KEY = "cashier_copilot_refresh_token";

let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

function normalizeApiBaseUrl(value: string | undefined) {
  const rawValue = value?.trim() || DEFAULT_API_BASE_URL;
  return rawValue.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: ApiErrorBody,
  ) {
    super(body.message);
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getRefreshToken() {
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string | null) {
  if (token) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(response.status, body ?? { error: "API_ERROR", message: response.statusText });
  }

  return body as T;
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) return false;

  const auth = await parseResponse<AuthResponse>(response);
  setAccessToken(auth.accessToken);
  setRefreshToken(auth.refreshToken);
  return true;
}

function buildHeaders(init: RequestInit) {
  const headers: Record<string, string> = {
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
  if (!(init.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  return { ...headers, ...init.headers };
}

export async function apiRequest<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
    ...init,
    headers: buildHeaders(init),
  });

  if (response.status === 401 && retry && (await refreshAccessToken())) {
    return apiRequest<T>(path, init, false);
  }

  if (response.status === 401 && retry) {
    onUnauthorized?.();
  }

  return parseResponse<T>(response);
}

export async function apiBlob(path: string, init: RequestInit = {}, retry = true): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
    ...init,
    headers: buildHeaders(init),
  });

  if (response.status === 401 && retry && (await refreshAccessToken())) {
    return apiBlob(path, init, false);
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: "API_ERROR", message: response.statusText }));
    throw new ApiError(response.status, body);
  }

  return response.blob();
}

function normalizeListResponse<T>(value: unknown): ListResponse<T> {
  if (Array.isArray(value)) {
    return { data: value as T[], pagination: { page: 1, limit: value.length, total: value.length } };
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      return {
        data: record.data as T[],
        pagination: normalizePagination(record.pagination, record.data.length),
      };
    }
    if (record.data && typeof record.data === "object") {
      const nested = record.data as Record<string, unknown>;
      if (Array.isArray(nested.data)) {
        return {
          data: nested.data as T[],
          pagination: normalizePagination(nested.pagination ?? record.pagination, nested.data.length),
        };
      }
      if (Array.isArray(nested.items)) {
        return {
          data: nested.items as T[],
          pagination: normalizePagination(nested.pagination ?? record.pagination, nested.items.length),
        };
      }
    }
    if (Array.isArray(record.items)) {
      return {
        data: record.items as T[],
        pagination: normalizePagination(record.pagination, record.items.length),
      };
    }
  }

  return { data: [], pagination: { page: 1, limit: 0, total: 0 } };
}

function normalizePagination(value: unknown, fallbackTotal: number) {
  if (value && typeof value === "object") {
    const pagination = value as Record<string, unknown>;
    return {
      page: typeof pagination.page === "number" ? pagination.page : 1,
      limit: typeof pagination.limit === "number" ? pagination.limit : fallbackTotal,
      total: typeof pagination.total === "number" ? pagination.total : fallbackTotal,
    };
  }
  return { page: 1, limit: fallbackTotal, total: fallbackTotal };
}

export const api = {
  login: (email: string, password: string) =>
    apiRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => apiRequest<AuthResponse["user"]>("/auth/me"),
  logout: () => apiRequest<void>("/auth/logout", { method: "POST" }),
  list: async <T>(path: string) => normalizeListResponse<T>(await apiRequest<unknown>(path)),
  get: <T>(path: string) => apiRequest<T>(path),
  blob: (path: string) => apiBlob(path),
  post: <T>(path: string, body?: unknown) =>
    apiRequest<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  upload: <T>(path: string, formData: FormData) => apiRequest<T>(path, { method: "POST", body: formData }),
  patch: <T>(path: string, body: unknown) =>
    apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
};
