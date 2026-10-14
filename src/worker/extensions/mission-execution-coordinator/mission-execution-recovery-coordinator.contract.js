export const MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION='13.1.0';
export const MISSION_EXECUTION_RECOVERY_EFFECT_FENCE_VERSION='14.2.0';
export const VERIFICATION_RECOVERY_STATES=Object.freeze(['VERIFIED','RECOVERY_REQUIRED']);
export const VERIFICATION_RECOVERY_INVARIANTS=Object.freeze({
  unknownIsNotSuccess:true,
  externalRequiresProviderVerification:true,
  canonicalEffectRequiresCanonicalEvidence:true,
  recoveryDoesNotOwnMissionTruth:true,
  recoveryDoesNotAutoRetryUnknown:true
});

export function buildVerificationRecoveryContract({status,external=false,providerVerified=false,canonicalVerified=false,recovery=null}={}){
  const normalized=String(status||'RECOVERY_REQUIRED');
  const validStatus=VERIFICATION_RECOVERY_STATES.includes(normalized);
  const safe=normalized==='VERIFIED' && (!external || providerVerified) && canonicalVerified;
  return Object.freeze({
    version:MISSION_EXECUTION_RECOVERY_COORDINATOR_VERSION,
    status:normalized,
    external:Boolean(external),
    providerVerified:Boolean(providerVerified),
    canonicalVerified:Boolean(canonicalVerified),
    recovery:recovery||null,
    invariant:Object.freeze({
      validStatus,
      ...VERIFICATION_RECOVERY_INVARIANTS,
      safeVerifiedOutcome:safe
    })
  });
}

export function validateVerificationRecoveryContract(contract){
  const failures=[];
  if(!contract?.invariant?.validStatus)failures.push('verification_recovery_status_invalid');
  if(!contract?.invariant?.unknownIsNotSuccess)failures.push('unknown_execution_misclassified');
  if(contract?.status==='VERIFIED'&&!contract?.invariant?.safeVerifiedOutcome)failures.push('verified_without_required_evidence');
  return [...new Set(failures)];
}
