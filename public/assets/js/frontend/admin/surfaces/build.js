/* ON Mission 10.82.0 — BUILD surface composition. No business authority lives here. */
import { renderProductEcosystem, renderProductBuild, renderProductPublisherWorkspace } from '../oversight/product-factory.js?v=16.10.20';
import { renderProductPublisher } from '../product-publisher.js?v=16.10.20';
import { renderDataCatalog } from '../data-catalog.js?v=16.10.20';
import { renderDataStudio } from '../data-studio.js?v=16.10.20';
import { renderProductStudio } from '../oversight/product-studio.js?v=16.10.20';
import { renderProductVerification } from '../oversight/privacy-verification.js?v=16.10.20';

export const buildSurface = Object.freeze({
  'product-publisher': renderProductPublisher,
  'product-ecosystem': renderProductEcosystem,
  'product-build': renderProductBuild,
  'product-studio': renderProductStudio,
  'product-publisher-workspace': renderProductPublisherWorkspace,
  'data-catalog': renderDataCatalog,
  'data-studio': renderDataStudio,
  'product-verification': renderProductVerification,
});
