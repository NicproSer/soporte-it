import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { UserRole } from "@prisma/client";

export const SESSION_COOKIE = "soporteit_session";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 horas

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Falta JWT_SECRET en el archivo .env");
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
};

export async function createSession(payload: SessionPayload): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ email: payload.email, name: payload.name, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_MAX_AGE)
    .sign(getSecret());
}

export async function setSessionCookie(payload: SessionPayload) {
  const token = await createSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return {
      sub: String(payload.sub),
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: (payload.role as UserRole) ?? "TECHNICIAN",
    };
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}
