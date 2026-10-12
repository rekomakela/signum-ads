<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { fetchDecodedCase, type DecodedCaseDetail } from '$lib/decode';

  let detail: DecodedCaseDetail | null = $state(null);
  let errorMessage = $state('');
  let technicalError = $state('');
  let loading = $state(false);
  let slug = $state('');

  const claimsForEvidence = (evidenceId: string) =>
    detail?.decode.proposed_decode.interpretive_claims.filter((claim) =>
      claim.evidence_references.some((reference) => reference.evidence_id === evidenceId),
    ) ?? [];

  $effect(() => {
    const nextSlug = page.url.searchParams.get('slug') ?? '';
    slug = nextSlug;
    if (!nextSlug) {
      detail = null;
      errorMessage = '';
      technicalError = '';
      loading = false;
      return;
    }

    let cancelled = false;
    loading = true;
    errorMessage = '';
    technicalError = '';
    detail = null;
    fetchDecodedCase(nextSlug)
      .then((result) => {
        if (!cancelled) detail = result;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          technicalError = error instanceof Error ? error.message : String(error);
          errorMessage =
            "This analysis couldn't be loaded. The local analysis service may not be running.";
        }
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });
    return () => {
      cancelled = true;
    };
  });
</script>

<svelte:head>
  <title>Uploaded analysis · Signum</title>
</svelte:head>

<section class="decoded-page">
  <header class="decoded-header">
    <a href={resolve('/cases')} class="back-link">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M10 7l-5 5 5 5"></path></svg>
      Analyses
    </a>
    <div>
      <h1>Uploaded analysis</h1>
      {#if detail}
        <span
          >{detail.decode.evidence_records.length} visible details · {detail.decode.proposed_decode
            .interpretive_claims.length} interpretations</span
        >
      {/if}
    </div>
  </header>

  {#if !slug}
    <section class="empty-state">
      <h2>No analysis selected</h2>
      <p>Choose an existing analysis or analyse an advertisement to create a new one.</p>
      <a href={resolve('/')}>Analyse an ad</a>
    </section>
  {:else if loading}
    <section class="decoded-loading" aria-live="polite">
      <span></span><span></span><span></span>
      <p>Loading analysis…</p>
    </section>
  {:else if errorMessage}
    <section class="empty-state empty-state--error">
      <h2>Analysis unavailable</h2>
      <p>{errorMessage}</p>
      {#if technicalError}
        <details class="technical-details">
          <summary>Show technical details</summary>
          <p>{technicalError}</p>
        </details>
      {/if}
      <a href={resolve('/cases')}>Back to analyses</a>
    </section>
  {:else if detail}
    <div class="decoded-workspace">
      <aside class="decoded-source">
        {#if detail.asset_base64}
          <div class="decoded-source__media">
            <img
              src={`data:${detail.asset_mime};base64,${detail.asset_base64}`}
              alt={`Advertisement for ${detail.slug}`}
            />
          </div>
        {/if}
        <p>Uploaded locally · AI-assisted analysis</p>
      </aside>

      <section class="decoded-analysis">
        <section class="decoded-summary">
          <strong>Analysis summary</strong>
          <p>{detail.decode.proposed_decode.summary}</p>
        </section>

        <section class="decoded-group">
          <header>
            <div>
              <h2>What the ad shows</h2>
              <p>Open a visible detail to see the interpretations it supports.</p>
            </div>
            <span>{detail.decode.evidence_records.length}</span>
          </header>
          <div class="decoded-observation-list">
            {#each detail.decode.evidence_records as observation (observation.evidence_id)}
              <details id={`direct-evidence-${observation.evidence_id}`}>
                <summary>
                  <div>
                    <small
                      >{observation.evidence_type.replaceAll('_', ' ')} · {observation.location ??
                        'Whole ad'}</small
                    >
                    <p>{observation.description}</p>
                    <em
                      title="Confidence describes how strongly the available evidence supports this result. It does not mean the interpretation is objectively true."
                      >{observation.confidence} confidence · {claimsForEvidence(
                        observation.evidence_id,
                      ).length}
                      {claimsForEvidence(observation.evidence_id).length === 1
                        ? 'interpretation'
                        : 'interpretations'}</em
                    >
                  </div>
                  <svg class="disclosure-icon" viewBox="0 0 24 24" aria-hidden="true"
                    ><path d="m8 10 4 4 4-4"></path></svg
                  >
                </summary>

                <div class="decoded-observation-list__body">
                  {#if claimsForEvidence(observation.evidence_id).length > 0}
                    <section class="decoded-linked-claims">
                      <header>
                        <strong
                          title="Possible meanings supported by this visible detail. Technical term: Interpretation."
                          >What it may mean</strong
                        >
                        <span>{claimsForEvidence(observation.evidence_id).length}</span>
                      </header>
                      <div>
                        {#each claimsForEvidence(observation.evidence_id) as claim (claim.claim_id)}
                          <details class="decoded-linked-claim">
                            <summary>
                              <div>
                                <small>{claim.kind.replaceAll('_', ' ')}</small>
                                <p>{claim.text}</p>
                                <em
                                  >{claim.evidence_references.length} supporting details · {claim
                                    .references.length} concepts</em
                                >
                              </div>
                              <svg class="disclosure-icon" viewBox="0 0 24 24" aria-hidden="true"
                                ><path d="m8 10 4 4 4-4"></path></svg
                              >
                            </summary>
                            <div class="decoded-linked-claim__details">
                              {#if claim.references.length > 0}
                                <div
                                  class="decoded-claim-list__refs"
                                  aria-label="Concepts used in this interpretation"
                                >
                                  {#each claim.references as reference (`${reference.reference_type}:${reference.reference_value}`)}
                                    <a
                                      href={resolve(
                                        `/glossary?concept=${encodeURIComponent(reference.reference_value)}`,
                                      )}
                                    >
                                      {reference.reference_value.replaceAll('_', ' ')}
                                    </a>
                                  {/each}
                                </div>
                              {/if}
                              <div
                                class="decoded-linked-claim__evidence"
                                aria-label="Supporting evidence"
                              >
                                {#each claim.evidence_references as reference (reference.evidence_id)}
                                  <a href={`#direct-evidence-${reference.evidence_id}`}>
                                    <span>{reference.evidence_id}</span>
                                    <em>{reference.support}</em>
                                  </a>
                                {/each}
                              </div>
                            </div>
                          </details>
                        {/each}
                      </div>
                    </section>
                  {/if}
                </div>
              </details>
            {/each}
          </div>
        </section>
      </section>
    </div>
  {/if}
</section>
