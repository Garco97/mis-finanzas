# Mis Finanzas

Webapp móvil para gestionar ingresos y gastos, con sincronización opcional en Google Sheets.

## Publicación en GitHub Pages (gratis)

1. Sube el repo a GitHub (ya configurado como privado)
2. En el repo: **Settings → Pages**
3. Source: **Deploy from a branch**
4. Branch: `main` / carpeta `/ (root)`
5. Guarda y espera 1-2 minutos
6. Tu app estará en: `https://TU_USUARIO.github.io/mis-finanzas/`

## Conectar Google Sheets (gratis)

### 1. Crear la hoja

1. Crea una [Google Sheet](https://sheets.google.com) nueva
2. Puedes dejarla vacía; el script creará la pestaña `Movimientos`

### 2. Instalar el script

1. En la hoja: **Extensiones → Apps Script**
2. Borra el código por defecto y pega el contenido de `google-apps-script/Code.gs`
3. Guarda el proyecto

### 3. Publicar como aplicación web

1. **Implementar → Nueva implementación**
2. Tipo: **Aplicación web**
3. Ejecutar como: **Yo**
4. Quién tiene acceso: **Cualquiera**
5. Implementar y copia la URL (termina en `/exec`)

### 4. Configurar la app

1. Abre `sheets-config.js`
2. Pega la URL en `SHEETS_WEB_APP_URL`
3. Haz commit y push (o edita directamente en GitHub)

```js
export const SHEETS_WEB_APP_URL = 'https://script.google.com/macros/s/XXXX/exec';
```

4. Recarga la app: arriba a la derecha debería poner **Sheets** en verde

## Probar en local

```bash
python3 -m http.server 8765
```

Abre http://localhost:8765 (no abras el HTML directamente).

## Estructura

```
mis-finanzas/
├── index.html              # App
├── app.js                  # Lógica
├── styles.css              # Estilos
├── storage.js              # Local + Sheets
├── sheets-config.js        # URL de tu Apps Script
├── google-apps-script/
│   └── Code.gs             # Script para Google Sheets
└── sheets-config.example.js
```

## Notas

- Sin configurar Sheets, los datos se guardan solo en el navegador (`localStorage`)
- La URL del Apps Script funciona como clave de acceso: no la compartas públicamente
- Puedes ver y editar los movimientos directamente en la hoja de cálculo
