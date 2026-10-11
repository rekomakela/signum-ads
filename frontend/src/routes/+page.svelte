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
    <div>
      <span class="archive-home__kicker">Advertising analysis archive</span>
      <h1>An archive of decoded advertisements</h1>
      <p>
        Explore how ads construct meaning through signs, cultural codes, values, identities, and
        assumptions that are easy to overlook.
      </p>
      <div class="archive-home__actions">
        <a class="archive-home__primary" href={resolve('/cases')}>Explore analyses</a>
        <a href={resolve('/method')}>How Signum reads ads</a>
      </div>
      <p class="archive-home__corpus">
        <strong>{data.counts.total} advertisements analysed</strong>
        <span
          >{data.counts.sourced} reference examples · {data.counts.direct} uploaded analyses</span
        >
      </p>
    </div>
  </header>

  <section class="archive-home__featured" aria-labelledby="featured-heading">
    <header class="editorial-heading">
      <div>
        <span>Explore the archive</span>
        <h2 id="featured-heading">Featured analyses</h2>
      </div>
      <a href={resolve('/cases')}>View all {data.counts.total} analyses</a>
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
                  {[item.archive.brand, item.archive.year_label].filter(Boolean).join(' · ')}
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
      <div>
        <span>Follow recurring ideas</span>
        <h2 id="patterns-heading">Explore patterns across advertising</h2>
      </div>
      <a href={resolve('/glossary')}>Browse all concepts</a>
    </header>

    <div class="archive-concept-grid">
      {#each recurringConcepts as concept (concept.id)}
        <form method="GET" action={resolve('/cases')}>
          <input type="hidden" name="concept" value={concept.id} />
          <button type="submit">
            <span>{concept.domain}</span>
            <strong>{concept.label}</strong>
            <p>{concept.plain_language || concept.definition}</p>
            <em>{concept.case_ids.length} analyses</em>
          </button>
        </form>
      {/each}
    </div>
  </section>

  <section class="archive-home__reading" aria-labelledby="reading-heading">
    <header>
      <span>How Signum reads ads</span>
      <h2 id="reading-heading">From what is visible to what is made to seem natural</h2>
      <p>
        Signum treats an interpretation as an argument. It starts with what can be pointed to in the
        ad, then asks what those details suggest and what assumptions they help make ordinary.
      </p>
    </header>

    <ol class="archive-reading-model">
      <li>
        <span>01</span>
        <strong>What is shown</strong>
        <p>Observable text, people, objects, composition, colour, and other visible evidence.</p>
      </li>
      <li>
        <span>02</span>
        <strong>What it suggests</strong>
        <p>
          Associations, values, identities, emotions, and cultural codes attached to that evidence.
        </p>
      </li>
      <li>
        <span>03</span>
        <strong>How meaning is constructed</strong>
        <p>
          The relationships between signs, persuasive structures, and the readings they support.
        </p>
      </li>
      <li>
        <span>04</span>
        <strong>What is made to seem natural</strong>
        <p>The worldview or assumption the advertisement invites the viewer to accept as normal.</p>
      </li>
    </ol>
  </section>

  <section class="archive-home__method" aria-labelledby="home-method-heading">
    <div>
      <span>Method</span>
      <h2 id="home-method-heading">A critical reading, not a verdict</h2>
      <p>
        Signum draws on semiotics, critical advertising studies, and Judith Williamson’s
        <cite>Decoding Advertisements: Ideology and Meaning in Advertising</cite>. Machine-generated
        interpretations remain contestable readings rather than objective facts.
      </p>
    </div>
    <a href={resolve('/method')}>Read the methodology</a>
  </section>

  <section class="archive-home__create" aria-labelledby="create-heading">
    <div>
      <span>Create</span>
      <h2 id="create-heading">Analyse an advertisement</h2>
      <p>
        Want to examine an ad yourself? The analysis workspace separates visible evidence from the
        interpretations built from it.
      </p>
    </div>
    <a href={resolve('/analyse')}>Start an analysis</a>
  </section>
</article>
