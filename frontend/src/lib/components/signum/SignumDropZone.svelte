<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { requestDecode, type DecodeResponse } from '$lib/decode';
  import type { SignumWorkbenchCase } from '$lib/types';

  type Status = 'idle' | 'matching' | 'decoding' | 'done' | 'error';

  let { archiveCases = [] }: { archiveCases?: readonly SignumWorkbenchCase[] } = $props();

  const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

  let status: Status = $state('idle');
  let errorMessage = $state('');
  let result: DecodeResponse | null = $state(null);
  let dragging = $state(false);
  let inputEl: HTMLInputElement | undefined = $state();

  function readAsBase64(file: File): Promise<string> {
    return new Promise((resolveFile, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = reader.result;
        if (typeof value !== 'string') {
          reject(
            new Error(
              'Signum could not read this image. Try another copy or export it as JPG or PNG.',
            ),
          );
          return;
        }
        resolveFile(value.split(',')[1] ?? '');
      };
      reader.onerror = () =>
        reject(
          new Error(
            'Signum could not read this image. Try another copy or export it as JPG or PNG.',
          ),
        );
      reader.readAsDataURL(file);
    });
  }

  async function sha256ForFile(file: File): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }

  function canUseLocalAnalyzer(): boolean {
    return ['127.0.0.1', 'localhost', '::1', '0.0.0.0'].includes(window.location.hostname);
  }

  function userFacingError(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Could not reach the decode server')) {
      return "Image analysis is unavailable. The local analysis service isn't running.";
    }
    if (message.includes('too large') || message.includes('body too large')) {
      return 'This image is too large to analyse. Choose an image under 20 MB.';
    }
    if (message.includes('Unsupported image type')) {
      return "This image format isn't supported. Choose a JPG, PNG, or WebP file.";
    }
    if (message.startsWith('Signum could not read this image')) return message;
    return "The analysis couldn't be completed. Your image is still available. Try again.";
  }

  async function analyse(file: File | undefined): Promise<void> {
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      errorMessage = "This image format isn't supported. Choose a JPG, PNG, or WebP file.";
      status = 'error';
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      errorMessage = 'This image is too large to analyse. Choose an image under 20 MB.';
      status = 'error';
      return;
    }

    status = 'matching';
    errorMessage = '';
    result = null;
    try {
      const sha256 = await sha256ForFile(file);
      const archived = archiveCases.find((entry) => entry.asset.sha256 === sha256);
      if (archived) {
        await goto(resolve('/cases/[caseId]', { caseId: archived.advertisement_id }));
        return;
      }

      if (!canUseLocalAnalyzer()) {
        errorMessage =
          'This advertisement is not in the public archive yet. New analysis requires the Signum analyzer.';
        status = 'error';
        return;
      }

      status = 'decoding';
      const base64 = await readAsBase64(file);
      result = await requestDecode({
        base64,
        mime_type: file.type,
        filename: file.name || 'ad',
      });
      status = 'done';
    } catch (error) {
      errorMessage = userFacingError(error);
      status = 'error';
    }
  }

  function reset(event?: Event): void {
    event?.stopPropagation();
    status = 'idle';
    result = null;
    errorMessage = '';
  }
</script>

<div
  class="decode-dropzone"
  class:decode-dropzone--dragging={dragging}
  class:decode-dropzone--result={status === 'done' || status === 'error'}
  role="button"
  tabindex="0"
  aria-busy={status === 'matching' || status === 'decoding'}
  onclick={() => {
    if (status === 'idle') inputEl?.click();
  }}
  onkeydown={(event) => {
    if (status === 'idle' && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      inputEl?.click();
    }
  }}
  ondragover={(event) => {
    event.preventDefault();
    if (status === 'idle') dragging = true;
  }}
  ondragleave={() => {
    dragging = false;
  }}
  ondrop={(event) => {
    event.preventDefault();
    dragging = false;
    if (status === 'idle') void analyse(event.dataTransfer?.files?.[0]);
  }}
>
  <input
    type="file"
    accept="image/jpeg,image/png,image/webp"
    hidden
    bind:this={inputEl}
    onchange={(event) => void analyse(event.currentTarget.files?.[0])}
  />

  {#if status === 'idle'}
    <div class="decode-dropzone__idle">
      <span class="decode-dropzone__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 4v10"></path>
          <path d="m8 10 4 4 4-4"></path>
          <path d="M5 18.5h14"></path>
        </svg>
      </span>
      <div>
        <strong>Drop an ad here</strong>
        <p>or <span class="decode-dropzone__choose">choose an image</span></p>
      </div>
    </div>
  {:else if status === 'matching'}
    <div class="decode-dropzone__processing" aria-live="polite">
      <div class="decode-dropzone__processing-head">
        <span class="decode-dropzone__pulse" aria-hidden="true"></span>
        <div>
          <strong>Checking the archive</strong>
          <p>Matching this image against persisted Signum analyses on this device.</p>
        </div>
      </div>
      <div class="decode-dropzone__progress" aria-hidden="true"><span></span></div>
    </div>
  {:else if status === 'decoding'}
    <div class="decode-dropzone__processing" aria-live="polite">
      <div class="decode-dropzone__processing-head">
        <span class="decode-dropzone__pulse" aria-hidden="true"></span>
        <div>
          <strong>Analysing the advertisement</strong>
          <p>This can take about a minute on the local analysis service.</p>
        </div>
      </div>
      <div class="decode-dropzone__progress" aria-hidden="true"><span></span></div>
      <div class="decode-dropzone__skeleton" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
    </div>
  {:else if status === 'done' && result}
    <div class="decode-result" aria-live="polite">
      <header class="decode-result__header">
        <span class="decode-result__state">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4 10-10"></path></svg>
          Analysis complete
        </span>
        <button type="button" onclick={reset}>Analyse another</button>
      </header>
      <h3>{result.decode.proposed_decode.summary}</h3>
      <div class="decode-result__meta">
        <span>{result.decode.evidence_records.length} visible details</span>
        <span>{result.decode.proposed_decode.interpretive_claims.length} interpretations</span>
      </div>
      {#if result.decode.proposed_decode.interpretive_claims.length > 0}
        <details class="decode-result__claims">
          <summary>
            <span>Preview interpretations</span>
            <span>{result.decode.proposed_decode.interpretive_claims.length}</span>
          </summary>
          <ul>
            {#each result.decode.proposed_decode.interpretive_claims as claim (`${claim.kind}:${claim.text}`)}
              <li>
                <strong>{claim.kind.replaceAll('_', ' ')}</strong>
                <span>{claim.text}</span>
              </li>
            {/each}
          </ul>
        </details>
      {/if}
      <a
        class="decode-result__open"
        href={resolve(`/decoded?slug=${encodeURIComponent(result.slug)}`)}
      >
        View full analysis
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"></path></svg>
      </a>
    </div>
  {:else if status === 'error'}
    <div class="decode-error" aria-live="polite">
      <span class="decode-error__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"
          ><circle cx="12" cy="12" r="9"></circle><path d="M12 7v6M12 17h.01"></path></svg
        >
      </span>
      <div>
        <strong>Analysis unavailable</strong>
        <p>{errorMessage}</p>
      </div>
      <button type="button" onclick={reset}>Choose another image</button>
    </div>
  {/if}
</div>
