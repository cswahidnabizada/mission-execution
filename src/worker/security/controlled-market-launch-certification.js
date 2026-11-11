/** Backward-compatible certification adapter; launch projection remains read-only.
 * Status vocabulary retained: HUMAN_INPUT_REQUIRED, SYSTEM_ACTION_REQUIRED,
 * WAITING_FOR_RUNTIME_EVIDENCE. completionRule is emitted by the launch projection.
 */
import { buildMarketLaunchControl } from './market-launch-control.service.js';

export function assessControlledMarketLaunch(input = {}) {
  const launchControl = buildMarketLaunchControl(input);
  const assessedTasks = launchControl.tasks;
  return {
    ...launchControl,
    launchControl,
    // Keep the existing task register contract for current Market Factory clients.
    tasks:assessedTasks,
    legacyStatus: launchControl.status === 'WAITING_FOR_RUNTIME_EVIDENCE' ? 'WAITING_FOR_RUNTIME_EVIDENCE' : launchControl.status
  };
}
