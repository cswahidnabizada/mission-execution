export const NETWORK_INVITATION_STATUS=Object.freeze({
  PENDING:"Pending",
  ACCEPTED:"Accepted",
  REJECTED:"Rejected",
  CANCELLED:"Cancelled"
});

export const NETWORK_INVITATION_ALLOWED=Object.freeze(Object.values(NETWORK_INVITATION_STATUS));

export function assertNetworkInvitationStatus(status){
  const value=String(status||"");
  if(!NETWORK_INVITATION_ALLOWED.includes(value)){
    const e=new Error(`Invalid Network invitation status: ${value}`);
    e.status=500;
    throw e;
  }
  return value;
}

export function networkInvitationMeaning(status){
  const value=String(status||"");
  return Object.freeze({
    status:value,
    pending:value===NETWORK_INVITATION_STATUS.PENDING,
    accepted:value===NETWORK_INVITATION_STATUS.ACCEPTED,
    rejected:value===NETWORK_INVITATION_STATUS.REJECTED,
    // "Cancelled" is the persisted D1 state for owner/system withdrawal/revocation.
    revoked:value===NETWORK_INVITATION_STATUS.CANCELLED,
    unavailable:[NETWORK_INVITATION_STATUS.REJECTED,NETWORK_INVITATION_STATUS.CANCELLED].includes(value)
  });
}
