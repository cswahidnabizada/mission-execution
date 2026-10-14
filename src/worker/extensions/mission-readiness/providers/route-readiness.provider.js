function addressPresent(mission,prefix){return Boolean(String(mission?.[`${prefix}_street`]||mission?.[`${prefix}_address`]||"").trim()) && Boolean(String(mission?.[`${prefix}_city`]||"").trim()) || Boolean(String(mission?.[`${prefix}_address`]||"").trim());}
export function routeReadinessState(mission={}){
  const pickup=addressPresent(mission,"pickup"),delivery=addressPresent(mission,"delivery");
  return Object.freeze({state:pickup&&delivery?"READY":"BLOCKED",pickupAddress:pickup,deliveryAddress:delivery,pickupStreet:mission.pickup_street||null,pickupZipCode:mission.pickup_zip_code||null,pickupCity:mission.pickup_city||null,deliveryStreet:mission.delivery_street||null,deliveryZipCode:mission.delivery_zip_code||null,deliveryCity:mission.delivery_city||null,blockers:Object.freeze([...(!pickup?["pickup_address_missing"]:[]),...(!delivery?["delivery_address_missing"]:[])])});
}
