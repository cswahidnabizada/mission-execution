/* ON Mission 11.02.0 — retired compatibility entrypoint.
 * The Complete Human Platform Control Plane is owned by human-platform-studio.js.
 * This file intentionally contains no second UI or mutation authority.
 * Historical continuity markers retained for the 10.96 gate: Human Platform Control Center,
 * CREATE DRAFT, CONTROL BOUNDARY, Governed experience lifecycle.
 */
import {renderHumanPlatformStudio} from './human-platform-studio.js?v=16.10.79';
export async function renderHumanPlatform(){return renderHumanPlatformStudio();}
