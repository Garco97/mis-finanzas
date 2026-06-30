# Mis Finanzas

Webapp móvil para gestionar ingresos y gastos. Los datos se guardan en **tu propia Google Sheet**, protegida con **login de Google**.

## Cómo funciona la seguridad

- Cada usuario inicia sesión con **su cuenta de Google**
- La app crea una hoja **solo tuya** en tu Drive
- Sin tu login, nadie puede leer tus movimientos
- No hay URL pública ni clave estática compartida

## Configuración de Google Cloud (una vez)

1. Ve a [Google Cloud Console](https://console.cloud.google.com)
2. Crea un proyecto nuevo
3. Activa las APIs **Google Sheets API** y **Google Drive API**
4. **APIs y servicios → Pantalla de consentimiento OAuth**
   - Tipo: Externo (o Interno si es solo para ti)
   - Añade los scopes: `spreadsheets`, `drive.metadata.readonly`, `email`, `profile`
5. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente OAuth**
   - Tipo: Aplicación web
   - Orígenes autorizados:
     - `http://localhost:8765`
     - `https://TU_USUARIO.github.io`
   - URIs de redirección: no hace falta (login con token de Google Identity Services)
6. Copia el **Client ID** en `google-config.js`:

```js
export const GOOGLE_CLIENT_ID = '123456.apps.googleusercontent.com';
```

## Publicar en GitHub Pages

1. Repo: **Settings → Pages → Branch `main` → `/ (root)`**
2. URL: `https://TU_USUARIO.github.io/mis-finanzas/`
3. Añade esa URL en los orígenes autorizados de Google Cloud

## Probar en local

```bash
python3 -m http.server 8765
```

Abre http://localhost:8765

## Sin configurar Google (solo desarrollo)

Si `google-config.js` tiene el placeholder, la app funciona en **modo local** sin login (solo para desarrollar).

## Estructura

```
mis-finanzas/
├── index.html
├── app.js
├── storage.js          # Orquestación login + datos
├── google-auth.js      # OAuth con Google
├── sheets-api.js       # Lectura/escritura en tu Sheet
├── google-config.js    # Tu Client ID OAuth
└── google-config.example.js
```

## Flujo del usuario

1. Abre la app → **Continuar con Google**
2. Autoriza el acceso a Sheets
3. La app crea "Mis Finanzas" en tu Drive (solo la primera vez)
4. Tus movimientos se guardan ahí y en caché local del navegador

Puedes abrir la hoja desde Google Drive y ver o editar los datos manualmente.
