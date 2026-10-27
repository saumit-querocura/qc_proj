# -*- coding: utf-8 -*-
"""More public pages: free calculators, Hindi pages, a glossary, practical guides and a press page.

Same rules as pages.py: only what is true, answer first, no medicine advice.  Calculator formulas are the published
ones, named on each page; results are information, never a diagnosis.
"""

# ------------------------------------------------------------------ free calculators (rendered with assets/js/qc-tools.js)

def F(k, label, unit="", typ="number", step="any", mn=None, mx=None, value="", hint=""):
    return {"k": k, "label": label, "unit": unit, "type": typ, "step": step, "min": mn, "max": mx, "value": value, "hint": hint}


TOOLS = [
    {
        "slug": "calculators/bmi-calculator", "tool": "bmi", "audience": "consumer", "kind": "tool",
        "title": "BMI Calculator for Indians (Asian Cut-offs) | QueroCura",
        "description": "Free BMI calculator with both WHO and the lower Asian-Indian cut-offs (overweight from 23, obese from 25). Enter height and weight; nothing is sent anywhere.",
        "eyebrow": "BMI calculator", "h1": "BMI calculator with Indian cut-offs",
        "lead": "Body mass index (BMI) is weight in kilograms divided by height in metres squared. Indians develop diabetes and heart disease at lower BMIs than Europeans, so Indian guidelines use lower cut-offs: overweight from 23 and obese from 25. This calculator shows both.",
        "fields": [F("h", "Height", "cm", mn=50, mx=250, value=""), F("w", "Weight", "kg", mn=2, mx=400, value="")],
        "cta": ["Track your weight in QueroCura", "register/"], "cta2": ["All calculators", "calculators/"],
        "sections": [
            {"h2": "BMI categories", "table": {"head": ["Category", "Asian-Indian cut-off", "WHO international"], "rows": [
                ["Underweight", "Below 18.5", "Below 18.5"], ["Normal", "18.5 to 22.9", "18.5 to 24.9"], ["Overweight", "23 to 24.9", "25 to 29.9"], ["Obese", "25 or more", "30 or more"]]}},
            {"h2": "How it's calculated", "p": ["BMI = weight (kg) ÷ height (m)². The Asian-Indian cut-offs come from the 2009 Indian consensus guidelines on obesity, which lowered them because of higher body fat and metabolic risk at the same BMI.",
                                               "BMI does not measure body fat directly: very muscular people can score high, and older people can score normal while carrying too much fat. Waist size adds useful information (risk rises above 90 cm for Indian men and 80 cm for Indian women)."]},
        ],
        "faq": [["What is a normal BMI for Indians?", "18.5 to 22.9. Indian guidelines treat 23 to 24.9 as overweight and 25 or more as obese, lower than the WHO international cut-offs."],
                ["Is BMI accurate?", "It is a quick screening number, not a diagnosis. It does not tell muscle from fat; waist size and a doctor's assessment add to it."]],
        "related": ["calculators/blood-pressure-checker", "calculators/hba1c-to-average-glucose", "health-app"],
    },
    {
        "slug": "calculators/blood-pressure-checker", "tool": "bp", "audience": "consumer", "kind": "tool",
        "title": "Blood Pressure Chart & Checker: Is My BP Normal? | QueroCura",
        "description": "Enter your blood pressure reading to see its category (ISH 2020): normal, high-normal, grade 1 or grade 2 hypertension, and when to get urgent care.",
        "eyebrow": "Blood pressure checker", "h1": "Is my blood pressure normal? Check a reading",
        "lead": "Enter the top (systolic) and bottom (diastolic) numbers of a reading. The checker shows which category it falls in under the International Society of Hypertension 2020 guideline. One reading is not a diagnosis: blood pressure is judged on several readings taken on different days.",
        "fields": [F("s", "Top number (systolic)", "mmHg", mn=50, mx=300), F("d", "Bottom number (diastolic)", "mmHg", mn=30, mx=200)],
        "cta": ["Track your BP in QueroCura", "register/"], "cta2": ["All calculators", "calculators/"],
        "sections": [
            {"h2": "Blood pressure categories (ISH 2020, adults, clinic readings)", "table": {"head": ["Category", "Systolic (top)", "Diastolic (bottom)"], "rows": [
                ["Normal", "Below 130", "and below 85"], ["High-normal", "130 to 139", "or 85 to 89"], ["Grade 1 hypertension", "140 to 159", "or 90 to 99"], ["Grade 2 hypertension", "160 or more", "or 100 or more"]]}},
            {"h2": "When it is urgent", "p": ["A reading of 180/110 or higher needs medical attention the same day. Go to an emergency department now if a high reading comes with chest pain, breathlessness, a severe headache, confusion, weakness on one side, blurred vision or trouble speaking. In India, call 112."]},
            {"h2": "Measuring it right", "ul": ["Sit quietly for five minutes, back supported, feet flat, arm resting at heart level.", "No caffeine, smoking or exercise in the 30 minutes before.", "Take two readings a minute apart and use the average.", "Home readings run lower than clinic ones: 135/85 at home is roughly equivalent to 140/90 in a clinic."]},
        ],
        "faq": [["What is normal blood pressure?", "Under the ISH 2020 guideline, below 130/85 is normal for adults. Hypertension starts at 140/90 on repeated clinic readings."],
                ["Is 140/90 high blood pressure?", "Yes, 140/90 or above on repeated readings is grade 1 hypertension. Talk to your doctor; do not start or change medicines on your own."]],
        "related": ["calculators/bmi-calculator", "health-app", "medicine-reminder-app"],
    },
    {
        "slug": "calculators/hba1c-to-average-glucose", "tool": "a1c", "audience": "consumer", "kind": "tool",
        "title": "HbA1c to Average Blood Sugar Calculator (eAG) | QueroCura",
        "description": "Convert an HbA1c result to estimated average glucose in mg/dL and mmol/L, or the other way round, with the normal, prediabetes and diabetes ranges.",
        "eyebrow": "HbA1c calculator", "h1": "HbA1c to average blood sugar",
        "lead": "HbA1c shows your average blood sugar over the past two to three months. Enter an HbA1c percentage to see the estimated average glucose (eAG) it corresponds to, or enter an average glucose to see the matching HbA1c.",
        "fields": [F("a", "HbA1c", "%", mn=3, mx=20, hint="or fill in the next box instead"), F("g", "Average glucose", "mg/dL", mn=40, mx=600)],
        "cta": ["Keep your reports in CuraVault", "personal-health-records/"], "cta2": ["All calculators", "calculators/"],
        "sections": [
            {"h2": "HbA1c ranges", "table": {"head": ["HbA1c", "Meaning (ADA)", "Average glucose"], "rows": [
                ["Below 5.7%", "Normal", "below about 117 mg/dL"], ["5.7% to 6.4%", "Prediabetes", "about 117 to 137 mg/dL"], ["6.5% or more", "Diabetes range (confirm with a repeat test)", "about 140 mg/dL or more"]]}},
            {"h2": "How it's calculated", "p": ["The ADAG study formula: average glucose (mg/dL) = 28.7 × HbA1c − 46.7, or in mmol/L = 1.59 × HbA1c − 2.59. Anaemia, recent blood loss or transfusion, pregnancy, kidney disease and some haemoglobin variants can make HbA1c misleading; your doctor reads it with those in mind."]},
        ],
        "faq": [["What is a normal HbA1c?", "Below 5.7%. 5.7% to 6.4% is prediabetes and 6.5% or more is in the diabetes range."],
                ["HbA1c 7 means what blood sugar?", "An HbA1c of 7% corresponds to an estimated average glucose of about 154 mg/dL (8.6 mmol/L)."]],
        "related": ["calculators/bmi-calculator", "personal-health-records", "health-app"],
    },
    {
        "slug": "calculators/pregnancy-due-date", "tool": "due", "audience": "consumer", "kind": "tool",
        "title": "Pregnancy Due Date Calculator (from Last Period) | QueroCura",
        "description": "Calculate your estimated due date and how many weeks pregnant you are from the first day of your last period, with your cycle length.",
        "eyebrow": "Due date calculator", "h1": "Pregnancy due date calculator",
        "lead": "Enter the first day of your last menstrual period and your usual cycle length. The calculator gives your estimated due date, how far along you are today and your trimester. An early ultrasound scan gives a more exact date.",
        "fields": [F("l", "First day of your last period", "", typ="date"), F("c", "Usual cycle length", "days", mn=20, mx=45, value="28")],
        "cta": ["Plan visits in your health calendar", "register/"], "cta2": ["All calculators", "calculators/"],
        "sections": [
            {"h2": "How it's calculated", "p": ["Naegele's rule: the due date is 280 days (40 weeks) after the first day of the last period, adjusted by the difference between your cycle length and 28 days. Only about 1 in 20 babies arrives on the due date; most arrive within two weeks either side."]},
            {"h2": "Trimesters", "table": {"head": ["Trimester", "Weeks"], "rows": [["First", "Up to 13 weeks 6 days"], ["Second", "14 to 27 weeks 6 days"], ["Third", "28 weeks to birth"]]}},
        ],
        "faq": [["How accurate is a due date calculator?", "It is an estimate. A dating ultrasound in the first trimester is more accurate, especially with irregular cycles."]],
        "related": ["health-app", "family-health-app"],
    },
    {
        "slug": "calculators/medicine-schedule-maker", "tool": "meds", "audience": "consumer", "kind": "tool",
        "title": "Free Printable Medicine Schedule Chart Maker | QueroCura",
        "description": "Make a printable daily medicine chart for a parent or yourself: medicines, doses and times of day in a clear table. Free, in your browser, nothing is sent anywhere.",
        "eyebrow": "Medicine schedule maker", "h1": "Make a printable medicine schedule",
        "lead": "Write down each medicine exactly as your doctor prescribed it, tick the times of day, and print a clear chart to stick on the fridge. Everything stays in your browser. For reminders on your phone with a Taken button and family alerts, use the QueroCura app.",
        "fields": [],
        "cta": ["Get medicine reminders", "medicine-reminder-app/"], "cta2": ["All calculators", "calculators/"],
        "sections": [
            {"h2": "Tips for a medicine chart that works", "ul": ["Copy names and doses exactly from the prescription; ask your pharmacist if anything is unclear.", "Note \"before food\" or \"after food\" where the prescription says so.", "Keep the chart next to the medicines, and a photo of it on your phone.", "Bring the chart and the medicines to every doctor's visit."]},
        ],
        "faq": [["Does this tell me what medicines to take?", "No. Fill it in from your doctor's prescription. QueroCura never recommends medicines or doses."]],
        "related": ["medicine-reminder-app", "family-health-app", "guides/how-to-remind-elderly-parents-to-take-medicines"],
    },
    {
        "slug": "calculators/qtc-calculator", "tool": "qtc", "audience": "business", "kind": "tool",
        "title": "QTc Calculator: Bazett, Fridericia, Framingham, Hodges | QueroCura",
        "description": "Corrected QT interval calculator for clinicians: Bazett, Fridericia, Framingham and Hodges from QT and heart rate, with prolongation thresholds.",
        "eyebrow": "QTc calculator", "h1": "QTc calculator (four formulas)",
        "lead": "Enter the measured QT interval and the heart rate. The calculator gives the corrected QT by Bazett, Fridericia, Framingham and Hodges. Fridericia is preferred at fast or slow rates, where Bazett over- and under-corrects.",
        "fields": [F("q", "QT interval", "ms", mn=150, mx=800), F("r", "Heart rate", "bpm", mn=20, mx=250)],
        "cta": ["AI-assisted ECG analysis", "ai-medical-imaging/"], "cta2": ["All calculators", "calculators/"],
        "sections": [
            {"h2": "Formulas", "table": {"head": ["Formula", "QTc ="], "rows": [["Bazett", "QT ÷ √RR"], ["Fridericia", "QT ÷ ∛RR"], ["Framingham", "QT + 154 × (1 − RR)"], ["Hodges", "QT + 1.75 × (HR − 60)"]]}},
            {"h2": "Thresholds", "p": ["Prolonged: over 450 ms in men, over 470 ms in women. 500 ms or more, or a rise of 60 ms or more from baseline, carries a high risk of torsades de pointes. RR is in seconds (60 ÷ heart rate). With a QRS of 120 ms or more, the JT interval is a better guide."]},
        ],
        "faq": [["Which QTc formula is best?", "Fridericia and Framingham correct better than Bazett at heart rates outside 60 to 100; Bazett remains common but overestimates QTc at fast rates."]],
        "related": ["ai-medical-imaging", "hospital-management-system"],
    },
    {
        "slug": "calculators/bed-occupancy-rate", "tool": "beds", "audience": "business", "kind": "tool",
        "title": "Bed Occupancy Rate, ALOS & Bed Turnover Calculator | QueroCura",
        "description": "Free hospital KPI calculator: bed occupancy rate, average length of stay (ALOS), bed turnover rate and turnover interval from beds, inpatient days and discharges.",
        "eyebrow": "Bed occupancy calculator", "h1": "Bed occupancy rate and length-of-stay calculator",
        "lead": "Four numbers hospital managers watch every month. Enter your bed count, the period, inpatient days and discharges to get bed occupancy rate, average length of stay (ALOS), bed turnover rate and turnover interval.",
        "fields": [F("b", "Staffed beds", "", mn=1), F("p", "Days in the period", "days", mn=1, value="30"), F("i", "Inpatient days in the period", "days", mn=0), F("x", "Discharges in the period", "", mn=0)],
        "cta": ["See the live bed board", "hospital-management-system/"], "cta2": ["All calculators", "calculators/"],
        "sections": [
            {"h2": "Formulas", "table": {"head": ["Indicator", "Formula"], "rows": [
                ["Bed occupancy rate", "Inpatient days ÷ (beds × days in period) × 100"], ["Average length of stay", "Inpatient days ÷ discharges"],
                ["Bed turnover rate", "Discharges ÷ beds"], ["Turnover interval", "(Beds × days − inpatient days) ÷ discharges"]]}},
            {"h2": "What good looks like", "p": ["Many hospitals aim for 75% to 85% occupancy: lower wastes capacity, while running above about 85% leaves little room for emergencies and is linked to bed shortages and infection risk. ALOS depends heavily on case mix, so compare it within a specialty and over time."]},
        ],
        "faq": [["What is a good bed occupancy rate?", "Around 75% to 85% is a common target. Sustained occupancy above 85% leaves too little room for emergency admissions."],
                ["How do you calculate average length of stay?", "Total inpatient days in a period divided by the number of discharges in the same period."]],
        "related": ["hospital-management-system", "calculators/opd-capacity-planner", "glossary"],
    },
    {
        "slug": "calculators/opd-capacity-planner", "tool": "opd", "audience": "business", "kind": "tool",
        "title": "OPD Capacity & Waiting Time Calculator | QueroCura",
        "description": "How many OPD patients can your doctors see per day, and how long will the next patient wait? A free calculator for clinics and hospitals.",
        "eyebrow": "OPD capacity planner", "h1": "OPD capacity and waiting time calculator",
        "lead": "Enter how many doctors are in OPD, their hours and the average consultation time. The planner shows how many patients you can see per day and per hour, and how long a patient arriving now will wait behind those already in the queue.",
        "fields": [F("d", "Doctors in OPD", "", mn=1, value="2"), F("h", "OPD hours per doctor per day", "hours", mn=0.5, value="4"), F("c", "Average consultation", "minutes", mn=1, value="10"), F("w", "Patients waiting now", "", mn=0, value="12")],
        "cta": ["Real wait times with QueroCura", "doctor-appointment-booking/"], "cta2": ["All calculators", "calculators/"],
        "sections": [
            {"h2": "How it's calculated", "p": ["Capacity per day = doctors × hours × 60 ÷ consultation minutes. Expected wait for a new arrival ≈ patients waiting × consultation minutes ÷ doctors. Real days drift: consultations vary and doctors start late. QueroCura learns each doctor's real consultation times and shows the real wait for every slot."]},
        ],
        "faq": [["How do you reduce OPD waiting time?", "Book patients for when the doctor will really be free, spread arrivals with arrive-by times, separate quick follow-ups, and show the queue honestly. See our guide on reducing OPD waiting time."]],
        "related": ["doctor-appointment-booking", "guides/how-to-reduce-opd-waiting-time", "calculators/bed-occupancy-rate"],
    },
]

