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
