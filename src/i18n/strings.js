// UI words in English, Hindi and Bengali. Keep them short and everyday: the
// person reading is a busy front desk, not an IT team. Hindi and Bengali were
// drafted in-house; have a native speaker check before a wide roll-out.
// Missing keys fall back to English.

const en = {
  'tab.bills': 'Bills', 'tab.partners': 'Partner share', 'tab.expenses': 'Expenses', 'tab.daybook': 'Day book', 'tab.creditNotes': 'Credit notes', 'tab.services': 'Tests', 'tab.pricing': 'Price list', 'tab.analytics': 'Charts',
  // navigation
  'nav.dashboard': 'Dashboard', 'nav.appointments': 'Appointments', 'nav.billing': 'Billing',
  'nav.approvals': 'Approvals', 'nav.imaging': 'Scan room', 'nav.reporting': 'Reports',
  'nav.referrals': 'Referral partners', 'nav.staff': 'Staff & salary', 'nav.operations': 'Patient tracker',
  'nav.configuration': 'Settings for reports', 'nav.subscription': 'Plan & payment', 'nav.bridge': 'Scanner link',
  'nav.studies': 'Scans (PACS)', 'nav.settings': 'My settings', 'nav.signout': 'Sign out', 'nav.menu': 'Menu',
  'nav.today': 'Today', 'nav.money': 'Money', 'nav.scans': 'Scans',
  // header
  'hdr.centre': 'Centre', 'hdr.online': 'Online', 'hdr.offline': 'No internet', 'hdr.language': 'Language',
  'hdr.desktopApp': 'Desktop app',
  // visit stages (one set of words on every screen)
  'stage.notArrived': 'Not arrived', 'stage.waitingScan': 'Waiting for scan', 'stage.noShow': 'Did not come', 'stage.drafting': 'Being written', 'stage.signedToday': 'Signed today', 'stage.arrived': 'Arrived', 'stage.inScan': 'In scan',
  'stage.waitingReport': 'Waiting for report', 'stage.reportReady': 'Report ready', 'stage.given': 'Report given',
  'stage.cancelled': 'Cancelled', 'stage.future': 'Booked for later', 'stage.total': 'All visits',
  // bill states
  'bill.toCollect': 'To collect', 'bill.partPaid': 'Part paid', 'bill.paid': 'Paid', 'bill.cancelled': 'Cancelled',
  'bill.waitingApproval': 'Waiting for approval',
  // money words
  'money.listPrice': 'Price before discount', 'money.billed': 'Billed', 'money.toCollect': 'Still to collect',
  'money.collected': 'Collected', 'money.centreKeeps': 'Centre keeps', 'money.discounts': 'Discounts given',
  'money.partnerShare': 'Partner share', 'money.help': 'What do these numbers mean?',
  'money.helpText': 'Price before discount: the price-list total. Billed: what patients were charged after discounts. Collected: money received. Centre keeps: billed minus the referral partner’s share.',
  // filters
  'filter.dates': 'Dates', 'filter.status': 'Bill', 'filter.testType': 'Test type', 'filter.today': 'Today',
  'filter.past': 'Earlier', 'filter.future': 'Later', 'filter.all': 'All', 'filter.custom': 'Pick dates',
  'filter.show': 'Filters', 'filter.hide': 'Hide filters', 'filter.notArrived': 'Not arrived',
  // pages
  'page.appointments': 'Appointments', 'page.finance': 'Billing', 'page.operations': 'Patient tracker',
  'page.operationsSub': 'Where every patient is today, and what is late',
  'page.scanRoom': 'Scan room', 'page.scanRoomSub': 'Today’s scans and image upload',
  'page.reports': 'Reports to write', 'page.reportsSub': 'Write and sign today’s reports',
  // common actions
  'act.new': 'New booking', 'act.view': 'Open', 'act.print': 'Print', 'act.edit': 'Change', 'act.cancel': 'Cancel visit',
  'act.move': 'Move', 'act.refresh': 'Refresh', 'act.export': 'Download Excel', 'act.search': 'Mobile number or name',
  'act.nothingPending': 'Nothing to do',
  // login
  'login.offline': 'Works on slow internet',
  'login.offlineSub': 'Opens fast and keeps your place. You need an internet connection to save bookings and payments.',
  'login.noNet': 'No internet right now', 'login.noNetSub': 'Connect to the internet to sign in and save work.',
  'login.welcome': 'Welcome back', 'login.sub': 'Sign in to continue',
};

