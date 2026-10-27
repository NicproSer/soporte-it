# Notificaciones por correo (SMTP Gmail)

## 1. Configurar Gmail
1. Activa la verificación en dos pasos de tu cuenta Google.
2. Crea una **contraseña de aplicación** en https://myaccount.google.com/apppasswords
3. En `.env` agrega:
```
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_USER="remite.tucorreo@gmail.com"   # el correo que enviará los mensajes
SMTP_PASS="abcd efgh ijkl mnop"          # contraseña de aplicación (sin espacio también sirve)
MAIL_TO_ADMIN="correo1@empresa.com,correo2@empresa.com"  # LOS 2 DESTINATARIOS, separados por coma
```

## 2. Flujo de una visita técnica
1. El cliente llena el formulario público **/solicitar** → se crea la solicitud con estado `PENDING`
   y **llega un correo a los 2 administradores** indicando que deben ingresar al sistema a proponer un día.
2. En el **dashboard**, cada solicitud tiene el botón **"Proponer fecha"**: eliges día/hora + mensaje opcional
   y presionas "Enviar propuesta". Se guarda (`PROPOSED`) y **llega un correo al cliente** con 3 botones:
   - **Aceptar la fecha** → la visita queda `CONFIRMADA`.
   - **Rechazar** → queda `RECHAZADA` (puede adjuntar motivo).
   - **Proponer otra fecha** → el cliente sugiere un nuevo día (`RESCHEDULE_REQUESTED`).
3. Cada respuesta del cliente **notifica de nuevo a los 2 administradores** por correo y actualiza el dashboard.
   Los enlaces de respuesta expiran a los 30 días y solo funcionan una vez.

## 3. Notas
- Si falta SMTP_USER/SMTP_PASS o MAIL_TO_ADMIN, la solicitud se guarda igual y el panel muestra el error de correo; nada se pierde.
- Para probar sin Gmail real puedes usar https://ethereal.email (mismas variables SMTP).

## 4. Desplegar en Vercel (producción) — checklist de variables
En Vercel → Project → Settings → **Environment Variables**, define (Production):

| Variable | Valor recomendado | Nota |
|---|---|---|
| `DATABASE_URL` | cadena de MongoDB Atlas | usa la opción **"Connect / Standard connection string"** (`mongodb+srv://…`) y agrega la IP `0.0.0.0/0` (o el rango de Vercel) en Network Access |
| `NEXT_PUBLIC_APP_URL` | `https://soporte-it-neon.vercel.app` | ⚠️ **obligatorio**: sin esto los botones Aceptar/Rechazar de los correos apuntan a `localhost:3000` |
| `JWT_SECRET` | valor largo aleatorio | distinto al de local |
| `SMTP_HOST` | `smtp.gmail.com` | ⚠️ **NO uses `smtp.googlemail.com`**: puede resolver solo a IPv6 y Vercel no soporta IPv6 → el correo falla en producción aunque funcione en local |
| `SMTP_PORT` | `465` | el código reintenta automáticamente con 587 |
| `SMTP_USER` / `SMTP_PASS` | Gmail + contraseña de aplicación | revisa que no tengan espacios ni comillas extra al pegarlas |
| `MAIL_TO_ADMIN` | `correo1@…,correo2@…` | opcional: además se notifica a todos los ADMIN/TECHNICIAN de la BD |

**Cómo comprobarlo sin esperar una solicitud:** en los **Logs de Vercel** cada envío ahora registra
`[mail] ✔ enviado "asunto" → destinatarios` o `[mail] ✖ FALLÓ …` con el motivo exacto
(faltan credenciales, DNS IPv6-only, timeout, autenticación rechazada…). Si ves `✖`, el texto
del log te dice qué variable corregir.

**Nota sobre funciones serverless:** los envíos se hacen "en segundo plano" para no provocar 504;
si un envío queda cortado por inactividad de la función, verás `✖ FALLÓ` en los logs y podrás
reenviar desde el panel (botón de recordatorio/repropuesta).
