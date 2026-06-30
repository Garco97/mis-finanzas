# Mis Finanzas — contexto del proyecto

## Deploy
- GitHub Pages: https://garco97.github.io/mis-finanzas/
- Repo: https://github.com/Garco97/mis-finanzas

## Auth Google
- Client ID en `google-config.js`
- Proyecto GCP: `662148207869`
- Desktop y móvil: login con GIS token client (sin client_secret)
- Sesión en `localStorage` (más fiable en móvil y PWA)

## Google Cloud — URIs requeridas
- Orígenes JS: `https://garco97.github.io`, `http://localhost:8765`
- Redirect URIs (móvil): ya no necesarias
- API activa: Google Sheets API, Google Drive API
- Una sola hoja por cuenta: Drive primero, luego caché local
- Sincroniza al volver a la pestaña (visibilitychange)

## Datos
- Hoja "Mis Finanzas" en Drive del usuario (pestaña Movimientos)
- Caché local en `localStorage`

## Problemas resueltos
- Sheets API desactivada → activar en GCP
- Guardado silencioso → toast + guardar local primero
- Login unificado móvil/PC con GIS token client
- Borrado en Sheets → limpiar filas A2:E antes de reescribir (batchUpdate no borra sobrantes)