const hi = {
  'tab.bills': 'बिल', 'tab.partners': 'पार्टनर हिस्सा', 'tab.expenses': 'खर्च', 'tab.daybook': 'रोज़नामचा', 'tab.creditNotes': 'क्रेडिट नोट', 'tab.services': 'जाँच', 'tab.pricing': 'रेट लिस्ट', 'tab.analytics': 'चार्ट',
  'nav.dashboard': 'डैशबोर्ड', 'nav.appointments': 'अपॉइंटमेंट', 'nav.billing': 'बिल और पैसा',
  'nav.approvals': 'मंज़ूरी', 'nav.imaging': 'स्कैन रूम', 'nav.reporting': 'रिपोर्ट',
  'nav.referrals': 'रेफ़रल पार्टनर', 'nav.staff': 'स्टाफ़ और वेतन', 'nav.operations': 'मरीज़ ट्रैकर',
  'nav.configuration': 'रिपोर्ट सेटिंग', 'nav.subscription': 'प्लान और भुगतान', 'nav.bridge': 'स्कैनर कनेक्शन',
  'nav.studies': 'स्कैन (PACS)', 'nav.settings': 'मेरी सेटिंग', 'nav.signout': 'बाहर निकलें', 'nav.menu': 'मेन्यू',
  'nav.today': 'आज', 'nav.money': 'पैसा', 'nav.scans': 'स्कैन',
  'hdr.centre': 'सेंटर', 'hdr.online': 'ऑनलाइन', 'hdr.offline': 'इंटरनेट नहीं', 'hdr.language': 'भाषा',
  'hdr.desktopApp': 'कंप्यूटर ऐप',
  'stage.notArrived': 'अभी नहीं आए', 'stage.waitingScan': 'स्कैन का इंतज़ार', 'stage.noShow': 'नहीं आए', 'stage.drafting': 'लिखी जा रही', 'stage.signedToday': 'आज साइन हुई', 'stage.arrived': 'आ गए', 'stage.inScan': 'स्कैन में',
  'stage.waitingReport': 'रिपोर्ट का इंतज़ार', 'stage.reportReady': 'रिपोर्ट तैयार', 'stage.given': 'रिपोर्ट दे दी',
  'stage.cancelled': 'रद्द', 'stage.future': 'आगे की बुकिंग', 'stage.total': 'सभी विज़िट',
  'bill.toCollect': 'लेना बाकी', 'bill.partPaid': 'कुछ बाकी', 'bill.paid': 'चुका दिया', 'bill.cancelled': 'रद्द',
  'bill.waitingApproval': 'मंज़ूरी का इंतज़ार',
  'money.listPrice': 'छूट से पहले कीमत', 'money.billed': 'बिल हुआ', 'money.toCollect': 'अभी लेना बाकी',
  'money.collected': 'मिल गया', 'money.centreKeeps': 'सेंटर का हिस्सा', 'money.discounts': 'दी गई छूट',
  'money.partnerShare': 'पार्टनर का हिस्सा', 'money.help': 'इन आँकड़ों का मतलब?',
  'money.helpText': 'छूट से पहले कीमत: रेट लिस्ट का जोड़। बिल हुआ: छूट के बाद मरीज़ों से लिया जाने वाला पैसा। मिल गया: जो पैसा आ चुका। सेंटर का हिस्सा: बिल में से रेफ़रल पार्टनर का हिस्सा घटाकर।',
  'filter.dates': 'तारीख', 'filter.status': 'बिल', 'filter.testType': 'जाँच का प्रकार', 'filter.today': 'आज',
  'filter.past': 'पहले', 'filter.future': 'आगे', 'filter.all': 'सभी', 'filter.custom': 'तारीख चुनें',
  'filter.show': 'फ़िल्टर', 'filter.hide': 'फ़िल्टर छिपाएँ', 'filter.notArrived': 'अभी नहीं आए',
  'page.appointments': 'अपॉइंटमेंट', 'page.finance': 'बिल और पैसा', 'page.operations': 'मरीज़ ट्रैकर',
  'page.operationsSub': 'आज हर मरीज़ कहाँ है, और क्या देर से चल रहा है',
  'page.scanRoom': 'स्कैन रूम', 'page.scanRoomSub': 'आज के स्कैन और तस्वीरें अपलोड',
  'page.reports': 'लिखनी हैं रिपोर्ट', 'page.reportsSub': 'आज की रिपोर्ट लिखें और साइन करें',
  'act.new': 'नई बुकिंग', 'act.view': 'खोलें', 'act.print': 'छापें', 'act.edit': 'बदलें', 'act.cancel': 'विज़िट रद्द करें',
  'act.move': 'आगे बढ़ाएँ', 'act.refresh': 'ताज़ा करें', 'act.export': 'Excel डाउनलोड', 'act.search': 'मोबाइल नंबर या नाम',
  'act.nothingPending': 'कुछ बाकी नहीं',
  'login.offline': 'धीमे इंटरनेट पर भी चलता है',
  'login.offlineSub': 'जल्दी खुलता है और आपकी जगह याद रखता है। बुकिंग और पैसे सेव करने के लिए इंटरनेट चाहिए।',
  'login.noNet': 'अभी इंटरनेट नहीं है', 'login.noNetSub': 'साइन इन करने और काम सेव करने के लिए इंटरनेट से जुड़ें।',
  'login.welcome': 'फिर से स्वागत है', 'login.sub': 'आगे बढ़ने के लिए साइन इन करें',
};

