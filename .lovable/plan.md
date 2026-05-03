
# خطة نسخة Demo (Local-Only)

تحويل التطبيق لنسخة تجريبية مستقلة بالكامل تشتغل في المتصفح بدون Directus / Supabase / أي API. كل البيانات تتخزن في `localStorage` و الملفات تتحول لـ Data URLs.

## 1. طبقة بيانات Demo جديدة

أنشئ `src/services/demoStore.ts`:
- `demoUsers` (3 حسابات جاهزة):
  - `admin@demo.com` / `demo123` — Admin
  - `supervisor@demo.com` / `demo123` — Supervisor (فرع Dubai)
  - `agent@demo.com` / `demo123` — Agent (id: A001, فرع Dubai)
- `demoBranches`: Dubai, Abu Dhabi, Sharjah
- `demoAgents`: 3 agents وهميين
- `demoRequests`: 4 طلبات seed بحالات مختلفة (new / processing / sold / reupload) مع صور placeholder
- كل الـ CRUD يكتب على `localStorage` تحت مفتاح `demo:*`
- يرسل `aib:requests-changed` event بعد كل تغيير → الـ polling في `useRequestsLive` يلتقطها فوراً

## 2. إعادة كتابة `src/services/api.ts`

استبدال كل `dx*` calls بـ helpers من `demoStore`:
- `login()` → فحص الإيميل/الباسورد من `demoUsers`
- `submitUpload()` → يحفظ الطلب لوكال + يحول الملفات لـ Data URLs (مع compression للصور عبر `imagePrep`)
- `listRequests / getRequest / updateRequestStatus / addRequestNote / etc.` كلها على store الذاكرة
- نفس الـ types و الـ exports تبقى زي ما هي → لا تعديلات بباقي المكونات

## 3. حذف كل ما هو backend-related

- حذف: `src/services/directus.ts`, `src/integrations/supabase/*`, مجلد `supabase/`, مجلد `directus/`, `DIRECTUS_SETUP.md`
- حذف: كل routes تحت `src/routes/api/` (submit-upload, upload-file, resolve-agent, role-id, agent-users, notes, directus.$, reupload-*)
- إزالة `audit.ts` references للسيرفر، تحويل audit log لـ localStorage بسيط

## 4. صفحة Login محسّنة (التعبئة التلقائية)

في `src/routes/login.tsx` نضيف 3 أزرار كبيرة فوق الفورم:
```
[Login as Admin]  [Login as Supervisor]  [Login as Agent]
```
كل زر يعبّي الإيميل/الباسورد ويسجّل دخول مباشرة.

## 5. صفحة الرفع (`/`) — زر تعبئة تلقائية

نضيف زر "Fill demo data" يعبّي:
- اسم/إيميل/تلفون عميل وهمي
- 3 صور placeholder كملفات للـ registration / license / emirates
- agent_id افتراضي = A001
عشان أي حدا يعمل submit بضغطة واحدة ويشوف النتيجة على dashboard.

## 6. Demo Banner + Reset

- Banner ثابت أعلى كل صفحة: "Demo Mode — data is stored locally on this browser"
- زر "Reset Demo Data" في الـ DashboardShell (header) يعيد كل البيانات للـ seed الأصلي
- زر اختيار اللغة بقي زي ما هو

## 7. Branding Generic

- استبدال "Al Rahaib" / "AIB" بـ "DocFlow Demo" بكل النصوص و translations
- استبدال اللوغو بأيقونة عامة (Lucide `FileCheck2` مثلاً)
- إزالة أي references لـ insurance-specific copy لو فيه (الإبقاء على المعنى العام: insurance documents flow)

## 8. تنظيف ملفات أخرى

- إزالة `auth-middleware.ts`, `client.server.ts` imports
- تنظيف `package.json` من dependencies غير المستخدمة (Supabase, إلخ) — اختياري
- مسح `.env` للقيم Supabase (تبقى الملف فاضي)
- حذف ملفات الـ migrations في `supabase/migrations/`

## النتيجة

- يفتح أي حدا الرابط → يلاقي banner + 3 أزرار دخول
- يدخل بأي دور → يشوف dashboard مع بيانات seed
- يفتح Tab/متصفح ثاني (نفس الجهاز) → نفس الداتا
- يفتح من تلفون مختلف → بيانات seed نضيفة (لأن لكل جهاز localStorage مستقل) — هذا مطلوب حسب اختيارك "لوكال 100%"
- زر Reset يرجّع كل شيء

## ملاحظة مهمة

اختيارك "لوكال 100%" يعني: لو رفعت طلب من اللابتوب، **لن يظهر** على التلفون لأن localStorage مش مشترك بين الأجهزة. الطريقة الوحيدة لمشاركة نفس البيانات بين الأجهزة هي backend. لو لاحقاً بدك "نفس الداتا تظهر على التلفون لما ترفع من اللابتوب"، رجعلي وبنفعّل الخيار الثاني (Lovable Cloud).
