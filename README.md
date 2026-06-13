# BlakFinanceHub

App web estatica de control financiero personal conectada a Supabase Realtime.

## Stack

- Frontend: HTML, CSS, JavaScript, Chart.js, Lucide
- Backend: Supabase Postgres + Auth + Realtime
- Deploy: Vercel static hosting

## Supabase

- Project: `blakfinancehub`
- Project ref: `rhbtzgjhlfkflqeqpcso`
- URL: `https://rhbtzgjhlfkflqeqpcso.supabase.co`
- Public key usada en el navegador: `sb_publishable_RWRWCKvm-uoEQMWQosAuAg_g4-PqU1Z`

El esquema esta en `schema.sql`. Las tablas usan RLS y solo usuarios autenticados pueden leer/escribir sus propias transacciones y categorias personalizadas.

## Uso local

Abre `index.html` en el navegador. Para probar auth con magic links o email confirmation, configura en Supabase Auth la URL publica que uses en Vercel cuando ya tengas el dominio final.

## Vercel

Este proyecto es estatico. Vercel puede desplegarlo desde la raiz del repositorio sin comando de build.
