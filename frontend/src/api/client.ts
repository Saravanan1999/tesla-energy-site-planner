enum Env {
  Local = "local",
  Prod = "prod",
}

const ENV: Env = Env.Prod;

const API_URLS: Record<Env, string> = {
  [Env.Local]: "http://localhost:8080",
  [Env.Prod]: "https://tesla-energy-site-planner.onrender.com",
};

export const BASE_URL = import.meta.env.VITE_API_URL ?? API_URLS[ENV];

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
