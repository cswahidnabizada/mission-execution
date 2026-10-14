import {json,publicErrorMessage} from '../core/http.js';
import {publicLaunchCountries} from '../security/country-product-launch.service.js';
export function registerProductAvailabilityRoutes(router){
 router.get('/api/product/availability',async({env})=>{try{const countries=await publicLaunchCountries(env);return json({success:true,status:countries.length?'start':'under_development',countries,message:countries.length?'Choose a launched country to start.':'ON Mission is preparing its first country launch. Country access will appear here only after Super Admin completes and activates the country product.'});}catch(e){return json({success:false,error:publicErrorMessage(e,'Product availability unavailable')},500);}});
}
