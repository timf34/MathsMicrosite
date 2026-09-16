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
const previousPage = document.querySelector<HTMLButtonElement>('#signatories-previous')!;
const nextPage = document.querySelector<HTMLButtonElement>('#signatories-next')!;
const pageLabel = document.querySelector<HTMLElement>('#signatories-page')!;
const mobileLayout = window.matchMedia('(max-width: 767px)');
const pageSize = 6;
let people: Array<{ name: string; role: string }> = [];
let page = 0;

function renderSignatories() {
  const pageCount = Math.max(1, Math.ceil(people.length / pageSize));
  page = Math.min(page, pageCount - 1);
  const visiblePeople = mobileLayout.matches ? people.slice(page * pageSize, (page + 1) * pageSize) : people;
  const fragment = document.createDocumentFragment();
  visiblePeople.forEach(person => {
    const item = document.createElement('li');
    const name = document.createElement('h3');
    name.textContent = person.name;
    item.append(name);
    if (person.role) {
      const role = document.createElement('p');
      role.textContent = person.role;
      item.append(role);
    }
    fragment.append(item);
  });
  list.replaceChildren(fragment);
  pagination.hidden = !mobileLayout.matches || pageCount <= 1;
  previousPage.disabled = page === 0;
  nextPage.disabled = page === pageCount - 1;
  pageLabel.textContent = `Page ${page + 1} of ${pageCount}`;
}

function changePage(direction: number) {
  page = Math.max(0, page + direction);
  renderSignatories();
  heading.focus({ preventScroll: true });
  heading.scrollIntoView({ block: 'start' });
}
previousPage.addEventListener('click', () => changePage(-1));
nextPage.addEventListener('click', () => changePage(1));
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
      const updatedPeople = data.signatories as Array<{ name: string; role: string }>;
      if (!updatedPeople.every(person => typeof person.name === 'string' && typeof person.role === 'string')) throw new Error('Invalid names');
      people = updatedPeople;
      renderSignatories();
      heading.textContent = `${people.length} ${people.length === 1 ? 'signatory' : 'signatories'}`;
      listStatus.textContent = people.length ? '' : 'Be among the first to sign. Names will appear here after review.';
      hasList = true;
    } else {
      people = [];
      page = 0;
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
    status.textContent = 'Thank you—your signature has been submitted for review.';
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
