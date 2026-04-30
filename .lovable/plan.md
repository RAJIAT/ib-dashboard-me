## خطة الإطلاق الكاملة (بدون دومين/SSL)

الهدف: الموقع جاهز 100% على Directus، كل البيانات على السيرفر تبعك (74.162.122.193:8055)، بدون أي اعتماد على localStorage أو بيانات ديمو. الدومين + SSL آخر مرحلة منفصلة.

---

### المرحلة 1 — تجهيز Directus (أنا أعمله بالـ token)

أستخدم الـ Admin token اللي أعطيتني عشان أعمل عبر Directus REST API:

**أ) إنشاء Collection `branches`**
- name (string, required)
- code (string, required, unique)
- address (text)
- phone (string)
- is_active (boolean, default true)

**ب) ربط `directus_users` بـ `branches`**
- إضافة حقل `branch_id` (M2O → branches) للـ users
- (الحقل القديم `branch` كـ string يبقى للـ backward compatibility)

**ج) تنظيف Collections غير المستخدمة**
- مراجعة `request_missing_attachments`, `request_vehicle_media`, `requests_files` ودمجها/حذفها لو في تكرار
- التأكد من حقول `requests` كاملة (status, branch, agent_id, customer_*, الصور)

**د) ضبط Permissions**
- **Administrator**: full access (تلقائي)
- **Supervisor**: قراءة/تعديل الطلبات في فرعه فقط، إدارة Agents في فرعه
- **Agent**: إنشاء/تعديل طلباته فقط (assigned_to = $CURRENT_USER)

**هـ) إضافة فروع تجريبية**
- 3-5 فروع مبدئية حتى تقدر تجرب فوراً

---

### المرحلة 2 — تحويل الكود بالكامل لـ Directus

**أ) Requests (الطلبات)**
- استبدال كل `readRequests/writeRequests` (localStorage) بـ `dxListRequests/dxCreateRequest/dxUpdateRequest`
- رفع الصور عبر `dxUploadFile` بدل data URLs
- استرجاع الصور عبر `dxFetchAsset` بـ token
- حذف `REQUESTS_KEY`, `SEQ_KEY`, `AGENTS_KEY` نهائياً من api.ts

**ب) Notes & Attachments**
- ربط `request_notes` collection بشاشة الطلب
- ربط `request_attachments` collection
- ربط `request_missing_attachments` لرفع المستندات الناقصة من العميل

**ج) Audit Log**
- كل عملية حساسة (create/update/delete request, إنشاء agent, تغيير حالة) تُسجَّل في `audit_log`
- شاشة `/audit` تقرأ من Directus

**د) Branches**
- شاشة جديدة `/branches` لإدارة الفروع (Admin فقط)
- Dropdown الفرع في كل المكانات يقرأ من Directus بدل قائمة hardcoded

---

### المرحلة 3 — تنظيف نهائي

- حذف ملفات/دوال الديمو غير المستخدمة (`isDemoMode`, `resetDemo`, `DemoBanner` لو ما عاد له معنى)
- إزالة كل `localStorage` ما عدا: token الـ session، تفضيلات اللغة
- إصلاح warning المفاتيح المكررة في React (نهائياً، مش بس بالتنظيف)
- التحقق من كل المسارات (admin, agents, audit, branches, request detail, login, customer upload)

---

### المرحلة 4 — الجاهزية للإطلاق

- صفحة Login تعمل 100% عبر الـ proxy
- إنشاء فرع تجريبي + supervisor + agent للتأكد من الـ flow كامل
- اختبار: تسجيل دخول agent → إنشاء request → رفع صور → supervisor يراجع → admin يوافق
- التحقق من أن لا شيء يُكتب في localStorage باستثناء الـ session token

---

### ما يبقى لاحقاً (مؤجل حسب طلبك)

- إعداد دومين `docportal.alrahaib.com` (DNS A record)
- نقل الـ frontend من Lovable hosting إلى السيرفر
- تركيب Nginx + Let's Encrypt SSL
- نقل الـ proxy من `/api/directus` (Lovable) إلى Nginx reverse proxy

عند هذه النقطة الموقع كله سيعمل مباشرة من سيرفرك على HTTPS.

---

### تفاصيل تقنية

- استخدام Directus REST API عبر الـ token: `umhu-zcr7HgK-...` (محفوظ مؤقتاً للإعداد، يُلغى بعد الانتهاء)
- الـ proxy `/api/directus/$` الموجود حالياً يبقى كما هو — يحل مشكلة Mixed Content
- ملف الإعداد الرئيسي: `src/services/directus.ts` (الموسّع) و `src/services/api.ts` (يُعاد كتابته بالكامل ليصبح wrapper نظيف فوق Directus)
- Storage للصور: `directus_files` (مدمج، مش محتاج Supabase Storage)
- Supabase Cloud الموجود حالياً: لا يُستخدم في هذا المسار، يبقى للـ session تخزين فقط أو يُلغى لاحقاً

بعد الموافقة، أنفّذ كل المراحل دفعة واحدة بدون أسئلة وأقللك "الموقع جاهز".