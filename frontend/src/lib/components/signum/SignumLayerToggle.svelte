<script lang="ts">
  import type { DeconstructionLayer } from '$lib/deconstruction';

  let {
    active = $bindable<DeconstructionLayer>('signifiers'),
  }: {
    active: DeconstructionLayer;
  } = $props();

  const layers: readonly {
    id: DeconstructionLayer;
    label: string;
    short: string;
    technical: string;
  }[] = [
    { id: 'raw', label: 'Overview', short: 'Overview', technical: 'Source' },
    {
      id: 'signifiers',
      label: 'What it shows',
      short: 'Shows',
      technical: 'Observations / signifiers',
    },
    {
      id: 'signifieds',
      label: 'What it may mean',
      short: 'Meaning',
      technical: 'Interpretations / signifieds',
    },
    { id: 'referents', label: 'Concepts', short: 'Concepts', technical: 'Referent systems' },
    { id: 'ideology', label: 'Broader meaning', short: 'Broader', technical: 'Ideology' },
  ];
</script>

<div class="layer-toggle" role="group" aria-label="Analysis views">
  {#each layers as layer (layer.id)}
    <button
      type="button"
      class:active={active === layer.id}
      aria-pressed={active === layer.id}
      aria-label={layer.label}
      title={`Technical layer: ${layer.technical}`}
      onclick={() => (active = layer.id)}
    >
      <span class="layer-toggle__long">{layer.label}</span>
      <span class="layer-toggle__short">{layer.short}</span>
    </button>
  {/each}
</div>
