import { createCaseLibrary } from '../cases/case-library.js';

/**
 * Read-only Decode quality audit: report summary, Observation/Claim counts,
 * controlled-reference resolution, and structural validation errors for every
 * Decoded Case in the Case Library.
 */
async function main(): Promise<void> {
  const library = createCaseLibrary('cases');
  const entries = await library.listCases();
  const rows: Array<{
    slug: string;
    summary: string;
    observations: number;
    claims: number;
    references: number;
    unresolved: number;
    structural_errors: number;
  }> = [];

  for (const entry of entries) {
    const decode = entry.decode;
    if (decode === null) continue;

    const unresolved = entry.validation_issues.filter(
      (issue) => issue.code === 'unresolved_reference',
    ).length;
    const structuralErrors = entry.validation_issues.filter(
      (issue) => issue.severity === 'error',
    ).length;
    const references = decode.proposed_decode.interpretive_claims.reduce(
      (total, claim) => total + claim.references.length,
      0,
    );

    rows.push({
      slug: entry.case_id,
      summary: decode.proposed_decode.summary,
      observations: decode.evidence_records.length,
      claims: decode.proposed_decode.interpretive_claims.length,
      references,
      unresolved,
      structural_errors: structuralErrors,
    });
  }

  const totalReferences = rows.reduce((sum, row) => sum + row.references, 0);
  const totalUnresolved = rows.reduce((sum, row) => sum + row.unresolved, 0);
  const totalStructural = rows.reduce((sum, row) => sum + row.structural_errors, 0);

  for (const row of rows) {
    process.stdout.write(
      `${row.slug}\n  observations=${row.observations} claims=${row.claims} refs=${row.references} unresolved=${row.unresolved} errors=${row.structural_errors}\n  ${row.summary.slice(0, 110)}\n`,
    );
  }

  process.stdout.write(
    `\n${rows.length} Decoded Cases · ${totalReferences} references · ${totalUnresolved} unresolved (${totalReferences === 0 ? 0 : Math.round((totalUnresolved / totalReferences) * 100)}%) · ${totalStructural} structural errors\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
