## إضافة حقل رقم الهاتف الإجباري

### الهدف
إضافة حقل **رقم الهاتف** كحقل ثالث إجباري ضمن قسم "بيانات العميل" (KYC) في الصفحة الرئيسية `/`، بنفس مستوى الإلزامية للاسم والبريد، مع عرضه في صفحة تفاصيل الطلب.

### الملفات المعدّلة

**1. `src/services/api.ts`**
- إضافة `customerPhone?: string` إلى نوع `InsuranceRequest`.
- إضافة `customerPhone?: string` إلى مدخلات `submitUpload` وحفظه ضمن الطلب.

**2. `src/routes/index.tsx`**
- إضافة state جديد: `const [customerPhone, setCustomerPhone] = useState("")`.
- إضافة الحقل في `errors` state: `phone?: string`.
- توسيع `kycSchema` (Zod) بحقل phone:
  ```ts
  customerPhone: z.string()
    .trim()
    .min(1, t.upload.errors.phoneRequired)
    .regex(/^\+?[0-9\s-]{7,20}$/, t.upload.errors.phoneInvalid)
    .max(20)
  ```
- تحديث `safeParse` و `onSubmit` لتمرير `customerPhone` ومعالجة أخطائه.
- تحويل grid قسم KYC إلى 3 أعمدة على الشاشات المتوسطة فأكبر (`sm:grid-cols-2 md:grid-cols-3`) لاستيعاب الحقل الثالث.
- إضافة input للهاتف بعد الإيميل: `type="tel"`, `inputMode="tel"`, `autoComplete="tel"`, `dir="ltr"`, `maxLength={20}`، placeholder مثل `+971 50 123 4567`.

**3. `src/i18n/translations.ts`**
- إضافة في قسم `upload.kyc` (عربي وإنجليزي):
  - `phoneLabel`: "رقم الهاتف" / "Phone Number"
  - `phonePlaceholder`: "+971 50 123 4567"
- إضافة في `upload.errors`:
  - `phoneRequired`: "رقم الهاتف مطلوب" / "Phone number is required"
  - `phoneInvalid`: "صيغة رقم الهاتف غير صحيحة" / "Invalid phone number format"
- إضافة في `details`:
  - `customerPhone`: "رقم الهاتف" / "Phone"

**4. `src/routes/requests.$id.tsx`**
- توسيع شرط عرض بطاقة العميل ليشمل `customerPhone`.
- إضافة سطر لعرض رقم الهاتف بـ `dir="ltr"` بجانب الاسم والإيميل.

### التحقق من الإدخال (Security)
- التحقق من جانب العميل عبر Zod مع regex بسيط يقبل أرقام دولية (`+`, أرقام، مسافات، شرطات).
- حد أقصى 20 حرف.
- لا تسجيل (logging) للبيانات الحساسة.
- عند تفعيل السيرفر لاحقاً، يجب التحقق نفسه على جهة Supabase.

### ملاحظات
- لا يتغير شيء في تخزين الـ Demo Mode عدا إضافة حقل جديد إلى الكائن المخزن في `localStorage` — البيانات القديمة تبقى سليمة لأن الحقل اختياري في النوع.
- لا يتم ذكر اسم الشركة في أي نص جديد.
