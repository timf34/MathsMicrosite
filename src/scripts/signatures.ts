const form = document.querySelector<HTMLFormElement>('#signature-form')!;
const fields = document.querySelector<HTMLFieldSetElement>('#form-fields')!;
const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const status = document.querySelector<HTMLElement>('#signature-status')!;
const note = document.querySelector<HTMLElement>('#preview-note')!;
const list = document.querySelector<HTMLUListElement>('#public-signatories')!;
const heading = document.querySelector<HTMLElement>('#signatories-title')!;
const listStatus = document.querySelector<HTMLElement>('#signatories-status')!;
const retry = document.querySelector<HTMLButtonElement>('#retry-signatories')!;
const pagination = document.querySelector<HTMLElement>('#signatory-pagination')!;
const seeMore = document.querySelector<HTMLButtonElement>('#signatories-more')!;
const mobileLayout = window.matchMedia('(max-width: 767px)');
const pageSize = 10;
let people: Array<{ name: string; role: string; institution?: string }> = [];
let visibleCount = pageSize;

function renderSignatories() {
  const visiblePeople = mobileLayout.matches ? people.slice(0, visibleCount) : people;
  const fragment = document.createDocumentFragment();
  visiblePeople.forEach(person => {
    const item = document.createElement('li');
    const name = document.createElement('h3');
    name.textContent = person.name;
    item.append(name);
    if (person.role || person.institution) {
      const role = document.createElement('p');
      role.textContent = [person.role, person.institution].filter(Boolean).join(', ');
      item.append(role);
    }
    fragment.append(item);
  });
  list.replaceChildren(fragment);
  pagination.hidden = !mobileLayout.matches || visibleCount >= people.length;
}

seeMore.addEventListener('click', () => {
  const firstNewIndex = visibleCount;
  visibleCount += pageSize;
  renderSignatories();
  // Keep the reading position while moving keyboard focus to the newly revealed names.
  const firstNewName = list.children[firstNewIndex]?.querySelector('h3');
  if (firstNewName instanceof HTMLElement) {
    firstNewName.tabIndex = -1;
    firstNewName.focus({ preventScroll: true });
  }
});
mobileLayout.addEventListener('change', renderSignatories);

let configured = false;
let submitting = false;
let loading = false;
let hasList = false;
let startedAt = Date.now();
let submissionId = crypto.randomUUID();

async function loadSignatories() {
  if (loading) return;
  loading = true;
  retry.disabled = true;
  try {
    const response = await fetch('/api/signatures', { signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error('Unavailable');
    const data = await response.json();
    if (typeof data.configured !== 'boolean' || !Array.isArray(data.signatories)) throw new Error('Invalid response');
    configured = data.configured;
    fields.disabled = !configured || submitting;
    note.textContent = configured
      ? 'Your email stays private. Every signature is reviewed before publication.'
      : 'Signing opens soon. No signatures are being collected yet.';
    if (configured) {
      const updatedPeople = data.signatories as Array<{ name: string; role: string; institution?: string }>;
      if (!updatedPeople.every(person => typeof person.name === 'string' && typeof person.role === 'string' && (person.institution === undefined || typeof person.institution === 'string'))) throw new Error('Invalid names');
      people = updatedPeople;
      renderSignatories();
      heading.textContent = `${people.length} ${people.length === 1 ? 'signatory' : 'signatories'}`;
      listStatus.textContent = people.length ? '' : 'Be among the first to sign. Names will appear here after review.';
      hasList = true;
    } else {
      people = [];
      visibleCount = pageSize;
      renderSignatories();
      heading.textContent = 'Signatories';
      listStatus.textContent = 'Approved signatures will appear here once signing opens.';
    }
    retry.hidden = true;
  } catch {
    listStatus.textContent = hasList
      ? 'Showing the last loaded list. Updates are temporarily unavailable.'
      : 'The signatory list is temporarily unavailable. Please try again.';
    if (!configured) note.textContent = 'Signing is temporarily unavailable. Please try again shortly.';
    retry.hidden = false;
  } finally {
    loading = false;
    retry.disabled = false;
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!configured || submitting) return;
  const values = new FormData(form);
  const firstName = String(values.get('firstName') ?? '').trim();
  const lastName = String(values.get('lastName') ?? '').trim();
  for (const [key, value] of [['firstName', firstName], ['lastName', lastName]]) {
    (form.elements.namedItem(key) as HTMLInputElement).setCustomValidity(value ? '' : 'Please enter your name.');
  }
  if (!form.reportValidity()) return;
  const payload = {
    firstName, lastName, email: String(values.get('email') ?? '').trim(),
    institution: String(values.get('institution') ?? '').trim(),
    role: String(values.get('role') ?? '').trim(), consent: values.get('consent') === 'on',
    website: String(values.get('website') ?? ''), submissionId, elapsedMs: Date.now() - startedAt,
  };
  submitting = true;
  fields.disabled = true;
  button.textContent = 'Submitting…';
  status.textContent = '';
  try {
    const response = await fetch('/api/signatures', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(25000),
    });
    const data = await response.json();
    if (!response.ok || data.ok !== true) throw new Error(data.error || 'We could not confirm your submission. Please try again.');
    document.querySelector<HTMLElement>('#signature-entry')!.hidden = true;
    const signatureSection = document.querySelector<HTMLElement>('#sign')!;
    signatureSection.removeAttribute('aria-labelledby');
    signatureSection.setAttribute('aria-label', 'Signature submitted');
    status.textContent = 'Thank you, your signature has been submitted for review.';
    status.classList.add('signature-success');
    status.focus({ preventScroll: true });
    form.reset();
    submissionId = crypto.randomUUID();
    startedAt = Date.now();
    // Pending submissions never get appended to the public list here.
  } catch (error) {
    status.textContent = error instanceof Error && error.name !== 'TimeoutError'
      ? error.message : 'We could not confirm your submission. Please try again; retries will not add duplicates.';
  } finally {
    submitting = false;
    fields.disabled = !configured;
    button.textContent = 'Sign';
  }
});
form.addEventListener('input', event => {
  if (event.target instanceof HTMLInputElement) event.target.setCustomValidity('');
});
retry.addEventListener('click', loadSignatories);
void loadSignatories();
window.setInterval(() => { if (!document.hidden) void loadSignatories(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void loadSignatories(); });
