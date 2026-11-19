# نقش · دعوات رقمية

الموقع: https://naqsh.mohanedadnan99.workers.dev

- `server/` — خادم Cloudflare Worker (الطلبات، الدفع عبر Wayl، صفحات الدعوات) والواجهة في `server/public/index.html`.
- المفاتيح السرية (`WAYL_KEY`, `WEBHOOK_SECRET`) محفوظة كـ secrets على Cloudflare فقط، وليست في هذا المستودع.
- النشر: `cd server && npx wrangler deploy`

إحدى خدمات مجموعة J8JI · تطوير مهند العدنان
