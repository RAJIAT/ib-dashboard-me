## الهدف

إضافة سجل زمني (History/Timeline) لكل طلب يُظهر تفاصيل كل ما حدث عليه — متى وصل من العميل، متى استلمه السيلز، متى حوّله للأندر رايتر، متى رجّعه، أي تغيير في الأندر رايتر، تغيير الحالة، رفع/حذف مستندات، رفع عرض السعر، الملاحظات… إلخ. يظهر للأدمن (والمشرف اختياريًا) داخل صفحة الطلب نفسها.

## ما هو موجود حاليًا

- `src/services/audit.ts` + `logEvent()` في `src/services/api.ts` يكتبان سجلات في `demoStore` بحقل `entityId` (id الطلب)، مع `before/after/meta`.
- يتم تسجيل: `request.created`, `request.status_changed`, `request.reassigned`, ودخول/خروج، وأحداث الايجنت.
- صفحة `audit.tsx` تعرض سجل عام للأدمن، لكن لا يوجد عرض لكل طلب على حدة.

## الخطة

### 1) توسيع الأحداث المُسجَّلة (`src/services/api.ts`)

إضافة استدعاءات `logEvent` للأحداث التالية إن لم تكن موجودة، وكلها بـ `entityType: "request"` و `entityId = request.id`:

- `request.document_uploaded` — اسم المستند ونوعه (Emirates/License/Passport/Registration/Vehicle…)، meta: { docKey, fileName, size }
- `request.document_removed` — meta: { docKey, fileName, byRole }
- `request.reupload_requested` — لما السيلز/الأندر يطلب إعادة رفع مستند ناقص
- `request.note_added` — meta: { noteId, snippet }
- `request.quote_uploaded` / `request.quote_removed`
- `request.shared_with_customer` — لما يُرسَل عرض السعر/الرابط
- `request.assigned_to_underwriter` (تمييز عن `reassigned` العامة): meta: { fromSales, toUnderwriter }
- `request.returned_to_sales`
- `request.underwriter_changed` — لما الأندر يحوّل لأندر آخر، meta: { fromUnderwriter, toUnderwriter, reason? }

تحديث `reassignRequest` ليُميّز نوع التحويل (sales→UW / UW→UW / UW→sales) ويختار الـ action المناسبة بدل `request.reassigned` عامة.

### 2) دالة جلب سجل طلب واحد (`src/services/audit.ts`)

إضافة:
```ts
export async function fetchRequestHistory(requestId: string): Promise<AuditEntry[]>
```
ترجع كل السجلات بـ `entityType==="request" && entityId===requestId` مرتبة من الأقدم للأحدث.

### 3) مكوّن Timeline جديد

ملف جديد `src/components/RequestHistoryTimeline.tsx`:

- يستلم `requestId`.
- يستخدم `fetchRequestHistory` + `subscribeAudit` ليتحدث لحظيًا.
- يعرض كل حدث كصف في تايملاين عمودي مع:
  - أيقونة حسب نوع الحدث (إنشاء، تحويل، تغيير حالة، مستند، ملاحظة…)
  - النص بالعربية/الإنجليزية حسب اللغة (نضيف ترجمات في `src/i18n/translations.ts`)
  - الفاعل (الاسم + الدور + الفرع)
  - الوقت بصيغة محلية + tooltip بالتاريخ الكامل
  - تفاصيل قابلة للطي تُظهر `before/after` (مثلاً: status: new → processing) و meta (اسم الملف، السبب…)
- فلتر بسيط (الكل / الحالة / المستندات / التحويلات).

### 4) دمج التايملاين في صفحة الطلب

في `src/routes/requests.$id.tsx`:

- إضافة قسم جديد (Card) بعنوان "سجل الطلب / Request history" يظهر فقط للأدمن والمشرف:
  ```ts
  {(user.role === "admin" || user.role === "supervisor") && (
    <RequestHistoryTimeline requestId={req.id} />
  )}
  ```
- يوضع أسفل قسم الإجراءات/الملاحظات.

### 5) ترجمات

إضافة مفاتيح في `src/i18n/translations.ts` لكل نوع حدث (نص قصير + قالب مع متغيرات مثل `{from}` `{to}` `{name}`).

### 6) Backfill للطلبات الموجودة

السجل الحالي يبدأ من اللحظة التي تُضاف فيها هذه التعديلات؛ الطلبات القديمة ستُظهر فقط الأحداث الموجودة مسبقًا (created/status_changed/reassigned). نُضيف ملاحظة في أعلى التايملاين تقول "بعض الأحداث قبل هذا التاريخ قد لا تكون مسجلة" عند غياب حدث `request.created`.

## ملاحظات تقنية

- الأحداث تُخزّن حاليًا في الـ demoStore (localStorage) بسقف 500. سنرفع السقف إلى 5000 لأن أحداث المستندات/التحويلات أكثر تكرارًا.
- لا حاجة لتغييرات في قاعدة البيانات في هذه المرحلة (المشروع يستعمل demoStore للحالة العملياتية). إن أردت لاحقًا حفظ الـ audit في Lovable Cloud (Supabase) لجعله مشتركًا بين الأجهزة، يمكن إضافة جدول `request_events` لاحقًا.

## ملفات ستُعدَّل / تُنشأ

- تعديل: `src/services/api.ts` (إضافة استدعاءات logEvent للأحداث الناقصة + تمييز أنواع reassign)
- تعديل: `src/services/audit.ts` (دالة `fetchRequestHistory` + توسعة `AuditAction`)
- تعديل: `src/services/demoStore.ts` (سقف 500 → 5000)
- جديد: `src/components/RequestHistoryTimeline.tsx`
- تعديل: `src/routes/requests.$id.tsx` (دمج المكوّن للأدمن/المشرف)
- تعديل: `src/i18n/translations.ts` (نصوص الأحداث)

## سؤال قبل التنفيذ

هل تريد التايملاين يظهر **للأدمن والمشرف فقط**، أم أيضًا للمالك (السيلز/الأندر رايتر صاحب الطلب)؟
