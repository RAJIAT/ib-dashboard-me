## Goal

Extend the customer upload form on `/` to capture:
- **KYC (mandatory):** Customer Full Name + Email
- **Optional uploads:** Passport photo + Vehicle Photos (multiple)

These should flow through to the request details page so admins/agents can see them.

## Scope

### 1. Upload form (`src/routes/index.tsx`)
Add a small KYC card above the document upload grid with two inputs (validated with `zod`):
- `customerName` — required, trimmed, 2–100 chars
- `customerEmail` — required, valid email, ≤ 255 chars

Add two optional upload sections below the existing 3 cards:
- **Passport** — single optional upload (reuse `UploadCard` with an `optional` flag)
- **Vehicle Photos** — multi-image optional upload (new `MultiUploadCard` component, max ~6 photos)

Submit button stays disabled until 3 mandatory docs + valid KYC are present. Optional fields don't block submit.

### 2. New component `src/components/MultiUploadCard.tsx`
Same visual style as `UploadCard`, but accepts multiple images, shows them as a small thumbnail grid with remove buttons and an "add more" tile.

### 3. `UploadCard` minor change
Add an `optional?: boolean` prop to render an "(Optional)" badge next to the label. No behavior change.

### 4. API layer (`src/services/api.ts`)
Extend `submitUpload` input:
```ts
{
  agentId, customerName, customerEmail,
  images: { registration, license, emirates },
  optional?: { passport?: File; vehiclePhotos?: File[] }
}
```
Extend `InsuranceRequest` type:
```ts
customerName?: string;
customerEmail?: string;
images: { registration; license; emirates; passport?: string; vehiclePhotos?: string[] }
```

**Mock path:** store via `fileToStoredDataUrl` (vehicle photos as array of data URLs) in localStorage.

**Directus path:** upload optional files via `dxUploadFile`, send `customer_name`, `customer_email`, `passport` (file id), `vehicle_photos` (array of file ids or M2M depending on schema) to `/items/requests`.

### 5. Directus client (`src/services/directus.ts`)
Extend `DxRequest` type and `dxCreateRequest` payload with `customer_name`, `customer_email`, `passport`, `vehicle_photos`. Update `mapDx` in `api.ts` to expose them.

### 6. Request details (`src/routes/requests.$id.tsx`)
- Show "Customer" block (name + email) under the request header.
- Render Passport `ImgCard` if present.
- Render a Vehicle Photos gallery (grid of `ImgCard`s) if present.

### 7. Translations (`src/i18n/translations.ts`)
Add to both `ar` and `en`:
- `upload.kyc.title`, `nameLabel`, `namePlaceholder`, `emailLabel`, `emailPlaceholder`, `optional`
- `upload.cards.passport`, `vehiclePhotos`, `addPhoto`
- `upload.errors.nameRequired`, `nameTooShort`, `emailRequired`, `emailInvalid`
- `details.customer`, `passport`, `vehiclePhotos`

### 8. Backend (Directus) — user action required
The Directus `requests` collection needs new fields. Document in chat after implementation:
- `customer_name` (string)
- `customer_email` (string)
- `passport` (file, nullable)
- `vehicle_photos` (files M2M, nullable)
Public role needs create permission on these fields.

## Out of scope
- Editing KYC after submit
- Email verification / OTP
- Admin filtering by customer name/email (can be a follow-up)

## Files touched
- `src/routes/index.tsx` (KYC + optional uploads + validation)
- `src/components/UploadCard.tsx` (optional badge)
- `src/components/MultiUploadCard.tsx` (new)
- `src/services/api.ts` (types + submitUpload)
- `src/services/directus.ts` (DxRequest + create payload)
- `src/routes/requests.$id.tsx` (display new data)
- `src/i18n/translations.ts` (strings)
