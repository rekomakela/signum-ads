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
    <h1>Analyse an advertisement.</h1>
    <p>
      Upload an ad and Signum reads it the way the archive reads every ad: what it shows, what it
      may mean, and why that reading fits.
    </p>
  </header>

  <div class="decode-console">
    <section class="decode-console__drop" aria-labelledby="decode-title">
      <div class="decode-console__heading">
        <h2 id="decode-title">Upload an image</h2>
        <p>
          JPG, PNG, or WebP. The image is hashed on this device and matched against the archive
          before any model runs.
        </p>
      </div>
      <SignumDropZone archiveCases={data.dataset.cases} />
      <p class="decode-home__stance">
        <strong>AI-assisted analysis.</strong>
        Every interpretation shows the evidence it is based on and remains a contestable reading, not
        a verdict.
      </p>
    </section>

    <aside class="decode-console__method" aria-labelledby="method-title">
      <h2 id="method-title">What comes back</h2>
      <dl class="decode-layers">
        <div>
          <dt>What the ad shows</dt>
          <dd>
            Visible text, people, objects, layout, and colour, recorded without assigning meaning.
          </dd>
        </div>
        <div>
          <dt>What it may mean</dt>
          <dd>
            Possible messages, persuasive techniques, associations, and cultural meanings based on
            those details.
          </dd>
        </div>
        <div>
          <dt>Why that interpretation fits</dt>
          <dd>Which details support each interpretation, and which concepts explain it.</dd>
        </div>
      </dl>
      <a href={resolve('/method')}>Read the method</a>
    </aside>
  </div>

  <section class="recent-cases">
    <header class="section-heading">
      <h2>Featured analyses</h2>
      <a href={resolve('/cases')}>All {data.counts.total} analyses</a>
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
