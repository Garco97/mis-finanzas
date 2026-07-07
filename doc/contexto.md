# Mis Finanzas — contexto del proyecto

## Deploy
- GitHub Pages: https://garco97.github.io/mis-finanzas/
- Repo: https://github.com/Garco97/mis-finanzas

## Auth Google
- Client ID en `google-config.js`
- Proyecto GCP: `662148207869`
- PC: popup con Google Identity Services
- Móvil: redirección OAuth (token en URL, sin client_secret)
- Sesión en `localStorage`

## Google Cloud — URIs requeridas
- Orígenes JS: `https://garco97.github.io`, `http://localhost:8765`
- Redirect URIs (móvil): `https://garco97.github.io/mis-finanzas/`, `http://localhost:8765/`
- API activa: Google Sheets API, Google Drive API
- Una sola hoja por cuenta: Drive primero, luego caché local
- Sincroniza al volver a la pestaña (visibilitychange)

## Datos
- Hoja "Mis Finanzas" en Drive del usuario (pestaña Movimientos)
- Caché local en `localStorage`
- Columnas: id, type, amount, note, date, category (A-F)
- Categorías de gasto en `categories.js`; selector en modal (solo gastos); desglose en Estadísticas
- Pestaña "Categorías": filtra por categoría y lista todos sus gastos (sin límite de fechas)

## Problemas resueltos
- Sheets API desactivada → activar en GCP
- Guardado silencioso → toast + guardar local primero
- Sesión Google: 90 días en local; token se renueva en silencio antes de caducar
- Hoja: caché primero (estable); Drive solo como fallback y mantiene la anterior si existe
- Guardado optimista: aplica local + cierra modal al instante; Sheets sincroniza en segundo plano
- `storage.subscribeSync`/`isSyncing`: bloquea Aceptar y Actualizar mientras hay petición
- Al arrancar se fusiona local+remoto por si quedó un cambio sin subir
- Borrado en Sheets → limpiar filas A2:E antes de reescribir (batchUpdate no borra sobrantes)
