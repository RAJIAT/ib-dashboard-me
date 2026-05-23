# مراجعة وتأكيد جاهزية Directus

راجعت السكربتات والملفات المتولّدة. اللي محتاج تعديل قبل التطبيق الفعلي:

## ⚠️ مشاكل مكتشفة

### 1. الـ Flows تستخدم API خاطئ لـ `exec`
الكود الحالي في `scripts/directus-bootstrap.ts`:
```js
const me = await $trigger.services.usersService.readOne(...)
```
هاد ما يشتغل. عملية `exec` في Directus 10+ ما عندها وصول مباشر لـ services. الطريقة الصح: flow متعدد الخطوات (Read Data → Condition → Reject).

**الإصلاح**: إعادة كتابة الـ 3 flows (`enforce_sales_routing`, `quote_kind_guard`, `auto_assigned_at`) كـ multi-operation chains:
- Operation 1: `read` على `directus_users` بـ `key = $accountability.user`
- Operation 2: `condition` يقارن payload مع نتيجة الـ read
- Operation 3 (reject path): `exec` يرمي Error

### 2. ثغرة محتملة في صلاحيات `requests.update` للـ agent
حالياً السماح بتعديل حقل `agent` يعتمد فقط على الـ flow. لو الـ flow فشل بالتحميل، أي sales يقدر يحوّل الطلب لأي مستخدم. 

**الإصلاح**: تقسيم الصلاحيات:
- `requests.update` (الحقول العادية: status, customer_*) — صلاحية عادية مع filter الـ ownership.
- `requests.update` (حقل `agent`) — يصير عبر **custom endpoint** `/items/requests/:id/reassign` (Directus Flow بـ webhook trigger) اللي يطبّق المنطق سيرفر-سايد.

### 3. Operations chaining في الـ bootstrap ناقص
لو flow فيه أكثر من operation، الكود الحالي ما بيربطهم بـ `resolve`/`reject` pointers، فقط بيحدّد الأولى entry point. مع التعديل #1، الـ flows صارت multi-op، فلازم نضيف ربط `resolve` بين العمليات.

## ✅ مراجعة باقي العناصر (تمام)

| عنصر | الحالة |
|---|---|
| Collections schema (branches, requests, notes, files, notifications, audit, app_settings) | ✓ |
| `directus_users` extension fields | ✓ |
| Relations (M2O FKs بكل أنواعها: int/uuid/string) | ✓ idempotent |
| Roles (Admin / Supervisor / Agent) | ✓ |
| Permission filters (`$CURRENT_USER.branch`, `_or` ownership) | ✓ |
| Permissions wipe-and-recreate via `comment="lovable-bootstrap"` | ✓ |
| Seed script (idempotent: branch by code, user by email, request by id) | ✓ |
| Two-pass relationships (supervisor + assigned_underwriter بعد إنشاء الـ users) | ✓ |
| `directusClient.ts` (login + auto-refresh + `dxRequest`) | ✓ |
| Demo store ما تأثّر | ✓ |

## 📋 خطوات الإصلاح المقترحة (build mode)

1. **إعادة كتابة الـ flows** في `scripts/directus-bootstrap.ts` كـ multi-operation chains مع `resolve`/`reject` pointers صحيحة.
2. **تقسيم permission `requests.update`** للـ agent: حقل `agent` يطلع من الـ allowed fields، وننشئ flow webhook منفصل `/flows/trigger/<reassign-flow-id>` للـ reassignment.
3. **تحديث `directusClient.ts`** بدالة `dxReassignRequest(requestId, newAgentId)` تنادي الـ webhook flow بدل `PATCH /items/requests`.
4. **تحديث `docs/directus-schema.md`** بنفس التعديلات (المنطق المعدّل + endpoint الـ reassign).
5. **اختبار محلي**: تشغيل Directus عبر Docker (`docker run directus/directus`) مع Postgres محلي، ثم:
   ```bash
   DIRECTUS_URL=http://localhost:8055 DIRECTUS_ADMIN_TOKEN=… \
     bun run scripts/directus-bootstrap.ts && \
     bun run scripts/directus-seed.ts
   ```
   والتحقق من:
   - 3 رولز موجودة، كل واحد بصلاحياته.
   - login بـ `sales@demo.com` وتجربة قراءة `requests` (لازم يشوف بس طلباته).
   - login بـ `supervisor@demo.com` وقراءة users (لازم بس Dubai).
   - محاولة sales يحوّل لـ underwriter غير `assigned_underwriter` — لازم يفشل.

## 📦 ملفات المتأثرة (build mode)

- `scripts/directus-bootstrap.ts` — إصلاح section الـ flows.
- `scripts/directus-permissions.json` — إخراج `agent` من حقول `requests.update`.
- `src/services/directusClient.ts` — إضافة `dxReassignRequest`.
- `docs/directus-schema.md` — تحديث جدول الـ flows + endpoint الـ reassign.

ما رح يتعدّل: `scripts/directus-seed.ts`, `.env.example`, demoStore أو api.ts الحاليين.