CALC_HUB = {
    "slug": "calculators", "audience": "both", "kind": "hub",
    "title": "Free Health & Hospital Calculators | QueroCura",
    "description": "Free calculators: BMI with Indian cut-offs, blood pressure checker, HbA1c to average glucose, due date, medicine chart maker, QTc, bed occupancy and OPD capacity.",
    "eyebrow": "Free calculators", "h1": "Free health and hospital calculators",
    "lead": "Quick, private calculators that run in your browser: nothing you type is sent anywhere. For people and families, and for the doctors and managers who run clinics and hospitals.",
    "cta": ["Try the QueroCura app", "register/"], "cta2": ["For hospitals", "hospital-management-system/"],
    "sections": [
        {"h2": "For you and your family", "ul": ['<a href="{root}%s/">%s</a>: %s' % (t["slug"], t["h1"], t["description"]) for t in TOOLS if t["audience"] == "consumer"]},
        {"h2": "For doctors and hospital managers", "ul": ['<a href="{root}%s/">%s</a>: %s' % (t["slug"], t["h1"], t["description"]) for t in TOOLS if t["audience"] == "business"]},
    ],
    "faq": [], "related": [],
}

# ------------------------------------------------------------------ practical guides

GUIDES = [
    {
        "slug": "guides/how-to-reduce-opd-waiting-time", "kind": "guide", "audience": "business",
        "title": "How to Reduce OPD Waiting Time: 8 Practical Fixes | QueroCura",
        "description": "Long OPD queues cost patients and revenue. Eight practical ways Indian clinics and hospitals cut waiting time, from realistic booking to honest queue screens.",
        "eyebrow": "Guide", "h1": "How to reduce OPD waiting time: 8 practical fixes",
        "lead": "Most OPD waiting comes from one mismatch: patients are booked for the time on the schedule, but doctors run to the time of the real day. Fixing that mismatch, and being honest with patients about it, does more than adding chairs to the waiting room.",
        "cta": ["Plan my hospital setup", "hospital/setup/"], "cta2": ["OPD capacity calculator", "calculators/opd-capacity-planner/"],
        "sections": [
            {"h2": "1. Measure the real wait first", "p": ["Record arrival time, time called and time seen for a week. Most clinics find the wait is concentrated in two or three peak hours and with one or two doctors, which tells you where to act."]},
            {"h2": "2. Book to the real consultation length", "p": ["Fixed 10-minute slots fail when a doctor really averages 14. Book each doctor to their own average consultation time, and recalculate it every few weeks."]},
            {"h2": "3. Give arrive-by times, not slot times", "p": ["Tell patients when to arrive based on when the doctor will really be free, and warn them on the day if the doctor is running late. Fewer people arrive early and sit for an hour."]},
            {"h2": "4. Separate quick visits", "p": ["Report reviews, dressing changes and prescription renewals take minutes. A separate queue or time block for them stops them waiting behind new consultations."]},
            {"h2": "5. Do the paperwork before the patient reaches the doctor", "p": ["Registration, vitals and history-taking at the front desk or by a nurse, and patients who send their history before the visit, save minutes in every consultation."]},
            {"h2": "6. Use fair, visible tokens", "p": ["A token per department and a waiting-room screen that shows the queue (by number, never by name) reduces anxiety and the stream of \"how much longer?\" questions at the desk."]},
            {"h2": "7. Watch every doctor's status live", "p": ["The desk should see at a glance who is free, who is with a patient and who is running late, and send walk-ins to the doctor with the shortest real wait."]},
            {"h2": "8. Review weekly", "p": ["Look at waiting times by doctor and hour every week and adjust slots and staffing. Small changes compound."]},
        ],
        "faq": [["What is a reasonable OPD waiting time?", "Many hospitals aim for patients to be seen within 30 minutes of their appointment time; publish your own target and measure against it."]],
        "related": ["doctor-appointment-booking", "calculators/opd-capacity-planner", "hospital-management-system"],
    },
    {
        "slug": "guides/how-to-remind-elderly-parents-to-take-medicines", "kind": "guide", "audience": "consumer",
        "title": "How to Help Elderly Parents Take Their Medicines on Time | QueroCura",
        "description": "Practical ways to help ageing parents take medicines correctly, especially from another city: a clear list, pill organisers, reminders, and family alerts.",
        "eyebrow": "Guide", "h1": "How to help elderly parents take their medicines on time",
        "lead": "Missed and doubled doses are common when parents take several medicines a day, and harder to spot when you live in another city. A clear list, a simple routine and reminders that tell you when a dose has been taken make the biggest difference.",
        "cta": ["Medicine reminders with family alerts", "medicine-reminder-app/"], "cta2": ["Print a medicine chart", "calculators/medicine-schedule-maker/"],
        "sections": [
            {"h2": "1. Make one up-to-date list", "p": ["Gather every prescription and every strip in the house. Write one list with each medicine, its dose, when to take it and what it is for, and ask their doctor or pharmacist to check it, especially if several doctors prescribe. Our free medicine schedule maker prints one."]},
            {"h2": "2. Tie doses to daily habits", "p": ["Morning tea, lunch and the evening news are easier to remember than clock times. Keep the medicines where that habit happens, away from heat and children."]},
            {"h2": "3. Use a weekly pill organiser", "p": ["A box with morning, afternoon and night compartments for each day shows at a glance whether a dose was taken. Fill it together once a week, or ask a neighbour or pharmacist to help."]},
            {"h2": "4. Set reminders that close the loop", "p": ["A reminder only helps if someone knows the dose was taken. With QueroCura, your parent taps Taken on the reminder and, with their permission, you are told straight away. If no confirmation comes, you know to call."]},
            {"h2": "5. Watch for side effects and changes", "p": ["Dizziness, falls, confusion or new sleepiness after a medicine change are worth a call to the doctor. Never stop or change a medicine without the doctor's advice."]},
            {"h2": "6. Take the list to every visit", "p": ["Bring the list and the medicines themselves to each appointment so the doctor can review everything together, and update the list the same day."]},
        ],
        "faq": [["How can I check if my parents took their medicine when I live far away?", "Use a reminder app with family alerts. In QueroCura, your parent marks a dose as taken and, with their permission, you are notified immediately."]],
        "related": ["medicine-reminder-app", "family-health-app", "calculators/medicine-schedule-maker"],
    },
    {
        "slug": "guides/emr-vs-ehr-vs-hms", "kind": "guide", "audience": "business",
        "title": "EMR vs EHR vs HMS vs PHR: What's the Difference? | QueroCura",
        "description": "Plain-language definitions of EMR, EHR, HMS (HIS) and PHR, how they differ, and how they fit together with ABHA and ABDM in India.",
        "eyebrow": "Guide", "h1": "EMR vs EHR vs HMS vs PHR: what's the difference?",
        "lead": "These four terms are often used as if they mean the same thing. In short: an EMR is one provider's clinical record, an EHR is a record designed to follow the patient between providers, an HMS runs the hospital's operations, and a PHR belongs to the patient.",
        "cta": ["QueroCura HMS", "hospital-management-system/"], "cta2": ["CuraVault PHR", "personal-health-records/"],
        "sections": [
            {"h2": "At a glance", "table": {"head": ["", "Who owns it", "What it holds", "Example use"], "rows": [
                ["EMR (electronic medical record)", "One clinic or hospital", "Diagnoses, notes, prescriptions, results at that provider", "A doctor reviewing last month's visit"],
                ["EHR (electronic health record)", "Shared across providers", "A patient's record from many providers, built to be exchanged", "A specialist seeing a GP's history"],
                ["HMS / HIS (hospital management or information system)", "The hospital", "Operations: registration, appointments, beds, theatres, pharmacy, billing, plus the EMR", "Running the OPD queue and billing"],
                ["PHR (personal health record)", "The patient", "Reports, prescriptions, readings and history the patient keeps", "A family keeping parents' reports in one place"]]}},
            {"h2": "How they fit together in India", "p": ["ABDM (Ayushman Bharat Digital Mission) links these pieces: patients get an ABHA number, facilities register in the Health Facility Registry, and records can move between providers with the patient's consent. A hospital's HMS holds its EMR; the patient's PHR app can receive copies; consent decides who sees what."]},
            {"h2": "Where QueroCura fits", "p": ["QueroCura has both ends: a hospital management system with a clinical record for providers, and CuraVault, a personal health record for patients and families, connected by the patient's consent."]},
        ],
        "faq": [["Is an HMS the same as an EMR?", "No. An HMS runs hospital operations (appointments, beds, pharmacy, billing) and usually contains an EMR, which is the clinical record."],
                ["What is a PHR?", "A personal health record: the patient's own collection of reports, prescriptions and readings, which the patient controls."]],
        "related": ["hospital-management-system", "personal-health-records", "glossary"],
    },
    {
        "slug": "guides/how-to-organise-your-familys-medical-records", "kind": "guide", "audience": "consumer",
        "title": "How to Organise Your Family's Medical Records | QueroCura",
        "description": "A simple system for keeping your family's reports, prescriptions and scans organised and ready for any doctor's visit or emergency.",
        "eyebrow": "Guide", "h1": "How to organise your family's medical records",
        "lead": "Reports in WhatsApp chats, prescriptions in drawers, scans on CDs: most families' records are scattered until the day a doctor needs them. An hour of organising, then a habit of adding each new report the day it arrives, fixes it.",
        "cta": ["Create your CuraVault", "personal-health-records/"], "cta2": ["Family health app", "family-health-app/"],
        "sections": [
            {"h2": "1. One place per person", "p": ["Give each family member their own folder or record. Mixing everyone's papers is how a parent's report ends up in a child's file."]},
            {"h2": "2. Keep these first", "ul": ["Allergies, long-term conditions and current medicines (one page per person).", "Blood group, ABHA number and insurance details.", "The last two years of lab reports, discharge summaries and scan reports.", "Vaccination records for children and older adults."]},
            {"h2": "3. Digitise and name files clearly", "p": ["Photograph or scan each paper and name it with the date, the person and the test, such as \"2026-03-14 Papa HbA1c\". In CuraVault, upload the photo: it reads the values, you check them, and each one is explained and tracked over time."]},
            {"h2": "4. Share safely", "p": ["Share only what a doctor needs, for as long as they need it. QueroCura share links need a PIN, expire on their own and can be switched off; a hospital sees nothing until you say yes."]},
            {"h2": "5. Make it a habit", "p": ["Add every new report the day you receive it, and review each person's one-page summary before a visit."]},
        ],
        "faq": [["Which medical records should I keep?", "Allergies, conditions and current medicines; blood group and insurance; recent lab, scan and discharge reports; and vaccination records."]],
        "related": ["personal-health-records", "family-health-app", "health-app"],
    },
]

