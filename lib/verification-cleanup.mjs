// Temporary, narrowly scoped maintenance for the user-authorized verification cleanup.
export const targetCampaign = {
  id: "draft-1792610674372",
  publicationId: "251ae167-9535-478f-a558-818c4d840baf",
  publishedAt: "2026-10-21T19:25:47.145Z"
};
export const targetEvents = [
  ["38031caa-3553-4789-a37d-dfd699f4a9c9", "like", "2026-10-21T19:23:07.332Z"],
  ["413ba33e-68e8-4148-b57c-1dfe94b3bb09", "purchase", "2026-10-21T19:23:18.919Z"],
  ["7c3c69cd-9f96-4688-a3af-d3af85d0271b", "click", "2026-10-21T19:22:21.741Z"]
];
export async function cleanupAuthorized(request, expectedDigest, expiresAt, now = Date.now()) {
  if (now >= expiresAt) return false;
  const header = request.headers.get("authorization") ?? "";
  if (!/^Bearer [a-f0-9]{64}$/.test(header)) return false;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(header.slice(7)));
  const digest = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, "0")).join("");
  return digest === expectedDigest;
}
export async function cleanupVerification(db) {
  const statements = targetEvents.map(([id, type, at]) =>
    db.prepare(`DELETE FROM customer_events WHERE id = ? AND type = ? AND occurred_at = ?
      AND campaign_id = ? AND publication_id = ? AND product_id = ? AND block_id = ? AND well = ?`)
      .bind(id, type, at, "draft-1792610381399", "24bef87e-5897-4285-ad24-619acd0c9316",
        "P0219", "editors-pick", "Fit Well"));
  statements.push(db.prepare(`DELETE FROM campaign_publications WHERE id = ?
    AND published_at = ? AND json_extract(draft_json, '$.id') = ?
    AND json_extract(draft_json, '$.publicationId') = ?`)
    .bind("active", targetCampaign.publishedAt, targetCampaign.id, targetCampaign.publicationId));
  const result = await db.batch(statements);
  return {
    deletedEvents: result.slice(0, 3).reduce((sum, row) => sum + Number(row.meta.changes ?? 0), 0),
    deletedCampaigns: Number(result[3].meta.changes ?? 0)
  };
}
