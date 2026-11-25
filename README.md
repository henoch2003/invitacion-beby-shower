# Invitación Baby Shower · Aysel Alessia + Mesa de regalos

100 % gratis: Vercel (plan Hobby) + Upstash Redis (plan gratuito).

- `public/index.html` → la invitación (los invitados eligen regalos en "Lista de regalos")
- `public/admin.html` → panel privado (`tu-sitio.vercel.app/admin.html`): agrega regalos con foto o link de imagen y ve quién eligió cada uno
- `public/og-image.jpg` → imagen que aparece al compartir el link (WhatsApp, Facebook)
- `api/` y `lib/` → funciones de Vercel y acceso a la base de datos

## Variables en Vercel
- `ADMIN_PASSWORD` = contraseña para entrar al panel.
- La base de datos Upstash Redis crea sus variables al conectarla (`KV_REST_API_URL`/`KV_REST_API_TOKEN`, o con otro prefijo; el código lo detecta solo).

Después de cambiar variables: Deployments → ⋯ → Redeploy.

## Cómo funciona lo de "ya no disponible"
Al elegir, se usa `HSETNX` (guardar solo si no existe), que es atómico: si dos personas eligen el mismo regalo
al mismo tiempo, solo una lo logra. Los invitados solo ven "Ya elegido"; únicamente el panel muestra el nombre.