# ------------------------------------------------------------------ glossary

GLOSSARY_TERMS = [
    ["ABDM", "Ayushman Bharat Digital Mission: India's national programme to connect patients, health facilities and professionals digitally, with records shared by consent."],
    ["ABHA", "Ayushman Bharat Health Account: a free 14-digit health ID that lets a person link and share their health records across ABDM-connected providers with consent."],
    ["ALOS (average length of stay)", "Total inpatient days in a period divided by the number of discharges in that period."],
    ["Bed occupancy rate", "Inpatient days divided by available bed-days in a period, as a percentage; many hospitals aim for 75% to 85%."],
    ["CGHS", "Central Government Health Scheme: health cover for central government employees, pensioners and their dependants, used at empanelled hospitals."],
    ["DICOM", "Digital Imaging and Communications in Medicine: the standard format for medical images such as X-ray, CT and MRI, and for exchanging them."],
    ["Discharge summary", "A document given when a patient leaves hospital: diagnosis, treatment given, medicines and follow-up instructions."],
    ["Early warning score (NEWS2)", "A score from vital signs (breathing rate, oxygen, blood pressure, pulse, consciousness, temperature) that flags patients who are getting worse."],
    ["EHR (electronic health record)", "A patient's record designed to be shared across providers."],
    ["EMR (electronic medical record)", "The clinical record kept by one provider."],
    ["e-Prescription", "A prescription created digitally, which can be checked for allergies and duplicates and printed or shared."],
    ["HbA1c", "A blood test showing average blood sugar over about three months; 6.5% or more is in the diabetes range."],
    ["HFR (Health Facility Registry)", "ABDM's registry of verified health facilities in India; a registered facility has a facility ID."],
    ["HMS / HIS", "Hospital management system or hospital information system: software that runs a hospital's operations and records."],
    ["HPR (Healthcare Professionals Registry)", "ABDM's registry of verified doctors, nurses and other health professionals."],
    ["IPD (in-patient department)", "Care for patients admitted to a hospital bed."],
    ["LIS", "Laboratory information system: software that manages lab orders, samples and results."],
    ["Medication adherence", "Taking medicines as prescribed: the right dose, at the right time, for the right duration."],
    ["MRN / UHID", "Medical record number or unique health ID: the number a hospital uses to identify one patient's record."],
    ["NABH", "National Accreditation Board for Hospitals & Healthcare Providers, part of the Quality Council of India, which accredits hospitals against quality standards."],
    ["OPD (out-patient department)", "Care for patients who visit and leave the same day, without admission."],
    ["PACS", "Picture archiving and communication system: stores and shows medical images."],
    ["PHR (personal health record)", "A health record kept and controlled by the patient."],
    ["PM-JAY", "Ayushman Bharat Pradhan Mantri Jan Arogya Yojana: government health cover of up to ₹5 lakh per family per year for hospital care at empanelled hospitals."],
    ["Pre-authorisation", "Approval from an insurer, TPA or scheme before a planned treatment, so the hospital is paid."],
    ["QTc", "The QT interval of an ECG corrected for heart rate; prolongation raises the risk of dangerous arrhythmias."],
    ["RIS", "Radiology information system: manages radiology orders, scheduling and reports."],
    ["TPA (third-party administrator)", "A company that processes health insurance claims and cashless approvals for insurers."],
    ["Triage", "Sorting patients by how urgently they need care, usually in five levels in emergency departments."],
    ["WHO surgical safety checklist", "A checklist used before anaesthesia, before incision and before the patient leaves theatre, shown to reduce surgical complications."],
]

