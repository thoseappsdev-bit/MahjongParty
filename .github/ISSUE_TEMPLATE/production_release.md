---
name: Production release checklist
about: Track a production release candidate
labels: release
---

## Gates

- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm check:cloudflare`
- [ ] `pnpm production:check`

## External Checks

- [ ] Cloudflare deployment completed
- [ ] Live `/health` smoke passes
- [ ] Security headers are present
- [ ] Discord Activity URL/OAuth settings checked
- [ ] Multiplayer smoke tested on desktop and mobile