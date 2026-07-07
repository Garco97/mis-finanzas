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
   - URIs de redirección autorizadas (móvil):
     - `https://TU_USUARIO.github.io/mis-finanzas/`
     - `http://localhost:8765/`
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

## Categorías automáticas

Al escribir la nota de un gasto (p. ej. "Mercadona"), la app sugiere la categoría
automáticamente. Puedes cambiarla a mano; la app **aprende** tu elección para esa
nota y la reutilizará la próxima vez.

## Atajo de Apple (meter gastos rápido)

La app puede recibir un gasto por URL, ideal para un Atajo de Apple / Siri:

```
https://TU_USUARIO.github.io/mis-finanzas/?amount=12,50&note=Cafe&type=gasto&cat=comida
```

Parámetros:

- `amount` — importe (obligatorio). Acepta coma o punto.
- `type` — `gasto` (por defecto) o `ingreso`.
- `note` — descripción opcional.
- `cat` — categoría opcional (`comida`, `casa`, `transporte`…). Si falta, se adivina por la nota.

Cómo crear el Atajo en iPhone:

1. App **Atajos** → nuevo atajo → acción **"Pedir entrada"** (número) para el importe.
2. (Opcional) otra **"Pedir entrada"** (texto) para la nota.
3. Acción **"Abrir URL"** con la URL de arriba, insertando las variables en `amount` y `note`.
4. Añádelo a la pantalla de inicio o actívalo con "Oye Siri".

> Requiere tener la sesión de Google iniciada en el navegador que abre el atajo.
> El gasto se guarda, se sincroniza con tu hoja y la URL se limpia sola.
