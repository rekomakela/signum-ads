<script lang="ts">
  import { onMount } from 'svelte';
  import { base, resolve } from '$app/paths';
  import SignumLayerToggle from '$lib/components/signum/SignumLayerToggle.svelte';
  import {
    conceptIdsForCase,
    displayEvidenceType,
    type DeconstructionLayer,
  } from '$lib/deconstruction';
  import { caseDisplayTitle } from '$lib/display';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let activeLayer = $state<DeconstructionLayer>('signifiers');
  let selectedCaseId = $state('');

  const availableCases = $derived(data.dataset.cases.filter((entry) => entry.asset.src));
  const defaultCaseId = $derived.by(
    () =>
      availableCases.find((entry) => entry.compatibility_case_id === 'real-ikea-sleep')?.case_id ??
      availableCases[0]?.case_id ??
      '',
  );
  const caseData = $derived(
    data.dataset.cases.find((entry) => entry.case_id === (selectedCaseId || defaultCaseId)) ??
      data.dataset.cases.find((entry) => entry.case_id === defaultCaseId) ??
      null,
  );
  const concepts = $derived(caseData ? conceptIdsForCase(caseData).slice(0, 10) : []);
  const primaryClaims = $derived(
    caseData?.claims.filter((claim) => !claim.ref.includes('alternate')).slice(0, 8) ?? [],
  );

  onMount(() => {
    selectedCaseId = new URL(window.location.href).searchParams.get('case') ?? defaultCaseId;
  });
</script>

<svelte:head>
  <title>Inspect an advertisement analysis · Signum</title>
  <meta
    name="description"
    content="Inspect one advertisement analysis from visible details through interpretations, concepts, and broader meaning."
  />
</svelte:head>

{#if caseData}
  <section class="workbench-page">
    <header class="workbench-header">
      <div>
        <h1>Inspect an analysis</h1>
        <p>Move from what the ad shows to what it may mean without losing the source image.</p>
      </div>
      <a href={resolve('/cases/[caseId]', { caseId: caseData.case_id })}>
        Open full analysis
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"></path></svg>
      </a>
    </header>

    <div class="workbench-grid">
      <aside class="workbench-case-rail">
        <header>
          <strong>Analyses</strong>
          <span>{availableCases.length}</span>
        </header>
        <div class="workbench-case-list" aria-label="Local advertisements">
          {#each availableCases as item (item.case_id)}
            <a
              href={resolve(`/workbench?case=${encodeURIComponent(item.case_id)}`)}
              class:active={item.case_id === caseData.case_id}
              aria-current={item.case_id === caseData.case_id ? 'page' : undefined}
            >
              <span class="workbench-case-list__thumb">
                {#if item.asset.src}<img
                    src={`${base}${item.asset.src}`}
                    alt=""
                    loading="lazy"
                  />{/if}
              </span>
              <span>
                <strong>{caseDisplayTitle(item.compatibility_case_id, item.title)}</strong>
                <small
                  >{item.observations.length} details · {item.claims.length} interpretations</small
                >
              </span>
            </a>
          {/each}
        </div>
      </aside>

      <section class="workbench-stage">
        <header>
          <div>
            {#if caseData.status === 'pending'}<span>Analysis pending</span>{/if}
            <h2>{caseDisplayTitle(caseData.compatibility_case_id, caseData.title)}</h2>
          </div>
          <p>{caseData.summary}</p>
        </header>

        <div class="workbench-stage__media">
          {#if caseData.asset.src}
            <img src={`${base}${caseData.asset.src}`} alt={caseData.asset.alt} />
          {/if}
        </div>

        <footer>
          <span>{caseData.evidence_types.length} kinds of visible detail</span>
          <span>{caseData.unresolved_reference_count ?? '—'} unresolved concepts</span>
        </footer>
      </section>

      <section class="workbench-inspector" aria-label="Deconstruction layer inspector">
        <header class="workbench-inspector__header">
          <div>
            <strong>Analysis view</strong>
            <span>One advertisement, five ways to inspect the analysis</span>
          </div>
          <SignumLayerToggle bind:active={activeLayer} />
        </header>

        <div class="workbench-inspector__body">
          {#if activeLayer === 'raw'}
            <section class="layer-raw">
              <h3>Advertisement and analysis summary</h3>
              <p>{caseData.summary}</p>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>{caseData.status}</dd>
                </div>
                <div>
                  <dt>Visible details</dt>
                  <dd>{caseData.observations.length}</dd>
                </div>
                <div>
                  <dt>Interpretations</dt>
                  <dd>{caseData.claims.length}</dd>
                </div>
                <div>
                  <dt>Detail types</dt>
                  <dd>{caseData.evidence_types.length}</dd>
                </div>
              </dl>
            </section>
          {:else if activeLayer === 'signifiers'}
            <section class="layer-list">
              <header>
                <h3>What the ad shows</h3>
                <span>{caseData.observations.length}</span>
              </header>
              <div>
                {#each caseData.observations as observation, index (observation.ref)}
                  <article class="layer-observation">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <small
                        >{displayEvidenceType(observation.evidence_type)} · {observation.location ??
                          'Whole ad'}</small
                      >
                      <p>{observation.description}</p>
                      <em>{observation.confidence} confidence</em>
                    </div>
                  </article>
                {/each}
              </div>
            </section>
          {:else if activeLayer === 'signifieds'}
            <section class="layer-list">
              <header>
                <h3>What it may mean</h3>
                <span>{primaryClaims.length}</span>
              </header>
              <div>
                {#each primaryClaims as claim, index (claim.ref)}
                  <article class="layer-claim">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <small>{claim.kind.replaceAll('_', ' ')}</small>
                      <p>{claim.text}</p>
                      <em>{claim.evidence_refs.length} supporting details</em>
                    </div>
                  </article>
                {/each}
              </div>
            </section>
          {:else if activeLayer === 'referents'}
            <section class="layer-list">
              <header>
                <h3>Concepts used in the analysis</h3>
                <span>{concepts.length}</span>
              </header>
              <div class="layer-concepts">
                {#each concepts as concept (concept)}
                  <a
                    href={resolve(
                      `/glossary?from=${encodeURIComponent(caseData.case_id)}&concept=${encodeURIComponent(concept)}`,
                    )}
                  >
                    <strong>{concept.replaceAll('_', ' ')}</strong>
                    <span>Inspect concept</span>
                  </a>
                {/each}
              </div>
            </section>
          {:else}
            <section class="layer-list">
              <header>
                <h3>Broader reading</h3>
                <span>{caseData.claims.length}</span>
              </header>
              <div>
                {#each caseData.claims.filter((claim) => claim.kind === 'interpretation' || claim.kind === 'core_message') as claim, index (claim.ref)}
                  <article class="layer-claim">
                    <span>{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <small
                        >{claim.ref.includes('alternate')
                          ? 'Alternate reading'
                          : 'Broader reading'}</small
                      >
                      <p>{claim.text}</p>
                      <em>{claim.evidence_refs.length} supporting details</em>
                    </div>
                  </article>
                {/each}
              </div>
            </section>
          {/if}
        </div>
      </section>
    </div>
  </section>
{/if}
