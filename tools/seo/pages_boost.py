# -*- coding: utf-8 -*-
"""Round three: Hindi calculators and a Hindi HMS page, specialty hospital pages, and a comparison guide.

Specialty pages say plainly what QueroCura covers for that kind of hospital and what it does not specialise in, so
each one is useful on its own rather than a copy with the specialty's name swapped in.
"""
from pages_more import F

# ------------------------------------------------------------------ Hindi calculators (results in Hindi via qc-tools.js)

HINDI_TOOLS = [
    {
        "slug": "hi/calculators/bp", "lang": "hi", "en": "calculators/blood-pressure-checker", "tool": "bp", "kind": "tool", "audience": "consumer",
        "title": "बीपी कितना होना चाहिए? ब्लड प्रेशर चार्ट और चेकर | QueroCura",
        "description": "अपनी बीपी रीडिंग डालकर जानिए कि वह सामान्य है या ज़्यादा (ISH 2020): सामान्य, थोड़ा ज़्यादा, ग्रेड 1 या ग्रेड 2 हाई बीपी, और कब तुरंत डॉक्टर के पास जाएँ।",
        "eyebrow": "बीपी चेकर", "h1": "बीपी कितना होना चाहिए? अपनी रीडिंग जाँचें",
        "lead": "ऊपर वाली (सिस्टोलिक) और नीचे वाली (डायस्टोलिक) संख्या डालिए। चेकर बताएगा कि International Society of Hypertension 2020 के अनुसार आपकी रीडिंग किस श्रेणी में आती है। वयस्कों में 130/85 से कम बीपी सामान्य माना जाता है। एक रीडिंग से बीमारी तय नहीं होती।",
        "fields": [F("s", "ऊपर वाली संख्या (सिस्टोलिक)", "mmHg", mn=50, mx=300), F("d", "नीचे वाली संख्या (डायस्टोलिक)", "mmHg", mn=30, mx=200)],
        "cta": ["QueroCura में बीपी ट्रैक करें", "register/"], "cta2": ["QueroCura हिन्दी में", "hi/"],
        "sections": [
            {"h2": "बीपी चार्ट (ISH 2020, वयस्क)", "table": {"head": ["श्रेणी", "ऊपर वाली (सिस्टोलिक)", "नीचे वाली (डायस्टोलिक)"], "rows": [
                ["सामान्य", "130 से कम", "और 85 से कम"], ["सामान्य से थोड़ा ज़्यादा", "130 से 139", "या 85 से 89"], ["ग्रेड 1 हाई बीपी", "140 से 159", "या 90 से 99"], ["ग्रेड 2 हाई बीपी", "160 या ज़्यादा", "या 100 या ज़्यादा"]]}},
            {"h2": "कब तुरंत डॉक्टर के पास जाएँ", "p": ["180/110 या उससे ज़्यादा रीडिंग पर उसी दिन डॉक्टर को दिखाएँ। अगर साथ में सीने में दर्द, साँस फूलना, तेज़ सिरदर्द, उलझन, एक तरफ़ कमज़ोरी, धुंधला दिखना या बोलने में परेशानी हो, तो तुरंत इमरजेंसी जाएँ और 112 पर कॉल करें।"]},
            {"h2": "बीपी सही तरीके से कैसे नापें", "ul": ["पाँच मिनट आराम से बैठें, पीठ टिकी हो, पैर ज़मीन पर, बाँह दिल की ऊँचाई पर।", "नापने से 30 मिनट पहले चाय-कॉफ़ी, सिगरेट और कसरत न करें।", "एक मिनट के अंतर पर दो बार नापें और औसत लें।", "घर की रीडिंग अक्सर क्लिनिक से कम आती है: घर पर 135/85 लगभग क्लिनिक के 140/90 के बराबर है।"]},
        ],
        "faq": [["बीपी कितना होना चाहिए?", "ISH 2020 के अनुसार वयस्कों में 130/85 से कम सामान्य है। बार-बार 140/90 या ज़्यादा आए तो यह हाई बीपी है।"],
                ["क्या 140/90 हाई बीपी है?", "हाँ, बार-बार 140/90 या ज़्यादा रीडिंग ग्रेड 1 हाई बीपी है। डॉक्टर से बात करें; ख़ुद से कोई दवा शुरू या बंद न करें।"]],
        "related": ["hi/calculators/sugar-hba1c", "hi/calculators/bmi", "hi"],
    },
    {
        "slug": "hi/calculators/sugar-hba1c", "lang": "hi", "en": "calculators/hba1c-to-average-glucose", "tool": "a1c", "kind": "tool", "audience": "consumer",
        "title": "HbA1c कितना होना चाहिए? शुगर कैलकुलेटर | QueroCura",
        "description": "HbA1c रिपोर्ट को औसत ब्लड शुगर (mg/dL) में बदलें, और जानें कि सामान्य, प्रीडायबिटीज़ या डायबिटीज़ की सीमा क्या है। मुफ़्त, कुछ भी कहीं नहीं भेजा जाता।",
        "eyebrow": "शुगर कैलकुलेटर", "h1": "HbA1c कितना होना चाहिए? औसत शुगर जानें",
        "lead": "HbA1c पिछले दो-तीन महीनों की औसत ब्लड शुगर बताता है। अपनी HbA1c (%) डालिए, या औसत शुगर डालिए, और देखिए दोनों का संबंध। 5.7% से कम सामान्य है, 5.7% से 6.4% प्रीडायबिटीज़ और 6.5% या ज़्यादा डायबिटीज़ की सीमा है।",
        "fields": [F("a", "HbA1c", "%", mn=3, mx=20, hint="या अगला खाना भरें"), F("g", "औसत शुगर", "mg/dL", mn=40, mx=600)],
        "cta": ["अपनी रिपोर्ट CuraVault में रखें", "hi/personal-health-records/"], "cta2": ["QueroCura हिन्दी में", "hi/"],
        "sections": [
            {"h2": "HbA1c की सीमाएँ", "table": {"head": ["HbA1c", "मतलब (ADA)", "औसत शुगर"], "rows": [
                ["5.7% से कम", "सामान्य", "लगभग 117 mg/dL से कम"], ["5.7% से 6.4%", "प्रीडायबिटीज़", "लगभग 117 से 137 mg/dL"], ["6.5% या ज़्यादा", "डायबिटीज़ की सीमा (दोबारा जाँच से पक्का)", "लगभग 140 mg/dL या ज़्यादा"]]}},
            {"h2": "यह कैसे निकाला जाता है", "p": ["ADAG अध्ययन का फ़ॉर्मूला: औसत शुगर (mg/dL) = 28.7 × HbA1c − 46.7। ख़ून की कमी, हाल में ख़ून चढ़ना, गर्भावस्था और किडनी की बीमारी में HbA1c गुमराह कर सकता है; डॉक्टर इन बातों को ध्यान में रखकर पढ़ते हैं।"]},
        ],
        "faq": [["HbA1c 7 का मतलब कितनी शुगर?", "HbA1c 7% का मतलब लगभग 154 mg/dL औसत ब्लड शुगर है।"], ["सामान्य HbA1c कितना है?", "5.7% से कम।"]],
        "related": ["hi/calculators/bp", "hi/calculators/bmi", "hi/personal-health-records"],
    },
    {
        "slug": "hi/calculators/bmi", "lang": "hi", "en": "calculators/bmi-calculator", "tool": "bmi", "kind": "tool", "audience": "consumer",
        "title": "BMI कैलकुलेटर हिन्दी में (भारतीय मानक) | QueroCura",
        "description": "अपनी लंबाई और वज़न से BMI निकालें, भारतीय मानकों के साथ (23 से ज़्यादा वज़न, 25 से मोटापा)। मुफ़्त, कुछ भी कहीं नहीं भेजा जाता।",
        "eyebrow": "BMI कैलकुलेटर", "h1": "BMI कैलकुलेटर, भारतीय मानकों के साथ",
        "lead": "BMI यानी वज़न (किलो) को लंबाई (मीटर) के वर्ग से भाग। भारतीयों में कम BMI पर ही डायबिटीज़ और दिल की बीमारी का ख़तरा बढ़ता है, इसलिए भारतीय मानक कम हैं: 23 से ज़्यादा वज़न और 25 से मोटापा। यह कैलकुलेटर दोनों दिखाता है।",
        "fields": [F("h", "लंबाई", "cm", mn=50, mx=250), F("w", "वज़न", "kg", mn=2, mx=400)],
        "cta": ["QueroCura में वज़न ट्रैक करें", "register/"], "cta2": ["QueroCura हिन्दी में", "hi/"],
        "sections": [
            {"h2": "BMI की श्रेणियाँ", "table": {"head": ["श्रेणी", "भारतीय मानक", "WHO अंतरराष्ट्रीय"], "rows": [
                ["कम वज़न", "18.5 से कम", "18.5 से कम"], ["सामान्य", "18.5 से 22.9", "18.5 से 24.9"], ["ज़्यादा वज़न", "23 से 24.9", "25 से 29.9"], ["मोटापा", "25 या ज़्यादा", "30 या ज़्यादा"]]}},
            {"h2": "कमर का नाप भी देखें", "p": ["BMI मांसपेशी और चर्बी में फ़र्क़ नहीं करता। भारतीय पुरुषों में 90 सेमी और महिलाओं में 80 सेमी से ज़्यादा कमर होने पर ख़तरा बढ़ता है।"]},
        ],
        "faq": [["भारतीयों के लिए सामान्य BMI कितना है?", "18.5 से 22.9। भारतीय मानकों में 23 से 24.9 ज़्यादा वज़न और 25 या ज़्यादा मोटापा है।"]],
        "related": ["hi/calculators/bp", "hi/calculators/sugar-hba1c", "hi"],
    },
]