GLOSSARY = {
    "slug": "glossary", "kind": "glossary", "audience": "both",
    "title": "Healthcare & Hospital Glossary: OPD, IPD, ABHA, PM-JAY | QueroCura",
    "description": "Plain-language definitions of 30 healthcare and hospital terms used in India: OPD, IPD, ABHA, ABDM, PM-JAY, CGHS, NABH, EMR, EHR, ALOS, triage and more.",
    "eyebrow": "Glossary", "h1": "Healthcare and hospital glossary",
    "lead": "Short, plain-language definitions of the terms used in Indian hospitals, health schemes and health records.",
    "cta": ["QueroCura HMS", "hospital-management-system/"], "cta2": ["EMR vs EHR vs HMS", "guides/emr-vs-ehr-vs-hms/"],
    "sections": [], "faq": [], "related": ["guides/emr-vs-ehr-vs-hms", "hospital-management-system", "calculators/bed-occupancy-rate"],
}

# ------------------------------------------------------------------ press

PRESS = {
    "slug": "press", "kind": "about", "audience": "both",
    "title": "QueroCura Press Kit: Facts, Founders & Boilerplate",
    "description": "Facts, boilerplate, founders and contact for journalists and partners writing about QueroCura, Indian healthcare software for hospitals and families.",
    "eyebrow": "Press", "h1": "Press kit",
    "lead": "Everything you need to write about QueroCura. For interviews, demos and images, write to hello@querocura.com.",
    "cta": ["Email us", "mailto:hello@querocura.com"], "cta2": ["About QueroCura", "about/"],
    "sections": [
        {"h2": "Boilerplate", "p": ["QueroCura is Indian healthcare software that connects the people who give care with the people who receive it. Its free health app helps people and families check symptoms in English and Hindi, remember their medicines, keep and understand their medical reports and prepare for doctor visits. Its hospital management system runs appointments, OPD queues, emergency triage, beds, theatres, pharmacy and billing for clinics and hospitals of any size. Patients decide what their hospital can see. QueroCura was founded by Udantika Dhar and Saumit Pradhan."]},
        {"h2": "One line", "p": ["QueroCura: one place for your family's health, and one system for the hospital that cares for them."]},
        {"h2": "Facts", "table": {"head": ["", ""], "rows": [
            ["Name", "QueroCura (one word, capital Q and C)"], ["Website", "querocura.com"], ["Founders", "Udantika Dhar, Chief Executive Officer; Saumit Pradhan, Chief Technology Officer"],
            ["Country", "India"], ["Languages", "English and Hindi"], ["For people", "Free: symptom checker, medicine reminders, CuraVault health records, family garden, calendar, visit prep"],
            ["For providers", "Hospital management system, clinic software, AI-assisted imaging that can run on the hospital's own server"],
            ["Principles", "Consent first; never medicine advice; encrypted records; an audit log of every access"], ["Contact", "hello@querocura.com"]]}},
        {"h2": "Story angles", "ul": ["Booking patients for when the doctor will really be free, instead of the time on the schedule.", "AI imaging reads that run on the hospital's own server, so scans never leave the building.", "Family health with consent: each person chooses what their relatives can see.", "A symptom checker that works end to end in Hindi and never recommends medicines."]},
    ],
    "faq": [], "related": ["about", "healthcare-software"],
}

