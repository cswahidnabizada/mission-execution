import { api } from "../core/api.js";
import { escapeHtml } from "../core/dom.js";

const status = document.querySelector("#verificationStatus");
const back = document.querySelector("#backButton");
const cont = document.querySelector("#continueButton");

back?.addEventListener("click", () => history.length > 1 ? history.back() : (location.href = "/"));
cont?.addEventListener("click", () => { location.href = "/app"; });

try {
  const data = await api("/api/verification");
  const v = data.verification || {};
  const available = Object.fromEntries((v.checks || []).map(c => [c.type, c]));
  const checks = ["email", "phone", "company", "identity"].map(type => available[type]).filter(Boolean);
  status.innerHTML = `
    <div class="font-black">Verification status: ${escapeHtml(String(v.reviewStatus || "pending").toUpperCase())}</div>
    <div class="mt-3 space-y-2">
      ${checks.map(c => `<div class="flex justify-between gap-4"><span>${escapeHtml(c.type)}</span><b>${escapeHtml(c.status)}</b></div>`).join("")}
    </div>
  `;
} catch (error) {
  status.innerHTML = `<div class="text-red-700 font-bold">${escapeHtml(error.message || "Unable to load verification status")}</div>`;
}