HINDI_HMS = {
    "slug": "hi/hospital-management-system", "lang": "hi", "en": "hospital-management-system", "audience": "business",
    "title": "अस्पताल प्रबंधन सॉफ़्टवेयर (HMS) भारत के लिए | QueroCura",
    "description": "QueroCura अस्पताल प्रबंधन सॉफ़्टवेयर: अपॉइंटमेंट, OPD टोकन, इमरजेंसी ट्राइएज, बेड, ऑपरेशन थिएटर, फ़ार्मेसी और बिलिंग (UPI, PM-JAY, CGHS), हर आकार के अस्पताल के लिए।",
    "eyebrow": "अस्पताल प्रबंधन सॉफ़्टवेयर", "h1": "अस्पताल प्रबंधन सॉफ़्टवेयर, जो आपके अस्पताल का हर घंटा सँभाले",
    "lead": "QueroCura भारत के क्लिनिक, नर्सिंग होम और मल्टी-स्पेशियलिटी अस्पतालों के लिए अस्पताल प्रबंधन सॉफ़्टवेयर (HMS) है। मरीज़ रजिस्टर, अपॉइंटमेंट, OPD कतार, इमरजेंसी ट्राइएज, बेड, ऑपरेशन थिएटर, फ़ार्मेसी, बिलिंग और रिपोर्ट, सब एक जगह।",
    "cta": ["अपने अस्पताल का सेटअप प्लान बनाएँ", "hospital/setup/"], "cta2": ["अस्पताल पोर्टल", "hospital/"],
    "sections": [
        {"h2": "इसमें क्या है", "table": {"head": ["हिस्सा", "QueroCura में"], "rows": [
            ["मरीज़ रजिस्टर", "हर मरीज़ का एक रिकॉर्ड और MRN"], ["अपॉइंटमेंट", "हर स्लॉट पर असली इंतज़ार का समय"], ["OPD कतार", "विभाग के हिसाब से टोकन, स्क्रीन पर नाम कभी नहीं"],
            ["इमरजेंसी", "पाँच स्तर का ट्राइएज और समय-सीमा"], ["बेड", "लाइव बेड बोर्ड, भर्ती और डिस्चार्ज"], ["ऑपरेशन थिएटर", "क्लैश जाँच और WHO सर्जिकल सेफ़्टी चेकलिस्ट"],
            ["फ़ार्मेसी", "एलर्जी और दोहराव की जाँच, एक्सपायरी के हिसाब से स्टॉक"], ["बिलिंग", "नकद, UPI, कार्ड; PM-JAY, CGHS और बीमा"]]}},
        {"h2": "भारतीय अस्पतालों के लिए", "ul": ["ABHA के लिए तैयार, आपकी ABDM फ़ैसिलिटी ID के साथ।", "मरीज़ों के लिए हिन्दी और अंग्रेज़ी।", "हर संस्था की जाँच रजिस्ट्रेशन या लाइसेंस नंबर से।", "स्टाफ़ के लिए दो-चरण साइन-इन और ऐसा ऑडिट लॉग जिसे कोई बदल न सके।"]},
    ],
    "faq": [["अस्पताल प्रबंधन सॉफ़्टवेयर क्या है?", "ऐसा सॉफ़्टवेयर जो अस्पताल का रोज़ का काम एक जगह चलाता है: रजिस्ट्रेशन, अपॉइंटमेंट और कतार, इमरजेंसी और भर्ती, ऑपरेशन थिएटर, फ़ार्मेसी, बिलिंग और रिपोर्ट।"],
            ["क्या यह PM-JAY और CGHS के साथ काम करता है?", "हाँ, नकद, UPI और कार्ड के साथ PM-JAY, CGHS और बीमा भुगतानकर्ता भी।"]],
    "related": ["hi", "hi/calculators/bp"],
}

