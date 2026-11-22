import fs from 'node:fs';
import vm from 'node:vm';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('Missing GEMINI_API_KEY environment variable.');
  process.exit(1);
}

const docText = fs.readFileSync('data/osaka-doc.txt', 'utf8').trim();
const currentHtml = fs.readFileSync('index.html', 'utf8');

const prompt = `You are updating a single-file travel manager web app (index.html) so it matches the latest Google Doc itinerary (data/osaka-doc.txt).

RULES:
1. Return ONLY the complete, valid updated HTML document starting with <!DOCTYPE html> and ending with </html>. Do NOT wrap it in markdown code fences.
2. Preserve the exact visual design, calm minimalist styling, layout, tabs, modals, weather widget, Google Maps links, and existing JavaScript functionality.
3. Update all itinerary days, times, titles, summaries, details/nuances (including Day 1 shopping stops like PARCO 9F-11F Hands card holder & Daimaru/ABC-Mart P1 school shoes, and Day 3 USJ Express Pass 5 slots), the Pre-Trip Action Checklist, and Venue Hours so they match the Google Doc 100%.
4. Ensure the Wallet tab includes a clean, minimalist "S$1,000 (~¥123,500) On-Ground Budget & Payment Split" card synced with Appendix D of the Google Doc (showing the 3-channel payment split up front: Trust Debit Card, Digital ICOCA, Physical JPY Cash, plus a collapsible Category Breakdown). If that card does not exist yet in index.html, add it cleanly to the Wallet tab matching the existing card style.
5. Make sure all JavaScript syntax is 100% valid with zero unescaped quotes.

=== LATEST GOOGLE DOC (data/osaka-doc.txt) ===
${docText}

=== CURRENT index.html ===
${currentHtml}`;

const models = [
  'gemini-3.8-flash',
  'gemini-3.8-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
];

let data = null;

for (const model of models) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    console.log(`Calling ${model} (attempt ${attempt})...`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 65536,
        },
      }),
    });

    if (response.ok) {
      data = await response.json();
      console.log(`Succeeded with ${model}`);
      break;
    }

    const errText = await response.text();
    console.warn(`${model} returned ${response.status}: ${errText}`);

    if (response.status === 503 || response.status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 6000));
      continue;
    }

    // Move immediately to the next fallback model on non-transient errors (e.g. 404)
    break;
  }

  if (data) break;
}

if (!data) {
  console.error('All Gemini fallback models failed.');
  process.exit(1);
}

let updatedHtml = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

// Strip accidental markdown fences if present
updatedHtml = updatedHtml.replace(/^```html\s*/i, '').replace(/\s*```$/i, '').trim();

const lowerHtml = updatedHtml.toLowerCase();
if (!lowerHtml.startsWith('<!doctype html>') || !lowerHtml.endsWith('</html>')) {
  console.error('Generated output is not a complete HTML document. Aborting.');
  process.exit(1);
}

// Validate inline JavaScript syntax before overwriting index.html
const scriptMatches = [...updatedHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
for (const match of scriptMatches) {
  const code = match[1].trim();
  if (!code) continue;
  try {
    new vm.Script(code);
  } catch (err) {
    console.error('Generated JavaScript syntax error. Aborting:', err.message);
    process.exit(1);
  }
}

fs.writeFileSync('index.html', updatedHtml + '\n', 'utf8');
console.log('Successfully updated index.html from data/osaka-doc.txt');
