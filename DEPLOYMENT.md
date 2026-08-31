# Deployment workflow

- `main` = النسخة المعتمدة.
- `preview` = التعديلات والتجارب قبل الاعتماد.
- Vercel production should deploy from `main`.
- Preview deployments should be created from `preview`.
- Do not store Telegram bot tokens or other secrets in GitHub. Use Vercel Environment Variables.
