import "server-only";
import crypto from "node:crypto";

/** Caracteres seguros para contraseñas temporales (sin caracteres ambiguos). */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%$";

/** Genera una contraseña temporal legible de 12 caracteres. */
export function generateTempPassword(length = 12): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  // Garantiza complejidad mínima: mayúscula, minúscula, dígito y símbolo.
  return `Aa7!${out.slice(0, length - 4)}`;
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
