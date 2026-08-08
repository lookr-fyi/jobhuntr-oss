import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderResumeDocument, renderCoverLetterDocument } from '../server/render.mjs';

test('document renderer escapes all user-controlled HTML', () => {
  assert.equal(escapeHtml('<script>"x" & y</script>'), '&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;');
  const resume = renderResumeDocument({ name: '<img src=x>', templateId: 'impact', content: 'SUMMARY\n<script>alert(1)</script>\n- Shipped 20%' }, { name: 'Jane <Admin>', headline: 'Builder', location: 'Remote' });
  assert.doesNotMatch(resume, /<script>alert|<img src=x>/); assert.match(resume, /Jane &lt;Admin&gt;/); assert.match(resume, /Shipped 20%/);
  const letter = renderCoverLetterDocument({ title: 'Letter', body: '<iframe>private</iframe>' }, { name: 'Jane' }, { title: 'Engineer', company: 'Acme' });
  assert.doesNotMatch(letter, /<iframe>/); assert.match(letter, /&lt;iframe&gt;/);
});
