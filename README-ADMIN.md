# Acceso de administrador, Dashboard y generación de etiquetas con un clic

Esta rama agrega:

1. **Login de administrador** (`/login`) — autenticación con cookie HTTP-only firmada (JWT vía `jose`) y contraseña verificada con `bcryptjs`. Solo la cuenta con rol `ADMIN` puede entrar; los técnicos reciben un mensaje de "área exclusiva para administradores".
2. **Dashboard real** (`/dashboard`) — replica el diseño del home, pero con datos consultados directamente a la base de datos (MongoDB + Prisma):
   - Etiquetas disponibles / totales
   - Equipos registrados
   - Visitas pendientes
   - Intervenciones
   - Listados de solicitudes recientes, equipos y últimas etiquetas generadas
   - Botón para **cerrar sesión**
3. **Botón "Generar etiquetas"** dentro del dashboard — crea el lote de QR en la base de datos y descarga el PDF listo para imprimir **con un solo clic**, sin escribir comandos npm. El script `npm run labels:generate` sigue funcionando como alternativa por terminal (ambos usan la misma lógica en `src/lib/labels.ts`).

## Cómo usarlo

```bash
# 1. Configura las variables de entorno
cp .env.example .env   # ajusta DATABASE_URL, NEXT_PUBLIC_APP_URL y JWT_SECRET

# 2. Instala dependencias y genera el cliente de Prisma
npm install
npx prisma generate
npx prisma db push     # crea las colecciones en MongoDB

# 3. Crea tu usuario administrador (una sola vez)
npm run seed:admin
# Por defecto: admin@empresa.com / Admin123!
# Personalízalo: ADMIN_EMAIL=tu@correo.com ADMIN_PASSWORD=TuClave npm run seed:admin

# 4. Levanta la aplicación
npm run dev
```

Luego entra a **http://localhost:3000/login**, inicia sesión y usa el botón **"Generar etiquetas"** del panel: se creará el lote (`LOT-YYYYMMDD-XXXXXX`), se guardará el PDF en `output/` y el navegador lo descargará automáticamente. Las métricas del dashboard se actualizan solas tras generar.

## Rutas nuevas

| Ruta | Descripción |
| --- | --- |
| `/login` | Formulario de inicio de sesión (solo administradores) |
| `/dashboard` | Panel protegido con datos reales de la BD |
| `POST /api/login` | Verifica credenciales y crea la sesión |
| `POST /api/logout` | Cierra la sesión |
| `POST /api/labels/generate` | Genera un lote de etiquetas (requiere sesión de admin) |
| `GET /api/labels/generate/:batchId/pdf` | Descarga el PDF del lote generado |

## Archivos principales

- `src/lib/auth.ts` — sesión JWT (cookie httpOnly, 8 h de expiración)
- `src/lib/labels.ts` — lógica compartida de generación de etiquetas + PDF
- `src/app/login/page.tsx` — pantalla de acceso
- `src/app/dashboard/page.tsx` — panel protegido (Server Component)
- `src/app/dashboard/actions.tsx` — botones "Generar etiquetas" y "Cerrar sesión"
- `scripts/seed-admin.ts` — crea/actualiza el usuario administrador

> ⚠️ Antes de publicar, cambia `JWT_SECRET` y la contraseña del administrador.
