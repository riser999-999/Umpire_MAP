# Umpire Map

## Supabase-Setup

Ligen, Spiele und Geocoding-Ergebnisse werden nicht mehr live von der BSM-API
geladen, sondern per periodischem Sync-Job (`scripts/sync.ts`, ausgeführt über
den GitHub-Actions-Workflow `.github/workflows/sync.yml` alle 30 Minuten) in
Supabase zwischengespeichert. Das Frontend liest ausschließlich aus der
Datenbank.

Dafür werden folgende Umgebungsvariablen/Secrets benötigt:

**Lokal / Vercel** (`.env.local` bzw. Vercel-Projekteinstellungen):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**GitHub Actions Secrets** (Repository-Settings → Secrets and variables → Actions):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BSM_API_KEY`

Der Service-Role-Key wird ausschließlich im Sync-Job verwendet und darf
niemals im Frontend-Code oder in `NEXT_PUBLIC_*`-Variablen landen.

Vor dem ersten Sync muss das SQL-Schema (Tabellen `leagues`, `venues`,
`matches` inkl. RLS-Policies) einmalig im Supabase SQL-Editor ausgeführt
werden. Das Schema kann bei Bedarf nachgereicht werden, falls es noch nicht
im Repo liegt.
