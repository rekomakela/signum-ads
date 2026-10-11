<script lang="ts">
  import { resolve } from '$app/paths';
  import SignumAdThumbnail from '$lib/components/signum/SignumAdThumbnail.svelte';
  import SignumDropZone from '$lib/components/signum/SignumDropZone.svelte';
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
      .slice(0, 4),
  );
</script>

<svelte:head>
  <title>Analyse an advertisement · Signum</title>
  <meta
    name="description"
    content="Analyse an advertisement with Signum and see what it shows, what it may mean, and the evidence behind each interpretation."
  />
</svelte:head>

<section class="decode-home">
  <header class="decode-home__intro">
    <div>
      <h1>Analyse an advertisement.<br />See what it shows, what it may mean, and why.</h1>
      <p>
        Signum separates visible details in the ad from interpretations about its message,
        persuasive techniques, and cultural meaning.
      </p>
      <p class="decode-home__stance">
        <strong>AI-assisted analysis.</strong>
        Every interpretation shows the evidence it is based on.
      </p>
    </div>
  </header>

  <div class="decode-console">
    <section class="decode-console__drop" aria-labelledby="decode-title">
      <div class="surface-heading">
        <div>
          <h2 id="decode-title">Analyse an advertisement</h2>
          <p>
            Upload a JPG, PNG, or WebP image. Signum first checks for an existing archived analysis
            on this device.
          </p>
        </div>
        <span
          class="surface-heading__badge"
          title="The image is hashed locally and matched against Signum's persisted archive before any analyzer is considered."
          >Local-first</span
        >
      </div>
      <SignumDropZone archiveCases={data.dataset.cases} />
    </section>

    <section class="decode-console__method" aria-labelledby="method-title">
      <div class="surface-heading">
        <div>
          <h2 id="method-title">How the analysis works</h2>
          <p>Signum keeps visible evidence separate from interpretation.</p>
        </div>
      </div>

      <ol class="evidence-chain">
        <li>
          <span>01</span>
          <div>
            <strong>What the ad shows</strong>
            <p>
              Identify visible text, people, objects, layout, colours, and other details without
              assigning meaning.
            </p>
          </div>
        </li>
        <li>
          <span>02</span>
          <div>
            <strong>What it may mean</strong>
            <p>
              Explain possible messages, persuasive techniques, associations, and cultural meanings
              based on those details.
            </p>
          </div>
        </li>
        <li>
          <span>03</span>
          <div>
            <strong>Why that interpretation fits</strong>
            <p>
              See which details support each interpretation and which concepts were used to explain
              it.
            </p>
          </div>
        </li>
      </ol>

      <p class="decode-console__collection-summary">
        <strong>{data.counts.total} analyses</strong>
        <span
          >{data.counts.sourced} reference examples · {data.counts.direct} uploaded analyses</span
        >
      </p>

      <aside class="method-inspiration" aria-label="Methodological inspiration">
        <span>Methodological inspiration</span>
        <p>
          Inspired by Judith Williamson’s <cite
            >Decoding Advertisements: Ideology and Meaning in Advertising</cite
          > (1978).
        </p>
      </aside>
    </section>
  </div>

  <section class="recent-cases">
    <header class="section-heading">
      <div>
        <h2>Featured analyses</h2>
        <p>
          A curated set of ads where the evidence-to-interpretation chain is especially worth
          exploring.
        </p>
      </div>
      <a href={resolve('/cases')}>View all {data.counts.total} analyses</a>
    </header>

    <div class="recent-cases__grid">
      {#each featuredCases as item (item.case_id)}
        <SignumAdThumbnail {item} featured />
      {/each}
    </div>
  </section>

  <footer class="home-reference-strip">
    <p>
      Want the expert vocabulary behind the analysis? <a href={resolve('/glossary')}>Concepts</a>
      explains the ideas Signum uses. <a href={resolve('/method')}>Method</a> explains why the evidence
      and interpretation layers stay separate.
    </p>
  </footer>
</section>
