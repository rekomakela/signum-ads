<script lang="ts">
  import { onMount } from 'svelte';
  import { base, resolve } from '$app/paths';
  import { buildGlossary, type SignumGlossaryEntry } from '$lib/deconstruction';
  import { caseDisplayTitle } from '$lib/display';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let query = $state('');
  let selectedDomain = $state('All');
  let selectedEntry = $state<SignumGlossaryEntry | null>(null);
  let fromCaseId = $state<string | null>(null);
  let inspectorEl: HTMLElement | undefined = $state();

  const glossary = $derived.by(() => buildGlossary(data.dataset.cases));
  const reviewedCount = $derived(glossary.filter((entry) => entry.reviewed_at !== null).length);
  const caseTitleById = $derived.by(
    () =>
      Object.fromEntries(data.dataset.cases.map((entry) => [entry.case_id, entry.title])) as Record<
        string,
        string
      >,
  );
  const fromCase = $derived(
    fromCaseId ? (data.dataset.cases.find((entry) => entry.case_id === fromCaseId) ?? null) : null,
  );
  const domains = $derived([
    'All',
    ...Array.from(new Set(glossary.map((entry) => entry.domain))).sort(),
  ]);
  const visibleEntries = $derived.by(() => {
    const term = query.trim().toLowerCase();
    return glossary.filter((entry) => {
      const domainMatches = selectedDomain === 'All' || entry.domain === selectedDomain;
      const searchMatches =
        term.length === 0 ||
        [
          entry.label,
          entry.definition,
          entry.plain_language,
          entry.why_it_matters,
          entry.scope_note,
          ...entry.how_to_spot,
          ...entry.common_misreadings,
          ...entry.related_terms,
        ]
          .join(' ')
          .toLowerCase()
          .includes(term);
      return domainMatches && searchMatches;
    });
  });
  const relevantEntries = $derived(
    fromCase ? visibleEntries.filter((entry) => entry.case_ids.includes(fromCase.case_id)) : [],
  );
  const remainingEntries = $derived(
    visibleEntries.filter((entry) => !fromCase || !entry.case_ids.includes(fromCase.case_id)),
  );
  const selectedCases = $derived(
    selectedEntry
      ? data.dataset.cases.filter((entry) => selectedEntry?.case_ids.includes(entry.case_id))
      : [],
  );

  onMount(() => {
    const params = new URL(window.location.href).searchParams;
    fromCaseId = params.get('from');
    const concept = params.get('concept');
    if (concept) {
      selectedEntry = glossary.find((entry) => entry.id === concept) ?? null;
    }
  });

  function selectEntry(entry: SignumGlossaryEntry): void {
    selectedEntry = entry;
    const url = new URL(window.location.href);
    url.searchParams.set('concept', entry.id);
    window.history.replaceState({}, '', url);
    if (window.innerWidth < 1100) {
      requestAnimationFrame(() => inspectorEl?.scrollIntoView({ block: 'start' }));
    }
  }
</script>

<svelte:head>
  <title>Deconstruction glossary · Signum</title>
  <meta
    name="description"
    content="Browse the controlled concepts Signum uses to describe advertising, persuasion, and cultural meaning."
  />
</svelte:head>

