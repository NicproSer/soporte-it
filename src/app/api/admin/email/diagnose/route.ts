import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { diagnoseSMTP } from "@/lib/mailer-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Comprueba configuración, DNS IPv4, conexión TLS/STARTTLS y autenticación. */
export async function POST() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  try {
    const result = await diagnoseSMTP();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[mail] diagnostic endpoint failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "No se pudo completar el diagnóstico SMTP." }, { status: 500 });
  }
}
