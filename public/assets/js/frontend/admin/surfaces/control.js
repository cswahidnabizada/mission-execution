/* ON Mission 10.82.0 — CONTROL surface composition. Admin orchestrates; authorities own truth. */
import { renderControlCenter } from '../oversight/product-factory.js?v=16.10.80';
import { renderPlatformCenter } from '../oversight/product-studio.js?v=16.10.80';
import { renderCertification } from '../certification.js?v=16.10.80';
import { api, esc } from '../admin-runtime.js?v=16.10.80';
import { navigate } from '../oversight/context.js?v=16.10.80';
import { renderHumanPlatformStudio } from '../human-platform-studio.js?v=16.10.80';

export const controlSurface = Object.freeze({
  overview: renderControlCenter,
  control: renderControlCenter,
  'platform-center': renderPlatformCenter,
  'human-platform': renderHumanPlatformStudio,
  certification:()=>renderCertification({api,esc,show:navigate}),
});
