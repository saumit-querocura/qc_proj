/* CuraVault document review. OCR strings are always rendered as text. */
(function (root) {
  "use strict";
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function field(parent, label, value, type = "text") {
    const wrap = element("label", label, "cv-review-field");
    const input = element("input");
    input.type = type;
    input.value = value == null ? "" : String(value);
    wrap.append(input); parent.append(wrap);
    return input;
  }
  function choice(parent, label, options) {
    const wrap = element("label", label, "cv-review-field");
    const select = element("select");
    for (const [value, text] of options) {
      const option = element("option", text); option.value = value; select.append(option);
    }
    wrap.append(select); parent.append(wrap); return select;
  }
  function evidence(parent, source) {
    if (!source) return;
    const details = element("details");
    details.append(element("summary", "Source evidence" + (source.page ? " · page " + source.page : "")));
    details.append(element("pre", source.text || "")); parent.append(details);
  }

  class CuraVaultDocumentReview {
    constructor(api, notify) {
      this.api = api; this.notify = notify || (() => {}); this.pending = new Map();
      if (!document.getElementById("cv-document-review-style")) {
        const style = element("style"); style.id = "cv-document-review-style";
        style.textContent = `
          .cv-review-dialog{width:min(850px,94vw);max-height:90vh;box-sizing:border-box;border:1px solid #d5dfda;border-radius:18px;padding:24px;color:#18352a;background:#fff}
          .cv-review-dialog form>.cv-review-field,.cv-review-wide>.cv-review-field{margin-bottom:12px}.cv-review-dialog [hidden]{display:none!important}.cv-review-dialog fieldset{display:flex;flex-wrap:wrap;gap:10px;padding:12px;border:1px solid #b9ccc0;border-radius:8px}.cv-review-dialog fieldset label{display:flex;align-items:center;gap:5px}.cv-review-dialog input[type=checkbox]{width:auto;margin-right:6px}.cv-review-dialog::backdrop{background:#10251acc}.cv-review-dialog h2{margin:0 0 12px}.cv-review-dialog h3{margin:22px 0 12px}
          .cv-review-card{border:1px solid #d8e2dc;border-radius:12px;padding:16px;margin:12px 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
          .cv-review-field{display:flex;flex-direction:column;gap:6px;font-size:14px}.cv-review-field input,.cv-review-field select{padding:10px;border:1px solid #b9ccc0;border-radius:7px;width:100%;box-sizing:border-box;background:white;color:#18352a;font:inherit}
          .cv-review-dialog details,.cv-review-wide{grid-column:1/-1}.cv-review-dialog pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;max-height:200px;overflow:auto}
          .cv-review-actions{display:flex;gap:12px;flex-wrap:wrap;justify-content:flex-end;margin-top:20px}.cv-review-dialog button{padding:10px 16px;border-radius:8px;border:1px solid #b9ccc0;cursor:pointer;background:#eef5f0;color:#18352a;font:inherit}
          .cv-review-dialog button[type=submit]{background:#146642;color:white}.cv-review-error{color:#a42d24;font-weight:600}.cv-review-warning{font-size:14px;color:#725014}.cv-review-dialog input:disabled{background:#f0f2f1}
          @media(max-width:540px){.cv-review-card{grid-template-columns:1fr}.cv-review-dialog{padding:16px}}
        `;
        document.head.append(style);
      }
      document.addEventListener("click", event => {
        const button = event.target.closest("[data-cv-review]");
        if (button) this.open(button.dataset.cvReview).catch(error => this.notify(error.message, "err"));
      });
    }
    async request(path, payload) {
      const response = await fetch(this.api + path, { credentials: "include", cache: "no-store",
        ...(payload === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }) });
      let data;
      try { data = await response.json(); } catch (_) { throw new Error("The server did not return a review. Please retry."); }
      if (!response.ok || !data.ok) throw new Error(data.error || "Document review is unavailable.");
      return data;
    }
    async reviewRecords(records) {
      for (const record of records) await this.open(record.id || record.record_id);
    }
    async open(id) {
      if (this.dialog) { this.dialog.focus(); return; }
      let review;
      try { review = await this.request("/records/" + encodeURIComponent(id) + "/review"); }
      catch (error) {
        // Upload persistence may have succeeded while review persistence failed.
        // A record action can recover from its existing encrypted original.
        this.notify(error.message + " Retrying extraction from the saved record…", "err");
        review = await this.request("/records/" + encodeURIComponent(id) + "/review/retry", {});
      }
      return this.render(review);
    }
    render(review) {
      if (['queued', 'processing'].includes(review.status)) return this.processing(review);
      return new Promise(resolve => {
        const previousFocus = document.activeElement;
        const dialog = element("dialog", undefined, "cv-review-dialog");
        this.dialog = dialog; dialog.setAttribute("aria-labelledby", "cv-review-title");
        const title = element("h2", review.status === "confirmed" ? "Confirmed record" : "Review your medical record");
        title.id = "cv-review-title"; dialog.append(title);
        const original = element('a', 'View original record'); original.href = this.api + '/records/' + encodeURIComponent(review.record_id) + '/original'; original.target = '_blank'; original.rel = 'noopener'; dialog.append(original);
        dialog.append(element("p", "Check extracted values and medicines against the original record. Handwriting and unclear photographs may need correction."));
        const form = element("form"); dialog.append(form);
        const errorBox = element("p", "", "cv-review-error"); errorBox.setAttribute("role", "alert"); form.append(errorBox);
        const rows = [], medicineRows = [];
        const confirmed = review.status === "confirmed";
        const displayObservations = confirmed ? (review.confirmation?.observations || []) : review.observations;
        const displayMedicines = confirmed ? (review.confirmation?.medicines || []) : review.medicines;
        if (review.status === "failed" || review.status === "partial") {
          form.append(element("p", "Some or all text could not be read: " + (review.error_code || (review.warnings || []).join(", ")) + ". Try a clearer photo or enter medicines manually.", "cv-review-warning"));
        }
        if (displayObservations?.length) form.append(element("h3", "Lab values"));
        for (const observation of displayObservations || []) {
          const card = element("section", undefined, "cv-review-card");
          card.append(element("strong", observation.label + " · " + observation.marker_id.replace(/_/g, " "), "cv-review-wide"));
          if (observation.issues?.length) card.append(element("p", "Needs correction: " + observation.issues.join(", ").replace(/_/g, " "), "cv-review-wide cv-review-warning"));
          const decision = choice(card, "Include this result?", [["", "Choose…"], ["confirmed", "Confirm result"], ["excluded", "Exclude result"]]);
          decision.required = !confirmed; if (confirmed) decision.value = "confirmed";
          const value = field(card, "Reported value", observation.value, "number"); value.step = "any"; value.min = "0";
          const comparator = choice(card, "Comparison", [["", "Exact value"], ["<", "Less than"], [">", "Greater than"], ["<=", "Less than or equal"], [">=", "Greater than or equal"]]);
          comparator.value = observation.comparator || "";
          const reportedDate = field(card, "Test date (optional)", observation.reported_date || "", "date");
          const unit = field(card, "Reported unit", observation.unit); unit.maxLength = 40;
          if (observation.reference_range) card.append(element("p", "Reported reference range: " + observation.reference_range, "cv-review-wide"));
          evidence(card, observation.source);
          const toggle = () => { value.required = unit.required = decision.value === "confirmed"; value.disabled = unit.disabled = comparator.disabled = decision.value === "excluded"; };
          decision.addEventListener("change", toggle); toggle();
          rows.push({ observation, decision, value, comparator, unit, reportedDate }); form.append(card);
        }
        if (review.radiology && Object.keys(review.radiology).length) {
          form.append(element("h3", "Written imaging report · " + (review.radiology.modality || "Imaging")));
          for (const key of ["findings", "impression"]) if (review.radiology[key]) {
            form.append(element("strong", key)); form.append(element("pre", review.radiology[key]));
          }
          form.append(element("p", "These sections come from the written report. Scan images are stored for review by your clinician."));
        }
        form.append(element("h3", "Medicines and timing"));
        form.append(element("p", "For every medicine, enter when you are supposed to take it, choose as-needed, or choose medicine not to be taken. Follow the prescriber's instructions."));
        const medicinesBox = element("div"); form.append(medicinesBox);
        const addMedicine = medicine => {
          const card = element("section", undefined, "cv-review-card");
          const name = field(card, "Medicine name", medicine.name); name.required = true; name.maxLength = 240;
          const strength = field(card, "Strength", medicine.strength); strength.maxLength = 120;
          const instructions = field(card, "Dose / instructions", medicine.instructions); instructions.maxLength = 2000;
          const meal = field(card, "Food instructions (if prescribed)", medicine.meal_relation); meal.maxLength = 80;
          const decision = choice(card, "How is this medicine taken?", [["", "Choose…"], ["scheduled", "At specified times"], ["as_needed", "As needed (no fixed reminders)"], ["not_to_be_taken", "medicine not to be taken"]]);
          decision.required = true;
          const times = field(card, "When are you supposed to take it? (24-hour times)", (medicine.times?.length ? medicine.times : medicine.reported_times || []).join(", "));
          times.placeholder = "e.g. 08:00, 20:00";
          const schedule = root.CuraVaultScheduleFields(card, medicine);
          const zone = field(card, "Timezone", medicine.timezone_name || Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata");
          schedule.bindInputs({name,times,zone},this.api);
          evidence(card, medicine.source || { text: medicine.instructions });
          decision.value = medicine.decision || "";
          const toggle = () => { times.disabled = decision.value !== "scheduled"; times.required = decision.value === "scheduled"; schedule.setDecision(decision.value); if (['as_needed','not_to_be_taken'].includes(decision.value)) times.value = ""; };
          decision.addEventListener("change", toggle); toggle();
          medicineRows.push({ medicine, card, name, strength, instructions, meal, decision, times, schedule, zone }); medicinesBox.append(card);
        };
        for (const medicine of displayMedicines || []) addMedicine(medicine);
        const add = element("button", "Add a missed medicine"); add.type = "button";
        add.addEventListener("click", () => addMedicine({ name: "", times: [] })); form.append(add);
        const allText = element("details"); allText.append(element("summary", "All extracted text"));
        allText.append(element("pre", review.extraction?.text || "No readable text.")); form.append(allText);
        let acknowledge;
        if (review.status === "failed" || review.warnings?.some(warning => warning.includes('unreadable_text'))) {
          const label = element("label", "I understand this record could not be read and will review the original.");
          acknowledge = element("input"); acknowledge.type = "checkbox"; label.prepend(acknowledge); form.append(label);
        }
        const actions = element("div", undefined, "cv-review-actions");
        const later = element("button", confirmed ? "Close" : "Review later"); later.type = "button"; later.addEventListener("click", () => dialog.close());
        let replacing = false;
        const retry = element("button", "Retry extraction"); retry.type = "button";
        retry.addEventListener("click", async () => {
          retry.disabled = true; errorBox.textContent = "";
          try {
            const updated = await this.request("/records/" + encodeURIComponent(review.record_id) + "/review/retry", {});
            replacing = true; dialog.close(); await this.render(updated); resolve();
          } catch (error) { errorBox.textContent = error.message; retry.disabled = false; }
        });
        const submit = element("button", "Confirm reviewed values and medicines"); submit.type = "submit";
        actions.append(later); if (!confirmed) actions.append(retry, submit); form.append(actions);
        if (confirmed) for (const input of form.querySelectorAll("input,select")) input.disabled = true;
        add.hidden = confirmed;
        let attempt = this.pending.get(review.record_id);
        if (!attempt || attempt.revision !== review.revision) {
          attempt = { revision: review.revision, key: crypto.randomUUID() }; this.pending.set(review.record_id, attempt);
        }
        form.addEventListener("submit", async event => {
          event.preventDefault(); if (confirmed || !form.reportValidity()) return;
          errorBox.textContent = "";
          const observations = rows.map(row => ({ candidate_id: row.observation.candidate_id, decision: row.decision.value,
            value: row.value.value === "" ? null : Number(row.value.value), unit: row.unit.value.trim(), comparator: row.comparator.value, reported_date: row.reportedDate.value }));
          let medicines;
          try { medicines = medicineRows.map(row => ({ ...row.medicine, name: row.name.value.trim(), strength: row.strength.value.trim(),
            instructions: row.instructions.value.trim(), meal_relation: row.meal.value.trim(), decision: row.decision.value,
            times: row.decision.value === "scheduled" ? row.times.value.split(",").map(x => x.trim()).filter(Boolean) : [],
            ...row.schedule.value(), timezone_name: row.zone.value.trim() })); }
          catch (error) { errorBox.textContent = error.message; return; }
          const payload = { revision: review.revision, idempotency_key: attempt.key, observations, medicines, acknowledge_unreadable: !!acknowledge?.checked };
          submit.disabled = retry.disabled = true; submit.textContent = "Saving review…";
          try {
            await this.request("/records/" + encodeURIComponent(review.record_id) + "/review/confirm", payload);
            this.pending.delete(review.record_id); this.notify("Reviewed values and medicine decisions saved.", "ok"); dialog.close();
            document.dispatchEvent(new CustomEvent('cv-medications-changed'));
          } catch (error) { errorBox.textContent = error.message; }
          finally { submit.disabled = retry.disabled = false; submit.textContent = "Confirm reviewed values and medicines"; }
        });
        dialog.addEventListener("close", () => { dialog.remove(); this.dialog = null; previousFocus?.focus(); if (!replacing) resolve(); }, { once: true });
        document.body.append(dialog); dialog.showModal(); later.focus();
      });
    }
    processing(review) {
      return new Promise(resolve => {
        const dialog = element('dialog', undefined, 'cv-review-dialog'); this.dialog = dialog;
        dialog.append(element('h2', 'Reading your medical record'));
        const status = element('p', 'Your encrypted original is saved. Recognition is running on our server.'); status.setAttribute('aria-live', 'polite'); dialog.append(status);
        const later = element('button', 'Review later'); later.type = 'button'; later.onclick = () => dialog.close(); dialog.append(later);
        const check = element('button', 'Check status'); check.type = 'button'; dialog.append(check);
        let closed = false, replacing = false, timer;
        dialog.addEventListener('close', () => { closed = true; clearTimeout(timer); dialog.remove(); this.dialog = null; if (!replacing) resolve(); }, { once: true });
        const poll = async (attempt = 0) => {
          if (closed) return; check.disabled = true;
          try {
            const updated = await this.request('/records/' + encodeURIComponent(review.record_id) + '/review');
            if (closed) return;
            if (!['queued', 'processing'].includes(updated.status)) { replacing = true; dialog.close(); await this.render(updated); resolve(); return; }
            status.textContent = updated.status === 'queued' ? 'Waiting to process this record. You can review it later.' : 'Reading the record and matching values and medicines…';
            if (attempt < 30) timer = setTimeout(() => poll(attempt + 1), Math.min(4000, 1000 + attempt * 250));
            else { status.textContent = 'Processing is taking longer. Your original is saved; check again or review later.'; check.disabled = false; }
          } catch (error) { status.textContent = error.message; check.disabled = false; }
        };
        check.onclick = () => poll(); document.body.append(dialog); dialog.showModal(); later.focus(); poll();
      });
    }
  }
  root.CuraVaultDocumentReview = CuraVaultDocumentReview;
})(typeof window === "undefined" ? globalThis : window);
