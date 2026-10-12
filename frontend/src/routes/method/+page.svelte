<script lang="ts">
  import { resolve } from '$app/paths';
  import { signumWorkbenchData } from '$lib/generated/signum-workbench-data';
  import SignumWorkedExample from '$lib/components/signum/SignumWorkedExample.svelte';

  const tabascoCompatibilityCaseIds = new Set([
    'real-tabasco-ad-fc858453',
    'real-a-picture-is-worth-1000-words-no-tag-line-necess-b461c1b7',
  ]);
  const tabascoExample = signumWorkbenchData.cases.find((item) =>
    tabascoCompatibilityCaseIds.has(item.compatibility_case_id),
  );
</script>

<svelte:head>
  <title>Method · Signum</title>
  <meta
    name="description"
    content="How Signum separates visible details in advertisements from interpretation, supporting evidence, and semiotic concepts."
  />
</svelte:head>

<article class="method-page">
  <header class="method-hero">
    <h1>See the ad first. Interpret it second.</h1>
    <p>
      Signum keeps what is visibly present in an advertisement separate from what it may mean, and
      shows which details support each reading. Every analysis in the archive is built from the same
      three layers.
    </p>
  </header>

  {#if tabascoExample}
    <section class="method-section" aria-labelledby="method-example-heading">
      <h2 id="method-example-heading">One analysis, layer by layer</h2>
      <SignumWorkedExample caseData={tabascoExample} linkLabel="Open the Tabasco analysis" />
    </section>
  {/if}

  <section class="method-section method-section--prose" aria-labelledby="method-stance-heading">
    <h2 id="method-stance-heading">A supported reading, not ground truth</h2>
    <p>
      An interpretation can be plausible, useful, or contestable without being objectively true.
      Signum therefore exposes support instead of presenting model output as proven advertiser
      intent.
    </p>
    <p>
      Confidence describes how strongly the available evidence supports the generated reading. It
      does not certify that the interpretation is correct.
    </p>
  </section>

  <section class="method-section method-notes" aria-labelledby="method-notes-heading">
    <h2 id="method-notes-heading">More about the method</h2>

    <details class="method-note">
      <summary>What each layer records</summary>
      <div>
        <dl class="method-layers">
          <div>
            <dt>What the ad shows</dt>
            <dd>
              <p>
                Visible text, objects, people, layout, colour, and composition, recorded without
                assigning meaning to them.
              </p>
              <span>Recorded as observations.</span>
            </dd>
          </div>
          <div>
            <dt>What it may mean</dt>
            <dd>
              <p>
                Possible messages, persuasive techniques, associations, cultural codes, and
                ideological readings that those details support.
              </p>
              <span>Recorded as interpretations.</span>
            </dd>
          </div>
          <div>
            <dt>Why that interpretation fits</dt>
            <dd>
              <p>
                Each interpretation points back to the visible details that support it and names the
                <a href={resolve('/glossary')}>concepts</a> used to explain the reading.
              </p>
              <span>Recorded as evidence links and concept references.</span>
            </dd>
          </div>
        </dl>
      </div>
    </details>

    <details class="method-note">
      <summary>Where the approach comes from</summary>
      <div>
        <p>
          Signum is inspired by Judith Williamson’s <cite
            >Decoding Advertisements: Ideology and Meaning in Advertising</cite
          > (1978), particularly the idea that advertising transfers meanings from existing cultural systems
          onto products and consumers.
        </p>
        <p>
          The project is independent and is not affiliated with or endorsed by Williamson or the
          book’s publisher.
        </p>
      </div>
    </details>

    <details class="method-note">
      <summary>Why analysis runs locally</summary>
      <div>
        <p>
          Image analysis runs through a local vision-model seam. The durable value is the
          inspectable structure around the result: visible detail, interpretation, evidence links,
          and concepts.
        </p>
        <p>
          The public showcase is static; it does not expose the local analysis service to the
          internet.
        </p>
      </div>
    </details>

    <details class="method-note">
      <summary>What Signum does not claim</summary>
      <div>
        <ul>
          <li>It does not infer the advertiser’s true private intention.</li>
          <li>It does not treat semiotic interpretation as objective measurement.</li>
          <li>It does not collapse visible evidence and interpretation into one paragraph.</li>
          <li>
            It does not require a human approval step before a machine analysis can be inspected.
          </li>
        </ul>
      </div>
    </details>
  </section>
</article>