const bn = {
  'tab.bills': 'বিল', 'tab.partners': 'পার্টনারের ভাগ', 'tab.expenses': 'খরচ', 'tab.daybook': 'দৈনিক হিসাব', 'tab.creditNotes': 'ক্রেডিট নোট', 'tab.services': 'পরীক্ষা', 'tab.pricing': 'রেট লিস্ট', 'tab.analytics': 'চার্ট',
  'nav.dashboard': 'ড্যাশবোর্ড', 'nav.appointments': 'অ্যাপয়েন্টমেন্ট', 'nav.billing': 'বিল ও টাকা',
  'nav.approvals': 'অনুমোদন', 'nav.imaging': 'স্ক্যান রুম', 'nav.reporting': 'রিপোর্ট',
  'nav.referrals': 'রেফারাল পার্টনার', 'nav.staff': 'স্টাফ ও বেতন', 'nav.operations': 'রোগী ট্র্যাকার',
  'nav.configuration': 'রিপোর্ট সেটিং', 'nav.subscription': 'প্ল্যান ও পেমেন্ট', 'nav.bridge': 'স্ক্যানার সংযোগ',
  'nav.studies': 'স্ক্যান (PACS)', 'nav.settings': 'আমার সেটিং', 'nav.signout': 'বেরিয়ে যান', 'nav.menu': 'মেনু',
  'nav.today': 'আজ', 'nav.money': 'টাকা', 'nav.scans': 'স্ক্যান',
  'hdr.centre': 'সেন্টার', 'hdr.online': 'অনলাইন', 'hdr.offline': 'ইন্টারনেট নেই', 'hdr.language': 'ভাষা',
  'hdr.desktopApp': 'কম্পিউটার অ্যাপ',
  'stage.notArrived': 'এখনও আসেননি', 'stage.waitingScan': 'স্ক্যানের অপেক্ষায়', 'stage.noShow': 'আসেননি', 'stage.drafting': 'লেখা হচ্ছে', 'stage.signedToday': 'আজ সই হয়েছে', 'stage.arrived': 'এসেছেন', 'stage.inScan': 'স্ক্যানে',
  'stage.waitingReport': 'রিপোর্টের অপেক্ষায়', 'stage.reportReady': 'রিপোর্ট তৈরি', 'stage.given': 'রিপোর্ট দেওয়া হয়েছে',
  'stage.cancelled': 'বাতিল', 'stage.future': 'পরের বুকিং', 'stage.total': 'সব ভিজিট',
  'bill.toCollect': 'নিতে বাকি', 'bill.partPaid': 'আংশিক বাকি', 'bill.paid': 'মেটানো', 'bill.cancelled': 'বাতিল',
  'bill.waitingApproval': 'অনুমোদনের অপেক্ষায়',
  'money.listPrice': 'ছাড়ের আগে দাম', 'money.billed': 'বিল হয়েছে', 'money.toCollect': 'এখনও নিতে বাকি',
  'money.collected': 'পাওয়া গেছে', 'money.centreKeeps': 'সেন্টারের ভাগ', 'money.discounts': 'দেওয়া ছাড়',
  'money.partnerShare': 'পার্টনারের ভাগ', 'money.help': 'এই সংখ্যাগুলোর মানে?',
  'money.helpText': 'ছাড়ের আগে দাম: রেট লিস্টের যোগফল। বিল হয়েছে: ছাড়ের পরে রোগীদের থেকে নেওয়ার টাকা। পাওয়া গেছে: যে টাকা এসেছে। সেন্টারের ভাগ: বিল থেকে রেফারাল পার্টনারের ভাগ বাদ দিয়ে।',
  'filter.dates': 'তারিখ', 'filter.status': 'বিল', 'filter.testType': 'পরীক্ষার ধরন', 'filter.today': 'আজ',
  'filter.past': 'আগে', 'filter.future': 'পরে', 'filter.all': 'সব', 'filter.custom': 'তারিখ বাছুন',
  'filter.show': 'ফিল্টার', 'filter.hide': 'ফিল্টার লুকান', 'filter.notArrived': 'এখনও আসেননি',
  'page.appointments': 'অ্যাপয়েন্টমেন্ট', 'page.finance': 'বিল ও টাকা', 'page.operations': 'রোগী ট্র্যাকার',
  'page.operationsSub': 'আজ কোন রোগী কোথায়, আর কী দেরি হচ্ছে',
  'page.scanRoom': 'স্ক্যান রুম', 'page.scanRoomSub': 'আজকের স্ক্যান ও ছবি আপলোড',
  'page.reports': 'রিপোর্ট লিখতে হবে', 'page.reportsSub': 'আজকের রিপোর্ট লিখুন ও সই করুন',
  'act.new': 'নতুন বুকিং', 'act.view': 'খুলুন', 'act.print': 'ছাপুন', 'act.edit': 'বদলান', 'act.cancel': 'ভিজিট বাতিল',
  'act.move': 'এগিয়ে দিন', 'act.refresh': 'রিফ্রেশ', 'act.export': 'Excel ডাউনলোড', 'act.search': 'মোবাইল নম্বর বা নাম',
  'act.nothingPending': 'কিছু বাকি নেই',
  'login.offline': 'ধীর ইন্টারনেটেও চলে',
  'login.offlineSub': 'দ্রুত খোলে আর আপনার জায়গা মনে রাখে। বুকিং আর টাকা সেভ করতে ইন্টারনেট লাগবে।',
  'login.noNet': 'এখন ইন্টারনেট নেই', 'login.noNetSub': 'সাইন ইন করতে আর কাজ সেভ করতে ইন্টারনেটে যুক্ত হন।',
  'login.welcome': 'আবার স্বাগতম', 'login.sub': 'চালিয়ে যেতে সাইন ইন করুন',
};

export const STRINGS = { en, hi, bn };
