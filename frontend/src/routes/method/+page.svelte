<script lang="ts">
  import { resolve } from '$app/paths';
  import { signumWorkbenchData } from '$lib/generated/signum-workbench-data';

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

<section class="method-page">
  <header class="method-hero">
    <span class="method-kicker">Method</span>
    <h1>See the ad first.<br />Interpret it second.</h1>
    <p>
      Signum is an experiment in making AI-assisted advertising interpretation inspectable rather
      than authoritative. It keeps what is visibly present separate from what the model thinks those
      details may mean.
    </p>
    <div class="method-hero__actions">
      <a class="method-primary-link" href={resolve('/cases')}>Explore analyses</a>
      <a href={resolve('/glossary')}>Browse concepts</a>
    </div>
  </header>

  <section class="method-model" aria-labelledby="method-model-title">
    <header>
      <span>Analytical model</span>
      <h2 id="method-model-title">What → meaning → support</h2>
    </header>
    <ol>
      <li>
        <span>01</span>
        <div>
          <strong>What the ad shows</strong>
          <p>
            Record visible text, objects, people, layout, colour, composition, and other observable
            details without assigning meaning to them.
          </p>
          <small>Domain term: Observation</small>
        </div>
      </li>
      <li>
        <span>02</span>
        <div>
          <strong>What it may mean</strong>
          <p>
            Propose possible messages, persuasive techniques, associations, cultural codes, and
            ideological readings supported by those details.
          </p>
          <small>Domain term: Interpretation / Claim</small>
        </div>
      </li>
      <li>
        <span>03</span>
        <div>
          <strong>Why that interpretation fits</strong>
          <p>
            Trace each interpretation back to the visible details that support it and expose the
            controlled concepts used to explain the reading.
          </p>
          <small>Domain term: Evidence Link</small>
        </div>
      </li>
    </ol>
  </section>

  <div class="method-grid">
    <section class="method-panel">
      <span>Methodological inspiration</span>
      <h2>Judith Williamson</h2>
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
    </section>

    <section class="method-panel">
      <span>Epistemic stance</span>
      <h2>A supported reading, not ground truth</h2>
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

    <section class="method-panel">
      <span>Why local-first</span>
      <h2>The model is an adapter, not the product</h2>
      <p>
        Image analysis runs through a local vision-model seam. The durable product value is the
        inspectable structure around the result: visible detail, interpretation, evidence links, and
        concepts.
      </p>
      <p>
        The public showcase is static; it does not expose the local Decode service to the internet.
      </p>
    </section>

    <section class="method-panel">
      <span>Deliberate limits</span>
      <h2>What Signum does not claim</h2>
      <ul>
        <li>It does not infer the advertiser’s true private intention.</li>
        <li>It does not treat semiotic interpretation as objective measurement.</li>
        <li>It does not collapse visible evidence and interpretation into one model paragraph.</li>
        <li>
          It does not require a human approval ceremony before a machine Decode can be inspected.
        </li>
      </ul>
    </section>
  </div>

  <section class="method-example">
    <div>
      <span>Worked example</span>
      <h2>Follow one reading from image to concept.</h2>
      <p>
        Start with the Tabasco analysis, open a visible detail, inspect the interpretations linked
        to it, then follow a concept into the wider collection.
      </p>
    </div>
    {#if tabascoExample}
      <a
        class="method-primary-link"
        href={resolve('/cases/[caseId]', { caseId: tabascoExample.advertisement_id })}
        >Open the Tabasco analysis</a
      >
    {/if}
  </section>
</section>
