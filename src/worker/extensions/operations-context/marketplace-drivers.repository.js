/**
 * Operations performance boundary: load tenant-scoped marketplace driver capacity.
 * Read-only. Mission truth, authorization and assignment remain authoritative elsewhere.
 */
export async function listMarketplaceDrivers(env,tenantId){
  const rows=await env.DB.prepare(`
    SELECT d.id,d.name,d.active,p.vehicle_type,p.current_location,p.situation,
      nextm.delivery_city AS next_location_city,
      nextm.delivery_zip_code AS next_location_zip,
      nextm.delivery_at_utc AS next_location_at
    FROM drivers d
    LEFT JOIN driver_operational_profiles p
      ON p.driver_id=d.id AND p.company_id=d.company_id
    LEFT JOIN mission_canonical_projection nextm ON nextm.id=(
      SELECT m2.id
      FROM mission_canonical_projection m2
      WHERE m2.company_id=d.company_id
        AND EXISTS (SELECT 1 FROM mission_active_assignment_projection ca WHERE ca.mission_id=m2.id AND ca.company_id=m2.company_id AND ca.assignment_type='owner_driver' AND ca.assignee_type='driver' AND ca.assignee_id=d.id AND ca.status='active')
        AND m2.status NOT IN ('Completed','Cancelled','Canceled')
      ORDER BY datetime(COALESCE(m2.delivery_at_utc,m2.updated_at)) ASC,m2.id ASC
      LIMIT 1
    )
    WHERE d.company_id=? AND d.active=1
  `).bind(Number(tenantId)).all();
  return rows.results||[];
}
