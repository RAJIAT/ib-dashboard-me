# مخطط Directus جاهز للتطبيق

الهدف: لما يجي الـ Admin Key، نطبّق كل شي دفعة وحدة عبر سكربت `bootstrap.ts` (ينفّذ على Directus REST/SDK باستخدام `DIRECTUS_URL` + `DIRECTUS_ADMIN_TOKEN`). كل القواعد الموجودة حالياً بالـ demo (branch isolation، sales→assigned UW، supervisor scope، إلخ) متمثّلة بـ Permissions.

---

## 1) Collections & Fields

### `branches`
| field | type | notes |
|---|---|---|
| id | integer (PK, auto) | |
| name | string (req, unique) | |
| code | string (req, unique) | |
| address | text | |
| phone | string | |
| is_active | boolean (default true) | |

### `directus_users` (extension)
حقول إضافية على الـ users المدمج:
- `app_role` — dropdown: `admin` / `supervisor` / `agent`
- `staff_type` — dropdown: `underwriter` / `sales` / null
- `branch` — M2O → `branches`
- `agent_code` — string (مثل UW-001، SLS-001) — unique
- `supervisor` — M2O → `directus_users` (self)
- `assigned_underwriter` — M2O → `directus_users` (self) — للـ sales فقط
- `pending_approval` — boolean (default false)
- `active` — boolean (default true)

> ملاحظة: نستخدم `directus_users` بدل collection `agents` منفصل، عشان نستفيد من المصادقة المدمجة. حقل `agentId` بالـ frontend يصير `agent_code`.

### `requests`
| field | type | notes |
|---|---|---|
| id | string (PK) — مثل REQ-1001 | |
| uuid | uuid (auto) | |
| agent | M2O → users | المالك الحالي |
| origin_agent | M2O → users | السيلز الأصلي |
| branch | M2O → branches | |
| status | dropdown: `new`/`linkSent`/`processing`/`sold`/`rejected`/`reupload` | |
| customer_name, customer_email, customer_phone | string | |
| assigned_at | timestamp | |
| date_created, date_updated, user_created, user_updated | (system) | |

### `request_notes`
- id (PK), request (M2O→requests), author (M2O→users), author_role, text, kind (`comment`/`missing`), resolved_at, date_created

### `request_files` (موحّد لكل المرفقات والصور والـ quotes)
- id (PK), request (M2O→requests), file (M2O→`directus_files`)
- `kind` dropdown: `registration` / `license` / `emirates` / `vehicle_image` / `vehicle_video` / `inspection` / `attachment` / `missing_attachment` / `quote`
- `uploaded_by` M2O→users, `uploaded_at`

### `notifications`
- id, recipient (M2O→users), kind, title, body, link, read (bool), date_created

### `audit_log`
- id, ts, actor (M2O→users), actor_role, actor_branch, action, entity_type (`request`/`agent`/`auth`/`branch`), entity_id, entity_label, branch, before (json), after (json), meta (json)

### `app_settings` (singleton)
- require_admin_approval (boolean)

> Storage: استخدام `directus_files` مع S3/MinIO سيرفر داخل الإمارات (للتوطين).

---

## 2) Roles & Policies

3 رولز رئيسية + Policies تحدد الصلاحيات. الـ scope متكامل عبر `_and` filters على `branch` و `assigned_underwriter`.

### Role: **Admin**
- App access: full
- كل العمليات على كل الـ collections (CRUD).
- يقدر يغيّر `assigned_underwriter` و`supervisor` و`branch` لأي يوزر.

### Role: **Supervisor**
Policies:
- `branches`: read فقط.
- `users`:
  - **Read**: `{ branch: { _eq: "$CURRENT_USER.branch.id" } }`
  - **Create**: مسموح، مع enforcement أن `branch = $CURRENT_USER.branch` و`app_role ∈ {agent}`.
  - **Update**: same branch فقط، ولا يقدر يعدّل `app_role` لـ `admin/supervisor`، ولا يقدر يفعّل `pending_approval=false` إلا لو الـ approval setting يسمح.
  - يقدر يغيّر `assigned_underwriter` ضمن نفس الفرع.
  - **Delete**: ممنوع (admin فقط).
- `requests`: full CRUD على `{ branch: { _eq: "$CURRENT_USER.branch.id" } }`.
- `request_notes`, `request_files`: نفس قيد الفرع عبر علاقة `request.branch`.
- `audit_log`: read على نفس الفرع.
- `notifications`: read/update الخاصة فيه.