# ------------------------------------------------------------------ Hindi pages (paired with their English pages by hreflang)

HINDI = [
    {
        "slug": "hi", "lang": "hi", "en": "health-app", "audience": "consumer",
        "title": "QueroCura हेल्थ ऐप: लक्षण जाँच, दवा रिमाइंडर और परिवार की सेहत",
        "description": "हिन्दी में मुफ़्त हेल्थ ऐप: लक्षण जाँच, दवा याद दिलाने वाले रिमाइंडर, मेडिकल रिपोर्ट सँभालना और समझना, और पूरे परिवार की सेहत एक जगह। दवा की सलाह कभी नहीं।",
        "eyebrow": "QueroCura हिन्दी में", "h1": "आपकी और आपके परिवार की सेहत, एक ही जगह",
        "lead": "QueroCura एक मुफ़्त हेल्थ ऐप है जो पूरी तरह हिन्दी में चलता है। अपने लक्षण अपने शब्दों में बताइए, दवाओं के रिमाइंडर पाइए, अपनी रिपोर्टें सँभालिए और समझिए, डॉक्टर से मिलने की तैयारी कीजिए और अपने माता-पिता व बच्चों की सेहत का ध्यान रखिए।",
        "cta": ["मुफ़्त शुरू करें", "register/"], "cta2": ["लक्षण जाँचें", "symptoms/"],
        "sections": [
            {"h2": "ऐप में क्या है", "table": {"head": ["सुविधा", "क्या करती है"], "rows": [
                ['<a href="{root}hi/symptom-checker/">लक्षण जाँच</a>', "डॉक्टर की तरह आगे के सवाल पूछती है और बताती है कि मामला कितना ज़रूरी है"],
                ['<a href="{root}hi/medicine-reminder-app/">दवा रिमाइंडर</a>', "समय पर याद दिलाता है, नोटिफ़िकेशन पर ही \"ले ली\" बटन, और परिवार को सूचना"],
                ['<a href="{root}hi/personal-health-records/">CuraVault</a>', "रिपोर्ट, पर्चे और स्कैन पढ़ता है और हर वैल्यू आसान भाषा में समझाता है"],
                ['<a href="{root}hi/family-health-app/">फ़ैमिली गार्डन</a>', "माता-पिता और बच्चों की सेहत, उनकी अनुमति से"],
                ["हेल्थ कैलेंडर", "डॉक्टर विज़िट, जाँचें और फ़ॉलो-अप, रिमाइंडर के साथ"]]}},
            {"h2": "आपका डेटा, आपकी मर्ज़ी", "p": ["आपकी अनुमति के बिना कुछ भी साझा नहीं होता। रिकॉर्ड एन्क्रिप्टेड रहते हैं, हर बार कोई और देखे तो उसका रिकॉर्ड आपको दिखता है, और आप जब चाहें सब कुछ डाउनलोड या डिलीट कर सकते हैं।"]},
        ],
        "faq": [["क्या QueroCura मुफ़्त है?", "हाँ। साइन अप करना और लक्षण जाँच, रिमाइंडर, कैलेंडर, फ़ैमिली गार्डन और CuraVault इस्तेमाल करना मुफ़्त है।"],
                ["क्या यह दवा बताता है?", "नहीं। QueroCura कभी कोई दवा या खुराक नहीं सुझाता। यह डॉक्टर की जगह नहीं लेता। आपात स्थिति में 112 पर कॉल करें।"]],
        "related": ["hi/medicine-reminder-app", "hi/family-health-app", "hi/symptom-checker"],
    },
    {
        "slug": "hi/medicine-reminder-app", "lang": "hi", "en": "medicine-reminder-app", "audience": "consumer",
        "title": "दवा याद दिलाने वाला ऐप (मुफ़्त), परिवार को सूचना के साथ | QueroCura",
        "description": "मुफ़्त दवा रिमाइंडर ऐप: पर्चे के हिसाब से समय पर याद, नोटिफ़िकेशन पर ही \"ले ली\" बटन, और दवा लेते ही परिवार को सूचना। हिन्दी और अंग्रेज़ी में।",
        "eyebrow": "दवा रिमाइंडर", "h1": "दवा याद दिलाने वाला ऐप, जो पूरे परिवार को साथ रखता है",
        "lead": "QueroCura आपके पर्चे में लिखे समय पर हर खुराक की याद दिलाता है। नोटिफ़िकेशन पर ही \"ले ली\" दबाइए, और जिन परिवार वालों को आपने अनुमति दी है उन्हें तुरंत पता चल जाता है। इसलिए माता-पिता या बच्चों की दवा सिर्फ़ याददाश्त के भरोसे नहीं रहती। यह मुफ़्त है।",
        "cta": ["मुफ़्त शुरू करें", "register/"], "cta2": ["परिवार की सेहत", "hi/family-health-app/"],
        "sections": [
            {"h2": "रिमाइंडर कैसे काम करते हैं", "ul": ["<b>पर्चे के हिसाब से।</b> पर्चा जोड़ें (या उसकी फ़ोटो से CuraVault पढ़ ले) और खुराकें पक्की करें; रिमाइंडर उन्हीं समयों पर आते हैं।",
                                                     "<b>नोटिफ़िकेशन से ही \"ले ली\"।</b> ऐप खोले बिना खुराक दर्ज करें।",
                                                     "<b>परिवार को सूचना।</b> जिन्हें अनुमति दी है उन्हें तुरंत बताया जाता है कि खुराक ले ली गई।",
                                                     "<b>फ़ोन या कंप्यूटर पर।</b> ब्राउज़र से नोटिफ़िकेशन, किसी ऐप स्टोर की ज़रूरत नहीं।"]},
            {"h2": "सिर्फ़ याद दिलाना, सलाह नहीं", "p": ["QueroCura वही याद दिलाता है जो डॉक्टर ने लिखा है। यह कभी कोई दवा, खुराक या बदलाव नहीं सुझाता; ये फ़ैसले डॉक्टर के हैं।"]},
        ],
        "faq": [["क्या मैं अपने माता-पिता की दवाओं के रिमाइंडर देख सकता हूँ?", "हाँ। फ़ैमिली गार्डन में अपने खाते जोड़ें और \"दवाएँ\" की अनुमति लें; उनकी खुराक लेते ही आपको सूचना मिलती है।"],
                ["क्या यह हिन्दी में चलता है?", "हाँ, पूरा ऐप हिन्दी और अंग्रेज़ी दोनों में चलता है।"]],
        "related": ["hi/family-health-app", "hi", "hi/personal-health-records"],
    },
    {
        "slug": "hi/family-health-app", "lang": "hi", "en": "family-health-app", "audience": "consumer",
        "title": "परिवार की सेहत का ऐप: माता-पिता और बच्चों का ध्यान | QueroCura",
        "description": "पूरे परिवार की सेहत एक जगह: माता-पिता और बच्चों के खाते जोड़ें, हर व्यक्ति तय करे कि आप क्या देख सकते हैं (दवाएँ, रिपोर्ट, रीडिंग)। मुफ़्त।",
        "eyebrow": "परिवार की सेहत", "h1": "पूरे परिवार की सेहत, सबकी अनुमति से",
        "lead": "QueroCura का फ़ैमिली गार्डन आपके अपनों के QueroCura खातों को जोड़ता है, ताकि आप माता-पिता, बच्चों और जीवनसाथी की सेहत एक जगह से देख सकें। हर व्यक्ति ख़ुद तय करता है कि आप क्या देख और कर सकते हैं: दवाएँ, रिकॉर्ड, रीडिंग, लक्षण जाँच या प्रोफ़ाइल में बदलाव।",
        "cta": ["मुफ़्त शुरू करें", "register/"], "cta2": ["दवा रिमाइंडर", "hi/medicine-reminder-app/"],
        "sections": [
            {"h2": "हर हिस्से की अलग अनुमति", "table": {"head": ["अनुमति", "इससे आप क्या कर सकते हैं"], "rows": [
                ["दवाएँ", "उनकी दवाएँ और खुराक देखें, और खुराक लेते ही सूचना पाएँ"], ["रिकॉर्ड", "उनके CuraVault में रिपोर्ट और पर्चे देखें"],
                ["रीडिंग", "ब्लड प्रेशर, शुगर और वज़न जैसी रीडिंग पर नज़र रखें"], ["लक्षण जाँच", "उनकी लक्षण जाँच और वह कितनी ज़रूरी थी, देखें"], ["प्रोफ़ाइल", "उनकी प्रोफ़ाइल और एलर्जी अपडेट रखने में मदद करें"]]}},
            {"h2": "असली खाते, असली अनुमति", "p": ["फ़ैमिली गार्डन में हर व्यक्ति का अपना QueroCura खाता होता है, ताकि किसी की सेहत की जानकारी उसकी जानकारी के बिना किसी और के पास न रहे। जुड़ाव निमंत्रण से होता है, और कोई भी पक्ष कभी भी इसे बदल या ख़त्म कर सकता है।"]},
        ],
        "faq": [["क्या मैं दूसरे शहर से अपने बुज़ुर्ग माता-पिता की सेहत पर नज़र रख सकता हूँ?", "हाँ। उनकी अनुमति से आप उनकी दवाएँ और रीडिंग देख सकते हैं, और खुराक लेते ही सूचना पा सकते हैं।"]],
        "related": ["hi/medicine-reminder-app", "hi", "hi/symptom-checker"],
    },
    {
        "slug": "hi/symptom-checker", "lang": "hi", "en": "symptom-checker", "audience": "consumer",
        "title": "हिन्दी में लक्षण जाँच (मुफ़्त): कितना ज़रूरी है, जानिए | QueroCura",
        "description": "अपने लक्षण हिन्दी में अपने शब्दों में बताइए। QueroCura डॉक्टर की तरह आगे के सवाल पूछता है और बताता है कि मामला कितना ज़रूरी है। दवा की सलाह कभी नहीं।",
        "eyebrow": "लक्षण जाँच", "h1": "हिन्दी में लक्षण जाँच, जो डॉक्टर की तरह सवाल पूछती है",
        "lead": "लिखकर या बोलकर बताइए कि आपको कैसा लग रहा है। QueroCura कुछ आगे के सवाल पूछता है, हर सवाल का कारण बताता है, और फिर बताता है कि मामला कितना ज़रूरी है, घर पर क्या करना सुरक्षित है, किन बातों से बचें और डॉक्टर को कब दिखाएँ। लगभग दो मिनट, मुफ़्त।",
        "cta": ["लक्षण जाँचें", "symptoms/"], "cta2": ["QueroCura हिन्दी में", "hi/"],
        "sections": [
            {"h2": "यह क्या जानता है", "p": ["लक्षण इंजन 55 बीमारियों और 130 से ज़्यादा लक्षणों व चेतावनी संकेतों को समझता है, जिनमें भारत में मौसम से जुड़ी बातें भी हैं, जैसे बरसात में डेंगू और मलेरिया।"]},
            {"h2": "यह क्या नहीं है", "p": ["लक्षण जाँच डॉक्टर से बातचीत की शुरुआत है, निदान नहीं। यह कभी कोई दवा नहीं सुझाती। आपात स्थिति में 112 पर कॉल करें।"]},
        ],
        "faq": [["क्या लक्षण हिन्दी में बता सकते हैं?", "हाँ। आप हिन्दी में लक्षण बता सकते हैं, और सवाल व नतीजे भी हिन्दी में मिलते हैं।"]],
        "related": ["hi", "hi/family-health-app"],
    },
    {
        "slug": "hi/personal-health-records", "lang": "hi", "en": "personal-health-records", "audience": "consumer",
        "title": "मेडिकल रिपोर्ट सँभालने और समझने का ऐप: CuraVault | QueroCura",
        "description": "CuraVault आपकी रिपोर्ट, पर्चे और स्कैन एक एन्क्रिप्टेड जगह रखता है, उन्हें पढ़ता है (हाथ से लिखे भी) और हर वैल्यू आसान भाषा में समझाता है। मुफ़्त।",
        "eyebrow": "CuraVault हेल्थ रिकॉर्ड", "h1": "आपकी मेडिकल रिपोर्टें, एक जगह, आसान भाषा में",
        "lead": "ब्लड टेस्ट, स्कैन रिपोर्ट या पर्चा अपलोड कीजिए, हाथ से लिखा भी। CuraVault वैल्यू पढ़ता है, आप उन्हें जाँचते हैं, और हर वैल्यू का मतलब आसान भाषा में समझाता है और समय के साथ बदलाव दिखाता है। आपके रिकॉर्ड एन्क्रिप्टेड रहते हैं और आप तय करते हैं कि कौन देखे।",
        "cta": ["अपना CuraVault बनाएँ", "register/"], "cta2": ["QueroCura हिन्दी में", "hi/"],
        "sections": [
            {"h2": "CuraVault क्या करता है", "ul": ["<b>रिपोर्ट पढ़ता है:</b> लैब रिपोर्ट, स्कैन रिपोर्ट और पर्चे, हाथ से लिखे भी।", "<b>हर वैल्यू समझाता है:</b> जैसे HbA1c या विटामिन D का मतलब, और पिछली रिपोर्टों से तुलना।",
                                                "<b>बदलाव पर ध्यान देता है:</b> धीरे-धीरे बढ़ता ब्लड प्रेशर या बार-बार आने वाला नतीजा।", "<b>आपकी शर्तों पर साझा:</b> PIN वाले लिंक जो अपने-आप ख़त्म हो जाते हैं।"]},
        ],
        "faq": [["क्या मेरा डेटा सुरक्षित है?", "रिकॉर्ड एन्क्रिप्टेड रहते हैं, सिर्फ़ आपकी मर्ज़ी से साझा होते हैं, और कोई और देखे तो उसका रिकॉर्ड आपको दिखता है।"]],
        "related": ["hi", "hi/family-health-app"],
    },
]
