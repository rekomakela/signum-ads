<script lang="ts">
  import { base, resolve } from '$app/paths';
  import SignumObservationCard from '$lib/components/signum/SignumObservationCard.svelte';
  import { buildGlossary, rankObservationsForReading } from '$lib/deconstruction';
  import { caseDisplayTitle } from '$lib/display';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let showAllEvidence = $state(false);

  const caseData = $derived(data.caseData);
  const sourceTitle = $derived(
    caseDisplayTitle(caseData.compatibility_case_id, caseData.title),
  );
  const analyticalTitle = $derived(caseData.archive.analytical_title ?? sourceTitle);
  const archiveContext = $derived(
    [caseData.archive.brand, caseData.archive.year_label].filter(Boolean).join(' · '),
  );
  const previousCase = $derived(data.previousCase);
  const nextCase = $derived(data.nextCase);
  const rankedObservations = $derived(rankObservationsForReading(caseData));
  const visibleObservations = $derived(
    showAllEvidence ? rankedObservations : rankedObservations.slice(0, 3),
  );
  const remainingEvidenceCount = $derived(
    Math.max(0, rankedObservations.length - visibleObservations.length),
  );
  const conceptUseCount = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const claim of caseData.claims) {
      for (const reference of claim.references) {
        counts[reference.reference_value] = (counts[reference.reference_value] ?? 0) + 1;
      }
    }
    return counts;
  });
  const caseConcepts = $derived.by(() =>
    buildGlossary([caseData])
      .filter((entry) => entry.case_ids.includes(caseData.case_id))
      .toSorted(
        (left, right) =>
          (conceptUseCount[right.id] ?? 0) - (conceptUseCount[left.id] ?? 0) ||
          left.label.localeCompare(right.label),
      ),
  );
  const keyConcepts = $derived(caseConcepts.slice(0, 4));
</script>

<svelte:head>
  <title>{analyticalTitle} · Signum</title>
</svelte:head>

<article class="case-page">
  <header class="case-header">
    <div class="case-header__topline">
      <a href={resolve('/cases')} class="back-link">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M10 7l-5 5 5 5"></path></svg>
        Analyses
      </a>

      <nav class="case-mode-switch" aria-label="Analysis view">
        <span aria-current="page">Reading</span>
        <a href={resolve(`/workbench?case=${encodeURIComponent(caseData.case_id)}`)}>Analysis map</a>
      </nav>
    </div>

    <div class="case-header__content">
      {#if archiveContext}<p class="case-header__context">{archiveContext}</p>{/if}
      <h1>{analyticalTitle}</h1>
    </div>
  </header>

  <section class="case-lede" aria-label="Advertisement and overall interpretation">
    <aside class="case-source-panel">
      <div class="case-source-panel__heading"><strong>Advertisement</strong></div>
      <div class="case-source-panel__media">
        {#if caseData.asset.src}
          <img src={`${base}${caseData.asset.src}`} alt={caseData.asset.alt} />
        {:else}
          <div class="case-source-panel__missing">
            <img src={`${base}/brand/mark.svg`} alt="" />
            <p>No source image is available for this analysis.</p>
          </div>
        {/if}
      </div>
      <div class="case-source-panel__footer">
        {#if caseData.source_url}
          <a href={caseData.source_url} target="_blank" rel="noreferrer">
            View original
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8"></path><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path></svg>
          </a>
        {:else}
          <span>Original source unavailable</span>
        {/if}
      </div>
    </aside>

    <section class="case-interpretation" aria-labelledby="overall-interpretation-heading">
      <div>
        <span class="section-kicker">Interpretation</span>
        <h2 id="overall-interpretation-heading">Overall interpretation</h2>
      </div>
      {#if caseData.archive.analytical_deck || caseData.summary}
        <p class="case-interpretation__thesis">{caseData.archive.analytical_deck ?? caseData.summary}</p>
      {:else}
        <p class="case-interpretation__thesis">No overall interpretation is available yet.</p>
      {/if}

      {#if keyConcepts.length > 0}
        <div class="case-key-concepts">
          <span>Key concepts</span>
          <div>
            {#each keyConcepts as concept (concept.id)}
              <a
                href={resolve(
                  `/glossary?from=${encodeURIComponent(caseData.case_id)}&concept=${encodeURIComponent(concept.id)}`,
                )}
              >{concept.label}</a>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  </section>

  <section class="case-evidence" aria-labelledby="analysis-heading">
    <header class="case-evidence__header">
      <div>
        <span class="section-kicker">Reasoning</span>
        <h2 id="analysis-heading">Evidence and interpretation</h2>
        <p>The visible details that matter most to this reading, and what they may suggest.</p>
      </div>
      <span>{rankedObservations.length} observations</span>
    </header>

    {#if rankedObservations.length > 0}
      <div class="observation-list">
        {#each visibleObservations as observation (observation.ref)}
          <SignumObservationCard {observation} {caseData} />
        {/each}
      </div>

      {#if remainingEvidenceCount > 0}
        <button class="case-show-more" type="button" onclick={() => (showAllEvidence = true)}>
          Show {remainingEvidenceCount} more {remainingEvidenceCount === 1 ? 'observation' : 'observations'}
        </button>
      {:else if showAllEvidence && rankedObservations.length > 3}
        <button class="case-show-more" type="button" onclick={() => (showAllEvidence = false)}>
          Show only key observations
        </button>
      {/if}
    {:else}
      <section class="empty-state empty-state--compact">
        <h3>No clear visual evidence was identified</h3>
        <p>Try another image or review the source quality before analysing it again.</p>
      </section>
    {/if}
  </section>

  {#if caseConcepts.length > 0}
    <section class="case-concepts" aria-labelledby="case-concepts-heading">
      <header>
        <span class="section-kicker">Theory</span>
        <h2 id="case-concepts-heading">Concepts used in this analysis</h2>
        <p>Ideas that help connect the concrete advertisement to broader patterns of meaning.</p>
      </header>
      <div class="case-concepts__grid">
        {#each caseConcepts as concept (concept.id)}
          <a
            href={resolve(
              `/glossary?from=${encodeURIComponent(caseData.case_id)}&concept=${encodeURIComponent(concept.id)}`,
            )}
          >
            <strong>{concept.label}</strong>
            <span>{concept.plain_language || concept.definition}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}

  <details class="case-about">
    <summary>About this interpretation</summary>
    <div>
      <p>
        Interpretations are arguments, not facts. Signum keeps the visible evidence and the readings
        built from it inspectable so they can be challenged rather than treated as objective truth.
      </p>
      <div class="case-about__actions">
        <a href={resolve('/method')}>How Signum analyses advertisements</a>
        <a href={resolve(`/workbench?case=${encodeURIComponent(caseData.case_id)}`)}>View analysis map</a>
      </div>
    </div>
  </details>

  {#if previousCase || nextCase}
    <nav class="case-adjacent-nav" aria-label="Browse adjacent analyses">
      {#if previousCase}
        <a href={resolve('/cases/[caseId]', { caseId: previousCase.case_id })} rel="prev">
          <span>Previous analysis</span>
          <strong>{caseDisplayTitle(previousCase.case_id, previousCase.title)}</strong>
        </a>
      {:else}
        <span aria-hidden="true"></span>
      {/if}
      {#if nextCase}
        <a href={resolve('/cases/[caseId]', { caseId: nextCase.case_id })} rel="next">
          <span>Next analysis</span>
          <strong>{caseDisplayTitle(nextCase.case_id, nextCase.title)}</strong>
        </a>
      {/if}
    </nav>
  {/if}
</article>
