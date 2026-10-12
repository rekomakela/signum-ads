<script lang="ts">
  import { base, resolve } from '$app/paths';
  import { buildGlossary, type SignumGlossaryEntry } from '$lib/deconstruction';
  import { FEATURED_CASE_IDS, featuredRank } from '$lib/featured';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const featuredCases = $derived.by(() =>
    data.dataset.cases
      .filter(
        (entry) =>
          FEATURED_CASE_IDS.includes(
            entry.compatibility_case_id as (typeof FEATURED_CASE_IDS)[number],
          ) && entry.asset.src,
      )
      .toSorted(
        (a, b) => featuredRank(a.compatibility_case_id) - featuredRank(b.compatibility_case_id),
      )
      .slice(0, 6),
  );

  const glossary = $derived(buildGlossary(data.dataset.cases));
  const glossaryById = $derived(new Map(glossary.map((entry) => [entry.id, entry])));
  const recurringConceptIds = [
    'visual_metaphor',
    'cultural_identity',
    'status',
    'trust',
    'aspiration',
    'cultural_capital',
  ] as const;
  const recurringConcepts = $derived.by(() =>
    recurringConceptIds
      .map((id) => glossaryById.get(id))
      .filter(
        (entry): entry is SignumGlossaryEntry => entry !== undefined && entry.case_ids.length > 0,
      ),
  );
</script>

<svelte:head>
  <title>An archive of decoded advertisements · Signum</title>
  <meta
    name="description"
    content="Explore an archive of advertisements examined for the signs, cultural codes, values, identities, assumptions, and persuasive techniques they carry."
  />
</svelte:head>

<article class="archive-home">
  <header class="archive-home__hero">
    <h1>An archive of decoded advertisements</h1>
    <p>
      Each ad is read in three layers: what it shows, what it may mean, and why that reading fits.
    </p>
  </header>

  <section class="archive-home__featured" aria-labelledby="featured-heading">
    <header class="editorial-heading">
      <h2 id="featured-heading">Featured analyses</h2>
      <a href={resolve('/cases')}>All {data.counts.total} analyses</a>
    </header>

    <div class="editorial-analysis-grid">
      {#each featuredCases as item, index (item.case_id)}
        <a
          class="editorial-analysis-card"
          class:editorial-analysis-card--lead={index < 2}
          href={resolve('/cases/[caseId]', { caseId: item.case_id })}
        >
          <figure>
            <div class="editorial-analysis-card__media">
              <img
                src={`${base}${item.asset.src}`}
                alt={item.asset.alt}
                loading={index < 2 ? 'eager' : 'lazy'}
              />
            </div>
            <figcaption>
              {#if item.archive.brand || item.archive.year_label}
                <p class="editorial-analysis-card__context">
                  {[item.archive.brand, item.archive.year_label].filter(Boolean).join(', ')}
                </p>
              {/if}
              <h3>{item.archive.analytical_title ?? item.title}</h3>
            </figcaption>
          </figure>
        </a>
      {/each}
    </div>
  </section>

  <section class="archive-home__patterns" aria-labelledby="patterns-heading">
    <header class="editorial-heading">
      <h2 id="patterns-heading">Explore patterns across advertising</h2>
      <a href={resolve('/glossary')}>All concepts</a>
    </header>

    <div class="archive-concept-grid">
      {#each recurringConcepts as concept (concept.id)}
        <form method="GET" action={resolve('/cases')}>
          <input type="hidden" name="concept" value={concept.id} />
          <button type="submit">
            <strong>{concept.label}</strong>
            <p>{concept.plain_language || concept.definition}</p>
            <em>{concept.case_ids.length} analyses</em>
          </button>
        </form>
      {/each}
    </div>
  </section>

  <footer class="archive-home__notes">
    <div>
      <h2 id="home-method-heading">From what is visible to what is made to seem natural</h2>
      <p>
        Every reading starts with what can be pointed to in the ad, then asks what those details
        suggest and what assumptions they help make ordinary. The approach draws on semiotics and
        Judith Williamson’s
        <cite>Decoding Advertisements: Ideology and Meaning in Advertising</cite>. Interpretations
        stay contestable readings, not verdicts.
      </p>
      <a href={resolve('/method')}>See one analysis read layer by layer</a>
    </div>
    <div>
      <h2 id="create-heading">Analyse an advertisement</h2>
      <p>
        The analysis workspace runs the same reading on an ad you choose: what it shows, what it
        may mean, and which details support each interpretation.
      </p>
      <a href={resolve('/analyse')}>Start an analysis</a>
      {#if data.counts.direct > 0}
        <p class="archive-home__corpus">
          {data.counts.sourced} reference examples and {data.counts.direct} uploaded analyses
        </p>
      {/if}
    </div>
  </footer>
</article>