<section class="glossary-page">
  <header class="glossary-header">
    <div>
      <h1>Glossary</h1>
      <p>
        Controlled concepts used by the current Decode corpus, with definitions and spotting
        guidance.
      </p>
    </div>
    <span>{glossary.length} concepts</span>
  </header>

  {#if fromCase}
    <div class="glossary-context-bar">
      <div>
        <strong>Filtered from {caseDisplayTitle(fromCase.case_id, fromCase.title)}</strong>
        <span>{relevantEntries.length} concepts used by this Case</span>
      </div>
      <a href={resolve('/cases/[caseId]', { caseId: fromCase.case_id })}>Back to Case</a>
    </div>
  {/if}

  <div class="glossary-workspace">
    <aside class="glossary-filters">
      <label class="glossary-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"
          ><circle cx="11" cy="11" r="7"></circle><path d="m16.5 16.5 4.5 4.5"></path></svg
        >
        <span class="sr-only">Search glossary</span>
        <input type="search" bind:value={query} placeholder="Search concepts" />
      </label>

      <div class="glossary-domain-list" aria-label="Filter by domain">
        <strong>Domain</strong>
        {#each domains as domain (domain)}
          <button
            type="button"
            class:active={selectedDomain === domain}
            aria-pressed={selectedDomain === domain}
            onclick={() => (selectedDomain = domain)}
          >
            <span>{domain}</span>
            <small>
              {domain === 'All'
                ? glossary.length
                : glossary.filter((entry) => entry.domain === domain).length}
            </small>
          </button>
        {/each}
      </div>
    </aside>

    <section class="glossary-index" aria-label="Glossary concepts">
      <header>
        <strong>{visibleEntries.length} concepts</strong>
        <span
          >{selectedDomain === 'All' ? 'All domains' : selectedDomain} · {reviewedCount} editorially reviewed</span
        >
      </header>

      {#if fromCase && relevantEntries.length > 0}
        <section class="glossary-index__group">
          <div class="glossary-index__group-title">
            <strong>Used by this Case</strong>
            <span>{relevantEntries.length}</span>
          </div>
          <div class="glossary-term-list">
            {#each relevantEntries as entry (entry.id)}
              <button
                type="button"
                class:active={selectedEntry?.id === entry.id}
                onclick={() => selectEntry(entry)}
              >
                <span class="glossary-term-list__domain">{entry.domain}</span>
                <span class="glossary-term-list__copy">
                  <strong>{entry.label}</strong>
                  <span>{entry.definition}</span>
                </span>
                <span class="glossary-term-list__usage">{entry.case_ids.length}</span>
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <section class="glossary-index__group">
        {#if fromCase && relevantEntries.length > 0}
          <div class="glossary-index__group-title">
            <strong>All other concepts</strong>
            <span>{remainingEntries.length}</span>
          </div>
        {/if}
        <div class="glossary-term-list">
          {#each remainingEntries as entry (entry.id)}
            <button
              type="button"
              class:active={selectedEntry?.id === entry.id}
              onclick={() => selectEntry(entry)}
            >
              <span class="glossary-term-list__domain">{entry.domain}</span>
              <span class="glossary-term-list__copy">
                <strong>{entry.label}</strong>
                <span>{entry.definition}</span>
              </span>
              <span class="glossary-term-list__usage">{entry.case_ids.length}</span>
            </button>
          {/each}
        </div>
      </section>

      {#if visibleEntries.length === 0}
        <section class="empty-state empty-state--compact">
          <h2>No concepts match</h2>
          <p>Try another search term or domain.</p>
        </section>
      {/if}
    </section>

    <aside class="glossary-inspector" bind:this={inspectorEl}>
      {#if selectedEntry}
        <header class="glossary-inspector__header">
          <span>{selectedEntry.domain}</span>
          <h2>{selectedEntry.label}</h2>
        </header>
        <p class="glossary-inspector__definition">{selectedEntry.definition}</p>

        {#if selectedEntry.plain_language}
          <section class="glossary-inspector__why">
            <strong>In plain language</strong>
            <p>{selectedEntry.plain_language}</p>
          </section>
        {/if}

        <section class="glossary-inspector__why">
          <strong>Why it matters</strong>
          <p>{selectedEntry.why_it_matters}</p>
        </section>

        <details class="inspector-disclosure" open>
          <summary>
            <span>How to spot it</span>
            <span>{selectedEntry.how_to_spot.length}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"></path></svg>
          </summary>
          <ul>
            {#each selectedEntry.how_to_spot as item (item)}<li>{item}</li>{/each}
          </ul>
        </details>

        {#if selectedEntry.scope_note}
          <details class="inspector-disclosure">
            <summary>
              <span>Boundary</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"></path></svg>
            </summary>
            <p>{selectedEntry.scope_note}</p>
          </details>
        {/if}

        {#if selectedEntry.common_misreadings.length > 0}
          <details class="inspector-disclosure">
            <summary>
              <span>Common misreadings</span>
              <span>{selectedEntry.common_misreadings.length}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"></path></svg>
            </summary>
            <ul>
              {#each selectedEntry.common_misreadings as item (item)}<li>{item}</li>{/each}
            </ul>
          </details>
        {/if}

        {#if selectedEntry.related_terms.length > 0}
          <details class="inspector-disclosure">
            <summary>
              <span>Related terms</span>
              <span>{selectedEntry.related_terms.length}</span>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"></path></svg>
            </summary>
            <div class="glossary-inspector__tags">
              {#each selectedEntry.related_terms as term (term)}
                <span>{term.replaceAll('_', ' ')}</span>
              {/each}
            </div>
          </details>
        {/if}

        {#if selectedEntry.reviewed_at}
          <div class="glossary-inspector__why">
            <strong>Editorial status</strong>
            <p>Reviewed {selectedEntry.reviewed_at}</p>
          </div>
        {/if}

        {#if selectedCases.length > 0}
          <section class="concept-drilldown" aria-labelledby="concept-cases-title">
            <header>
              <div>
                <strong id="concept-cases-title">Ads using this concept</strong>
                <span>{selectedCases.length} analyses</span>
              </div>
              <form method="get" action={resolve('/cases')}>
                <input type="hidden" name="concept" value={selectedEntry.id} />
                <button type="submit">View all</button>
              </form>
            </header>
            <div class="concept-drilldown__grid">
              {#each selectedCases.slice(0, 4) as item (item.case_id)}
                <a href={resolve('/cases/[caseId]', { caseId: item.case_id })}>
                  {#if item.asset.src}<img
                      src={`${base}${item.asset.src}`}
                      alt=""
                      loading="lazy"
                    />{/if}
                  <span>{caseDisplayTitle(item.case_id, caseTitleById[item.case_id])}</span>
                </a>
              {/each}
            </div>
          </section>
        {/if}

        <details class="inspector-disclosure">
          <summary>
            <span>Present in Cases</span>
            <span>{selectedEntry.case_ids.length}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"></path></svg>
          </summary>
          <div class="glossary-inspector__cases">
            {#each selectedEntry.case_ids as caseId (caseId)}
              <a href={resolve('/cases/[caseId]', { caseId })}
                >{caseDisplayTitle(caseId, caseTitleById[caseId])}</a
              >
            {/each}
          </div>
        </details>
      {:else}
        <div class="glossary-inspector__empty">
          <img src={`${base}/brand/mark.svg`} alt="" />
          <strong>Select a concept</strong>
          <p>Definition, spotting guidance, and linked Cases will appear here.</p>
        </div>
      {/if}
    </aside>
  </div>
</section>
