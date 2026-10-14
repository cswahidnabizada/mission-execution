/**
 * ON Mission Analytics V1 — canonical KPI contract.
 *
 * This file is intentionally declarative. It contains no database access and
 * does not define mission truth. It describes how the metric layer interprets
 * authoritative operational data.
 */

export const ANALYTICS_VERSION = "v1";

import {MISSION_TERMINAL_STATUSES} from "../../domains/logistics/logistics-lifecycle.contract.js";

export const TERMINAL_STATUSES = MISSION_TERMINAL_STATUSES;

export const METRIC_DEFINITIONS = Object.freeze({
  missionVolume: {
    key: "mission_volume",
    label: "Mission Volume",
    status: "READY",
    grain: "mission",
    source: "missions",
    definition: "Eligible missions whose mission_date is inside the requested reporting range and tenant scope."
  },
  activeMissions: {
    key: "active_missions",
    label: "Active Missions",
    status: "PARTIAL",
    grain: "mission",
    source: "missions",
    definition: "Eligible missions whose current status is not an explicitly terminal status."
  },
  completionRate: {
    key: "completion_rate",
    label: "Completion Rate",
    status: "READY",
    grain: "mission",
    source: "missions",
    definition: "Completed eligible missions divided by all eligible missions."
  },
  overdueRate: {
    key: "overdue_rate",
    label: "Overdue Rate",
    status: "PARTIAL",
    grain: "mission",
    source: "missions",
    definition: "Currently overdue non-terminal missions divided by eligible missions with a valid UTC deadline."
  },
  averageMissionDurationMinutes: {
    key: "average_mission_duration_minutes",
    label: "Average Mission Duration",
    status: "READY",
    grain: "mission",
    source: "missions + mission_status_history",
    definition: "First valid Completed status timestamp minus mission.created_at for completed missions."
  },
  averageStageDurationMinutes: {
    key: "average_stage_duration_minutes",
    label: "Average Stage Duration",
    status: "READY",
    grain: "status transition",
    source: "mission_status_history",
    definition: "Average elapsed minutes between consecutive valid mission status-history events."
  },
  exceptionRate: {
    key: "exception_rate",
    label: "Exception Rate",
    status: "READY",
    grain: "mission",
    source: "mission_exceptions + missions",
    definition: "Distinct eligible missions with at least one exception divided by eligible missions."
  },
  networkInvitationAcceptanceRate: {
    key: "network_invitation_acceptance_rate",
    label: "Network Invitation Acceptance Rate",
    status: "READY",
    grain: "invitation",
    source: "network_mission_invitations",
    definition: "Accepted network invitations divided by decided invitations (Accepted, Rejected or Cancelled); pending invitations remain a separate backlog metric."
  },
  missionsPerExecutor: {
    key: "missions_per_executor",
    label: "Missions per Executor",
    status: "PARTIAL",
    grain: "mission + execution owner",
    source: "missions + assignment tables",
    definition: "Eligible missions grouped by execution ownership that can be unambiguously derived today; owner-driver and independent-executor ownership are supported in V1, while other channels remain future extensions."
  },
  foryouAcceptanceRate: {
    key: "foryou_acceptance_rate",
    label: "ForYou Acceptance Rate",
    status: "READY",
    grain: "request",
    source: "public_mission_requests",
    definition: "Approved ForYou requests divided by decided requests (Approved, Declined or Revoked); pending requests remain a separate backlog metric."
  }
});

export const EXECUTION_CHANNELS = Object.freeze({
  OWNER_DRIVER: "owner_driver",
  SHARED_TENANT_DRIVER: "shared_tenant_driver",
  NETWORK_TENANT: "network_tenant",
  NETWORK_EXECUTOR: "network_executor",
  FORYOU_TENANT: "foryou_tenant",
  FORYOU_EXECUTOR: "foryou_executor"
});
