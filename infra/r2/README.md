# Cloudflare R2 — CORS policy for presigned uploads

The browser uploads **directly** to R2:

```
PUT https://<ACCOUNT_ID>.r2.cloudflarestorage.com/tirap-docs/uploads/2026-11-06/<uuid>.pdf
```

That host is a different origin from the app, so the bucket must allow it. Without
this policy the upload fails in the browser with a CORS error, even though the
presigned URL itself is valid.

## What the policy must allow

| Setting | Value | Why |
|---|---|---|
| Origin | `https://app.yourdomain.com` | The deployed app, exactly — no trailing slash |
| Method | `PUT` | The presigned upload |
| Method | `GET`, `HEAD` | Previews and downloads |
| Header | `Content-Type` | It is a signed header on the presigned PUT |
| Expose | `ETag` | Optional, useful for upload verification and retries |
| Max age | `3600` | Caches the preflight for one hour |

If you test on both the Render URL and the custom domain, list both. If you test
locally, add `http://localhost:5173`.

## Apply it

### Option A — script (recommended)

Create an R2 API token first: **Cloudflare dashboard → R2 → Manage R2 API Tokens →
Create API token**, permission **Object Read & Write**, scoped to this bucket.
Then create a **Cloudflare API token** with **Account → Workers R2 Storage → Edit**
(the R2 access key is not the same thing as a Cloudflare API token).

```powershell
$env:CLOUDFLARE_API_TOKEN = '<account token with Workers R2 Storage: Edit>'
$env:CF_ACCOUNT_ID        = '<account id>'      # same name the backend uses
$env:R2_BUCKET            = 'tirap-docs'
$env:APP_ORIGIN           = 'https://app.yourdomain.com'

node infra/r2/apply-cors.mjs
```

The script reads `CF_ACCOUNT_ID` (the same variable `backend/src/r2.js` uses) and
falls back to `R2_ACCOUNT_ID` if only that is set. `R2_BUCKET` must match the
bucket named in the backend environment.

Add the Render URL and local Vite while testing:

```powershell
node infra/r2/apply-cors.mjs `
  --extra-origin http://localhost:5173 `
  --extra-origin https://your-service.onrender.com
```

Preview the request without calling Cloudflare:

```powershell
$env:APP_ORIGIN = 'https://app.yourdomain.com'
node infra/r2/apply-cors.mjs --dry-run
```

### Option B — dashboard

R2 → your bucket → **Settings → CORS Policy → Edit**, then paste `cors.json`
(or `cors.dev.json` while testing). The dashboard uses the
`AllowedOrigins` / `AllowedMethods` shape; the script uses the Cloudflare API
shape and is the source of truth.

## Verify the preflight

Replace the account ID and bucket, then run:

```powershell
curl.exe -i -X OPTIONS "https://<ACCOUNT_ID>.r2.cloudflarestorage.com/tirap-docs/healthcheck.txt" `
  -H "Origin: https://app.yourdomain.com" `
  -H "Access-Control-Request-Method: PUT" `
  -H "Access-Control-Request-Headers: content-type"
```

A correct policy returns:

```text
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://app.yourdomain.com
Access-Control-Allow-Methods: PUT, GET, HEAD
Access-Control-Allow-Headers: content-type
Access-Control-Max-Age: 3600
```

If `Access-Control-Allow-Origin` is missing, the policy is not on the bucket, is
on a different bucket, or the origin does not match exactly.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `No 'Access-Control-Allow-Origin' header` | Policy not applied, wrong bucket, or origin mismatch (`http` vs `https`, trailing slash, `www`, Render URL vs custom domain) |
| Preflight succeeds but PUT returns 403 | `Content-Type` sent by the browser differs from the one signed into the URL |
| `SignatureDoesNotMatch` | Same cause: send exactly `file.type`, not a value with `; charset=...` |
| Works on `localhost` but not production | Production origin missing from `AllowedOrigins` |
| Works on the `onrender.com` URL but not the domain | Custom domain missing from `AllowedOrigins` |

## Security notes

- CORS is **not** authentication. It only tells the browser whether a page may
  read the response. Keep the bucket **private**; access is controlled by
  short-lived presigned URLs minted by the authenticated backend.
- The backend must choose the object key. Never let the browser supply a path.
- Keep presigned TTLs short (5–10 minutes) and re-check uploads with
  `HeadObject` before marking them ready.
- Never put R2 keys in `VITE_*` variables — those are compiled into the public
  frontend bundle.