### Role: **Agent** (sales/underwriter)
Policies على `requests`:
- **Read**: `{ _or: [ { agent: { _eq: "$CURRENT_USER" } }, { origin_agent: { _eq: "$CURRENT_USER" } } ] }`
- **Update** (status/customer/notes/files): same filter.
- **Create**: السيلز فقط — enforcement: `agent = $CURRENT_USER`, `origin_agent = $CURRENT_USER`, `branch = $CURRENT_USER.branch`.
- **Reassign** (تغيير `agent`):
  - Custom field validation عبر **Flow** (لأن permissions ما تكفي للمنطق الشرطي):
    - لو `$CURRENT_USER.staff_type = sales` → الـ `agent` الجديد لازم يساوي `$CURRENT_USER.assigned_underwriter` — وإلا reject.
    - لو underwriter → الـ target لازم يكون underwriter بنفس الفرع، أو `origin_agent` (إرجاع للسيلز).
- `users`: read على نفس الفرع (لعرض الأسماء بالواجهة) — الحقول الحساسة (`password`, `email`, `assigned_underwriter`) محجوبة عبر **Field Permissions**.
- `request_files`: read/create على الـ requests اللي يملكها. الـ `kind=quote` مقتصر على underwriter (validation عبر Flow).
- `notifications`: read/update الخاصة فيه فقط.

### Public role
- `/q/:id` (مشاركة عرض السعر مع العميل) → عبر Custom **Endpoint** أو Flow بـ trigger `webhook`، يعرض quote بدون مصادقة بناءً على `request.uuid`. لا قراءة مباشرة للـ collection.

---

## 3) Flows (Business Logic)

| Flow | Trigger | Action |
|---|---|---|
| `enforce_sales_routing` | event: `requests.items.update` (filter) | لو المُحدِّث sales وكان `agent` تغيّر → تأكّد التارجت = `assigned_underwriter` للسيلز، وإلا fail. |
| `auto_return_to_sales` | event: `request_files.items.create` (kind=quote) | يحدّث `requests.agent = origin_agent` تلقائياً. |
| `notify_on_assign` | event: `requests.items.update` (agent changed) | ينشئ `notifications` للمستلم الجديد. |
| `audit_logger` | events متعددة (create/update/delete على requests/users) | يكتب صف بـ `audit_log`. |
| `approval_gate` | event: `users.create` | لو `require_admin_approval=true` → set `pending_approval=true` + notify admins. |

---

## 4) Frontend Wiring

`src/services/api.ts` (الموجود حالياً يقرأ من demoStore) → يتحوّل لطبقة تنادي Directus SDK:
- إضافة `src/services/directusClient.ts` يقرأ من `import.meta.env.VITE_DIRECTUS_URL` + token من login.
- استبدال كل `dsGetX` بـ `directus.request(readItems('...'))`.
- `login()` → `directus.login(email, password)` (يرجع access+refresh token).
- التوكن يحفظ بـ `localStorage` + auto-refresh.
- المنطق الموجود (validation الفرع، `assignedUnderwriterId`) يصير client-side guard فقط — السيرفر هو الحَكَم.

---

## 5) Bootstrap Script

ينضاف ملف `scripts/directus-bootstrap.ts` يحتوي:
1. إنشاء الـ collections بالترتيب (branches → users extensions → requests → notes/files → notifications → audit → settings).
2. إنشاء Roles + Policies + Permissions (JSON دقيق لكل filter).
3. إنشاء Flows.
4. Seed: 3 فروع + admin + supervisors + agents + 5 طلبات تجريبية (نفس بيانات `seedAgents`/`seedRequests`).

التشغيل:
```bash
DIRECTUS_URL=https://… DIRECTUS_ADMIN_TOKEN=… bun run scripts/directus-bootstrap.ts
```

---

## 6) Deliverables (لما نطبّق بالـ build mode)

1. `docs/directus-schema.md` — توثيق المخطط أعلاه بالتفصيل (مرجع دائم).
2. `scripts/directus-bootstrap.ts` — سكربت idempotent (يتحقّق قبل الإنشاء).
3. `scripts/directus-seed.ts` — بيانات تجريبية (منفصل عن البنية).
4. `scripts/directus-permissions.json` — كل الـ permission filters كـ JSON قابل للمراجعة.
5. `src/services/directusClient.ts` — العميل الحقيقي (معطّل افتراضياً، ينشّط بـ env var).
6. `.env.example` يوضّح `VITE_DIRECTUS_URL` + `DIRECTUS_ADMIN_TOKEN` (للسكربت فقط، مو للفرونت).

> **المهم**: ما رح نلمس `src/services/api.ts` الحالي ولا نكسر الـ demo. الـ Directus integration رح يكون wrapper موازي ينشّط لما `VITE_USE_DIRECTUS=true`.

---

## ملاحظات توطين البيانات (UAE)

- Self-host Directus على VPS داخل الإمارات (Etisalat/du/AWS me-central-1).
- ملفات `directus_files` تروح S3-compatible storage داخلي (MinIO على نفس الـ region).
- DB: Postgres داخل الإمارات.
- لا CDN خارجي للملفات الحساسة.
