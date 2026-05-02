## المشكلتان المُكتشفتان

### 1) النواقص تأخّرت بالظهور
صفحة تفاصيل الطلب `/requests/$id` لا تعمل polling. الـ`subscribeRequests` الموجود فيها هو مجرد `window.addEventListener` على نفس التبويب — لا يلتقط أي تغيير يحدث في متصفّح آخر (متصفّح العميل عند رفع النواقص). فالموظّف يرى التحديث فقط عند:
- إعادة تحميل الصفحة يدوياً، أو
- الرجوع لقائمة الطلبات (التي تعمل polling كل 4 ثواني) ثم العودة.

### 2) الصور لا تظهر (placeholder فارغ + "File wasn't available on site")
المشكلة في `ImgCard` ← `useAssetUrl` ← `resolveAssetUrl`:
- ملفات الـ Directus تُحفظ كـ URL مباشر مثل `/api/directus/assets/<id>` (وليس بادئة `storage:`).
- الشرط في `useAssetUrl` يقول: «إن لم يبدأ بـ `storage:` استخدم الـ URL كما هو دون جلب bearer».
- النتيجة: الـ`<img src>` يضرب `/api/directus/assets/<id>` **بدون** Authorization header، فيرفضه Directus (403/redirect)، فيظهر placeholder فارغ. هذا يطابق ما تظهره أيقونة "🚫 File wasn't available on site" في لقطة الشاشة.

كذلك المرفقات تستخدم `<a href={a.url} download>` مباشرة على نفس URL غير المُصرّح، فعند الفتح تنزّل ملفاً فارغاً (0 KB كما في صورتك).

---

## الخطة

### A. تسريع ظهور النواقص (real-time من جهة العميل)

في `src/routes/requests.$id.tsx`:
1. إضافة polling خفيف على تفاصيل الطلب (كل 4 ثواني) مع إيقافه عند `document.hidden` ثم استئنافه عند العودة، وإعادة فتش فورية على `visibilitychange`.
2. مقارنة بـ"signature" (عدد الملاحظات + عدد المرفقات الناقصة + status) قبل `setReq` لتجنّب re-renders بدون داعٍ.
3. الإبقاء على `subscribeRequests` للتحديث الفوري داخل نفس التبويب.

في `src/routes/api/public/reupload-submit.ts`:
- تثبيت ترتيب التنفيذ: رفع كل الملفات → إنشاء صفوف `request_missing_attachments` → resolve كل ملاحظات `missing` المفتوحة → flip status إلى `processing`. (هو حالياً صحيح؛ نتأكد فقط من `await` على كل خطوة لمنع سباق سريع.)

### B. إصلاح عرض الصور والمرفقات

في `src/services/directus.ts`:
- `isDirectusAssetUrl`: حالياً يقارن بـ `${DIRECTUS_URL}/assets/` فقط. نوسّعها لتقبل أي مسار يحتوي `/api/directus/assets/` (كل URLs الملفات تمرّ عبر هذا البروكسي بغضّ النظر عن الـ host).
- `dxFetchAsset`: يقبل إمّا fileId خام أو URL كامل ويستخرج الـ id منه.

في `src/services/api.ts → resolveAssetUrl`:
- استخراج fileId عبر regex على `/assets/([^/?#]+)` يعمل أصلاً، لكنه لا يُستدعى لأن `isDirectusAssetUrl` يفشل. بعد الإصلاح أعلاه سيمرّ التدفّق بشكل صحيح ويُرجع `blob:` URL مع mime.

في `src/routes/requests.$id.tsx → ImgCard`:
- يبقى كما هو — لكنه الآن سيستلم `blob:` URL صالح فيظهر الصورة.

في قسم "Other attachments" و "Missing attachments":
- استبدال `<a href={a.url} download>` بزر يستدعي helper `downloadAsset(a.url, a.name)` الذي:
  1. يستخرج fileId من URL،
  2. يستدعي `dxFetchAsset` (مع bearer)،
  3. يستخدم `triggerDownload(blob, name)`.
- إضافة معاينة inline للـ thumbnails في "Missing attachments" لما يكون `mime` صورة (كي يرى الموظّف ما رفعه العميل بدون تنزيل).

### C. تحسين تجربة سريعة إضافية
- إظهار toast «وصلت نواقص جديدة من العميل» إذا زاد عدد `missingAttachments` أثناء فتح الصفحة.

---

## الملفات المتأثّرة

1. `src/services/directus.ts` — توسيع `isDirectusAssetUrl` + قبول URL كامل في `dxFetchAsset`.
2. `src/services/api.ts` — لا تغيير منطقي، فقط التأكد من تمرير `dxFetchAsset` للـ fileId المستخرَج.
3. `src/routes/requests.$id.tsx`:
   - polling + signature
   - helper `downloadAsset` يستخدم bearer
   - استبدال روابط `<a download>` بأزرار
   - thumbnails للصور في "Missing attachments"
   - toast عند وصول نواقص جديدة
4. `src/routes/api/public/reupload-submit.ts` — مراجعة ترتيب الـ awaits (لا تغيير وظيفي كبير متوقّع).

## معايير القبول
- بعد رفع العميل لملف من اللينك، يظهر الملف عند الموظّف خلال **≤4 ثوانٍ** بدون refresh يدوي.
- صور الهوية/الرخصة/الملكية تظهر فعلياً داخل البطاقات (ليست بيضاء).
- الضغط على زر التنزيل ينزّل الملف الفعلي (وليس 0 KB).
- المرفقات الناقصة المرفوعة من العميل تظهر كـ thumbnails صور (لا روابط فقط).
