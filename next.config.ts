import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Evita que Turbopack/webpack empaquete pdfkit dentro de vendor-chunks,
  // lo que rompía la ruta relativa a data/Helvetica.afm (ENOENT en Windows).
  serverExternalPackages: ["pdfkit", "svg-to-pdfkit"],
};

export default nextConfig;
