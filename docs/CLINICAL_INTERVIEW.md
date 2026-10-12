# Adaptive symptom interview

The paired backend change provides schema version 2 when `CURA_ADAPTIVE_INTERVIEW_ENABLED=true`. The frontend asks for one server-selected question per answer, retains the server token, and submits signed interview evidence to final analysis. A successful legacy plan remains supported when adaptive enrollment is disabled.

Network failures show an explicit retry/close screen. Back edits retain accepted history and let the backend discard descendants of the changed branch. Closing or starting another interview invalidates pending UI updates. Insufficient-information results hide disease confidence and home-care cards; continuation retains interview evidence. Urgent results display care instructions before further analysis.

Deploy the backend before this frontend. Use `npm ci --ignore-scripts` and `npm test` for DOM behavior checks. Also exercise authenticated staging across desktop/mobile, keyboard navigation, expired state, changes to saved profile, urgent answers, and interrupted requests. Session storage is used only for same-origin result/continuation handoff; signed tokens never appear in URLs.
