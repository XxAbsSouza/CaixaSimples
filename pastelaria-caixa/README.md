# Caixa Pastelaria

1. Supabase: crie um projeto, abra SQL Editor, rode `supabase/schema.sql`.
2. `cp .env.example .env` e preencha URL e anon key (Project Settings > API).
3. `npm install && npm run dev` (teste local) e `npm run build` (valida TypeScript).
4. Suba para um repositório Git, importe na Vercel (preset Vite) e defina
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em Environment Variables. Deploy.