# ------------------------------------------------------------------ specialty hospitals

def S(slug, name, title, desc, h1, lead, needs, covers, pair, faq):
    return {"slug": slug, "audience": "business", "title": title, "description": desc, "eyebrow": name, "h1": h1, "lead": lead,
            "cta": ["Plan my setup", "hospital/setup/"], "cta2": ["Hospital management system", "hospital-management-system/"],
            "sections": [{"h2": "What %s need from their software" % name.lower(), "ul": needs},
                         {"h2": "What QueroCura covers", "ul": covers},
                         {"h2": "What to pair it with", "p": [pair]}],
            "faq": faq, "related": ["hospital-management-system", "guides/hospital-management-system-features", "nursing-home-software"]}


SPECIALTY = [
    S("eye-hospital-software", "Eye hospitals", "Eye Hospital Software: OPD, Cataract Theatre & Billing | QueroCura",
      "Hospital software for eye hospitals and clinics in India: high-volume OPD, cataract theatre lists, pharmacy and billing with PM-JAY, CGHS and insurance.",
      "Software for eye hospitals", "Eye hospitals see many patients a day and run high-volume theatre lists, mostly for cataract. Their software must keep a busy OPD moving, schedule theatres tightly and bill packages and schemes cleanly.",
      ["A fast, fair OPD with many quick reviews.", "Theatre lists that can hold many short cases a day.", "Package billing and schemes such as PM-JAY and CGHS.", "Pre-operative checks and follow-up visits on one record."],
      ["OPD tokens, live doctor status and real wait times.", "Theatre lists with clash checks and the WHO surgical safety checklist.", "Pharmacy with allergy checks and stock by expiry.", "Billing by cash, UPI, card, PM-JAY, CGHS and insurance.", "One record per patient for visits, results and bills."],
      "QueroCura does not include ophthalmology-specific tools such as refraction records, device integration with autorefractors or optical shop inventory. Pair it with your existing ophthalmic EMR or optical system for those.",
      [["What software do eye hospitals use?", "A hospital management system for OPD, theatres, pharmacy and billing, often alongside an ophthalmology EMR for refraction and device data."]]),
    S("dental-clinic-software", "Dental clinics", "Dental Clinic Software: Appointments, Billing & Records | QueroCura",
      "Software for dental clinics in India: appointments to real chair time, patient records, prescriptions and billing by UPI and card, with patients who arrive prepared.",
      "Software for dental clinics", "A dental clinic runs on chair time: appointments that match how long each procedure really takes, treatment over several visits, and clear billing for each step.",
      ["Appointments sized to the real length of each procedure.", "Treatment that spans several visits on one record.", "Clear estimates and billing per visit.", "Reminders so patients come back for the next step."],
      ["Appointments that learn each dentist's real consultation times.", "One record per patient across visits, with prescriptions and allergy checks.", "Billing by cash, UPI and card with receipts; prices per doctor and per procedure.", "Patients get visit reminders in the QueroCura app."],
      "QueroCura has no dental charting (tooth-by-tooth records), imaging integration with dental X-ray sensors or lab-work tracking. Pair it with a dental charting tool if you need those.",
      [["Is QueroCura a dental charting software?", "No. It runs appointments, records, prescriptions and billing; pair it with a dental charting tool for tooth-level records."]]),
    S("maternity-hospital-software", "Maternity hospitals", "Maternity Hospital & Nursing Home Software | QueroCura",
      "Software for maternity hospitals and nursing homes in India: antenatal OPD, labour and post-natal beds, theatre for caesarean sections, pharmacy and billing.",
      "Software for maternity hospitals", "A maternity hospital follows a mother over months: antenatal visits, admission in labour, delivery or caesarean section, post-natal care and the newborn's first days. The software must keep that journey on one record and the beds and theatre ready.",
      ["Antenatal OPD with regular visits and results on one record.", "Labour, post-natal and newborn beds on a live board.", "A theatre ready for emergency caesarean sections.", "Package billing and schemes."],
      ["OPD with real wait times and one record across visits.", "Live bed board for labour and post-natal wards, admission and discharge summaries.", "Theatre lists with the WHO surgical safety checklist.", "Pharmacy and billing including PM-JAY, CGHS and insurance.", "A free <a href=\"{root}calculators/pregnancy-due-date/\">due date calculator</a> for patients."],
      "QueroCura does not include a partograph, fetal monitoring integration or a dedicated newborn register. Use your obstetric tools for those alongside it.",
      [["What does maternity hospital software need?", "Antenatal OPD, a live view of labour and post-natal beds, a theatre for caesarean sections, pharmacy and billing, with the whole journey on one record."]]),
    S("diagnostic-centre-software", "Diagnostic centres", "Diagnostic Centre & Lab Software: Orders, Reports, Billing | QueroCura",
      "Software for diagnostic centres and labs that work with hospitals: orders from doctors, results back to the record, imaging with AI-assisted drafts, and billing.",
      "Software for diagnostic centres", "Diagnostic centres live between doctors and patients: orders arrive, samples and scans are taken, and results must go back to the right doctor and patient quickly, with the right bill.",
      ["Orders from doctors that reach the right department.", "Results that return to the requesting doctor and the patient's record.", "Imaging viewing and reporting.", "Billing per test with clear prices."],
      ["Orders between departments; lab and radiology staff see only the orders sent to them.", "Imaging: X-ray, CT and MRI series, ultrasound, ECG and more, with AI-assisted draft reads that a radiologist signs.", "Prices per test, billing by cash, UPI and card.", "Results shared to the patient's QueroCura app with their consent."],
      "QueroCura is not a full laboratory information system: it does not interface with lab analysers or manage sample barcodes and quality control. Pair it with a LIS for those.",
      [["Can QueroCura read scans?", "Its imaging workspace views and reports studies, and can prepare AI-assisted draft reads for chest X-ray, ECG and CT that a radiologist reviews and signs."]]),
    S("orthopaedic-hospital-software", "Orthopaedic hospitals", "Orthopaedic Hospital Software: OPD, Theatres, Imaging | QueroCura",
      "Software for orthopaedic hospitals: busy OPD with X-ray review, theatre lists with safety checks, in-patient beds, pharmacy and package billing.",
      "Software for orthopaedic hospitals", "Orthopaedic care runs through X-rays, theatres and beds: a busy OPD that reviews images, planned and trauma surgery, and in-patient stays with physiotherapy and follow-up.",
      ["OPD that keeps images next to the consultation.", "Theatre lists for planned and trauma cases.", "Beds and discharge with follow-up plans.", "Package billing for procedures."],
      ["Imaging workspace for X-ray, CT and MRI with reports on the patient record.", "Theatre lists with clash checks and the WHO checklist.", "Live bed board, discharge checklists and summaries.", "Billing with packages, schemes and insurance."],
      "QueroCura does not include implant inventory tracking or physiotherapy session planning. Use specialised tools for those alongside it.",
      [["What should orthopaedic hospital software include?", "OPD with image review, theatre scheduling with safety checks, bed management, pharmacy and package billing."]]),
    S("dialysis-centre-software", "Dialysis centres", "Dialysis Centre Software: Schedules, Records & Billing | QueroCura",
      "Software for dialysis centres: recurring session schedules, one record per patient, medicines with safety checks, and billing by schemes, insurance and UPI.",
      "Software for dialysis centres", "Dialysis patients come back two or three times a week for years. A centre needs schedules that repeat reliably, a record that shows the trend across sessions, and billing that handles schemes and insurance without friction.",
      ["Recurring schedules for each patient.", "One record across many sessions, with results and medicines.", "Medicine safety checks.", "Billing by schemes, insurance and self-pay."],
      ["Appointments and reminders for every session.", "One record per patient with results, prescriptions and allergy checks.", "Billing by cash, UPI, card, PM-JAY, CGHS and insurance.", "Patients can track readings such as blood pressure and weight in the QueroCura app and share them with consent."],
      "QueroCura does not connect to dialysis machines or record per-session machine parameters. Keep those in your dialysis machine software.",
      [["What does dialysis centre software need?", "Reliable recurring schedules, one record across sessions, medicine safety checks and billing for schemes and insurance."]]),
]

