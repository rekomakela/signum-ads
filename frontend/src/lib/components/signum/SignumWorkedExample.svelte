<script lang="ts">
  import { base, resolve } from '$app/paths';
  import type { SignumWorkbenchCase } from '$lib/types';
  import { caseDisplayTitle } from '$lib/display';
  import {
    claimsForObservation,
    displayClaimKind,
    rankClaimsForReading,
    rankObservationsForReading,
  } from '$lib/deconstruction';

  let {
    caseData,
    linkLabel = 'Open the full analysis',
  }: {
    caseData: SignumWorkbenchCase;
    linkLabel?: string;
  } = $props();

  const observation = $derived(rankObservationsForReading(caseData)[0] ?? null);
  const claim = $derived(
    observation
      ? (rankClaimsForReading(claimsForObservation(caseData, observation))[0] ?? null)
      : null,
  );
  const otherSupportingObservations = $derived.by(() => {
    if (!claim || !observation) return [];
    const refs = new Set(claim.evidence_refs.map((reference) => reference.ref));
    return caseData.observations.filter(
      (entry) => refs.has(entry.ref) && entry.ref !== observation.ref,
    );
  });
  const concepts = $derived(
    claim
      ? Array.from(new Set(claim.references.map((reference) => reference.reference_value)))
      : [],
  );
  const caption = $derived(
    caseData.archive.analytical_title
      ? [caseData.archive.brand, caseData.archive.year_label, caseData.archive.analytical_title]
          .filter(Boolean)
          .join(' · ')
      : caseDisplayTitle(caseData.compatibility_case_id, caseData.title),
  );
  const href = $derived(resolve('/cases/[caseId]', { caseId: caseData.case_id }));
</script>

<figure class="worked-example">
  <a class="worked-example__media" {href}>
    <img src={`${base}${caseData.asset.src}`} alt={caseData.asset.alt} loading="lazy" />
  </a>
  <figcaption class="worked-example__reading">
    <p class="worked-example__caption">{caption}</p>
    {#if observation && claim}
      <dl>
        <div>
          <dt>What the ad shows</dt>
          <dd>
            <p>{observation.description}</p>
            <span class="worked-example__term">Observation · {observation.location}</span>
          </dd>
        </div>
        <div>
          <dt>What it may mean</dt>
          <dd>
            <p>{claim.text}</p>
            <span class="worked-example__term"
              >Interpretation · {displayClaimKind(claim.kind).toLowerCase()}</span
            >
          </dd>
        </div>
        <div>
          <dt>Why that interpretation fits</dt>
          <dd>
            {#if otherSupportingObservations.length === 0}
              <p>The reading rests on this one visible detail, not on the image as a whole.</p>
            {:else}
              <p>
                The reading rests on this detail and {otherSupportingObservations.length === 1
                  ? 'one other'
                  : `${otherSupportingObservations.length} others`}, not on the image as a whole:
              </p>
              <ul>
                {#each otherSupportingObservations as entry (entry.ref)}
                  <li>{entry.description}</li>
                {/each}
              </ul>
            {/if}
            {#if concepts.length > 0}
              <span class="worked-example__term">
                Evidence links · concepts:
                {#each concepts as concept, index (concept)}
                  <a
                    href={resolve(
                      `/glossary?from=${encodeURIComponent(caseData.case_id)}&concept=${encodeURIComponent(concept)}`,
                    )}>{concept.replaceAll('_', ' ')}</a
                  >{index < concepts.length - 1 ? ', ' : ''}
                {/each}
              </span>
            {/if}
          </dd>
        </div>
      </dl>
    {/if}
    <div class="worked-example__actions">
      <a class="ds-button ds-button--primary" {href}>{linkLabel}</a>
    </div>
  </figcaption>
</figure>
