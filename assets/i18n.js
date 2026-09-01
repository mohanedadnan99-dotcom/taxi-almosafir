(() => {
  const STORAGE_KEY = 'almosafir-language';
  const supported = new Set(['ar', 'en']);
  let currentLang = supported.has(localStorage.getItem(STORAGE_KEY)) ? localStorage.getItem(STORAGE_KEY) : 'ar';

  const copy = {
    ar: {
      title: 'تكسي المسافر | حجز سريع',
      brandMain: 'تكسي المسافر',
      brandSub: 'ALMOSAFIR TAXI',
      badge: 'بغداد • 24/7',
      toggle: 'English',
      confirmLocation: 'تثبيت الموقع',
      pickupTitle: 'أين موقع الاستلام؟',
      pickupHelp: 'اكتب المنطقة أو العنوان، أو استخدم «موقعي»، ثم حرّك الخريطة وضع العلامة الحمراء على المكان المطلوب.',
      pickupPlaceholder: 'اكتب المنطقة أو العنوان',
      search: 'بحث',
      myLocation: 'موقعي',
      chooseCar: 'اختر السيارة',
      chooseCarSub: 'اختيار سريع وبسيط.',
      step1: '1 من 2',
      fixedPickup: 'موقع الاستلام المثبّت',
      editLocation: 'تعديل الموقع',
      tucsonDesc: 'خيار عملي ومريح للتنقل.',
      fortunerDesc: 'مساحة أكبر للعائلة والحقائب.',
      pajeroDesc: 'مريحة ومناسبة للطرق والمسافات.',
      gmcDesc: 'الخيار الأوسع والأفخم.',
      suv: 'فئة SUV',
      vvip: 'فئة VVIP',
      chooseCarWarning: 'اختر السيارة للمتابعة.',
      continue: 'استمرار',
      passengerName: 'اسم المسافر',
      passengerNamePh: 'الاسم الكامل',
      phone: 'رقم الهاتف — محلي أو دولي',
      phonePh: 'مثال: 077... أو 770... أو +964...',
      people: 'عدد الأشخاص',
      bags: 'عدد الأمتعة',
      tripType: 'نوع الرحلة',
      departure: 'مغادرة',
      arrival: 'استقبال',
      note: 'ملاحظة — اختياري',
      notePh: 'أي ملاحظة تساعد الكابتن',
      back: 'رجوع',
      send: 'إرسال الحجز',
      successHeading: 'تم تأكيد حجزك',
      successText: 'وصل طلبك إلى فريق تكسي المسافر بنجاح، وسيتم التعامل معه حسب معلومات الحجز المرسلة.',
      bookingNumber: 'رقم الحجز',
      car: 'السيارة',
      pickup: 'موقع الاستلام',
      keepRef: 'احتفظ برقم الحجز للرجوع إليه عند الحاجة.',
      newBooking: 'حجز جديد'
    },
    en: {
      title: 'Almosafir Taxi | Quick Booking',
      brandMain: 'Almosafir Taxi',
      brandSub: 'تكسي المسافر',
      badge: 'Baghdad • 24/7',
      toggle: 'العربية',
      confirmLocation: 'Confirm location',
      pickupTitle: 'Where should we pick you up?',
      pickupHelp: 'Enter an area or address, use “My location”, then move the map until the red pin is exactly where you want to be picked up.',
      pickupPlaceholder: 'Enter an area or address',
      search: 'Search',
      myLocation: 'My location',
      chooseCar: 'Choose a vehicle',
      chooseCarSub: 'Quick and simple selection.',
      step1: '1 of 2',
      fixedPickup: 'Confirmed pickup location',
      editLocation: 'Edit location',
      tucsonDesc: 'A practical and comfortable choice for everyday travel.',
      fortunerDesc: 'More space for families and luggage.',
      pajeroDesc: 'Comfortable and well-suited for longer trips.',
      gmcDesc: 'Our most spacious and premium option.',
      suv: 'SUV Class',
      vvip: 'VVIP Class',
      chooseCarWarning: 'Choose a vehicle to continue.',
      continue: 'Continue',
      passengerName: 'Passenger name',
      passengerNamePh: 'Full name',
      phone: 'Phone number — local or international',
      phonePh: 'Example: 077... or 770... or +964...',
      people: 'Passengers',
      bags: 'Luggage',
      tripType: 'Trip type',
      departure: 'Departure',
      arrival: 'Arrival',
      note: 'Note — optional',
      notePh: 'Any note that may help the driver',
      back: 'Back',
      send: 'Send booking',
      successHeading: 'Your booking is confirmed',
      successText: 'Your request has been sent successfully to the Almosafir Taxi team and will be handled using the booking details you provided.',
      bookingNumber: 'Booking number',
      car: 'Vehicle',
      pickup: 'Pickup location',
      keepRef: 'Keep your booking number for reference.',
      newBooking: 'New booking'
    }
  };

  const dynamicPairs = [
    ['جهازك ما يدعم تحديد الموقع', 'جهازك لا يدعم تحديد الموقع.', 'Your device does not support location services.'],
    ['فعّل إذن الموقع أو اختار نقطة من الخريطة.', 'فعّل إذن الموقع أو اختر نقطة من الخريطة.', 'Enable location permission or choose a point on the map.'],
    ['اكتب اسم المنطقة أو العنوان أولاً.', 'اكتب اسم المنطقة أو العنوان أولاً.', 'Enter an area or address first.'],
    ['ما لكينا هذا العنوان.', 'لم نعثر على هذا العنوان.', 'We could not find this address.'],
    ['تعذر البحث عن العنوان.', 'تعذر البحث عن العنوان.', 'Address search is currently unavailable.'],
    ['اختار السيارة حتى نكمل.', 'اختر السيارة للمتابعة.', 'Choose a vehicle to continue.'],
    ['بس المعلومات الضرورية.', 'المعلومات الضرورية فقط.', 'Only the essential booking details.'],
    ['تم تحديث الموقع وبقت معلوماتك محفوظة.', 'تم تحديث الموقع وبقيت معلوماتك محفوظة.', 'Location updated. Your entered details are still saved.'],
    ['تم تثبيت الموقع. اختار السيارة حتى نكمل.', 'تم تثبيت الموقع. اختر السيارة للمتابعة.', 'Location confirmed. Choose a vehicle to continue.'],
    ['اختيار سريع وبسيط.', 'اختيار سريع وبسيط.', 'Quick and simple selection.'],
    ['ثبّت موقع الاستلام أولاً.', 'ثبّت موقع الاستلام أولاً.', 'Confirm the pickup location first.'],
    ['حدد موقعك أولاً.', 'حدّد موقعك أولاً.', 'Choose your location first.'],
    ['اكتب اسم المسافر ورقم الهاتف.', 'اكتب اسم المسافر ورقم الهاتف.', 'Enter the passenger name and phone number.'],
    ['اكتب رقم هاتف حقيقي محلي أو دولي. يقبل 0 أو بدون 0 أو رمز الدولة +.', 'اكتب رقم هاتف صحيحاً، محلياً أو دولياً. يمكن أن يبدأ بـ 0 أو بدون 0 أو برمز الدولة +.', 'Enter a valid local or international phone number. It may start with 0, omit the leading 0, or use a + country code.'],
    ['اختار نوع الرحلة: مغادرة أو استقبال.', 'اختر نوع الرحلة: مغادرة أو استقبال.', 'Choose the trip type: Departure or Arrival.'],
    ['جاري الإرسال...', 'جاري الإرسال...', 'Sending...'],
    ['تعذر إرسال الحجز', 'تعذر إرسال الحجز.', 'Could not send the booking.'],
    ['تعذر إرسال الحجز، حاول مرة ثانية.', 'تعذر إرسال الحجز، حاول مرة أخرى.', 'Could not send the booking. Please try again.'],
    ['وصل طلبك بنجاح إلى فريق تكسي المسافر.', 'وصل طلبك بنجاح إلى فريق تكسي المسافر.', 'Your request was sent successfully to the Almosafir Taxi team.'],
    ['تم تأكيد الحجز', 'تم تأكيد الحجز', 'Booking confirmed'],
    ['تم تحديد الموقع', 'تم تحديد الموقع', 'Location selected'],
    ['موقع محدد داخل بغداد', 'موقع محدد داخل بغداد', 'Selected location in Baghdad'],
    ['معلومات الحجز', 'معلومات الحجز', 'Booking details'],
    ['اختار السيارة', 'اختر السيارة', 'Choose a vehicle'],
    ['مغادرة', 'مغادرة', 'Departure'],
    ['استقبال', 'استقبال', 'Arrival'],
    ['إرسال الحجز', 'إرسال الحجز', 'Send booking'],
    ['بحث', 'بحث', 'Search'],
    ['موقعي', 'موقعي', 'My location']
  ];

  function injectStyles() {
    if (document.getElementById('i18nStyles')) return;
    const style = document.createElement('style');
    style.id = 'i18nStyles';
    style.textContent = `
      .langToggle{border:1px solid rgba(213,171,99,.30);background:rgba(213,171,99,.08);color:var(--gold2);border-radius:999px;padding:7px 10px;font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap}
      .langToggle:active{transform:scale(.97)}
      #phone{direction:ltr;text-align:left}
      html[dir="ltr"] .brand{margin-left:0;margin-right:auto}
      html[dir="ltr"] .car,html[dir="ltr"] .successLocation{text-align:left}
      html[dir="ltr"] .confirmedLocationText{text-align:left}
      html[dir="ltr"] .searchCard,html[dir="ltr"] .sheet{direction:ltr}
      html[dir="ltr"] .locationInput,html[dir="ltr"] .field input,html[dir="ltr"] .field textarea{text-align:left}
      @media(max-width:620px){.langToggle{font-size:8px;padding:6px 8px}}
    `;
    document.head.appendChild(style);
  }

  function ensureToggle() {
    let button = document.getElementById('langToggle');
    if (button) return button;
    button = document.createElement('button');
    button.id = 'langToggle';
    button.className = 'langToggle';
    button.type = 'button';
    button.setAttribute('aria-label', 'Change language');
    const badge = document.querySelector('.topbar .badge');
    if (badge) badge.insertAdjacentElement('afterend', button);
    else document.querySelector('.topbar')?.appendChild(button);
    button.addEventListener('click', () => setLanguage(currentLang === 'ar' ? 'en' : 'ar'));
    return button;
  }

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
  }

  function setPlaceholder(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.setAttribute('placeholder', value);
  }

  function setCarDescription(car, value) {
    const el = document.querySelector(`.car[data-car="${car}"] .carCopy small`);
    if (el) el.textContent = value;
  }

  function setCarClass(car, value) {
    const el = document.querySelector(`.car[data-car="${car}"] .cap`);
    if (el) el.textContent = value;
  }

  function translateDynamicText(text, lang) {
    if (!text) return text;
    const trimmed = String(text).trim();

    if (lang === 'en') {
      if (trimmed.startsWith('تم تحديد العنوان:')) return `Address found: ${trimmed.slice('تم تحديد العنوان:'.length).trim()}`;
      if (trimmed === 'تم تحديد الموقع، جاري جلب العنوان التفصيلي...') return 'Location selected. Loading the detailed address...';
      for (const [source, , en] of dynamicPairs) if (trimmed === source) return en;
      return text;
    }

    if (trimmed.startsWith('Address found:')) return `تم تحديد العنوان: ${trimmed.slice('Address found:'.length).trim()}`;
    if (trimmed === 'Location selected. Loading the detailed address...') return 'تم تحديد الموقع، جاري جلب العنوان التفصيلي...';
    for (const [source, ar, en] of dynamicPairs) {
      if (trimmed === en || trimmed === source) return ar;
    }
    return text;
  }

  function translateVisibleDynamic() {
    ['#addressStatus', '#carWarning', '#infoWarning', '#sheetTitle', '#sheetSub', '#step', '#send', '#searchLocation', '#locate', '#successTrip'].forEach((selector) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const next = translateDynamicText(el.textContent, currentLang);
      if (next !== el.textContent) el.textContent = next;
    });
  }

  function applyStatic(lang) {
    const c = copy[lang];
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.body.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = c.title;

    const brand = document.querySelector('.brand > div:last-child');
    if (brand) brand.innerHTML = `${c.brandMain}<small>${c.brandSub}</small>`;
    setText('.badge', c.badge);
    ensureToggle().textContent = c.toggle;
    setText('#confirmLocation', c.confirmLocation);
    setText('.searchCard h1', c.pickupTitle);
    setText('.searchCard p', c.pickupHelp);
    setPlaceholder('#locationText', c.pickupPlaceholder);
    setText('#searchLocation', c.search);
    setText('#locate', c.myLocation);

    const activePane = document.querySelector('.pane.active')?.id;
    if (activePane === 'carPane' || !activePane) {
      setText('#sheetTitle', c.chooseCar);
      setText('#sheetSub', c.chooseCarSub);
      setText('#step', c.step1);
    }

    setText('.confirmedLocationText span', c.fixedPickup);
    setText('#editLocation', c.editLocation);
    setCarDescription('Tucson', c.tucsonDesc);
    setCarDescription('Fortuner', c.fortunerDesc);
    setCarDescription('Pajero', c.pajeroDesc);
    setCarDescription('GMC VVIP', c.gmcDesc);
    ['Tucson', 'Fortuner', 'Pajero'].forEach((car) => setCarClass(car, c.suv));
    setCarClass('GMC VVIP', c.vvip);
    setText('#carWarning', c.chooseCarWarning);
    setText('#carNext', c.continue);

    const labels = document.querySelectorAll('#infoPane .field label');
    if (labels[0]) labels[0].textContent = c.passengerName;
    if (labels[1]) labels[1].textContent = c.phone;
    setPlaceholder('#name', c.passengerNamePh);
    setPlaceholder('#phone', c.phonePh);
    const counterLabels = document.querySelectorAll('.counterBox > label');
    if (counterLabels[0]) counterLabels[0].textContent = c.people;
    if (counterLabels[1]) counterLabels[1].textContent = c.bags;
    if (counterLabels[2]) counterLabels[2].textContent = c.tripType;
    const tripButtons = document.querySelectorAll('.tripType');
    if (tripButtons[0]) tripButtons[0].textContent = c.departure;
    if (tripButtons[1]) tripButtons[1].textContent = c.arrival;
    const noteLabel = document.querySelector('#infoPane .field.full label');
    if (noteLabel) noteLabel.textContent = c.note;
    setPlaceholder('#notes', c.notePh);
    setText('#backCars', c.back);
    setText('#send', c.send);

    setText('.successHero h3', c.successHeading);
    setText('.successHero > p', c.successText);
    setText('.bookingRef span', c.bookingNumber);
    const successLabels = document.querySelectorAll('.successItem span');
    if (successLabels[0]) successLabels[0].textContent = c.tripType;
    if (successLabels[1]) successLabels[1].textContent = c.car;
    if (successLabels[2]) successLabels[2].textContent = c.people;
    if (successLabels[3]) successLabels[3].textContent = c.bags;
    setText('.successLocation span', c.pickup);
    setText('.successNote', c.keepRef);
    setText('#newBooking', c.newBooking);

    translateVisibleDynamic();
  }

  function setLanguage(lang) {
    currentLang = supported.has(lang) ? lang : 'ar';
    localStorage.setItem(STORAGE_KEY, currentLang);
    applyStatic(currentLang);
  }

  injectStyles();
  ensureToggle();

  const nativeAlert = window.alert.bind(window);
  window.alert = (message) => nativeAlert(translateDynamicText(message, currentLang));

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      if (typeof input === 'string' && (input.startsWith('/api/reverse?') || input.startsWith('/api/search-location?'))) {
        const url = new URL(input, location.origin);
        url.searchParams.set('lang', currentLang);
        input = `${url.pathname}${url.search}`;
      }
    } catch (_) {}
    return nativeFetch(input, init);
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const el = mutation.target.nodeType === Node.TEXT_NODE ? mutation.target.parentElement : mutation.target;
      if (!el) continue;
      if (el.matches?.('#addressStatus,#carWarning,#infoWarning,#sheetTitle,#sheetSub,#step,#send,#searchLocation,#locate,#successTrip')) {
        const next = translateDynamicText(el.textContent, currentLang);
        if (next !== el.textContent) el.textContent = next;
      }
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });

  setLanguage(currentLang);
})();
