# feat: Login de administrador, Dashboard con datos reales y botón "Generar etiquetas"

**Rama:** `feature/admin-login-dashboard-labels` → `main`
**Commit:** `a2a2b68` · 18 archivos · +832 / −106

## 📋 Resumen

Implementa tres requerimientos solicitados:

1. **Login de administrador** (`/login`) — autenticación real con sesión protegida, accesible solo para rol `ADMIN`.
2. **Dashboard** (`/dashboard`) — panel de administración que muestra en tiempo real los datos que antes solo aparecían como ilustrativos en el home (métricas, solicitudes recientes, equipos registrados y últimas etiquetas).
3. **Botón "Generar etiquetas"** — genera el lote de etiquetas y descarga el PDF desde la propia interfaz, sin necesidad de ejecutar comandos `npm` en la terminal.

## 🔐 1. Login de administrador

- Formulario correo + contraseña con el estilo visual del proyecto.
- Verificación de contraseña con **bcryptjs** (hash en base de datos, nunca en texto plano).
- Sesión guardada en cookie **HTTP-only firmada con JWT** (`jose`), expiración de 8 horas.
- Solo usuarios con rol `ADMIN` pueden ingresar; cualquier otro rol recibe el mensaje *"área exclusiva para administradores"*.
- Creación del usuario admin inicial mediante script: `npm run seed:admin`
  (por defecto `admin@empresa.com` / `Admin123!`, configurable por variables de entorno).
- El home ahora incluye el botón visible **"Ingresar como administrador"**.

## 📊 2. Dashboard

Protegido por middleware de sesión; todos los datos se consultan a MongoDB vía Prisma:

| Sección | Contenido |
|---|---|
| Métricas | Etiquetas disponibles/total, equipos registrados, visitas pendientes, intervenciones |
| Solicitudes recientes | Visitas técnicas con estado (Pendiente, Confirmada…), cliente, contacto y dirección |
| Equipos registrados | Código de etiqueta, ubicación y estado |
| Últimas etiquetas | Tabla con código, estado, lote y fecha de generación |

Incluye botón de **Cerrar sesión**.

## 🏷️ 3. Generar etiquetas sin npm

Nueva sección en el dashboard con campo de cantidad (1–500) y botón **"Generar etiquetas"** que:

1. Crea el lote en la BD (`LOT-YYYYMMDD-XXXXXX`) con los mismos códigos QR permanentes del script original.
2. Renderiza el PDF de stickers en `output/`.
3. **Descarga el PDF automáticamente** en el navegador y refresca las métricas del panel.

La lógica quedó centralizada en `src/lib/labels.ts`; `npm run labels:generate` sigue funcionando porque ahora reutiliza ese mismo módulo (sin duplicar código).

## 🗂️ Archivos principales

| Archivo | Rol |
|---|---|
| `src/lib/auth.ts` | Sesión JWT (crear/verificar/logout) |
| `src/lib/labels.ts` | Lógica compartida de generación de etiquetas + PDF |
| `src/app/login/page.tsx` | Página de login |
| `src/app/dashboard/page.tsx` + `actions.tsx` | Panel de admin y server actions |
| `src/app/api/login/route.ts` | `POST /api/login` (valida credenciales y rol ADMIN) |
| `src/app/api/logout/route.ts` | `POST /api/logout` |
| `src/app/api/labels/generate/route.ts` | `POST /api/labels/generate` (crea lote + PDF) |
| `src/app/api/labels/generate/[batchId]/pdf/route.ts` | `GET` descarga del PDF del lote |
| `scripts/seed-admin.ts` | Alta del usuario administrador inicial |
| `.env.example`, `README-ADMIN.md` | Configuración e instrucciones paso a paso |

## ✅ Verificación

- `next build` compila sin errores de tipos ni lint ✓
- Rutas protegidas: `/dashboard` y todas las APIs redirigen/rechazan si no hay sesión válida de admin ✓
- ⚠️ No hubo MongoDB disponible en el entorno de desarrollo, por lo que la validación fue por compilación/tipos. Seguir `README-ADMIN.md` para ejecutarlo contra la base de datos real: configurar `.env` → `npx prisma db push` → `npm run seed:admin` → `npm run dev`.

## 🔒 Notas de seguridad antes de producción

- Cambiar `JWT_SECRET` por uno aleatorio seguro.
- Cambiar la contraseña por defecto del admin tras el primer ingreso.
- Las credenciales por defecto están documentadas solo para desarrollo local.

## Dependencias nuevas

`bcryptjs`, `jose` (autenticación/sesión) — ya incluidas en `package.json`.
