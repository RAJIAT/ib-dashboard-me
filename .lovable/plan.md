## الهدف

ربط كل سيلز بأندررايتر محدد (assigned underwriter) — السيلز برفع الطلب لهذا الأندررايتر فقط، وما يقدر يغيره. الادمن والسوبرفايزر بقدروا يغيروا التعيين متى ما بدهم.

## التغييرات

### 1) موديل البيانات (`src/services/demoStore.ts`)

- إضافة حقل اختياري على `DemoAgent`:
  - `assignedUnderwriterId?: string` — مرتبط فقط بالسيلز (`staffType === "sales"`).
- نفس الحقل بيمر في النوع المُصدَّر من `api.ts` (`Agent`).

### 2) منطق الصلاحيات والـ API (`src/services/api.ts`)

- **`createAgent`**: لو الدور سيلز، استقبل `assignedUnderwriterId` (اختياري عند الإنشاء، إلزامي بشكل ناعم عبر تحذير في الـ UI لكن مش فاشل تقنياً). تحقق إنه:
  - الأندررايتر موجود.
  - `staffType === "underwriter"`.
  - بنفس الفرع (`branch`).
- **`updateAgent`**: استقبل `assignedUnderwriterId`. صلاحيات التعديل:
  - **Admin**: يقدر يعدّل لأي سيلز.
  - **Supervisor**: فقط لسيلز ضمن فرعه ومش متعمل من الأدمن (نفس قيود الموجودة).
  - **Sales/Underwriter (نفسه)**: ممنوع — يرجع `Error("Only admin/supervisor can change the assigned underwriter")`.
- **`reassignRequest`** (تحديث المنطق):
  - لما السيلز هو الـ caller وبده يحوّل لأندررايتر:
    - لازم `target.id === salesAgent.assignedUnderwriterId`. لو لأ → `Error("You can only send requests to your assigned underwriter")`.
  - الادمن/السوبرفايزر/الأندررايتر (handoff) بضلوا يقدروا يحولوا لأي أندررايتر بنفس الفرع زي ما هي.
- إضافة `logEvent("agent.assigned_underwriter_changed", { before, after })` لما يتغير التعيين.

### 3) واجهة إنشاء/تعديل الأكاونت (`src/components/AgentFormDialog.tsx`)

- لما `staffType === "sales"`: اظهر حقل **Assigned Underwriter** (select).
  - الخيارات: كل أندررايترز نفس الفرع المختار (`branch`) فقط.
  - يتفرّغ تلقائياً لو تغيّر الفرع.
- مخفي للأندررايتر والسوبرفايزر.
- في وضع التعديل: يظهر للأدمن دائماً، وللسوبرفايزر فقط إذا السيلز مش متعمل من الأدمن. مخفي/disabled لباقي الأدوار.

### 4) صفحة الطلب (`src/routes/requests.$id.tsx`)

- في `ReassignCard`:
  - **لو `myType === "sales"` (السيلز هو المالك)**:
    - لو عنده `assignedUnderwriterId`: اعرض زر واحد فقط "إرسال الطلب لـ {اسم الأندررايتر}" — بدون قائمة منسدلة.
    - لو ما عنده تعيين: اعرض رسالة "ما عندك أندررايتر معيّن — تواصل مع المشرف" وعطّل الإرسال.
  - **Admin/Supervisor**: يضل عندهم القائمة الكاملة (تحويل يدوي لأي أندررايتر بالفرع).
  - **Underwriter handoff**: بدون تغيير.
- لما الادمن/السوبرفايزر بشوفوا الطلب وصاحبه سيلز، الـ default المختار يكون الأندررايتر المعيّن لهذا السيلز (لو موجود) بدل أول أندررايتر في الفرع.

### 5) صفحة إدارة الايجنتس (`src/routes/agents.tsx`)

- في الجدول/الكارد، أضف عمود/سطر يبيّن "Assigned UW" لكل سيلز.
- لو السيلز ما عنده تعيين: badge أصفر "Unassigned" + زر سريع للأدمن/السوبرفايزر يفتح dialog التعديل مباشرة على هذا الحقل.

### 6) الترجمات (`src/i18n/translations.ts`)

أضف مفاتيح:
- `agents.assignedUnderwriter` — "Assigned Underwriter" / "الأندررايتر المعيّن"
- `agents.assignedUnderwriterHint` — "Sales requests will be routed to this underwriter only" / "طلبات السيلز ستُحوَّل لهذا الأندررايتر فقط"
- `agents.unassigned` — "Unassigned" / "غير معيّن"
- `requests.salesMustUseAssignedUW` — رسالة الخطأ.
- `requests.sendToAssignedUW` — "إرسال إلى {name}".

### 7) الهيستوري (`src/components/RequestHistoryTimeline.tsx`)

- أضف معالجة للـ action الجديد `agent.assigned_underwriter_changed` (للعرض في صفحة الادمن لو احتجناه لاحقاً — حالياً هذا الايفنت `entityType: "agent"` فبيظهر بصفحة الـ audit، مش بصفحة الطلب).

## نقاط الصلاحيات (ملخص)

| العملية | Admin | Supervisor (نفس الفرع) | Sales | Underwriter |
|---|---|---|---|---|
| تعيين/تغيير الأندررايتر للسيلز | ✅ | ✅ (لسيلز مش متعمل من أدمن) | ❌ | ❌ |
| رفع طلب لأندررايتر | لأي UW | لأي UW بالفرع | فقط للـ assigned UW | — |
| تحويل بين أندررايترز | ✅ | ✅ | ❌ | ✅ (handoff) |

## بيانات الديمو

- تحديث الـ seed في `demoStore.ts`: SLS-001 → assignedUnderwriterId: "UW-001"، SLS-002 → "UW-002"، SLS-003 → "UW-003" — حتى السلوك الجديد يكون مرئي مباشرة في الديمو.
