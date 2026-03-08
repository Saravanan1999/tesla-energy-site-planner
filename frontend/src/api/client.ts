const Env = {
  Local: "local",
  Prod: "prod",
} as const
type Env = typeof Env[keyof typeof Env]

const API_URLS: Record<Env, string> = {
  [Env.Local]: "http://localhost:8080",
  [Env.Prod]: "https://tesla-energy-site-planner.onrender.com",
};

// VITE_APP_ENV controls which backend to target (local | prod).
// Defaults to "local" so the app works out of the box without any .env file.
// Override in frontend/.env.local to point a local dev server at the prod backend.
const appEnv = (import.meta.env.VITE_APP_ENV ?? Env.Local) as Env;

export const BASE_URL = import.meta.env.VITE_API_URL ?? API_URLS[appEnv] ?? API_URLS[Env.Local];

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
};
