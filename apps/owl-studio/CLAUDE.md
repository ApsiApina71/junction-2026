# owl-studio

Owl Studio, the company's web app for Onboarding Owl. The contract is [`docs/specs/owl-contract.md`](../../docs/specs/owl-contract.md); keep `src/lib/types.ts` and `src/lib/api.ts` in step with it. The Data view (`src/views/DataView.tsx`) states what `apps/owl-api` does with data: update it when that code changes.

## Run

```sh
npm run dev
```

Needs `apps/owl-api` running on `VITE_API_URL` (default `http://localhost:8000`; see `apps/owl-api/CLAUDE.md`). Without a model key, start it with `OWL_MOCK_ASK=1 OWL_MOCK_CHECK=1`. The address and an access token can also be set in the app under Settings, and `?theme=dark` or `?theme=light` in the address forces a theme.

## Verify

```sh
npm ci
npm run lint
npm test
npm run build
```
