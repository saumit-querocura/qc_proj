# SEO and AI visibility playbook

The goal: when someone searches, or asks an AI assistant, for things like "hospital management system", "medicine
reminder app" or "manage family health", QueroCura is one of the answers. No one can guarantee a ranking. What we can
do is be the clearest, most trustworthy page on each topic, make it easy to crawl, and get other sites to point to us.

## What is in the code (done)

| Piece | Where | Why |
|---|---|---|
| Landing pages for each search topic | `tools/seo/pages.py` → `/hospital-management-system/`, `/clinic-management-software/`, `/doctor-appointment-booking/`, `/ai-medical-imaging/`, `/medicine-reminder-app/`, `/family-health-app/`, `/personal-health-records/`, `/symptom-checker/`, `/health-app/`, `/healthcare-software/`, `/about/`, `/guides/` | One page per search intent, with the answer in the first paragraph |
| Full content in the HTML | all public pages | Most AI crawlers do not run JavaScript |
| Structured data (JSON-LD) | every public page | Organization (one entity, `#organization`), SoftwareApplication, FAQPage, BreadcrumbList, Article |
| Titles, descriptions, canonical, Open Graph | new pages and home, hospital, doctor, book, setup, blog | Managed by `build_seo.py` between `seo:start` / `seo:end` markers |
| `sitemap.xml` | generated | Every indexable page, `lastmod` moves only when content changes |
| `robots.txt` | generated | Search engines and AI assistants (GPTBot, ClaudeBot, PerplexityBot, Google-Extended…) named and allowed; private areas closed |
| `llms.txt`, `llms-full.txt` | generated | What QueroCura is, in the format AI assistants look for |

| Free calculators | `/calculators/` (BMI with Indian cut-offs, BP checker, HbA1c↔glucose, due date, medicine chart maker, QTc, bed occupancy, OPD capacity) | Tools earn links and repeat visits; logic in `assets/js/qc-tools.js`, content in `pages_more.py` |
| Hindi pages | `/hi/`, `/hi/medicine-reminder-app/`, `/hi/family-health-app/`, `/hi/symptom-checker/`, `/hi/personal-health-records/` | Hindi health searches have far less competition; paired with English pages by `hreflang` |
| Guides, glossary, press kit | `/guides/…`, `/glossary/`, `/press/` | Definitions and how-tos are what AI assistants quote; the press kit makes writing about us easy |
| Specialty pages | `/specialties/` (eye, dental, maternity, diagnostic, orthopaedic, dialysis) | Each says honestly what QueroCura covers and what to pair it with |
| Hindi calculators and HMS | `/hi/calculators/bp/`, `/hi/calculators/sugar-hba1c/`, `/hi/calculators/bmi/`, `/hi/hospital-management-system/` | Huge Hindi health search volume with little competition |
| Embeddable calculators | `/embed/<calculator>/` (noindex) + an embed code on each calculator page | Other sites embed them with a credit link back: earned backlinks |
| Social preview images | `assets/og/` (one per page, made by `extras.py`) | Better click-through when pages are shared |
| Atom feed, FAQ hub, blog links | `/feed.xml`, `/faq/`, "Keep reading" on blog posts | Faster discovery, one page AI assistants can quote, internal links |
| IndexNow | key file at the site root, `tools/seo/indexnow.py` | Tells Bing (and so ChatGPT search and Copilot) about new pages within minutes |

**After editing any page content:**

```bash
python tools/seo/build_seo.py
python tools/version_assets.py
# after the pages are live:
python tools/seo/indexnow.py
```

Rules for content (also at the top of `pages.py`):
- Only claim what the product does today.
- Never invent customers, ratings, reviews or awards. Fake review markup can get the site penalised.
- Never give medicine advice.

## What needs a person (in order of impact)

1. **Google Search Console and Bing Webmaster Tools.** Verify `querocura.com`, submit `https://querocura.com/sitemap.xml`, and request indexing for the new pages. Bing matters doubly: ChatGPT search and Copilot draw on it.
2. **Listings that AI assistants and searchers trust.** Create complete, consistent profiles, with the same name, one-line description and URL everywhere:
   - Google Business Profile, LinkedIn company page, Crunchbase, Product Hunt (exists);
   - G2 and Capterra (category: Hospital Management Software / Medical Practice Management);
   - SoftwareSuggest, Techjockey (India);
   - Wikidata (an item for QueroCura with official website, founders and country).

   Add each profile URL to `sameAs` in `org()` in `build_seo.py`.
3. **Real reviews.** Once the first hospitals are live, ask them to review QueroCura on G2/Capterra and Google. Only then add ratings to structured data, from those real reviews.
4. **Links from relevant sites.** Ways to earn them:
   - healthcare and startup press in India (launch story, the on-premise AI imaging angle);
   - hospital associations and medical-college innovation cells;
   - ABDM/ABHA ecosystem listings;
   - guest articles on hospital-administration blogs;
   - founder interviews and podcasts.
5. **Content, every week.** One useful article per week, each linking to the matching landing page. Ideas:
   - "PM-JAY billing checklist for small hospitals"
   - "OPD waiting time: how to cut it"
   - "How to remind elderly parents to take medicines"
   - "Reading your HbA1c report"
   - "ABHA for hospitals"
   - "NABH documentation basics"
   - Hindi versions of the family and medicine-reminder pages ("दवा याद दिलाने वाला ऐप")
6. **Measure.** Watch Search Console queries monthly, and ask ChatGPT, Claude, Perplexity and Gemini the target questions. When a page shows up but isn't clicked, improve its title. When a topic is missing, add a page in `pages.py`.

## Target queries per page

| Page | Main queries |
|---|---|
| `/hospital-management-system/` | hospital management system, HMS software India, best hospital management system, hospital software with PM-JAY billing |
| `/clinic-management-software/` | clinic management software, clinic software for doctors, OPD software |
| `/doctor-appointment-booking/` | doctor appointment booking system, OPD queue management system, token system for hospital |
| `/ai-medical-imaging/` | AI X-ray analysis software, AI radiology India, on-premise AI imaging, ECG analysis software |
| `/medicine-reminder-app/` | medicine reminder app, pill reminder for parents, medication reminder with family alerts |
| `/family-health-app/` | family health app, manage family health, elderly parent health tracker |
| `/personal-health-records/` | personal health record app, store medical reports online, lab report explained |
| `/symptom-checker/` | symptom checker Hindi, AI symptom checker India |
| `/healthcare-software/` | healthcare software India, organised healthcare software |
| `/guides/how-to-choose-a-hospital-management-system/` | top hospital management systems, how to choose HMS |