COMPARE = {
    "slug": "guides/hospital-software-vs-excel-and-paper", "kind": "guide", "audience": "business",
    "title": "Hospital Software vs Excel & Paper Registers: When to Switch | QueroCura",
    "description": "Still running your hospital on registers and Excel? An honest comparison with hospital management software, the costs of staying, and when to switch.",
    "eyebrow": "Software vs Excel", "h1": "Hospital software vs Excel and paper registers: when to switch",
    "lead": "Many good hospitals in India still run on paper registers and spreadsheets. They work until they don't: when a report can't be found, a bill is missed or the waiting room overflows. Here is an honest comparison, and the signs that it is time to switch.",
    "cta": ["Plan my setup", "hospital/setup/"], "cta2": ["HMS features list", "guides/hospital-management-system-features/"],
    "sections": [
        {"h2": "Side by side", "table": {"head": ["", "Paper and Excel", "Hospital management software"], "rows": [
            ["Cost to start", "Almost nothing", "A subscription"], ["Finding a patient's history", "Search registers and files", "One record, found in seconds"],
            ["Billing", "Typed from memory; services get missed", "Built from the visit"], ["Queues", "Shouted names, guesswork", "Tokens and real wait times"],
            ["Beds", "A whiteboard, out of date by noon", "A live bed board"], ["Reports", "Hours of counting", "Live and exportable"],
            ["Security", "Anyone can read a register", "Roles and an audit log"], ["Patients' own records", "Paper they may lose", "Shared with consent, digitally"]]}},
        {"h2": "Signs it is time to switch", "ul": ["Patients wait more than half an hour and the desk can't say how long.", "Month-end collections don't match services given.", "Staff spend hours on counts for reports.", "You can't tell which beds are free without walking the wards.", "You are opening a second site."]},
        {"h2": "How to switch without chaos", "p": ["Start with the front desk and billing for one OPD, then add departments over a month. Our <a href=\"{root}guides/hospital-management-system-implementation-plan/\">30-day implementation plan</a> shows the order."]},
    ],
    "faq": [["Can a small hospital run on Excel?", "It can for a while, but billing leaks, slow record searches and no live view of beds and queues usually cost more than software once patient numbers grow."]],
    "related": ["guides/hospital-management-system-implementation-plan", "nursing-home-software", "hospital-management-system"],
}
