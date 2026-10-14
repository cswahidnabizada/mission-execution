import {api} from '../core/api.js';
let state={status:'idle',productState:'idle',session:null,situation:null,product:null,productError:null};let promise=null;
export async function loadSituation(force=false){
  if(!force&&promise)return promise;
  state={...state,status:'loading',productState:'loading',productError:null};
  promise=(async()=>{
    const d=await api('/api/bootstrap');
    const product=d.product||null;
    const productState=product?.runtime?.available===false?'unavailable':'ready';
    state={status:'ready',productState,session:d.session||null,product,productError:null,situation:d.situation||{}};
    return state;
  })().catch(e=>{
    state={...state,status:Number(e?.status)===401?'unauthenticated':'error',productState:'error',productError:e};
    promise=null;
    throw e;
  });
  return promise;
}
export function getSituation(){return state}
export function clearSituation(){state={status:'idle',productState:'idle',session:null,situation:null,product:null,productError:null};promise=null}
